"""Startup, security, database persistence and migrations."""
from fastapi.testclient import TestClient
from sqlalchemy import inspect, text

from conftest import DIST
from torz.config import AppConfig
from torz.db import LATEST_VERSION, Database
from torz.main import create_app


def test_startup_health_and_spa(client):
    r = client.get("/api/health")
    assert r.json() == {"ok": True, "app": "TORZ AI", "version": "1.0.0"}
    if (DIST / "index.html").exists():
        page = client.get("/")
        assert page.status_code == 200
        assert 'name="torz-token"' in page.text
        deep = client.get("/humanizer")  # SPA route falls back to index.html
        assert deep.status_code == 200 and "<div id=\"root\">" in deep.text


def test_api_requires_token(app):
    with TestClient(app, base_url="http://127.0.0.1:8765") as c:
        assert c.get("/api/settings").status_code == 401
        assert c.get("/api/settings", headers={"X-TORZ-Token": "wrong"}).status_code == 401
        assert c.get("/api/settings", headers={"X-TORZ-Token": app.state.ctx.token}).status_code == 200


def test_host_and_origin_checks(client, app):
    assert client.get("/api/health", headers={"Host": "evil.example.com"}).status_code == 403
    assert client.get("/api/settings", headers={"Origin": "https://evil.example.com"}).status_code == 403
    assert client.get("/api/settings", headers={"Origin": "http://127.0.0.1:8765"}).status_code == 200
    ext = f"chrome-extension://{app.state.ctx.config.extension_ids[0]}"
    r = client.get("/api/session", headers={"Origin": ext, "Sec-Fetch-Site": "cross-site"})
    assert r.status_code == 200 and r.json()["token"] == app.state.ctx.token
    assert r.headers["access-control-allow-origin"] == ext
    other = client.get("/api/session", headers={"Origin": "chrome-extension://abcdefghijklmnopabcdefghijklmnop"})
    assert other.status_code == 403
    pre = client.options("/api/tools/humanize", headers={"Origin": "https://evil.example.com", "Access-Control-Request-Method": "POST"})
    assert pre.status_code == 403


def test_token_persists_and_is_private(config, transports):
    a = create_app(config, transport_factory=transports)
    b = create_app(config, transport_factory=transports)
    assert a.state.ctx.token == b.state.ctx.token
    assert (config.data_dir / "token").read_text().strip() == a.state.ctx.token


def test_database_schema_and_migrations(tmp_path):
    db = Database(tmp_path / "x.db")
    assert db.version == LATEST_VERSION
    tables = set(inspect(db.engine).get_table_names())
    for t in ["documents", "folders", "document_versions", "history_entries", "summaries", "notes", "flashcard_decks",
              "flashcards", "quizzes", "quiz_questions", "quiz_attempts", "study_guides", "favorites", "settings",
              "tool_usage", "activity", "files", "autotyper_jobs", "schema_migrations"]:
        assert t in tables, t
    assert db.integrity_check() == "ok"
    with db.engine.connect() as c:
        assert c.execute(text("PRAGMA foreign_keys")).scalar() == 1
    db.dispose()
    # Simulate an older database at version 1 and upgrade it.
    with Database(tmp_path / "x.db").engine.begin() as c:
        c.execute(text("DELETE FROM schema_migrations WHERE version > 1"))
        c.execute(text("DROP INDEX IF EXISTS ix_documents_updated"))
    db2 = Database(tmp_path / "x.db")
    with db2.engine.connect() as c:
        versions = [r[0] for r in c.execute(text("SELECT version FROM schema_migrations ORDER BY version"))]
        idx = c.execute(text("SELECT name FROM sqlite_master WHERE type='index' AND name='ix_documents_updated'")).fetchall()
    assert versions == list(range(1, LATEST_VERSION + 1))
    assert idx


def test_data_persists_across_restart(tmp_path, transports):
    cfg = AppConfig(data_dir=tmp_path / "data", port=8765, frontend_dist=DIST)
    app1 = create_app(cfg, transport_factory=transports)
    with TestClient(app1, base_url="http://127.0.0.1:8765") as c:
        c.headers["X-TORZ-Token"] = app1.state.ctx.token
        doc = c.post("/api/documents", json={"title": "Persist me", "content_html": "<p>Saved text</p>"}).json()
        c.patch("/api/settings", json={"patch": {"profile": {"name": "Torz"}}})
        c.post("/api/favorites/humanizer")
    app1.state.ctx.db.dispose()
    app2 = create_app(cfg, transport_factory=transports)
    with TestClient(app2, base_url="http://127.0.0.1:8765") as c:
        c.headers["X-TORZ-Token"] = app2.state.ctx.token
        got = c.get(f"/api/documents/{doc['id']}").json()
        assert got["title"] == "Persist me" and "Saved text" in got["content_text"]
        assert c.get("/api/settings").json()["settings"]["profile"]["name"] == "Torz"
        assert c.get("/api/favorites").json()["favorites"] == ["humanizer"]


def test_validation_errors_are_readable(client):
    r = client.post("/api/tools/paraphrase", json={"text": "hello", "strength": 9})
    assert r.status_code == 422
    assert "strength" in r.json()["detail"]
    assert client.post("/api/tools/humanize", json={"text": "   "}).status_code == 400
