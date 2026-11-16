"""AutoTyper: jobs handed to the browser extension, and the Google Docs API typer."""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field

from ..db.models import AutoTyperJob, utcnow
from ..services.common import AppContext, get_ctx, record_run, touch_usage
from ..services.gdocs import GDocsError, GoogleDocsService

router = APIRouter(prefix="/api")


def _dt(d):
    return d.isoformat() + "Z" if d else None


def _job(j: AutoTyperJob) -> dict:
    return {"id": j.id, "title": j.title, "text": j.text, "settings": AutoTyperJob.loads(j.settings_json, {}),
            "target": j.target, "status": j.status, "progress": j.progress, "created_at": _dt(j.created_at),
            "updated_at": _dt(j.updated_at), "chars": len(j.text)}


class JobIn(BaseModel):
    title: str = Field("AutoTyper text", max_length=300)
    text: str = Field(min_length=1)
    wpm: int = Field(70, ge=10, le=400)
    natural_rhythm: bool = True
    pause_on_punctuation: bool = True


@router.post("/autotyper/jobs")
def create_job(body: JobIn, ctx: AppContext = Depends(get_ctx)):
    with ctx.db.session() as s:
        # Only the newest prepared job is offered to the extension; older ready jobs are superseded.
        s.query(AutoTyperJob).filter(AutoTyperJob.status == "ready").update({AutoTyperJob.status: "superseded"})
        j = AutoTyperJob(title=body.title.strip() or "AutoTyper text", text=body.text,
                         settings_json=AutoTyperJob.dumps({"wpm": body.wpm, "natural_rhythm": body.natural_rhythm,
                                                           "pause_on_punctuation": body.pause_on_punctuation}))
        s.add(j)
        s.flush()
        touch_usage(s, "autotyper")
        return _job(j)


@router.get("/autotyper/jobs")
def list_jobs(ctx: AppContext = Depends(get_ctx)):
    with ctx.db.session() as s:
        return {"jobs": [_job(j) for j in s.query(AutoTyperJob).order_by(AutoTyperJob.created_at.desc()).limit(20)]}


@router.get("/autotyper/jobs/latest")
def latest_job(ctx: AppContext = Depends(get_ctx)):
    with ctx.db.session() as s:
        j = s.query(AutoTyperJob).filter(AutoTyperJob.status.in_(["ready", "typing", "paused"])) \
            .order_by(AutoTyperJob.created_at.desc()).first()
        return {"job": _job(j) if j else None}


class JobPatch(BaseModel):
    status: Optional[str] = Field(None, pattern="^(ready|typing|paused|stopped|done|error|undone|superseded)$")
    progress: Optional[int] = Field(None, ge=0)


@router.patch("/autotyper/jobs/{job_id}")
def update_job(job_id: int, body: JobPatch, ctx: AppContext = Depends(get_ctx)):
    with ctx.db.session() as s:
        j = s.get(AutoTyperJob, job_id)
        if not j:
            raise HTTPException(404, "Job not found")
        prev = j.status
        if body.status is not None:
            j.status = body.status
        if body.progress is not None:
            j.progress = min(body.progress, len(j.text))
        j.updated_at = utcnow()
        out = _job(j)
    if body.status == "done" and prev != "done":
        record_run(ctx, "autotyper", out["text"], "", settings=out["settings"], engine="extension",
                   title=out["title"])
    return out


@router.delete("/autotyper/jobs/{job_id}")
def delete_job(job_id: int, ctx: AppContext = Depends(get_ctx)):
    with ctx.db.session() as s:
        j = s.get(AutoTyperJob, job_id)
        if j:
            s.delete(j)
    return {"ok": True}


# ------------------------------------------------------------------------------------------------ Google Docs

def gdocs(ctx: AppContext) -> GoogleDocsService:
    svc = ctx.extras.get("gdocs")
    if svc is None:
        svc = GoogleDocsService(ctx.secrets, f"http://127.0.0.1:{ctx.config.port}/api/gdocs/callback")
        ctx.extras["gdocs"] = svc
    return svc


def _err(exc: GDocsError):
    raise HTTPException(400, str(exc))


@router.get("/gdocs/status")
def gdocs_status(ctx: AppContext = Depends(get_ctx)):
    return gdocs(ctx).status()


class ClientIn(BaseModel):
    client_json: str = Field(min_length=10, max_length=20000)


@router.post("/gdocs/client")
def gdocs_client(body: ClientIn, ctx: AppContext = Depends(get_ctx)):
    try:
        gdocs(ctx).set_client(body.client_json)
    except GDocsError as exc:
        _err(exc)
    return gdocs(ctx).status()


@router.post("/gdocs/disconnect")
def gdocs_disconnect(forget_client: bool = False, ctx: AppContext = Depends(get_ctx)):
    gdocs(ctx).disconnect(forget_client)
    return gdocs(ctx).status()


@router.get("/gdocs/auth-url")
def gdocs_auth_url(ctx: AppContext = Depends(get_ctx)):
    try:
        return {"url": gdocs(ctx).auth_url()}
    except GDocsError as exc:
        _err(exc)


@router.get("/gdocs/callback", response_class=HTMLResponse)
async def gdocs_callback(code: str = "", state: str = "", error: str = "", ctx: AppContext = Depends(get_ctx)):
    page = """<!doctype html><meta charset="utf-8"><title>TORZ AI</title>
<body style="font-family:Segoe UI,Arial,sans-serif;background:#0b1020;color:#e8edf7;display:grid;place-items:center;height:100vh;margin:0">
<div style="max-width:440px;text-align:center"><h2>{title}</h2><p style="color:#9aa6bd">{msg}</p></div></body>"""
    if error:
        return HTMLResponse(page.format(title="Google sign-in cancelled", msg="You can close this tab."), status_code=400)
    try:
        await gdocs(ctx).handle_callback(code, state)
    except GDocsError as exc:
        return HTMLResponse(page.format(title="Could not connect", msg=str(exc)), status_code=400)
    return HTMLResponse(page.format(title="Google Docs connected", msg="You can close this tab and return to TORZ AI."))


@router.get("/gdocs/documents")
async def gdocs_documents(q: str = "", ctx: AppContext = Depends(get_ctx)):
    try:
        return {"documents": await gdocs(ctx).list_documents(q)}
    except GDocsError as exc:
        _err(exc)


class TypeIn(BaseModel):
    doc_id: str = Field(min_length=5, max_length=200, pattern=r"^[\w\-]+$")
    text: str = Field(min_length=1)
    wpm: int = Field(70, ge=10, le=400)


@router.post("/gdocs/jobs")
def gdocs_start(body: TypeIn, ctx: AppContext = Depends(get_ctx)):
    try:
        job = gdocs(ctx).start_job(body.doc_id, body.text, body.wpm)
    except GDocsError as exc:
        _err(exc)
    with ctx.db.session() as s:
        touch_usage(s, "autotyper")
    return job.public()


@router.get("/gdocs/jobs/{job_id}")
def gdocs_job(job_id: str, ctx: AppContext = Depends(get_ctx)):
    try:
        return gdocs(ctx).get_job(job_id).public()
    except GDocsError as exc:
        _err(exc)


@router.post("/gdocs/jobs/{job_id}/{action}")
async def gdocs_action(job_id: str, action: str, ctx: AppContext = Depends(get_ctx)):
    svc = gdocs(ctx)
    try:
        if action == "pause":
            return svc.pause(job_id).public()
        if action == "resume":
            return svc.resume(job_id).public()
        if action == "stop":
            return svc.stop(job_id).public()
        if action == "undo":
            return (await svc.undo(job_id)).public()
    except GDocsError as exc:
        _err(exc)
    raise HTTPException(404, "Unknown action")
