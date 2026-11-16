"""End-to-end API tests for every tool, using the deterministic fake model."""
from conftest import MATERIAL, done, sse

ROBOTIC = ("It is important to note that the utilization of renewable energy is very important. "
           "Furthermore, solar power (Smith, 2020) is \"cheaper than ever before\" in 2024.\n\n"
           "Wind power is also growing in order to meet demand.")


def history(client, tool):
    return client.get("/api/history", params={"tool": tool}).json()["entries"]


def test_humanizer_rewrites_with_report_and_history(client):
    ev = sse(client.post("/api/tools/humanize", json={"text": ROBOTIC, "mode": "enhanced", "tone": "formal", "keep_terms": ["solar power"]}))
    meta = [e for e in ev if e["type"] == "meta"][0]
    assert meta["model"] == "fake-model:latest" and meta["provider"] == "ollama"
    assert any(e["type"] == "delta" for e in ev)
    d = done(ev)
    assert d["output"] and d["output"] != ROBOTIC
    assert not d["output"].lower().startswith("here is")  # chatty preface removed
    assert "\n\n" in d["output"]  # paragraph structure kept
    checks = {r["check"]: r for r in d["report"]}
    assert checks["Citations"]["kept"] == 1 and checks["Quotations"]["kept"] == 1
    assert checks["Key terms"]["missing"] == [] and checks["Numbers"]["missing"] == []
    assert d["stats"]["readability_in"]["words"] > 0
    h = history(client, "humanizer")
    assert h and h[0]["model"] == "fake-model:latest" and h[0]["settings"]["mode"] == "enhanced"
    full = client.get(f"/api/history/{h[0]['id']}").json()
    assert full["input_text"] == ROBOTIC and full["output_text"] == d["output"]


def test_long_text_is_chunked_by_paragraph(client):
    client.patch("/api/settings", json={"patch": {"ai": {"num_ctx": 2048}}})
    long = "\n\n".join([f"Paragraph {i} is very important to the argument and explains a detail about topic {i}." * 8 for i in range(8)])
    ev = sse(client.post("/api/tools/paraphrase", json={"text": long, "mode": "academic", "strength": 4}))
    prog = [e for e in ev if e["type"] == "progress"]
    assert prog[-1]["total"] > 1 and prog[-1]["current"] == prog[-1]["total"]
    assert done(ev)["output"].count("\n\n") >= 7


def test_rewriter_simplifier_essay_and_assistant(client):
    d = done(sse(client.post("/api/tools/rewrite", json={"text": ROBOTIC, "tone": "friendly", "length": "shorter", "audience": "kids"})))
    assert d["output"]
    d = done(sse(client.post("/api/tools/simplify", json={"text": ROBOTIC, "level": "middle"})))
    assert d["stats"]["readability_out"]["grade_level"] >= 0
    d = done(sse(client.post("/api/tools/essay/feedback", json={"text": ROBOTIC, "focus": ["thesis"]})))
    assert d["feedback"]["scores"]["thesis"] == 7 and d["feedback"]["improvements"]
    d = done(sse(client.post("/api/tools/essay/improve", json={"text": ROBOTIC, "level": "strong"})))
    assert d["output"]
    d = done(sse(client.post("/api/tools/assistant", json={"text": ROBOTIC, "action": "shorten", "explain": True})))
    assert d["output"] and "Clarity" in d["explanation"]
    d = done(sse(client.post("/api/tools/assistant", json={"text": "Make it pop", "action": "custom", "instruction": "Add flair"})))
    assert d["output"]
    d = done(sse(client.post("/api/tools/assistant/compose", json={"topic": "Why sleep matters", "words": 300})))
    assert "essay" in d["output"]
    d = done(sse(client.post("/api/tools/assistant/explain-mistakes", json={"text": "me and him goes"})))
    assert d["output"]
    tools = client.get("/api/history").json()["tools"]
    assert tools["rewriter"] == 1 and tools["simplifier"] == 1 and tools["essay"] == 2 and tools["assistant"] == 4


def test_grammar_ai_and_offline(client):
    text = "i think teh results dont matter.\n\nTheir is a lot of data."
    d = done(sse(client.post("/api/tools/grammar", json={"text": text, "engine": "ai", "explain": True})))
    assert d["engine"] == "ai" and d["corrected"] == "I think the results doesn't matter.\n\nThere is a lot of data."
    originals = {i["original"] for i in d["issues"]}
    assert {"i", "teh", "dont"} <= originals
    assert all(i.get("explanation") for i in d["issues"] if i["category"] != "style")
    for i in d["issues"]:
        assert text[i["offset"]:i["offset"] + i["length"]] == i["original"]  # offsets are exact
    off = done(sse(client.post("/api/tools/grammar", json={"text": "We could of went to the the park on monday.", "engine": "offline"})))
    cats = {i["category"] for i in off["issues"]}
    assert {"grammar", "repetition", "capitalization"} <= cats
    assert off["provider"] is None and off["engine"] == "offline"


def test_summarizer_ai_offline_and_long_document(client):
    d = done(sse(client.post("/api/tools/summarize", json={"text": MATERIAL, "format": "bullets", "length": 60})))
    assert d["output"].startswith("- ") and d["summary_id"]
    off = done(sse(client.post("/api/tools/summarize", json={"text": MATERIAL, "format": "short", "engine": "offline"})))
    assert off["engine"] == "offline" and off["output"]
    for fmt in ["detailed", "paragraph", "facts", "arguments", "vocabulary"]:
        assert done(sse(client.post("/api/tools/summarize", json={"text": MATERIAL, "format": fmt, "engine": "offline"})))["output"]
    client.patch("/api/settings", json={"patch": {"ai": {"num_ctx": 2048}}})
    long = (MATERIAL + "\n\n") * 12
    ev = sse(client.post("/api/tools/summarize", json={"text": long, "format": "detailed"}))
    d = done(ev)
    assert d["stats"]["sections"] > 1
    assert any(e["type"] == "progress" and e["stage"] == "Writing final summary" for e in ev)
    assert len(client.get("/api/summaries").json()["summaries"]) == 8


def test_smart_notes_ai_and_offline(client):
    d = done(sse(client.post("/api/tools/notes", json={"text": MATERIAL, "detail": "detailed"})))
    note = client.get(f"/api/notes/{d['note_id']}").json()
    assert note["data"]["key_concepts"] and "<h2>" in note["content_html"] and note["model"] == "fake-model:latest"
    assert note["data"]["dates"][0]["date"] == "1950"
    off = done(sse(client.post("/api/tools/notes", json={"text": MATERIAL, "engine": "offline"})))
    on = client.get(f"/api/notes/{off['note_id']}").json()
    assert on["engine"] == "offline" and on["data"]["definitions"]


def test_quiz_generation_grounding_and_scoring(client):
    ev = sse(client.post("/api/tools/quiz", json={"text": MATERIAL, "count": 6, "types": ["multiple_choice", "true_false", "fill_blank"], "difficulty": "medium", "title": "Photo quiz"}))
    d = done(ev)
    assert d["count"] == 6
    quiz = client.get(f"/api/quizzes/{d['quiz_id']}").json()
    qs = quiz["questions"]
    assert all("Mars" not in q["question"] for q in qs)  # ungrounded question was filtered out
    assert {q["type"] for q in qs} == {"multiple_choice", "true_false", "fill_blank"}
    for q in qs:
        if q["type"] == "multiple_choice":
            assert q["answer"] in q["options"] and len(q["options"]) == 4
        if q["type"] == "fill_blank":
            assert "_____" in q["question"]
    # Per-question check and a full attempt
    mc = next(q for q in qs if q["type"] == "multiple_choice")
    assert client.post(f"/api/quizzes/{quiz['id']}/check", json={"question_id": mc["id"], "answer": mc["answer"]}).json()["correct"]
    wrong = next(o for o in mc["options"] if o != mc["answer"])
    assert not client.post(f"/api/quizzes/{quiz['id']}/check", json={"question_id": mc["id"], "answer": wrong}).json()["correct"]
    answers = {str(q["id"]): q["answer"] for q in qs}
    answers[str(mc["id"])] = wrong
    att = client.post(f"/api/quizzes/{quiz['id']}/attempts", json={"answers": answers, "duration_s": 42}).json()
    assert att["score"] == 5 and att["max_score"] == 6 and att["percent"] == 83.3
    assert client.get(f"/api/quizzes/{quiz['id']}").json()["questions"]
    listing = client.get("/api/quizzes", params={"kind": "quiz"}).json()["quizzes"][0]
    assert listing["best_score"] == 83.3 and listing["attempts"] == 1
    review = client.get(f"/api/attempts/{att['id']}").json()
    assert len(review["results"]) == 6
    shuffled = client.get(f"/api/quizzes/{quiz['id']}/shuffled").json()
    assert sorted(q["id"] for q in shuffled["questions"]) == sorted(q["id"] for q in qs)
    # Retake with new questions
    re = done(sse(client.post(f"/api/quizzes/{quiz['id']}/regenerate")))
    assert re["quiz_id"] != quiz["id"]
    assert client.get(f"/api/quizzes/{re['quiz_id']}").json()["title"].startswith("Photo quiz (retake")


def test_practice_test_with_written_answers_graded(client):
    d = done(sse(client.post("/api/tools/quiz", json={"text": MATERIAL, "count": 4, "types": ["true_false", "written"], "kind": "practice_test", "time_limit_min": 20})))
    test = client.get(f"/api/quizzes/{d['quiz_id']}").json()
    assert test["kind"] == "practice_test" and test["settings"]["time_limit_min"] == 20
    written = [q for q in test["questions"] if q["type"] == "written"]
    assert written and written[0]["points"] == 2.0
    answers = {str(q["id"]): q["answer"] for q in test["questions"]}
    att = client.post(f"/api/quizzes/{test['id']}/attempts", json={"answers": answers, "duration_s": 300, "time_limit_s": 1200}).json()
    assert att["percent"] == 100.0
    w = next(r for r in att["results"] if r["question_id"] == written[0]["id"])
    assert w["graded_by"].startswith("ollama:") and w["feedback"]
    hist = client.get("/api/attempts", params={"kind": "practice_test"}).json()["attempts"]
    assert hist[0]["percent"] == 100.0 and hist[0]["time_limit_s"] == 1200


def test_offline_quiz_and_flashcards(client):
    d = done(sse(client.post("/api/tools/quiz", json={"text": MATERIAL, "count": 5, "types": ["multiple_choice", "fill_blank", "true_false", "definition"], "engine": "offline"})))
    quiz = client.get(f"/api/quizzes/{d['quiz_id']}").json()
    assert quiz["engine"] == "offline" and len(quiz["questions"]) >= 4
    d = done(sse(client.post("/api/tools/flashcards", json={"text": MATERIAL, "count": 6, "engine": "offline"})))
    deck = client.get(f"/api/decks/{d['deck_id']}").json()
    assert deck["engine"] == "offline" and deck["cards"]


def test_flashcards_generation_and_study_progress(client):
    d = done(sse(client.post("/api/tools/flashcards", json={"text": MATERIAL, "count": 5, "style": "qa", "title": "Plants"})))
    deck = client.get(f"/api/decks/{d['deck_id']}").json()
    assert deck["title"] == "Plants" and len(deck["cards"]) == 5
    c = deck["cards"][0]
    assert client.patch(f"/api/cards/{c['id']}", json={"status": "known"}).json()["status"] == "known"
    assert client.patch(f"/api/cards/{deck['cards'][1]['id']}", json={"status": "difficult"}).json()["box"] == 1
    r = client.patch(f"/api/cards/{deck['cards'][2]['id']}", json={"review": True}).json()
    assert r["reviews"] == 1 and r["correct"] == 1
    decks = client.get("/api/decks").json()["decks"]
    assert decks[0]["known"] == 1 and decks[0]["difficult"] == 1 and decks[0]["last_studied_at"]


def test_study_guide_ai_and_offline(client):
    d = done(sse(client.post("/api/tools/study-guide", json={"text": MATERIAL, "title": "Unit 4"})))
    g = client.get(f"/api/guides/{d['guide_id']}").json()
    assert g["title"] == "Unit 4"
    for k in ["overview", "topics", "vocabulary", "key_concepts", "facts", "common_mistakes", "review_questions"]:
        assert g["data"][k], k
    for fmt in ["pdf", "docx", "md"]:
        assert client.get(f"/api/guides/{g['id']}/export", params={"format": fmt}).status_code == 200
    off = done(sse(client.post("/api/tools/study-guide", json={"text": MATERIAL, "engine": "offline"})))
    og = client.get(f"/api/guides/{off['guide_id']}").json()
    assert og["engine"] == "offline" and og["data"]["topics"] and og["data"]["review_questions"]


def test_question_answering_ai_and_offline(client):
    doc = client.post("/api/documents", json={"title": "Bio notes", "content_html": f"<p>{MATERIAL}</p>"}).json()
    body = {"question": "Where does the Calvin cycle take place?", "sources": [{"type": "document", "id": doc["id"]}, {"type": "text", "text": "Unrelated text about football."}]}
    ev = sse(client.post("/api/tools/qa", json=body))
    passages = [e for e in ev if e["type"] == "passages"][0]["passages"]
    assert passages[0]["source"] == "Bio notes" and "stroma" in passages[0]["text"]
    assert "[1]" in done(ev)["output"]
    off = sse(client.post("/api/tools/qa", json={**body, "engine": "offline"}))
    assert done(off)["engine"] == "offline" and [e for e in off if e["type"] == "passages"][0]["passages"]
    none = sse(client.post("/api/tools/qa", json={"question": "zzzz qqqq", "sources": [{"type": "document", "id": doc["id"]}]}))
    assert done(none)["found"] in (True, False)


def test_missing_source_errors(client):
    assert client.post("/api/tools/summarize", json={"file_id": 999}).status_code == 404
    assert client.post("/api/tools/summarize", json={}).status_code == 400
    assert client.post("/api/tools/quiz", json={"text": MATERIAL, "count": 0}).status_code == 422


def test_privacy_setting_disables_history(client):
    client.patch("/api/settings", json={"patch": {"privacy": {"save_history": False}}})
    done(sse(client.post("/api/tools/humanize", json={"text": ROBOTIC})))
    assert history(client, "humanizer") == []
    dash = client.get("/api/dashboard").json()
    assert dash["stats"]["runs_total"] == 1  # activity still counted locally
