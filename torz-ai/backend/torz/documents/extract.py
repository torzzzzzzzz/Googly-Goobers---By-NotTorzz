"""Safe text extraction from PDF, DOCX, TXT, Markdown and images (OCR)."""
from __future__ import annotations

import io
import logging
import re
import threading
import zipfile
from dataclasses import dataclass, field
from typing import Any

log = logging.getLogger("torz.documents")

SUPPORTED_EXT = {"pdf", "docx", "txt", "md", "markdown", "png", "jpg", "jpeg", "webp", "bmp", "tif", "tiff"}
IMAGE_EXT = {"png", "jpg", "jpeg", "webp", "bmp", "tif", "tiff"}
MIME = {
    "pdf": "application/pdf",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "txt": "text/plain",
    "md": "text/markdown",
    "markdown": "text/markdown",
    "png": "image/png",
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "webp": "image/webp",
    "bmp": "image/bmp",
    "tif": "image/tiff",
    "tiff": "image/tiff",
}
MAX_DOCX_UNCOMPRESSED = 250 * 1024 * 1024


class ExtractionError(Exception):
    pass


@dataclass
class ExtractResult:
    text: str
    pages: int = 0
    ocr_used: bool = False
    ocr_pages: int = 0
    warnings: list[str] = field(default_factory=list)
    meta: dict[str, Any] = field(default_factory=dict)


def file_ext(filename: str) -> str:
    return filename.rsplit(".", 1)[-1].lower() if "." in filename else ""


def sniff_ok(ext: str, data: bytes) -> bool:
    head = data[:16]
    if ext == "pdf":
        return b"%PDF" in data[:1024]
    if ext == "docx":
        return head.startswith(b"PK\x03\x04")
    if ext == "png":
        return head.startswith(b"\x89PNG")
    if ext in ("jpg", "jpeg"):
        return head.startswith(b"\xff\xd8\xff")
    if ext == "webp":
        return head[:4] == b"RIFF" and head[8:12] == b"WEBP"
    if ext == "bmp":
        return head.startswith(b"BM")
    if ext in ("tif", "tiff"):
        return head[:4] in (b"II*\x00", b"MM\x00*")
    if ext in ("txt", "md", "markdown"):
        return b"\x00" not in data[:4096] or data[:2] in (b"\xff\xfe", b"\xfe\xff")
    return False


# ------------------------------------------------------------------------------------------------ OCR

_ocr_engine = None
_ocr_lock = threading.Lock()
_ocr_error: str | None = None


def ocr_available() -> tuple[bool, str]:
    try:
        import rapidocr  # noqa: F401

        return True, "RapidOCR (offline ONNX models)"
    except Exception as exc:  # pragma: no cover - depends on install
        return False, f"OCR engine not installed ({exc.__class__.__name__}). Re-run INSTALL.bat to add it."


def _engine():
    global _ocr_engine, _ocr_error
    with _ocr_lock:
        if _ocr_engine is None and _ocr_error is None:
            try:
                logging.getLogger("RapidOCR").addFilter(lambda rec: rec.levelno >= logging.WARNING)
                from rapidocr import RapidOCR

                _ocr_engine = RapidOCR()
            except Exception as exc:  # pragma: no cover
                _ocr_error = str(exc)
        if _ocr_engine is None:
            raise ExtractionError(f"OCR is unavailable: {_ocr_error}")
        return _ocr_engine


def ocr_image(image) -> str:
    """OCR a PIL image or numpy array and return text in reading order."""
    import numpy as np

    eng = _engine()
    arr = np.array(image.convert("RGB")) if hasattr(image, "convert") else image
    res = eng(arr)
    boxes = getattr(res, "boxes", None)
    txts = getattr(res, "txts", None)
    if not txts:
        return ""
    items = []
    for box, t in zip(boxes if boxes is not None else [None] * len(txts), txts):
        if box is None:
            items.append((0, 0, t, 20))
            continue
        ys = [p[1] for p in box]
        xs = [p[0] for p in box]
        items.append((min(ys), min(xs), t, max(ys) - min(ys)))
    # group into lines by y, then sort by x
    items.sort(key=lambda it: (it[0], it[1]))
    lines: list[list[tuple]] = []
    for it in items:
        if lines and abs(lines[-1][0][0] - it[0]) < max(8, it[3] * 0.6):
            lines[-1].append(it)
        else:
            lines.append([it])
    text_lines = [" ".join(t for _, _, t, _ in sorted(line, key=lambda x: x[1])) for line in lines]
    # paragraph breaks where vertical gaps are large
    out = []
    prev_y, prev_h = None, None
    for line, txt in zip(lines, text_lines):
        y, h = line[0][0], line[0][3]
        if prev_y is not None and y - prev_y > (prev_h or h) * 2.2:
            out.append("")
        out.append(txt)
        prev_y, prev_h = y, h
    return "\n".join(out).strip()


# ------------------------------------------------------------------------------------------------ PDF

def _clean_pdf_text(t: str) -> str:
    t = t.replace("\r\n", "\n").replace("\r", "\n").replace("\x00", "")
    t = re.sub(r"(\w)-\n(\w)", r"\1\2", t)  # de-hyphenate line wraps
    t = re.sub(r"[ \t]+\n", "\n", t)
    t = re.sub(r"\n{3,}", "\n\n", t)
    return t.strip()


def extract_pdf(data: bytes, max_pages: int, ocr: bool = True, max_ocr_pages: int = 60,
                force_ocr: bool = False) -> ExtractResult:
    import pypdfium2 as pdfium

    try:
        pdf = pdfium.PdfDocument(data)
    except pdfium.PdfiumError as exc:
        msg = str(exc).lower()
        if "password" in msg:
            raise ExtractionError("This PDF is password-protected. Remove the password and upload it again.")
        raise ExtractionError("This file could not be read as a PDF. It may be damaged.")
    try:
        n = len(pdf)
        if n > max_pages:
            raise ExtractionError(f"This PDF has {n} pages; the limit is {max_pages}.")
        res = ExtractResult(text="", pages=n)
        parts: list[str] = []
        ocr_ok = ocr and ocr_available()[0]
        empty_pages = 0
        for i in range(n):
            page = pdf[i]
            try:
                tp = page.get_textpage()
                txt = tp.get_text_range() or ""
                tp.close()
            except Exception:
                txt = ""
            if (force_ocr or len(txt.strip()) < 25) and ocr_ok and res.ocr_pages < max_ocr_pages:
                try:
                    img = page.render(scale=2.2).to_pil()
                    o = ocr_image(img)
                    if len(o.strip()) > len(txt.strip()):
                        txt = o
                        res.ocr_pages += 1
                        res.ocr_used = True
                except Exception as exc:
                    res.warnings.append(f"OCR failed on page {i + 1}: {exc}")
            elif len(txt.strip()) < 25:
                empty_pages += 1
            page.close()
            parts.append(_clean_pdf_text(txt))
        res.text = "\n\n".join(p for p in parts if p)
        res.meta["page_texts"] = parts
        if empty_pages and not ocr_ok:
            res.warnings.append(f"{empty_pages} page(s) contain no selectable text and OCR is not available.")
        if res.ocr_pages >= max_ocr_pages and n > max_ocr_pages:
            res.warnings.append(f"OCR was limited to the first {max_ocr_pages} scanned pages.")
        if not res.text.strip():
            raise ExtractionError("No text could be found in this PDF. If it is a scan, make sure OCR is installed.")
        return res
    finally:
        pdf.close()


# ------------------------------------------------------------------------------------------------ DOCX

def extract_docx(data: bytes) -> ExtractResult:
    try:
        zf = zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile:
        raise ExtractionError("This file is not a valid DOCX document.")
    total = sum(i.file_size for i in zf.infolist())
    if total > MAX_DOCX_UNCOMPRESSED:
        raise ExtractionError("This DOCX expands to an unsafe size and was rejected.")
    if "word/document.xml" not in zf.namelist():
        raise ExtractionError("This ZIP file is not a Word document.")
    import docx

    try:
        d = docx.Document(io.BytesIO(data))
    except Exception as exc:
        raise ExtractionError(f"The DOCX could not be opened: {exc}")
    lines: list[str] = []
    body = d.element.body
    from docx.table import Table
    from docx.text.paragraph import Paragraph

    for child in body.iterchildren():
        tag = child.tag.rsplit("}", 1)[-1]
        if tag == "p":
            p = Paragraph(child, d)
            t = p.text.strip()
            if not t:
                continue
            style = (p.style.name if p.style is not None else "") or ""
            if style.lower().startswith("heading"):
                lvl = re.sub(r"\D", "", style) or "2"
                lines.append("#" * min(int(lvl), 6) + " " + t)
            elif style.lower().startswith("title"):
                lines.append("# " + t)
            elif "list" in style.lower():
                lines.append("- " + t)
            else:
                lines.append(t)
        elif tag == "tbl":
            tbl = Table(child, d)
            for row in tbl.rows:
                cells = []
                for c in row.cells:
                    ct = c.text.strip().replace("\n", " ")
                    if not cells or cells[-1] != ct:
                        cells.append(ct)
                if any(cells):
                    lines.append(" | ".join(cells))
    text = "\n\n".join(lines).strip()
    if not text:
        raise ExtractionError("This Word document does not contain any text.")
    core = d.core_properties
    meta = {"title": core.title or "", "author": core.author or ""}
    return ExtractResult(text=text, pages=0, meta=meta)


# ------------------------------------------------------------------------------------------------ text

def extract_text_file(data: bytes) -> ExtractResult:
    from charset_normalizer import from_bytes

    if data.startswith(b"\xef\xbb\xbf"):
        text = data[3:].decode("utf-8", "replace")
    else:
        try:
            text = data.decode("utf-8")
        except UnicodeDecodeError:
            best = from_bytes(data).best()
            if best is None:
                raise ExtractionError("The text encoding of this file could not be detected.")
            text = str(best)
    text = text.replace("\r\n", "\n").replace("\r", "\n").replace("\x00", "")
    if not text.strip():
        raise ExtractionError("This file is empty.")
    return ExtractResult(text=text.strip())


def extract_image(data: bytes) -> ExtractResult:
    from PIL import Image

    ok, msg = ocr_available()
    if not ok:
        raise ExtractionError(msg)
    try:
        img = Image.open(io.BytesIO(data))
        img.load()
    except Exception:
        raise ExtractionError("This image could not be opened.")
    if img.width * img.height > 60_000_000:
        raise ExtractionError("This image is too large to process.")
    text = ocr_image(img)
    if not text.strip():
        raise ExtractionError("No text was recognised in this image.")
    return ExtractResult(text=text, pages=1, ocr_used=True, ocr_pages=1)


def extract(filename: str, data: bytes, max_pages: int = 1500, max_ocr_pages: int = 60,
            force_ocr: bool = False) -> ExtractResult:
    ext = file_ext(filename)
    if ext not in SUPPORTED_EXT:
        raise ExtractionError(
            f"Unsupported file type '.{ext}'. Supported: PDF, DOCX, TXT, Markdown, and images (PNG/JPG) for OCR."
        )
    if not data:
        raise ExtractionError("The file is empty.")
    if not sniff_ok(ext, data):
        raise ExtractionError(f"The file content does not match its .{ext} extension.")
    if ext == "pdf":
        return extract_pdf(data, max_pages, True, max_ocr_pages, force_ocr)
    if ext == "docx":
        return extract_docx(data)
    if ext in IMAGE_EXT:
        return extract_image(data)
    return extract_text_file(data)
