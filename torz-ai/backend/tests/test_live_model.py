"""Live tests against a real local model (Ollama). Run with:  TORZ_LIVE_OLLAMA=1 pytest -m live

They check that every AI tool produces well-formed, grounded output with an actual model.
Assertions are structural (a real model's wording varies run to run).
"""
import os

import pytest
from fastapi.testclient import TestClient

from conftest import DIST, MATERIAL, done, sse
from torz.config import AppConfig
from torz.main import create_app

pytestmark = [pytest.mark.live, pytest.mark.skipif(os.environ.get("TORZ_LIVE_OLLAMA") != "1", reason="set TORZ_LIVE_OLLAMA=1 to run")]
MODEL = os.environ.get("TORZ_LIVE_MODEL", "llama3.2:3b")


@pytest.fixture(scope="module")
def live(tmp_path_factory):
    cfg = AppConfig(data_dir=tmp_path_factory.mktemp("live"), port=8765, frontend_dist=DIST)
    app = create_app(cfg)
    with TestClient(app, base_url="http://127.0.0.1:8765") as c:
        c.headers["X-TORZ-Token"] = app.state.ctx.token
        c.patch("/api/settings", json={"patch": {"ai": {"providers": {"ollama": {"model": MODEL}}, "num_ctx": 4096}}})
        st = c.get("/api/ai/status").json()
        assert st["ok"], st
        yield c


TEXT = ("It is important to note that the utilization of renewable energy sources is very important for the future of our planet. "
        "Solar power and wind power are becoming more cheaper every year (IEA, 2023).\n\n"
        "Furthermore, many countries are investing in these technologies in order to reduce emissions.")


def test_live_humanizer(live):
    d = done(sse(live.post("/api/tools/humanize", json={"text": TEXT, "mode": "standard"})))
    assert d["model"] == MODEL and len(d["output"].split()) > 20 and d["output"] != TEXT
    assert d["output"].count("\n\n") >= 1


def test_live_paraphrase_and_simplify(live):
    assert done(sse(live.post("/api/tools/paraphrase", json={"text": TEXT, "mode": "concise", "strength": 3})))["output"]
    d = done(sse(live.post("/api/tools/simplify", json={"text": TEXT, "level": "middle"})))
    assert d["output"]


def test_live_grammar(live):
    d = done(sse(live.post("/api/tools/grammar", json={"text": "She dont like teh new libary, and their is no reason.", "engine": "ai", "explain": False})))
    originals = " ".join(i["original"] for i in d["issues"]).lower()
    assert "teh" in originals or "libary" in originals or "dont" in originals


def test_live_summary_and_notes(live):
    s = done(sse(live.post("/api/tools/summarize", json={"text": MATERIAL, "format": "bullets"})))
    assert "-" in s["output"] or "•" in s["output"] or "*" in s["output"]
    n = done(sse(live.post("/api/tools/notes", json={"text": MATERIAL})))
    note = live.get(f"/api/notes/{n['note_id']}").json()
    assert note["data"]["overview"] or note["data"]["key_concepts"]


def test_live_quiz_grounded(live):
    d = done(sse(live.post("/api/tools/quiz", json={"text": MATERIAL, "count": 5, "types": ["multiple_choice", "true_false"]})))
    quiz = live.get(f"/api/quizzes/{d['quiz_id']}").json()
    assert len(quiz["questions"]) >= 3
    for q in quiz["questions"]:
        if q["type"] == "multiple_choice":
            assert q["answer"] in q["options"]


def test_live_flashcards_and_study_guide(live):
    d = done(sse(live.post("/api/tools/flashcards", json={"text": MATERIAL, "count": 6})))
    assert len(live.get(f"/api/decks/{d['deck_id']}").json()["cards"]) >= 3
    g = done(sse(live.post("/api/tools/study-guide", json={"text": MATERIAL})))
    data = live.get(f"/api/guides/{g['guide_id']}").json()["data"]
    assert data["overview"] and (data["topics"] or data["vocabulary"])


def test_live_question_answering(live):
    ev = sse(live.post("/api/tools/qa", json={"question": "Where does the Calvin cycle take place?", "sources": [{"type": "text", "text": MATERIAL}]}))
    assert "stroma" in done(ev)["output"].lower()


def test_live_essay_feedback(live):
    d = done(sse(live.post("/api/tools/essay/feedback", json={"text": TEXT * 2})))
    assert all(1 <= v <= 10 for v in d["feedback"]["scores"].values())
