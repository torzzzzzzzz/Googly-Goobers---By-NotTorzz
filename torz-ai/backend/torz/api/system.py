"""System, settings, AI provider management, dashboard, favorites, usage and search routes."""
from __future__ import annotations

import io
import json
import os
import platform
import shutil
import sys
import time
import zipfile
from datetime import timedelta
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import func, or_

from .. import APP_NAME, __version__
from ..ai.base import ProviderError
from ..ai.registry import PROVIDER_IDS, RECOMMENDED_OLLAMA_MODELS, provider_catalog
from ..db.models import (
    Activity,
    Document,
    Favorite,
    Flashcard,
    FlashcardDeck,
    HistoryEntry,
    Note,
    Quiz,
    QuizAttempt,
    StoredFile,
    StudyGuide,
    ToolUsage,
    utcnow,
)
from ..documents.extract import ocr_available
from ..secrets_store import mask
from ..services.common import TOOLS, AppContext, get_ctx, sse

router = APIRouter(prefix="/api")


@router.get("/health")
def health():
    return {"ok": True, "app": APP_NAME, "version": __version__}


@router.get("/session")
def session(ctx: AppContext = Depends(get_ctx)):
    return {"token": ctx.token, "version": __version__, "app": APP_NAME}


# ------------------------------------------------------------------------------------------------ settings

@router.get("/settings")
def get_settings(ctx: AppContext = Depends(get_ctx)):
    return {"settings": ctx.settings.all(), "api_keys": _key_status(ctx)}


class SettingsPatch(BaseModel):
    patch: dict[str, Any]


@router.patch("/settings")
def patch_settings(body: SettingsPatch, ctx: AppContext = Depends(get_ctx)):
    try:
        merged = ctx.settings.update(body.patch)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    if "ai" in body.patch:
        ctx.ai.invalidate_models()
        default = merged["ai"].get("default_provider")
        if default not in PROVIDER_IDS:
            raise HTTPException(400, "Unknown provider")
    return {"settings": merged, "api_keys": _key_status(ctx)}


def _key_status(ctx: AppContext) -> dict[str, dict[str, Any]]:
    out = {}
    for pid in PROVIDER_IDS:
        k = ctx.secrets.get(f"api_key:{pid}")
        out[pid] = {"set": bool(k), "masked": mask(k)}
    return out


class ApiKeyBody(BaseModel):
    key: str = Field(min_length=1, max_length=500)


@router.put("/ai/providers/{provider_id}/key")
def set_api_key(provider_id: str, body: ApiKeyBody, ctx: AppContext = Depends(get_ctx)):
    if provider_id not in PROVIDER_IDS:
        raise HTTPException(404, "Unknown provider")
    ctx.secrets.set(f"api_key:{provider_id}", body.key.strip())
    ctx.ai.invalidate_models()
    return {"ok": True, "api_keys": _key_status(ctx)}


@router.delete("/ai/providers/{provider_id}/key")
def delete_api_key(provider_id: str, ctx: AppContext = Depends(get_ctx)):
    ctx.secrets.delete(f"api_key:{provider_id}")
    ctx.ai.invalidate_models()
    return {"ok": True, "api_keys": _key_status(ctx)}


# ------------------------------------------------------------------------------------------------ AI providers

@router.get("/ai/providers")
def providers(ctx: AppContext = Depends(get_ctx)):
    return {"providers": provider_catalog(), "settings": ctx.settings.get("ai"), "api_keys": _key_status(ctx),
            "recommended_models": RECOMMENDED_OLLAMA_MODELS, "secret_backend": ctx.secrets.backend_name}


@router.post("/ai/providers/{provider_id}/test")
async def test_provider(provider_id: str, ctx: AppContext = Depends(get_ctx)):
    try:
        p = ctx.ai.build(provider_id)
    except ProviderError as exc:
        raise HTTPException(404, exc.message)
    ctx.ai.invalidate_models()
    started = time.time()
    res = await p.check()
    res["latency_ms"] = int((time.time() - started) * 1000)
    res["provider"] = provider_id
    return res


@router.get("/ai/providers/{provider_id}/models")
async def provider_models(provider_id: str, ctx: AppContext = Depends(get_ctx)):
    try:
        p = ctx.ai.build(provider_id)
        models = await p.list_models()
        return {"models": [m.as_dict() for m in models]}
    except ProviderError as exc:
        return {"models": [], "error": exc.as_dict()}


@router.get("/ai/status")
async def ai_status(ctx: AppContext = Depends(get_ctx)):
    return await ctx.ai.status()


class PullBody(BaseModel):
    model: str = Field(min_length=1, max_length=200, pattern=r"^[\w.\-:/]+$")


@router.post("/ai/ollama/pull")
async def ollama_pull(body: PullBody, ctx: AppContext = Depends(get_ctx)):
    provider = ctx.ai.build("ollama")

    async def gen():
        yield {"type": "progress", "status": "starting", "model": body.model}
        async for ev in provider.pull(body.model):
            if ev.get("error"):
                yield {"type": "error", "kind": "pull", "message": str(ev["error"])}
                return
            yield {"type": "progress", "status": ev.get("status", ""), "completed": ev.get("completed"),
                   "total": ev.get("total"), "model": body.model}
        ctx.ai.invalidate_models()
        settings = ctx.settings.get("ai")
        if not settings["providers"]["ollama"].get("model"):
            ctx.settings.update({"ai": {"providers": {"ollama": {"model": body.model}}}})
        yield {"type": "done", "model": body.model}

    return sse(gen())


@router.delete("/ai/ollama/models/{name:path}")
async def ollama_delete(name: str, ctx: AppContext = Depends(get_ctx)):
    try:
        await ctx.ai.build("ollama").delete_model(name)
    except ProviderError as exc:
        raise HTTPException(400, exc.message)
    ctx.ai.invalidate_models()
    return {"ok": True}


# ------------------------------------------------------------------------------------------------ dashboard

def _dt(d) -> Optional[str]:
    return d.isoformat() + "Z" if d else None


@router.get("/dashboard")
def dashboard(ctx: AppContext = Depends(get_ctx)):
    now = utcnow()
    with ctx.db.session() as s:
        recent_tools = [{"tool_id": u.tool_id, "count": u.count, "last_used_at": _dt(u.last_used_at)}
                        for u in s.query(ToolUsage).order_by(ToolUsage.last_used_at.desc()).limit(8)]
        docs = [{"id": d.id, "title": d.title, "updated_at": _dt(d.updated_at), "word_count": d.word_count}
                for d in s.query(Document).filter(Document.deleted_at.is_(None))
                .order_by(func.coalesce(Document.last_opened_at, Document.updated_at).desc()).limit(6)]
        files = [{"id": f.id, "filename": f.filename, "created_at": _dt(f.created_at), "pages": f.page_count}
                 for f in s.query(StoredFile).order_by(func.coalesce(StoredFile.last_opened_at, StoredFile.created_at).desc()).limit(4)]
        history = [{"id": h.id, "tool": h.tool, "title": h.title, "created_at": _dt(h.created_at),
                    "engine": h.engine, "model": h.model}
                   for h in s.query(HistoryEntry).order_by(HistoryEntry.created_at.desc()).limit(8)]
        favorites = [f.tool_id for f in s.query(Favorite).order_by(Favorite.position)]
        week_ago = now - timedelta(days=7)
        runs_week = s.query(func.count(Activity.id)).filter(Activity.created_at >= week_ago).scalar() or 0
        words_total = s.query(func.coalesce(func.sum(Activity.words_in), 0)).scalar() or 0
        words_week = s.query(func.coalesce(func.sum(Activity.words_in), 0)).filter(Activity.created_at >= week_ago).scalar() or 0
        runs_total = s.query(func.count(Activity.id)).scalar() or 0
        start = (now - timedelta(days=13)).replace(hour=0, minute=0, second=0, microsecond=0)
        daily_rows = s.query(func.date(Activity.created_at), func.count(Activity.id)).filter(
            Activity.created_at >= start).group_by(func.date(Activity.created_at)).all()
        daily_map = {str(d): c for d, c in daily_rows}
        daily = [{"date": (start + timedelta(days=i)).date().isoformat(),
                  "runs": daily_map.get((start + timedelta(days=i)).date().isoformat(), 0)} for i in range(14)]
        top_tools = [{"tool_id": t, "runs": c} for t, c in s.query(Activity.tool_id, func.count(Activity.id))
                     .group_by(Activity.tool_id).order_by(func.count(Activity.id).desc()).limit(5)]
        attempts = s.query(QuizAttempt).filter(QuizAttempt.status == "completed").all()
        avg_score = round(100 * sum(a.score for a in attempts) / sum(a.max_score for a in attempts), 1) \
            if attempts and sum(a.max_score for a in attempts) else None
        counts = {
            "documents": s.query(func.count(Document.id)).filter(Document.deleted_at.is_(None)).scalar(),
            "notes": s.query(func.count(Note.id)).scalar(),
            "decks": s.query(func.count(FlashcardDeck.id)).scalar(),
            "cards": s.query(func.count(Flashcard.id)).scalar(),
            "cards_known": s.query(func.count(Flashcard.id)).filter(Flashcard.status == "known").scalar(),
            "quizzes": s.query(func.count(Quiz.id)).filter(Quiz.kind == "quiz").scalar(),
            "tests": s.query(func.count(Quiz.id)).filter(Quiz.kind == "practice_test").scalar(),
            "guides": s.query(func.count(StudyGuide.id)).scalar(),
            "files": s.query(func.count(StoredFile.id)).scalar(),
            "history": s.query(func.count(HistoryEntry.id)).scalar(),
        }
    return {
        "profile": ctx.settings.get("profile"),
        "shortcuts": (ctx.settings.get("dashboard") or {}).get("shortcuts", []),
        "favorites": favorites,
        "recent_tools": recent_tools,
        "recent_documents": docs,
        "recent_files": files,
        "recent_history": history,
        "stats": {"runs_week": runs_week, "runs_total": runs_total, "words_total": int(words_total),
                  "words_week": int(words_week), "daily": daily, "top_tools": top_tools,
                  "average_score": avg_score, "attempts": len(attempts), **counts},
    }


# ------------------------------------------------------------------------------------------------ favorites/usage

class FavoritesBody(BaseModel):
    tool_ids: list[str]


@router.get("/favorites")
def get_favorites(ctx: AppContext = Depends(get_ctx)):
    with ctx.db.session() as s:
        return {"favorites": [f.tool_id for f in s.query(Favorite).order_by(Favorite.position)]}


@router.put("/favorites")
def set_favorites(body: FavoritesBody, ctx: AppContext = Depends(get_ctx)):
    ids = [t for t in dict.fromkeys(body.tool_ids) if t in TOOLS]
    with ctx.db.session() as s:
        s.query(Favorite).delete()
        for i, t in enumerate(ids):
            s.add(Favorite(tool_id=t, position=i))
    return {"favorites": ids}


@router.post("/favorites/{tool_id}")
def add_favorite(tool_id: str, ctx: AppContext = Depends(get_ctx)):
    if tool_id not in TOOLS:
        raise HTTPException(404, "Unknown tool")
    with ctx.db.session() as s:
        if not s.query(Favorite).filter_by(tool_id=tool_id).first():
            pos = (s.query(func.max(Favorite.position)).scalar() or 0) + 1
            s.add(Favorite(tool_id=tool_id, position=pos))
    return get_favorites(ctx)


@router.delete("/favorites/{tool_id}")
def remove_favorite(tool_id: str, ctx: AppContext = Depends(get_ctx)):
    with ctx.db.session() as s:
        s.query(Favorite).filter_by(tool_id=tool_id).delete()
    return get_favorites(ctx)


@router.post("/usage/{tool_id}")
def touch_tool(tool_id: str, ctx: AppContext = Depends(get_ctx)):
    if tool_id not in TOOLS:
        raise HTTPException(404, "Unknown tool")
    from ..services.common import touch_usage

    with ctx.db.session() as s:
        touch_usage(s, tool_id)
    return {"ok": True}


# ------------------------------------------------------------------------------------------------ search

@router.get("/search")
def search(q: str = "", ctx: AppContext = Depends(get_ctx)):
    q = q.strip()
    if len(q) < 2:
        return {"results": []}
    like = f"%{q}%"
    out: list[dict[str, Any]] = []
    with ctx.db.session() as s:
        for d in s.query(Document).filter(Document.deleted_at.is_(None), or_(Document.title.ilike(like), Document.content_text.ilike(like))).limit(6):
            out.append({"kind": "document", "id": d.id, "title": d.title, "url": f"/documents/{d.id}"})
        for n in s.query(Note).filter(or_(Note.title.ilike(like), Note.content_text.ilike(like), Note.tags.ilike(like))).limit(5):
            out.append({"kind": "note", "id": n.id, "title": n.title, "url": f"/notes/{n.id}"})
        for dk in s.query(FlashcardDeck).filter(FlashcardDeck.title.ilike(like)).limit(4):
            out.append({"kind": "deck", "id": dk.id, "title": dk.title, "url": f"/flashcards/{dk.id}"})
        for qz in s.query(Quiz).filter(Quiz.title.ilike(like)).limit(4):
            url = f"/practice-test/{qz.id}" if qz.kind == "practice_test" else f"/quiz/{qz.id}"
            out.append({"kind": qz.kind, "id": qz.id, "title": qz.title, "url": url})
        for g in s.query(StudyGuide).filter(StudyGuide.title.ilike(like)).limit(3):
            out.append({"kind": "guide", "id": g.id, "title": g.title, "url": f"/study-guide/{g.id}"})
        for f in s.query(StoredFile).filter(or_(StoredFile.filename.ilike(like))).limit(3):
            out.append({"kind": "file", "id": f.id, "title": f.filename, "url": f"/pdf/{f.id}" if f.ext == "pdf" else f"/files/{f.id}"})
        for h in s.query(HistoryEntry).filter(or_(HistoryEntry.title.ilike(like), HistoryEntry.input_text.ilike(like))).order_by(HistoryEntry.created_at.desc()).limit(5):
            out.append({"kind": "history", "id": h.id, "title": h.title, "tool": h.tool, "url": f"/history/{h.id}"})
    return {"results": out}


# ------------------------------------------------------------------------------------------------ system

def _dir_size(path) -> int:
    total = 0
    for root, _dirs, files in os.walk(path):
        for f in files:
            try:
                total += os.path.getsize(os.path.join(root, f))
            except OSError:
                pass
    return total


@router.get("/system/info")
def system_info(ctx: AppContext = Depends(get_ctx)):
    cfg = ctx.config
    usage = shutil.disk_usage(cfg.data_dir)
    ocr_ok, ocr_msg = ocr_available()
    db_size = sum(os.path.getsize(p) for p in [cfg.db_path, cfg.db_path.with_suffix(".db-wal")] if p.exists())
    return {
        "app": APP_NAME,
        "version": __version__,
        "python": sys.version.split()[0],
        "platform": f"{platform.system()} {platform.release()}",
        "data_dir": str(cfg.data_dir),
        "db_path": str(cfg.db_path),
        "db_schema_version": ctx.db.version,
        "db_size": db_size,
        "files_size": _dir_size(cfg.files_dir),
        "disk_free": usage.free,
        "uptime_s": int(time.time() - ctx.started_at),
        "ocr": {"available": ocr_ok, "engine": ocr_msg},
        "secret_backend": ctx.secrets.backend_name,
        "max_upload_mb": cfg.max_upload_mb,
        "frontend_built": (cfg.frontend_dist / "index.html").exists(),
        "address": f"http://{cfg.host}:{cfg.port}",
    }


@router.post("/system/diagnostics")
async def diagnostics(ctx: AppContext = Depends(get_ctx)):
    checks = []

    def add(name, ok, detail):
        checks.append({"name": name, "ok": bool(ok), "detail": detail})

    try:
        res = ctx.db.integrity_check()
        add("Database integrity", res == "ok", res)
    except Exception as exc:
        add("Database integrity", False, str(exc))
    try:
        probe = ctx.config.data_dir / ".write-test"
        probe.write_text("ok")
        probe.unlink()
        add("Data folder writable", True, str(ctx.config.data_dir))
    except Exception as exc:
        add("Data folder writable", False, str(exc))
    free = shutil.disk_usage(ctx.config.data_dir).free
    add("Free disk space", free > 500 * 1024 * 1024, f"{free / 1024 ** 3:.1f} GB free")
    ocr_ok, ocr_msg = ocr_available()
    add("OCR engine", ocr_ok, ocr_msg)
    try:
        ctx.secrets.set("diagnostic_probe", "1")
        ok = ctx.secrets.get("diagnostic_probe") == "1"
        ctx.secrets.delete("diagnostic_probe")
        add("Secure key storage", ok, ctx.secrets.backend_name)
    except Exception as exc:
        add("Secure key storage", False, str(exc))
    st = await ctx.ai.status()
    add("AI model", st.get("ok"), st.get("message"))
    for pid in PROVIDER_IDS:
        if pid == st.get("provider"):
            continue
        if pid == "ollama":
            r = await ctx.ai.build("ollama").check()
            add("Ollama (local)", r["ok"], r["message"])
    add("Frontend bundle", (ctx.config.frontend_dist / "index.html").exists(), str(ctx.config.frontend_dist))
    return {"checks": checks, "ok": all(c["ok"] for c in checks if c["name"] not in ("Ollama (local)",))}


@router.post("/system/shutdown")
def shutdown(ctx: AppContext = Depends(get_ctx)):
    server = ctx.extras.get("server")
    if server is not None:
        server.should_exit = True
        return {"ok": True, "message": "TORZ AI is shutting down."}
    return {"ok": False, "message": "Shutdown is only available when started by the launcher."}


@router.get("/system/export")
def export_all(ctx: AppContext = Depends(get_ctx)):
    """Download every piece of local data as a ZIP (JSON tables + original files)."""
    from ..db.models import Base

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        with ctx.db.engine.connect() as conn:
            for table in Base.metadata.sorted_tables:
                rows = [dict(r._mapping) for r in conn.execute(table.select())]
                zf.writestr(f"data/{table.name}.json", json.dumps(rows, default=str, ensure_ascii=False, indent=1))
        for f in ctx.config.files_dir.glob("*"):
            if f.is_file():
                zf.write(f, f"files/{f.name}")
        zf.writestr("README.txt", f"{APP_NAME} {__version__} data export. API keys are not included.\n")
    stamp = time.strftime("%Y%m%d-%H%M")
    return Response(buf.getvalue(), media_type="application/zip",
                    headers={"Content-Disposition": f'attachment; filename="torz-ai-export-{stamp}.zip"'})


class ResetBody(BaseModel):
    confirm: str


@router.post("/system/reset")
def reset_app(body: ResetBody, ctx: AppContext = Depends(get_ctx)):
    if body.confirm != "RESET":
        raise HTTPException(400, "Type RESET to confirm.")
    from ..db.models import Base, SchemaMigration

    with ctx.db.session() as s:
        for table in reversed(Base.metadata.sorted_tables):
            if table.name != SchemaMigration.__tablename__:
                s.execute(table.delete())
    for f in ctx.config.files_dir.glob("*"):
        if f.is_file():
            f.unlink()
    ctx.secrets.clear()
    ctx.settings.reset()
    ctx.ai.invalidate_models()
    return {"ok": True}
