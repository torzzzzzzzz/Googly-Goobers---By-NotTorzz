"""History of every tool run."""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, or_

from ..db.models import HistoryEntry
from ..services.common import AppContext, get_ctx

router = APIRouter(prefix="/api/history")


def _dt(d):
    return d.isoformat() + "Z" if d else None


def _entry(h: HistoryEntry, full: bool = False) -> dict:
    out = {"id": h.id, "tool": h.tool, "title": h.title, "engine": h.engine, "provider": h.provider, "model": h.model,
           "created_at": _dt(h.created_at), "duration_ms": h.duration_ms, "words_in": h.words_in, "words_out": h.words_out,
           "preview": (h.output_text or h.input_text or "")[:200], "settings": HistoryEntry.loads(h.settings_json, {})}
    if full:
        out.update({"input_text": h.input_text, "output_text": h.output_text,
                    "output_json": HistoryEntry.loads(h.output_json, None), "source_file_id": h.source_file_id})
    return out


@router.get("")
def list_history(tool: str = "", q: str = "", limit: int = 50, offset: int = 0, ctx: AppContext = Depends(get_ctx)):
    limit = max(1, min(200, limit))
    with ctx.db.session() as s:
        qry = s.query(HistoryEntry)
        if tool:
            qry = qry.filter(HistoryEntry.tool == tool)
        if q.strip():
            like = f"%{q.strip()}%"
            qry = qry.filter(or_(HistoryEntry.title.ilike(like), HistoryEntry.input_text.ilike(like),
                                 HistoryEntry.output_text.ilike(like)))
        total = qry.count()
        rows = qry.order_by(HistoryEntry.created_at.desc()).offset(max(0, offset)).limit(limit).all()
        tools = dict(s.query(HistoryEntry.tool, func.count(HistoryEntry.id)).group_by(HistoryEntry.tool).all())
        return {"entries": [_entry(h) for h in rows], "total": total, "tools": tools}


@router.get("/{entry_id}")
def get_entry(entry_id: int, ctx: AppContext = Depends(get_ctx)):
    with ctx.db.session() as s:
        h = s.get(HistoryEntry, entry_id)
        if not h:
            raise HTTPException(404, "History entry not found")
        return _entry(h, True)


class RenameIn(BaseModel):
    title: str = Field(min_length=1, max_length=300)


@router.patch("/{entry_id}")
def rename_entry(entry_id: int, body: RenameIn, ctx: AppContext = Depends(get_ctx)):
    with ctx.db.session() as s:
        h = s.get(HistoryEntry, entry_id)
        if not h:
            raise HTTPException(404, "History entry not found")
        h.title = body.title.strip()
        return _entry(h)


@router.delete("/{entry_id}")
def delete_entry(entry_id: int, ctx: AppContext = Depends(get_ctx)):
    with ctx.db.session() as s:
        h = s.get(HistoryEntry, entry_id)
        if not h:
            raise HTTPException(404, "History entry not found")
        s.delete(h)
    return {"ok": True}


@router.delete("")
def clear_history(tool: Optional[str] = None, ctx: AppContext = Depends(get_ctx)):
    with ctx.db.session() as s:
        qry = s.query(HistoryEntry)
        if tool:
            qry = qry.filter(HistoryEntry.tool == tool)
        n = qry.delete(synchronize_session=False)
    return {"deleted": n}
