"""Documents, folders, uploads/extraction, notes, decks, history, favorites, settings, dashboard, system."""
import io
import json
import zipfile

import docx
import pytest
from fpdf import FPDF
from PIL import Image, ImageDraw, ImageFont

from conftest import MATERIAL, done, sse
from torz.documents.extract import ocr_available


def make_pdf(text: str) -> bytes:
    p = FPDF()
    p.add_page()
    p.set_font("Helvetica", size=12)
    p.multi_cell(0, 8, text)
    p.add_page()
    p.multi_cell(0, 8, "Second page about the Calvin cycle.")
    return bytes(p.output())


def make_scanned_pdf(lines: list[str]) -> bytes:
    img = Image.new("RGB", (1240, 700), "white")
    d = ImageDraw.Draw(img)
    try:
        f = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 40)
    except OSError:
        f = ImageFont.load_default(size=40)
    for i, line in enumerate(lines):
        d.text((60, 80 + i * 110), line, fill="black", font=f)
    buf = io.BytesIO()
    img.save(buf, format="PDF")
    return buf.getvalue()


def make_docx() -> bytes:
    d = docx.Document()
    d.add_heading("Cell Biology", 1)
    d.add_paragraph("The nucleus contains DNA and controls the cell.")
    d.add_paragraph("Mitochondria", style="List Bullet")
    t = d.add_table(rows=1, cols=2)
    t.rows[0].cells[0].text = "Organelle"
    t.rows[0].cells[1].text = "Function"
    b = io.BytesIO()
    d.save(b)
    return b.getvalue()


# ------------------------------------------------------------------------------------------------ documents

def test_document_lifecycle_versions_trash_and_export(client):
    d = client.post("/api/documents", json={"title": "Essay draft", "content_html": "<h1>Intro</h1><p>First <strong>bold</strong> line.</p>"}).json()
    assert d["word_count"] == 4 and "First bold line." in d["content_text"]
    # autosave edits
    for i in range(3):
        d = client.patch(f"/api/documents/{d['id']}", json={"content_html": f"<p>Version {i} text here.</p>"}).json()
    assert d["content_text"] == "Version 2 text here."
    client.patch(f"/api/documents/{d['id']}", json={"content_html": "<p>Final.</p>", "snapshot": True})
    versions = client.get(f"/api/documents/{d['id']}/versions").json()["versions"]
    assert len(versions) >= 2  # first edit + explicit snapshot
    restored = client.post(f"/api/documents/{d['id']}/versions/{versions[-1]['id']}/restore").json()
    assert "Intro" in restored["content_text"]
    # rename, pin, search
    client.patch(f"/api/documents/{d['id']}", json={"title": "Renamed essay", "pinned": True})
    found = client.get("/api/documents", params={"q": "renamed"}).json()["documents"]
    assert found[0]["title"] == "Renamed essay" and found[0]["pinned"]
    # exports
    for fmt, magic in [("docx", b"PK"), ("pdf", b"%PDF"), ("md", b"# Renamed essay"), ("txt", b"Renamed essay"), ("html", b"<!doctype html>")]:
        r = client.get(f"/api/documents/{d['id']}/export", params={"format": fmt})
        assert r.status_code == 200 and r.content.startswith(magic), fmt
        assert "attachment" in r.headers["content-disposition"]
    assert client.get(f"/api/documents/{d['id']}/export", params={"format": "exe"}).status_code == 400
    # duplicate, trash, restore, permanent delete
    dup = client.post(f"/api/documents/{d['id']}/duplicate").json()
    assert dup["title"].endswith("(copy)")
    client.delete(f"/api/documents/{d['id']}")
    assert client.get("/api/documents", params={"trash": True}).json()["documents"][0]["id"] == d["id"]
    assert all(x["id"] != d["id"] for x in client.get("/api/documents").json()["documents"])
    client.post(f"/api/documents/{d['id']}/restore")
    assert any(x["id"] == d["id"] for x in client.get("/api/documents").json()["documents"])
    client.delete(f"/api/documents/{dup['id']}")
    assert client.post("/api/documents/trash/empty").json()["deleted"] == 1
    assert client.get(f"/api/documents/{dup['id']}").status_code == 404


def test_folders_organize_documents(client):
    f = client.post("/api/folders", json={"name": "History"}).json()
    sub = client.post("/api/folders", json={"name": "WW2", "parent_id": f["id"]}).json()
    d = client.post("/api/documents", json={"title": "Notes", "folder_id": sub["id"]}).json()
    assert client.get("/api/documents", params={"folder_id": sub["id"]}).json()["documents"][0]["id"] == d["id"]
    client.patch(f"/api/documents/{d['id']}", json={"folder_id": f["id"]})
    folders = {x["name"]: x for x in client.get("/api/folders").json()["folders"]}
    assert folders["History"]["count"] == 1
    client.patch(f"/api/folders/{f['id']}", json={"name": "Modern history"})
    client.delete(f"/api/folders/{f['id']}")  # subfolders deleted, documents kept
    assert client.get(f"/api/documents/{d['id']}").json()["folder_id"] is None
    assert client.get("/api/folders").json()["folders"] == []


# ------------------------------------------------------------------------------------------------ uploads

def test_pdf_upload_extract_reopen_and_tools(client):
    r = client.post("/api/files", files={"file": ("bio.pdf", make_pdf(MATERIAL), "application/pdf")})
    assert r.status_code == 200, r.text
    f = r.json()
    assert f["pages"] == 2 and "chloroplasts" in f["text"] and len(f["page_texts"]) == 2
    raw = client.get(f"/api/files/{f['id']}/raw")
    assert raw.content.startswith(b"%PDF") and raw.headers["content-type"] == "application/pdf"
    again = client.post("/api/files", files={"file": ("bio.pdf", make_pdf(MATERIAL), "application/pdf")}).json()
    assert again["duplicate"] and again["id"] == f["id"]
    s = done(sse(client.post("/api/tools/summarize", json={"file_id": f["id"], "format": "short"})))
    assert s["output"]
    doc = client.post(f"/api/files/{f['id']}/to-document").json()
    assert "Calvin" in doc["content_text"]
    assert client.get("/api/dashboard").json()["recent_files"][0]["filename"] == "bio.pdf"
    client.delete(f"/api/files/{f['id']}")
    assert client.get(f"/api/files/{f['id']}").status_code == 404


def test_docx_txt_md_upload_and_import(client):
    f = client.post("/api/files", files={"file": ("cells.docx", make_docx(), "application/octet-stream")}).json()
    assert "# Cell Biology" in f["text"] and "- Mitochondria" in f["text"] and "Organelle | Function" in f["text"]
    t = client.post("/api/extract", files={"file": ("n.txt", "Plain ünïcode text.".encode("utf-8"), "text/plain")}).json()
    assert t["text"] == "Plain ünïcode text."
    latin = client.post("/api/extract", files={"file": ("l.txt", "Café crème brûlée is a dessert from France.".encode("cp1252"), "text/plain")}).json()
    assert "Café" in latin["text"]
    imp = client.post("/api/documents/import", files={"file": ("readme.md", b"# Heading\n\nSome **bold** text.\n\n- a\n- b", "text/markdown")}).json()
    assert imp["title"] == "readme" and "<h1>" in client.get(f"/api/documents/{imp['id']}").json()["content_html"]


@pytest.mark.skipif(not ocr_available()[0], reason="OCR engine not installed")
def test_scanned_pdf_and_image_use_ocr(client):
    f = client.post("/api/files", files={"file": ("scan.pdf", make_scanned_pdf(["Mitochondria produce ATP.", "Ribosomes build proteins."]), "application/pdf")}).json()
    assert f["ocr_used"] and f["meta"]["ocr_pages"] == 1
    assert "Mitochondria produce ATP" in f["text"] and "Ribosomes" in f["text"]
    img = Image.new("RGB", (900, 200), "white")
    ImageDraw.Draw(img).text((20, 60), "Hello OCR world", fill="black", font=ImageFont.load_default(size=48))
    b = io.BytesIO()
    img.save(b, format="PNG")
    r = client.post("/api/extract", files={"file": ("pic.png", b.getvalue(), "image/png")}).json()
    assert "Hello" in r["text"] and r["ocr_used"]


def test_upload_validation_and_errors(client, app):
    bad = client.post("/api/files", files={"file": ("fake.pdf", b"this is not a pdf", "application/pdf")})
    assert bad.status_code == 422 and "does not match" in bad.json()["detail"]
    exe = client.post("/api/files", files={"file": ("virus.exe", b"MZ...", "application/octet-stream")})
    assert exe.status_code == 422 and "Unsupported" in exe.json()["detail"]
    empty = client.post("/api/files", files={"file": ("e.txt", b"", "text/plain")})
    assert empty.status_code == 400
    # zip bomb disguised as docx
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("word/document.xml", b"0" * (260 * 1024 * 1024))
    bomb = client.post("/api/files", files={"file": ("bomb.docx", buf.getvalue(), "application/octet-stream")})
    assert bomb.status_code == 422 and "unsafe" in bomb.json()["detail"]
    app.state.ctx.config.max_upload_mb = 1
    big = client.post("/api/files", files={"file": ("big.txt", b"a " * (600 * 1024), "text/plain")})
    assert big.status_code == 413
    # path traversal in filename is neutralised
    ok = client.post("/api/files", files={"file": ("../../evil.txt", b"safe content here", "text/plain")}).json()
    assert ok["filename"] == "evil.txt"
    stored = list((app.state.ctx.config.files_dir).glob("*"))
    assert all(p.parent == app.state.ctx.config.files_dir for p in stored)


def test_password_protected_pdf_reports_clearly(client):
    import pypdfium2  # noqa: F401
    from pypdf import PdfReader, PdfWriter  # type: ignore

    w = PdfWriter()
    w.append(PdfReader(io.BytesIO(make_pdf("secret text"))))
    w.encrypt("pw")
    b = io.BytesIO()
    w.write(b)
    r = client.post("/api/files", files={"file": ("locked.pdf", b.getvalue(), "application/pdf")})
    assert r.status_code == 422 and "password" in r.json()["detail"].lower()


# ------------------------------------------------------------------------------------------------ notes / decks

def test_notes_crud_tags_export(client):
    n = client.post("/api/notes", json={"title": "Bio", "content_html": "<p>Cells are small.</p>", "tags": "biology, unit 1, biology"}).json()
    assert n["tags"] == ["biology", "unit 1"]
    client.patch(f"/api/notes/{n['id']}", json={"content_html": "<p>Cells are tiny.</p>", "pinned": True})
    lst = client.get("/api/notes", params={"tag": "unit 1"}).json()
    assert lst["notes"][0]["pinned"] and lst["tags"] == ["biology", "unit 1"]
    assert client.get("/api/notes", params={"q": "tiny"}).json()["notes"]
    md = client.get(f"/api/notes/{n['id']}/export", params={"format": "md"})
    assert md.text.startswith("# Bio") and "Cells are tiny." in md.text
    doc = client.post(f"/api/notes/{n['id']}/to-document").json()
    assert doc["title"] == "Bio"
    client.delete(f"/api/notes/{n['id']}")
    assert client.get(f"/api/notes/{n['id']}").status_code == 404


def test_deck_manual_edit_import_export(client):
    d = client.post("/api/decks", json={"title": "Spanish", "cards": [{"front": "hola", "back": "hello"}, {"front": "adiós", "back": "goodbye"}]}).json()
    c = client.post(f"/api/decks/{d['id']}/cards", json={"front": "gracias", "back": "thank you"}).json()
    client.patch(f"/api/cards/{c['id']}", json={"back": "thanks"})
    deck = client.get(f"/api/decks/{d['id']}").json()
    assert [x["back"] for x in deck["cards"]] == ["hello", "goodbye", "thanks"]
    j = client.get(f"/api/decks/{d['id']}/export", params={"format": "json"})
    assert json.loads(j.text)["cards"][2]["front"] == "gracias"
    csv_text = client.get(f"/api/decks/{d['id']}/export", params={"format": "csv"}).text
    assert csv_text.startswith("front,back")
    imp = client.post("/api/decks/import", files={"file": ("spanish.csv", csv_text.encode(), "text/csv")}).json()
    assert imp["imported"] == 3
    imp2 = client.post("/api/decks/import", files={"file": ("deck.json", j.content, "application/json")}).json()
    assert imp2["imported"] == 3 and imp2["title"] == "Spanish"
    tsv = client.post("/api/decks/import", files={"file": ("anki.txt", b"cat\tgato\ndog\tperro\n", "text/plain")}).json()
    assert tsv["imported"] == 2
    bad = client.post("/api/decks/import", files={"file": ("x.json", b"{oops", "application/json")})
    assert bad.status_code == 422
    client.patch(f"/api/cards/{c['id']}", json={"status": "known"})
    reset = client.post(f"/api/decks/{d['id']}/reset").json()
    assert all(x["status"] == "new" for x in reset["cards"])
    client.delete(f"/api/cards/{c['id']}")
    client.delete(f"/api/decks/{d['id']}")
    assert client.get(f"/api/decks/{d['id']}").status_code == 404


# ------------------------------------------------------------------------------------------------ history / favorites / settings / dashboard / search

def test_history_search_rename_delete_clear(client):
    for t in ["First text about whales and oceans.", "Second text about mountains."]:
        done(sse(client.post("/api/tools/paraphrase", json={"text": t})))
    done(sse(client.post("/api/tools/summarize", json={"text": MATERIAL, "engine": "offline"})))
    h = client.get("/api/history").json()
    assert h["total"] == 3 and h["tools"] == {"paraphraser": 2, "summarizer": 1}
    assert client.get("/api/history", params={"q": "whales"}).json()["total"] == 1
    e = h["entries"][0]
    client.patch(f"/api/history/{e['id']}", json={"title": "My summary"})
    assert client.get(f"/api/history/{e['id']}").json()["title"] == "My summary"
    client.delete(f"/api/history/{e['id']}")
    assert client.get("/api/history").json()["total"] == 2
    assert client.delete("/api/history", params={"tool": "paraphraser"}).json()["deleted"] == 2
    assert client.get("/api/history").json()["total"] == 0


def test_favorites_order_and_validation(client):
    for t in ["quiz", "humanizer", "notes"]:
        client.post(f"/api/favorites/{t}")
    assert client.get("/api/favorites").json()["favorites"] == ["quiz", "humanizer", "notes"]
    assert client.put("/api/favorites", json={"tool_ids": ["notes", "quiz", "bogus", "notes"]}).json()["favorites"] == ["notes", "quiz"]
    client.delete("/api/favorites/notes")
    assert client.get("/api/favorites").json()["favorites"] == ["quiz"]
    assert client.post("/api/favorites/bogus").status_code == 404


def test_settings_patch_merge_and_reject_unknown(client):
    s = client.patch("/api/settings", json={"patch": {"appearance": {"theme": "light", "accent": "violet"}}}).json()["settings"]
    assert s["appearance"]["theme"] == "light" and s["appearance"]["font_size"] == "medium"
    s = client.patch("/api/settings", json={"patch": {"ai": {"providers": {"ollama": {"base_url": "http://127.0.0.1:11435"}}}}}).json()["settings"]
    assert s["ai"]["providers"]["ollama"]["base_url"] == "http://127.0.0.1:11435" and s["ai"]["providers"]["openai"]
    assert client.patch("/api/settings", json={"patch": {"hacker": {"x": 1}}}).status_code == 400


def test_dashboard_stats_and_recent(client):
    client.post("/api/usage/grammar")
    done(sse(client.post("/api/tools/grammar", json={"text": "teh cat", "engine": "offline"})))
    client.post("/api/documents", json={"title": "Doc A"})
    d = client.get("/api/dashboard").json()
    recent = {r["tool_id"]: r for r in d["recent_tools"]}
    assert d["recent_tools"][0]["tool_id"] == "documents"  # most recently used
    assert recent["grammar"]["count"] == 2
    assert d["recent_documents"][0]["title"] == "Doc A"
    assert d["stats"]["runs_week"] == 1 and d["stats"]["words_total"] == 2
    assert len(d["stats"]["daily"]) == 14 and d["stats"]["daily"][-1]["runs"] == 1
    assert d["recent_history"][0]["tool"] == "grammar"


def test_global_search(client):
    client.post("/api/documents", json={"title": "Volcano report", "content_html": "<p>Lava flows</p>"})
    client.post("/api/notes", json={"title": "Geology notes", "content_html": "<p>volcano types</p>"})
    client.post("/api/decks", json={"title": "Volcano deck"})
    res = client.get("/api/search", params={"q": "volcano"}).json()["results"]
    assert {r["kind"] for r in res} >= {"document", "note", "deck"}
    assert client.get("/api/search", params={"q": "v"}).json()["results"] == []


def test_system_info_diagnostics_export_and_reset(client, app):
    info = client.get("/api/system/info").json()
    assert info["version"] == "1.0.0" and info["db_schema_version"] >= 2 and info["data_dir"]
    diag = client.post("/api/system/diagnostics").json()
    names = {c["name"]: c for c in diag["checks"]}
    assert names["Database integrity"]["ok"] and names["Data folder writable"]["ok"] and names["AI model"]["ok"]
    assert names["Secure key storage"]["ok"]
    client.post("/api/documents", json={"title": "Keep me"})
    z = client.get("/api/system/export")
    zf = zipfile.ZipFile(io.BytesIO(z.content))
    assert "data/documents.json" in zf.namelist() and "Keep me" in zf.read("data/documents.json").decode()
    assert "sk-" not in json.dumps([zf.read(n).decode("utf-8", "ignore") for n in zf.namelist() if n.endswith(".json")])
    assert client.post("/api/system/reset", json={"confirm": "nope"}).status_code == 400
    client.put("/api/ai/providers/openai/key", json={"key": "sk-abcdefghijkl"})
    assert client.post("/api/system/reset", json={"confirm": "RESET"}).json()["ok"]
    assert client.get("/api/documents").json()["documents"] == []
    assert client.get("/api/settings").json()["api_keys"]["openai"]["set"] is False
    assert client.post("/api/system/shutdown").json()["ok"] is False  # only via launcher


def test_autotyper_jobs_for_extension(client):
    j = client.post("/api/autotyper/jobs", json={"title": "Essay", "text": "Hello world", "wpm": 90}).json()
    assert client.get("/api/autotyper/jobs/latest").json()["job"]["id"] == j["id"]
    j2 = client.post("/api/autotyper/jobs", json={"text": "Newer"}).json()
    assert client.get("/api/autotyper/jobs/latest").json()["job"]["id"] == j2["id"]
    assert [x["status"] for x in client.get("/api/autotyper/jobs").json()["jobs"]] == ["ready", "superseded"]
    client.patch(f"/api/autotyper/jobs/{j2['id']}", json={"status": "typing", "progress": 3})
    done_job = client.patch(f"/api/autotyper/jobs/{j2['id']}", json={"status": "done", "progress": 5}).json()
    assert done_job["status"] == "done" and done_job["progress"] == 5
    assert client.get("/api/history", params={"tool": "autotyper"}).json()["total"] == 1
    assert client.patch(f"/api/autotyper/jobs/{j2['id']}", json={"status": "hacked"}).status_code == 422
