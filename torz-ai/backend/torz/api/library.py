"""Document workspace, folders, uploaded files, notes and summaries."""
from __future__ import annotations

import asyncio
import hashlib
import secrets
from datetime import timedelta
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel, Field
from sqlalchemy import func, or_

from ..db.models import Document, DocumentVersion, Folder, Note, StoredFile, Summary, utcnow
from ..documents.export import EXPORT_FORMATS, export, html_to_text, looks_like_html, safe_filename, text_to_html
from ..documents.extract import MIME, ExtractionError, extract, file_ext
from ..offline.text import word_count
from ..services.common import AppContext, get_ctx, touch_usage

router = APIRouter(prefix="/api")


def _dt(d):
    return d.isoformat() + "Z" if d else None


# ------------------------------------------------------------------------------------------------ folders

class FolderIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    parent_id: Optional[int] = None


def _folder(f: Folder, counts: dict[int, int]) -> dict:
    return {"id": f.id, "name": f.name, "parent_id": f.parent_id, "count": counts.get(f.id, 0),
            "created_at": _dt(f.created_at)}


@router.get("/folders")
def list_folders(ctx: AppContext = Depends(get_ctx)):
    with ctx.db.session() as s:
        counts = dict(s.query(Document.folder_id, func.count(Document.id)).filter(Document.deleted_at.is_(None))
                      .group_by(Document.folder_id).all())
        return {"folders": [_folder(f, counts) for f in s.query(Folder).order_by(Folder.name)]}


@router.post("/folders")
def create_folder(body: FolderIn, ctx: AppContext = Depends(get_ctx)):
    with ctx.db.session() as s:
        if body.parent_id and not s.get(Folder, body.parent_id):
            raise HTTPException(404, "Parent folder not found")
        f = Folder(name=body.name.strip(), parent_id=body.parent_id)
        s.add(f)
        s.flush()
        return _folder(f, {})


@router.patch("/folders/{folder_id}")
def rename_folder(folder_id: int, body: FolderIn, ctx: AppContext = Depends(get_ctx)):
    with ctx.db.session() as s:
        f = s.get(Folder, folder_id)
        if not f:
            raise HTTPException(404, "Folder not found")
        f.name = body.name.strip()
        if body.parent_id != f.parent_id:
            if body.parent_id == f.id:
                raise HTTPException(400, "A folder cannot contain itself")
            f.parent_id = body.parent_id
        return _folder(f, {})


@router.delete("/folders/{folder_id}")
def delete_folder(folder_id: int, ctx: AppContext = Depends(get_ctx)):
    """Deletes the folder; its documents move to 'All documents' (never deleted)."""
    with ctx.db.session() as s:
        f = s.get(Folder, folder_id)
        if not f:
            raise HTTPException(404, "Folder not found")
        ids = [folder_id]
        frontier = [folder_id]
        while frontier:
            kids = [c.id for c in s.query(Folder).filter(Folder.parent_id.in_(frontier))]
            ids += kids
            frontier = kids
        s.query(Document).filter(Document.folder_id.in_(ids)).update({Document.folder_id: None}, synchronize_session=False)
        s.delete(f)
    return {"ok": True}


# ------------------------------------------------------------------------------------------------ documents

class DocIn(BaseModel):
    title: str = Field("Untitled document", max_length=300)
    content_html: str = ""
    content_text: Optional[str] = None
    folder_id: Optional[int] = None


class DocPatch(BaseModel):
    title: Optional[str] = Field(None, max_length=300)
    content_html: Optional[str] = None
    content_text: Optional[str] = None
    folder_id: Optional[int] = None
    move_to_root: bool = False
    pinned: Optional[bool] = None
    snapshot: bool = False


def _doc_summary(d: Document) -> dict:
    snippet = (d.content_text or "").strip().replace("\n", " ")[:160]
    return {"id": d.id, "title": d.title, "folder_id": d.folder_id, "pinned": d.pinned, "word_count": d.word_count,
            "snippet": snippet, "created_at": _dt(d.created_at), "updated_at": _dt(d.updated_at),
            "deleted_at": _dt(d.deleted_at), "last_opened_at": _dt(d.last_opened_at)}


def _doc_full(d: Document) -> dict:
    out = _doc_summary(d)
    out.update({"content_html": d.content_html, "content_text": d.content_text, "source_file_id": d.source_file_id})
    return out


@router.get("/documents")
def list_documents(q: str = "", folder_id: Optional[int] = None, trash: bool = False, sort: str = "updated",
                   ctx: AppContext = Depends(get_ctx)):
    with ctx.db.session() as s:
        qry = s.query(Document)
        qry = qry.filter(Document.deleted_at.isnot(None)) if trash else qry.filter(Document.deleted_at.is_(None))
        if folder_id is not None:
            qry = qry.filter(Document.folder_id == folder_id)
        if q.strip():
            like = f"%{q.strip()}%"
            qry = qry.filter(or_(Document.title.ilike(like), Document.content_text.ilike(like)))
        order = {"title": Document.title.asc(), "created": Document.created_at.desc()}.get(sort, Document.updated_at.desc())
        return {"documents": [_doc_summary(d) for d in qry.order_by(Document.pinned.desc(), order).limit(500)]}


@router.post("/documents")
def create_document(body: DocIn, ctx: AppContext = Depends(get_ctx)):
    html = body.content_html
    text = body.content_text if body.content_text is not None else html_to_text(html)
    with ctx.db.session() as s:
        if body.folder_id and not s.get(Folder, body.folder_id):
            raise HTTPException(404, "Folder not found")
        d = Document(title=body.title.strip() or "Untitled document", content_html=html, content_text=text,
                     word_count=word_count(text), folder_id=body.folder_id, last_opened_at=utcnow())
        s.add(d)
        s.flush()
        touch_usage(s, "documents")
        return _doc_full(d)


@router.get("/documents/{doc_id}")
def get_document(doc_id: int, ctx: AppContext = Depends(get_ctx)):
    with ctx.db.session() as s:
        d = s.get(Document, doc_id)
        if not d:
            raise HTTPException(404, "Document not found")
        d.last_opened_at = utcnow()
        return _doc_full(d)


@router.patch("/documents/{doc_id}")
def update_document(doc_id: int, body: DocPatch, ctx: AppContext = Depends(get_ctx)):
    with ctx.db.session() as s:
        d = s.get(Document, doc_id)
        if not d:
            raise HTTPException(404, "Document not found")
        changed_content = body.content_html is not None and body.content_html != d.content_html
        if changed_content or body.snapshot:
            # Keep a version at most every 5 minutes (and always on explicit snapshot).
            last = s.query(DocumentVersion).filter_by(document_id=d.id).order_by(DocumentVersion.created_at.desc()).first()
            if body.snapshot or (d.content_html and (last is None or utcnow() - last.created_at > timedelta(minutes=5))):
                s.add(DocumentVersion(document_id=d.id, title=d.title, content_html=d.content_html, word_count=d.word_count))
        if body.title is not None:
            d.title = body.title.strip() or "Untitled document"
        if body.content_html is not None:
            d.content_html = body.content_html
            d.content_text = body.content_text if body.content_text is not None else html_to_text(body.content_html)
            d.word_count = word_count(d.content_text)
        if body.move_to_root:
            d.folder_id = None
        elif body.folder_id is not None:
            if not s.get(Folder, body.folder_id):
                raise HTTPException(404, "Folder not found")
            d.folder_id = body.folder_id
        if body.pinned is not None:
            d.pinned = body.pinned
        d.updated_at = utcnow()
        return _doc_full(d)


@router.delete("/documents/{doc_id}")
def delete_document(doc_id: int, permanent: bool = False, ctx: AppContext = Depends(get_ctx)):
    with ctx.db.session() as s:
        d = s.get(Document, doc_id)
        if not d:
            raise HTTPException(404, "Document not found")
        if permanent:
            s.delete(d)
        else:
            d.deleted_at = utcnow()
    return {"ok": True}


@router.post("/documents/{doc_id}/restore")
def restore_document(doc_id: int, ctx: AppContext = Depends(get_ctx)):
    with ctx.db.session() as s:
        d = s.get(Document, doc_id)
        if not d:
            raise HTTPException(404, "Document not found")
        d.deleted_at = None
        if d.folder_id and not s.get(Folder, d.folder_id):
            d.folder_id = None
        return _doc_summary(d)


@router.post("/documents/trash/empty")
def empty_trash(ctx: AppContext = Depends(get_ctx)):
    with ctx.db.session() as s:
        n = 0
        for d in s.query(Document).filter(Document.deleted_at.isnot(None)):
            s.delete(d)
            n += 1
    return {"deleted": n}


@router.post("/documents/{doc_id}/duplicate")
def duplicate_document(doc_id: int, ctx: AppContext = Depends(get_ctx)):
    with ctx.db.session() as s:
        d = s.get(Document, doc_id)
        if not d:
            raise HTTPException(404, "Document not found")
        c = Document(title=f"{d.title} (copy)"[:300], content_html=d.content_html, content_text=d.content_text,
                     word_count=d.word_count, folder_id=d.folder_id)
        s.add(c)
        s.flush()
        return _doc_full(c)


@router.get("/documents/{doc_id}/versions")
def list_versions(doc_id: int, ctx: AppContext = Depends(get_ctx)):
    with ctx.db.session() as s:
        vs = s.query(DocumentVersion).filter_by(document_id=doc_id).order_by(DocumentVersion.created_at.desc()).limit(50)
        return {"versions": [{"id": v.id, "title": v.title, "word_count": v.word_count, "created_at": _dt(v.created_at),
                              "preview": html_to_text(v.content_html)[:300]} for v in vs]}


@router.post("/documents/{doc_id}/versions/{version_id}/restore")
def restore_version(doc_id: int, version_id: int, ctx: AppContext = Depends(get_ctx)):
    with ctx.db.session() as s:
        d = s.get(Document, doc_id)
        v = s.get(DocumentVersion, version_id)
        if not d or not v or v.document_id != doc_id:
            raise HTTPException(404, "Version not found")
        s.add(DocumentVersion(document_id=d.id, title=d.title, content_html=d.content_html, word_count=d.word_count))
        d.content_html = v.content_html
        d.content_text = html_to_text(v.content_html)
        d.word_count = word_count(d.content_text)
        d.updated_at = utcnow()
        return _doc_full(d)


@router.get("/documents/{doc_id}/export")
def export_document(doc_id: int, format: str = "docx", ctx: AppContext = Depends(get_ctx)):
    if format not in EXPORT_FORMATS:
        raise HTTPException(400, f"Format must be one of: {', '.join(EXPORT_FORMATS)}")
    with ctx.db.session() as s:
        d = s.get(Document, doc_id)
        if not d:
            raise HTTPException(404, "Document not found")
        title, html = d.title, d.content_html
    data, mime, ext = export(title, html, format)
    return Response(data, media_type=mime,
                    headers={"Content-Disposition": f'attachment; filename="{safe_filename(title, ext)}"'})


class ExportIn(BaseModel):
    title: str = Field("TORZ AI export", max_length=300)
    content: str
    format: str = "docx"
    is_html: Optional[bool] = None


@router.post("/export")
def export_content(body: ExportIn):
    """Export arbitrary tool output (plain text/Markdown or HTML) to a file."""
    if body.format not in EXPORT_FORMATS:
        raise HTTPException(400, "Unsupported format")
    is_html = body.is_html if body.is_html is not None else looks_like_html(body.content)
    html = body.content if is_html else text_to_html(body.content)
    data, mime, ext = export(body.title, html, body.format)
    return Response(data, media_type=mime,
                    headers={"Content-Disposition": f'attachment; filename="{safe_filename(body.title, ext)}"'})


# ------------------------------------------------------------------------------------------------ files

def _file_meta(f: StoredFile, with_text: bool = False) -> dict:
    out = {"id": f.id, "filename": f.filename, "ext": f.ext, "mime": f.mime, "size": f.size, "pages": f.page_count,
           "word_count": f.word_count, "ocr_used": f.ocr_used, "created_at": _dt(f.created_at),
           "meta": StoredFile.loads(f.meta_json, {})}
    out["meta"].pop("page_texts", None)
    if with_text:
        out["text"] = f.text
        out["page_texts"] = StoredFile.loads(f.meta_json, {}).get("page_texts")
    return out


async def _read_upload(ctx: AppContext, upload: UploadFile) -> tuple[str, bytes]:
    name = (upload.filename or "upload").replace("\\", "/").rsplit("/", 1)[-1][:200]
    limit = ctx.config.max_upload_mb * 1024 * 1024
    data = await upload.read(limit + 1)
    if len(data) > limit:
        raise HTTPException(413, f"This file is larger than the {ctx.config.max_upload_mb} MB upload limit.")
    if not data:
        raise HTTPException(400, "The file is empty.")
    return name, data


async def _extract(ctx: AppContext, name: str, data: bytes, force_ocr: bool = False):
    try:
        return await asyncio.to_thread(extract, name, data, ctx.config.max_pdf_pages, ctx.config.max_ocr_pages, force_ocr)
    except ExtractionError as exc:
        raise HTTPException(422, str(exc))


@router.post("/files")
async def upload_file(file: UploadFile = File(...), ctx: AppContext = Depends(get_ctx)):
    name, data = await _read_upload(ctx, file)
    sha = hashlib.sha256(data).hexdigest()
    with ctx.db.session() as s:
        existing = s.query(StoredFile).filter_by(sha256=sha, filename=name).first()
        if existing:
            existing.last_opened_at = utcnow()
            return {**_file_meta(existing, with_text=True), "duplicate": True, "warnings": []}
    res = await _extract(ctx, name, data)
    ext = file_ext(name)
    stored_name = f"{secrets.token_hex(8)}.{ext}"
    (ctx.config.files_dir / stored_name).write_bytes(data)
    meta = dict(res.meta)
    meta["ocr_pages"] = res.ocr_pages
    meta["warnings"] = res.warnings
    with ctx.db.session() as s:
        f = StoredFile(filename=name, ext=ext, mime=MIME.get(ext, "application/octet-stream"), size=len(data), sha256=sha,
                       stored_name=stored_name, page_count=res.pages, text=res.text, word_count=word_count(res.text),
                       ocr_used=res.ocr_used, meta_json=StoredFile.dumps(meta), last_opened_at=utcnow())
        s.add(f)
        s.flush()
        return {**_file_meta(f, with_text=True), "duplicate": False, "warnings": res.warnings}


@router.post("/extract")
async def extract_only(file: UploadFile = File(...), ctx: AppContext = Depends(get_ctx)):
    """Extract text from a file without storing it (used by 'Upload' buttons in text tools)."""
    name, data = await _read_upload(ctx, file)
    res = await _extract(ctx, name, data)
    return {"filename": name, "text": res.text, "pages": res.pages, "ocr_used": res.ocr_used, "warnings": res.warnings,
            "word_count": word_count(res.text)}


@router.get("/files")
def list_files(q: str = "", ctx: AppContext = Depends(get_ctx)):
    with ctx.db.session() as s:
        qry = s.query(StoredFile)
        if q.strip():
            qry = qry.filter(StoredFile.filename.ilike(f"%{q.strip()}%"))
        return {"files": [_file_meta(f) for f in qry.order_by(StoredFile.created_at.desc()).limit(500)]}


@router.get("/files/{file_id}")
def get_file(file_id: int, ctx: AppContext = Depends(get_ctx)):
    with ctx.db.session() as s:
        f = s.get(StoredFile, file_id)
        if not f:
            raise HTTPException(404, "File not found")
        f.last_opened_at = utcnow()
        return _file_meta(f, with_text=True)


@router.get("/files/{file_id}/raw")
def raw_file(file_id: int, ctx: AppContext = Depends(get_ctx)):
    with ctx.db.session() as s:
        f = s.get(StoredFile, file_id)
        if not f:
            raise HTTPException(404, "File not found")
        path = ctx.config.files_dir / f.stored_name
        mime, name = f.mime, f.filename
    if not path.exists():
        raise HTTPException(404, "The original file is missing from the data folder.")
    return FileResponse(path, media_type=mime, filename=name, content_disposition_type="inline")


@router.post("/files/{file_id}/ocr")
async def rerun_ocr(file_id: int, ctx: AppContext = Depends(get_ctx)):
    with ctx.db.session() as s:
        f = s.get(StoredFile, file_id)
        if not f:
            raise HTTPException(404, "File not found")
        path, name = ctx.config.files_dir / f.stored_name, f.filename
    if not path.exists():
        raise HTTPException(404, "The original file is missing.")
    res = await _extract(ctx, name, path.read_bytes(), force_ocr=True)
    with ctx.db.session() as s:
        f = s.get(StoredFile, file_id)
        f.text = res.text
        f.word_count = word_count(res.text)
        f.ocr_used = res.ocr_used
        meta = StoredFile.loads(f.meta_json, {})
        meta.update(res.meta)
        meta["ocr_pages"] = res.ocr_pages
        meta["warnings"] = res.warnings
        f.meta_json = StoredFile.dumps(meta)
        return _file_meta(f, with_text=True)


@router.post("/files/{file_id}/to-document")
def file_to_document(file_id: int, ctx: AppContext = Depends(get_ctx)):
    with ctx.db.session() as s:
        f = s.get(StoredFile, file_id)
        if not f:
            raise HTTPException(404, "File not found")
        html = text_to_html(f.text)
        d = Document(title=f.filename.rsplit(".", 1)[0][:300], content_html=html, content_text=html_to_text(html),
                     word_count=f.word_count, source_file_id=f.id, last_opened_at=utcnow())
        s.add(d)
        s.flush()
        return _doc_full(d)


@router.delete("/files/{file_id}")
def delete_file(file_id: int, ctx: AppContext = Depends(get_ctx)):
    with ctx.db.session() as s:
        f = s.get(StoredFile, file_id)
        if not f:
            raise HTTPException(404, "File not found")
        path = ctx.config.files_dir / f.stored_name
        s.delete(f)
    if path.exists():
        path.unlink()
    return {"ok": True}


@router.post("/documents/import")
async def import_document(file: UploadFile = File(...), folder_id: Optional[int] = Form(None),
                          ctx: AppContext = Depends(get_ctx)):
    name, data = await _read_upload(ctx, file)
    res = await _extract(ctx, name, data)
    ext = file_ext(name)
    html = res.text if ext in ("md", "markdown", "txt") and looks_like_html(res.text) else text_to_html(res.text)
    with ctx.db.session() as s:
        d = Document(title=name.rsplit(".", 1)[0][:300], content_html=html, content_text=html_to_text(html),
                     word_count=word_count(res.text), folder_id=folder_id, last_opened_at=utcnow())
        s.add(d)
        s.flush()
        return {**_doc_full(d), "warnings": res.warnings}


# ------------------------------------------------------------------------------------------------ notes

class NoteIn(BaseModel):
    title: str = Field("Untitled note", max_length=300)
    content_html: str = ""
    tags: str = Field("", max_length=500)
    color: str = Field("", max_length=20)
    pinned: bool = False


class NotePatch(BaseModel):
    title: Optional[str] = Field(None, max_length=300)
    content_html: Optional[str] = None
    tags: Optional[str] = Field(None, max_length=500)
    color: Optional[str] = Field(None, max_length=20)
    pinned: Optional[bool] = None


def _note(n: Note, full: bool = False) -> dict:
    out = {"id": n.id, "title": n.title, "tags": [t for t in (n.tags or "").split(",") if t.strip()],
           "color": n.color, "pinned": n.pinned, "engine": n.engine, "provider": n.provider, "model": n.model,
           "snippet": (n.content_text or "")[:180], "created_at": _dt(n.created_at), "updated_at": _dt(n.updated_at),
           "source_file_id": n.source_file_id}
    if full:
        out["content_html"] = n.content_html
        out["data"] = Note.loads(n.data_json, {})
    return out


@router.get("/notes")
def list_notes(q: str = "", tag: str = "", ctx: AppContext = Depends(get_ctx)):
    with ctx.db.session() as s:
        qry = s.query(Note)
        if q.strip():
            like = f"%{q.strip()}%"
            qry = qry.filter(or_(Note.title.ilike(like), Note.content_text.ilike(like)))
        if tag.strip():
            qry = qry.filter(Note.tags.ilike(f"%{tag.strip()}%"))
        notes = qry.order_by(Note.pinned.desc(), Note.updated_at.desc()).limit(500).all()
        tags = sorted({t.strip() for n in s.query(Note.tags) for t in (n[0] or "").split(",") if t.strip()})
        return {"notes": [_note(n) for n in notes], "tags": tags}


@router.post("/notes")
def create_note(body: NoteIn, ctx: AppContext = Depends(get_ctx)):
    with ctx.db.session() as s:
        n = Note(title=body.title.strip() or "Untitled note", content_html=body.content_html,
                 content_text=html_to_text(body.content_html), tags=_tags(body.tags), color=body.color,
                 pinned=body.pinned, engine="manual")
        s.add(n)
        s.flush()
        return _note(n, True)


def _tags(raw: str) -> str:
    return ",".join(dict.fromkeys(t.strip() for t in (raw or "").split(",") if t.strip()))


@router.get("/notes/{note_id}")
def get_note(note_id: int, ctx: AppContext = Depends(get_ctx)):
    with ctx.db.session() as s:
        n = s.get(Note, note_id)
        if not n:
            raise HTTPException(404, "Note not found")
        return _note(n, True)


@router.patch("/notes/{note_id}")
def update_note(note_id: int, body: NotePatch, ctx: AppContext = Depends(get_ctx)):
    with ctx.db.session() as s:
        n = s.get(Note, note_id)
        if not n:
            raise HTTPException(404, "Note not found")
        if body.title is not None:
            n.title = body.title.strip() or "Untitled note"
        if body.content_html is not None:
            n.content_html = body.content_html
            n.content_text = html_to_text(body.content_html)
        if body.tags is not None:
            n.tags = _tags(body.tags)
        if body.color is not None:
            n.color = body.color
        if body.pinned is not None:
            n.pinned = body.pinned
        n.updated_at = utcnow()
        return _note(n, True)


@router.delete("/notes/{note_id}")
def delete_note(note_id: int, ctx: AppContext = Depends(get_ctx)):
    with ctx.db.session() as s:
        n = s.get(Note, note_id)
        if not n:
            raise HTTPException(404, "Note not found")
        s.delete(n)
    return {"ok": True}


@router.get("/notes/{note_id}/export")
def export_note(note_id: int, format: str = "md", ctx: AppContext = Depends(get_ctx)):
    if format not in EXPORT_FORMATS:
        raise HTTPException(400, "Unsupported format")
    with ctx.db.session() as s:
        n = s.get(Note, note_id)
        if not n:
            raise HTTPException(404, "Note not found")
        title, html = n.title, n.content_html
    data, mime, ext = export(title, html, format)
    return Response(data, media_type=mime, headers={"Content-Disposition": f'attachment; filename="{safe_filename(title, ext)}"'})


@router.post("/notes/{note_id}/to-document")
def note_to_document(note_id: int, ctx: AppContext = Depends(get_ctx)):
    with ctx.db.session() as s:
        n = s.get(Note, note_id)
        if not n:
            raise HTTPException(404, "Note not found")
        d = Document(title=n.title, content_html=n.content_html, content_text=n.content_text,
                     word_count=word_count(n.content_text), last_opened_at=utcnow())
        s.add(d)
        s.flush()
        return _doc_full(d)


# ------------------------------------------------------------------------------------------------ summaries

@router.get("/summaries")
def list_summaries(ctx: AppContext = Depends(get_ctx)):
    with ctx.db.session() as s:
        return {"summaries": [{"id": m.id, "title": m.title, "format": m.format, "content": m.content, "engine": m.engine,
                               "model": m.model, "created_at": _dt(m.created_at), "history_id": m.history_id}
                              for m in s.query(Summary).order_by(Summary.created_at.desc()).limit(200)]}


@router.delete("/summaries/{summary_id}")
def delete_summary(summary_id: int, ctx: AppContext = Depends(get_ctx)):
    with ctx.db.session() as s:
        m = s.get(Summary, summary_id)
        if not m:
            raise HTTPException(404, "Summary not found")
        s.delete(m)
    return {"ok": True}
