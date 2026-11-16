"""Offline engine units, Google Docs integration (mocked Google APIs) and the launcher."""
import asyncio
import json
import os
import socket
import subprocess
import sys
import time
import urllib.parse
from pathlib import Path

import httpx
import pytest

from conftest import MATERIAL
from torz.documents.export import html_to_markdown, html_to_text, text_to_html
from torz.offline import engine as OFF
from torz.offline.grammar import apply_issues, check, diff_issues
from torz.offline.retrieval import bm25_rank, build_passages
from torz.offline.text import chunk_text, readability, split_sentences
from torz.secrets_store import SecretStore
from torz.services.gdocs import GDocsError, GoogleDocsService, parse_client_json, utf16_len


# ------------------------------------------------------------------------------------------------ offline engine

def test_sentence_splitting_handles_abbreviations_and_wraps():
    s = [x.text for x in split_sentences("Dr. Smith arrived at 5 p.m. today. It was 3.5 km away!\nNext line here.\n\nNew paragraph?")]
    assert s == ["Dr. Smith arrived at 5 p.m. today.", "It was 3.5 km away!", "Next line here.", "New paragraph?"]
    wrapped = "This is a long PDF line that keeps going and going beyond the limit of a\nheading and continues here."
    assert len(split_sentences(wrapped)) == 1


def test_chunking_respects_paragraphs_and_limits():
    text = "\n\n".join(f"Paragraph {i}. " + "word " * 50 for i in range(10))
    chunks = chunk_text(text, 700)
    assert len(chunks) > 1 and all(len(c) <= 700 for c in chunks)
    assert "".join(chunks).replace("\n", "").replace(" ", "") == text.replace("\n", "").replace(" ", "")


def test_extractive_summary_notes_cards_quiz_guide():
    s = OFF.summarize(MATERIAL, "short")
    assert s and all(sent.strip() in MATERIAL for sent in s.split(". ") if sent)
    assert OFF.summarize(MATERIAL, "bullets").startswith("- ")
    assert "**" in OFF.summarize(MATERIAL, "vocabulary")
    n = OFF.notes(MATERIAL)
    assert n["definitions"] and n["dates"][0]["date"] == "1950" and n["key_information"]
    assert any(p["name"] == "Melvin Calvin" for p in n["people"])
    cards = OFF.flashcards(MATERIAL, 6)
    assert cards and all(c["back"] for c in cards)
    qs = OFF.quiz(MATERIAL, {"multiple_choice": 2, "true_false": 2, "fill_blank": 2}, "mixed", seed=1)
    assert len(qs) >= 5
    for q in qs:
        assert q["source_quote"] in MATERIAL
        if q["type"] == "multiple_choice":
            assert q["answer"] in q["options"]
        if q["type"] == "fill_blank":
            assert "_____" in q["question"]
    g = OFF.study_guide(MATERIAL)
    assert g["topics"] and g["vocabulary"] and g["review_questions"]
    assert OFF.grade_text_answer("It happens in the stroma", "The Calvin cycle takes place in the stroma", "Where does the Calvin cycle take place?")["verdict"] == "correct"
    assert OFF.grade_text_answer("In the nucleus", "The Calvin cycle takes place in the stroma", "Where does the Calvin cycle take place?")["verdict"] == "incorrect"
    assert OFF.grade_text_answer("", "x")["score"] == 0


def test_grammar_rules_and_issue_application():
    text = "i dont think their is alot of time. We should of left at at noon on friday.He have a an idea."
    issues = check(text)
    cats = {i["category"] for i in issues}
    assert {"capitalization", "grammar", "repetition", "agreement", "punctuation"} <= cats
    fixed = apply_issues(text, issues)
    assert "should have" in fixed and "at noon" in fixed and "Friday" in fixed and "He has" in fixed
    assert check("Everything here is correct.") == []
    assert check("Kubernetes runs on Linux.", custom_words=["kubernetes"]) == [] or all(i["original"] != "Kubernetes" for i in check("Kubernetes runs on Linux.", custom_words=["kubernetes"]))


def test_diff_issues_reproduce_corrected_text():
    pairs = [("teh cat sat on on the mat", "the cat sat on the mat"), ("I going home", "I am going home"),
             ("However the end", "However, the end."), ("same text", "same text")]
    for a, b in pairs:
        assert apply_issues(a, diff_issues(a, b)) == b


def test_bm25_retrieval_finds_relevant_passage():
    passages = build_passages([("Bio", "doc:1", MATERIAL), ("Sport", "doc:2", "Football is played with a ball on a field. " * 5)], size=300)
    top = bm25_rank(passages, "where is the calvin cycle", k=2)
    assert top[0].source == "Bio" and "stroma" in top[0].text


def test_readability_and_html_conversions():
    r = readability("The cat sat. The dog ran fast.")
    assert r["sentences"] == 2 and r["flesch_reading_ease"] > 80
    html = text_to_html("# T\n\nPara **b**\n\n- x\n- y")
    assert html_to_text(html) == "T\n\nPara b\n\n- x\n- y"
    assert "- x" in html_to_markdown(html) and "**b**" in html_to_markdown(html)


# ------------------------------------------------------------------------------------------------ Google Docs (mocked Google endpoints)

class FakeGoogle:
    def __init__(self):
        self.body = "Existing.\n"
        self.inserts = []
        self.deleted = []

    def __call__(self, req: httpx.Request) -> httpx.Response:
        url = str(req.url)
        if url.startswith("https://oauth2.googleapis.com/token"):
            form = urllib.parse.parse_qs(req.content.decode())
            if form["grant_type"][0] == "authorization_code":
                assert form["code_verifier"][0] and form["code"][0] == "abc"
                return httpx.Response(200, json={"access_token": "at1", "refresh_token": "rt", "expires_in": 3600})
            return httpx.Response(200, json={"access_token": "at2", "expires_in": 3600})
        assert req.headers["authorization"].startswith("Bearer at")
        if url.startswith("https://www.googleapis.com/drive/v3/files"):
            assert "application/vnd.google-apps.document" in req.url.params["q"]
            return httpx.Response(200, json={"files": [{"id": "doc123", "name": "Essay", "modifiedTime": "2026-01-01T00:00:00Z"}]})
        if req.url.path == "/v1/documents/doc123" and req.method == "GET":
            return httpx.Response(200, json={"title": "Essay", "body": {"content": [{"endIndex": 1}, {"endIndex": 1 + utf16_len(self.body)}]}})
        if req.url.path == "/v1/documents/doc123:batchUpdate":
            r = json.loads(req.content)["requests"][0]
            # Google indexes documents in UTF-16 code units (body starts at index 1).
            u = self.body.encode("utf-16-le")
            if "insertText" in r:
                idx = (r["insertText"]["location"]["index"] - 1) * 2
                u = u[:idx] + r["insertText"]["text"].encode("utf-16-le") + u[idx:]
                self.inserts.append(r["insertText"])
            else:
                rng = r["deleteContentRange"]["range"]
                self.deleted.append(rng)
                u = u[: (rng["startIndex"] - 1) * 2] + u[(rng["endIndex"] - 1) * 2:]
            self.body = u.decode("utf-16-le")
            return httpx.Response(200, json={})
        return httpx.Response(404)


async def test_google_docs_oauth_list_type_pause_undo(tmp_path):
    google = FakeGoogle()
    store = SecretStore(tmp_path, use_keyring=False)

    async def fast_sleep(_s):
        await asyncio.sleep(0)

    svc = GoogleDocsService(store, "http://127.0.0.1:8765/api/gdocs/callback", transport=httpx.MockTransport(google), sleep=fast_sleep)
    with pytest.raises(GDocsError):
        svc.auth_url()
    with pytest.raises(GDocsError):
        parse_client_json('{"installed": {"client_id": "nope"}}')
    svc.set_client(json.dumps({"installed": {"client_id": "123.apps.googleusercontent.com", "client_secret": "s"}}))
    url = svc.auth_url()
    q = urllib.parse.parse_qs(urllib.parse.urlparse(url).query)
    assert q["code_challenge_method"] == ["S256"] and "documents" in q["scope"][0]
    with pytest.raises(GDocsError):
        await svc.handle_callback("abc", "wrong-state")
    await svc.handle_callback("abc", q["state"][0])
    assert svc.status()["connected"]
    docs = await svc.list_documents("Ess'ay")
    assert docs[0]["id"] == "doc123"

    job = svc.start_job("doc123", "Hello there, Google Docs! 🎉 Done.", wpm=200)
    for _ in range(200):
        await asyncio.sleep(0)
        if job.inserted_chars > 0:
            break
    svc.pause(job.id)
    assert job.status == "paused"
    typed_at_pause = job.inserted_chars
    for _ in range(20):
        await asyncio.sleep(0)
    assert job.inserted_chars == typed_at_pause
    svc.resume(job.id)
    await asyncio.wait_for(job.task, 5)
    assert job.status == "done" and google.body == "Existing.Hello there, Google Docs! 🎉 Done.\n"
    assert job.public()["can_undo"]
    await svc.undo(job.id)
    assert google.body == "Existing.\n" and job.status == "undone"
    # Expired token is refreshed transparently.
    tok = json.loads(store.get("google_oauth_token"))
    tok["expires_at"] = 0
    store.set("google_oauth_token", json.dumps(tok))
    await svc.list_documents()
    assert json.loads(store.get("google_oauth_token"))["access_token"] == "at2"
    stopped = svc.start_job("doc123", "x" * 500, wpm=40)
    svc.stop(stopped.id)
    await asyncio.wait_for(stopped.task, 5)
    assert stopped.status == "stopped" and stopped.inserted_chars < 500


def test_gdocs_api_routes(client):
    st = client.get("/api/gdocs/status").json()
    assert st["client_configured"] is False and st["redirect_uri"].endswith("/api/gdocs/callback")
    assert client.get("/api/gdocs/auth-url").status_code == 400
    assert client.post("/api/gdocs/client", json={"client_json": "not json at all"}).status_code == 400
    ok = client.post("/api/gdocs/client", json={"client_json": json.dumps({"installed": {"client_id": "1.apps.googleusercontent.com", "client_secret": "x"}})}).json()
    assert ok["client_configured"]
    assert "accounts.google.com" in client.get("/api/gdocs/auth-url").json()["url"]
    # callback is reachable without the token (Google redirects the browser) but validates state
    from fastapi.testclient import TestClient

    with TestClient(client.app, base_url="http://127.0.0.1:8765") as anon:
        r = anon.get("/api/gdocs/callback", params={"code": "x", "state": "bogus"})
        assert r.status_code == 400 and "expired" in r.text
    assert client.get("/api/gdocs/documents").status_code == 400  # not connected


# ------------------------------------------------------------------------------------------------ launcher

def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def test_launcher_start_status_stop_restart(tmp_path):
    env = dict(os.environ, TORZ_DATA_DIR=str(tmp_path / "data"), TORZ_PORT=str(free_port()))
    backend = Path(__file__).resolve().parents[1]
    run = lambda *a: subprocess.run([sys.executable, "-m", "torz.launcher", *a], cwd=backend, env=env, capture_output=True, text=True, timeout=90)  # noqa: E731
    r = run("start", "--no-browser")
    assert r.returncode == 0, r.stderr
    assert "started" in r.stdout
    assert run("status").returncode == 0
    assert "already running" in run("start", "--no-browser").stdout
    # Write data through the API, stop, start again and read it back.
    port = env["TORZ_PORT"]
    token = (tmp_path / "data" / "token").read_text().strip()
    h = {"X-TORZ-Token": token}
    with httpx.Client(trust_env=False) as c:
        doc = c.post(f"http://127.0.0.1:{port}/api/documents", json={"title": "Survives restart"}, headers=h).json()
    s = run("stop")
    assert s.returncode == 0 and "stopped" in s.stdout
    assert run("status").returncode == 3
    assert run("start", "--no-browser").returncode == 0
    with httpx.Client(trust_env=False) as c:
        got = c.get(f"http://127.0.0.1:{port}/api/documents/{doc['id']}", headers=h).json()
    assert got["title"] == "Survives restart"
    assert run("stop").returncode == 0
    time.sleep(0.5)
    assert not (tmp_path / "data" / "server.json").exists()
