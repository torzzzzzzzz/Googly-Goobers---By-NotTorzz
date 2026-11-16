"""Shared helpers for tool services: app context, sources, history, activity, SSE."""
from __future__ import annotations

import json
import logging
import re
import time
from dataclasses import dataclass, field
from typing import Any, AsyncIterator, Optional

from fastapi import HTTPException, Request
from fastapi.responses import StreamingResponse

from ..ai.base import ProviderError
from ..ai.service import AIService
from ..config import AppConfig
from ..db import Database
from ..db.models import Activity, Document, HistoryEntry, Note, StoredFile, ToolUsage, utcnow
from ..documents.extract import ExtractionError
from ..offline.text import word_count
from ..secrets_store import SecretStore
from .settings_repo import SettingsRepo

log = logging.getLogger("torz.services")

# Tool catalogue (ids are shared with the frontend).
TOOLS = {
    "humanizer": "AI Humanizer",
    "assistant": "Writing Assistant",
    "grammar": "Grammar Checker",
    "paraphraser": "Paraphraser",
    "rewriter": "Text Rewriter",
    "essay": "Essay Improver",
    "simplifier": "Sentence Simplifier",
    "summarizer": "Summarizer",
    "notes": "Smart Notes",
    "autotyper": "AutoTyper",
    "documents": "Document Workspace",
    "pdf": "PDF Reader",
    "quiz": "Quiz Generator",
    "flashcards": "Flashcard Generator",
    "study_guide": "Study Guide Generator",
    "practice_test": "Practice Test Generator",
    "qa": "Question Answering",
}


@dataclass
class AppContext:
    config: AppConfig
    db: Database
    secrets: SecretStore
    settings: SettingsRepo
    ai: AIService
    token: str
    started_at: float = field(default_factory=time.time)
    extras: dict[str, Any] = field(default_factory=dict)


def get_ctx(request: Request) -> AppContext:
    return request.app.state.ctx


# ------------------------------------------------------------------------------------------------ sources

@dataclass
class Source:
    text: str
    title: str
    file_id: Optional[int] = None
    document_id: Optional[int] = None


def resolve_source(ctx: AppContext, text: str | None = None, file_id: int | None = None,
                   document_id: int | None = None, note_id: int | None = None) -> Source:
    with ctx.db.session() as s:
        if file_id:
            f = s.get(StoredFile, file_id)
            if not f:
                raise HTTPException(404, "That uploaded file no longer exists.")
            f.last_opened_at = utcnow()
            title = f.filename.rsplit(".", 1)[0]
            src = Source(f.text, title, file_id=f.id)
        elif document_id:
            d = s.get(Document, document_id)
            if not d or d.deleted_at:
                raise HTTPException(404, "That document no longer exists.")
            src = Source(d.content_text, d.title, document_id=d.id)
        elif note_id:
            n = s.get(Note, note_id)
            if not n:
                raise HTTPException(404, "That note no longer exists.")
            src = Source(n.content_text, n.title)
        else:
            t = (text or "").strip()
            src = Source(t, title_from_text(t))
    if not src.text or not src.text.strip():
        raise HTTPException(400, "Add some text or choose a document first.")
    return src


def title_from_text(text: str, limit: int = 60) -> str:
    t = re.sub(r"\s+", " ", (text or "").strip().lstrip("#").strip())
    if len(t) <= limit:
        return t or "Untitled"
    cut = t[:limit].rsplit(" ", 1)[0]
    return cut + "…"


# ------------------------------------------------------------------------------------------------ history

def record_run(ctx: AppContext, tool: str, input_text: str, output_text: str = "", output_json: Any = None,
               settings: dict[str, Any] | None = None, engine: str = "ai", provider: str = "", model: str = "",
               started: float | None = None, title: str | None = None, source_file_id: int | None = None) -> Optional[int]:
    """Store a history entry (if enabled) and always update activity statistics."""
    duration = int((time.time() - started) * 1000) if started else 0
    w_in, w_out = word_count(input_text), word_count(output_text or "")
    hid = None
    save = (ctx.settings.get("privacy") or {}).get("save_history", True)
    with ctx.db.session() as s:
        if save:
            h = HistoryEntry(
                tool=tool,
                title=title or title_from_text(input_text),
                input_text=input_text,
                output_text=output_text or "",
                output_json=json.dumps(output_json, ensure_ascii=False) if output_json is not None else "",
                settings_json=json.dumps(settings or {}),
                engine=engine,
                provider=provider,
                model=model,
                duration_ms=duration,
                words_in=w_in,
                words_out=w_out,
                source_file_id=source_file_id,
            )
            s.add(h)
            s.flush()
            hid = h.id
        s.add(Activity(tool_id=tool, kind="run", words_in=w_in, words_out=w_out))
        touch_usage(s, tool)
    return hid


def touch_usage(s, tool: str) -> None:
    u = s.get(ToolUsage, tool)
    if u is None:
        s.add(ToolUsage(tool_id=tool, count=1, last_used_at=utcnow()))
    else:
        u.count += 1
        u.last_used_at = utcnow()


# ------------------------------------------------------------------------------------------------ SSE

def _event(data: dict[str, Any]) -> str:
    return f"data: {json.dumps(data, ensure_ascii=False, default=str)}\n\n"


def error_payload(exc: Exception) -> dict[str, Any]:
    if isinstance(exc, ProviderError):
        return {"type": "error", "kind": exc.kind, "message": exc.message}
    if isinstance(exc, ExtractionError):
        return {"type": "error", "kind": "document", "message": str(exc)}
    if isinstance(exc, HTTPException):
        return {"type": "error", "kind": "bad_request", "message": str(exc.detail)}
    if isinstance(exc, ValueError):
        return {"type": "error", "kind": "bad_request", "message": str(exc)}
    log.exception("Unexpected tool error", exc_info=exc)
    return {"type": "error", "kind": "internal", "message": f"Something went wrong: {exc.__class__.__name__}: {exc}"}


def sse(gen: AsyncIterator[dict[str, Any]]) -> StreamingResponse:
    async def body():
        try:
            async for ev in gen:
                yield _event(ev)
        except Exception as exc:  # noqa: BLE001 - surfaced to the UI
            yield _event(error_payload(exc))

    return StreamingResponse(
        body(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


async def stream_text(ctx: AppContext, messages, temperature: float | None = None,
                      max_tokens: int | None = None) -> AsyncIterator[dict[str, Any]]:
    """Wrap AIService.stream; collects text and yields the same events plus a final 'text' accumulator."""
    opts = ctx.ai.gen_options(temperature=temperature, max_tokens=max_tokens)
    async for ev in ctx.ai.stream(messages, opts):
        yield ev
