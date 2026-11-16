"""Flashcard decks, quizzes / practice tests and attempts, study guides."""
from __future__ import annotations

import csv
import io
import json
import random
from typing import Any, Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import func

from ..db.models import Flashcard, FlashcardDeck, Quiz, QuizAttempt, QuizQuestion, StudyGuide, utcnow
from ..documents.export import EXPORT_FORMATS, export, safe_filename
from ..services import study
from ..services.common import AppContext, Source, get_ctx, sse

router = APIRouter(prefix="/api")


def _dt(d):
    return d.isoformat() + "Z" if d else None


# ------------------------------------------------------------------------------------------------ decks

def _card(c: Flashcard) -> dict:
    return {"id": c.id, "deck_id": c.deck_id, "position": c.position, "front": c.front, "back": c.back,
            "explanation": c.explanation, "topic": c.topic, "status": c.status, "box": c.box, "reviews": c.reviews,
            "correct": c.correct, "last_reviewed_at": _dt(c.last_reviewed_at)}


def _deck(d: FlashcardDeck, stats: dict | None = None) -> dict:
    out = {"id": d.id, "title": d.title, "description": d.description, "engine": d.engine, "provider": d.provider,
           "model": d.model, "created_at": _dt(d.created_at), "updated_at": _dt(d.updated_at),
           "last_studied_at": _dt(d.last_studied_at)}
    if stats is not None:
        out.update(stats)
    return out


@router.get("/decks")
def list_decks(ctx: AppContext = Depends(get_ctx)):
    with ctx.db.session() as s:
        rows = s.query(Flashcard.deck_id, Flashcard.status, func.count(Flashcard.id)).group_by(Flashcard.deck_id, Flashcard.status).all()
        stats: dict[int, dict[str, int]] = {}
        for did, status, n in rows:
            st = stats.setdefault(did, {"total": 0, "known": 0, "difficult": 0, "new": 0})
            st["total"] += n
            st[status] = st.get(status, 0) + n
        decks = s.query(FlashcardDeck).order_by(FlashcardDeck.updated_at.desc()).all()
        return {"decks": [_deck(d, stats.get(d.id, {"total": 0, "known": 0, "difficult": 0, "new": 0})) for d in decks]}


class DeckIn(BaseModel):
    title: str = Field(min_length=1, max_length=300)
    description: str = Field("", max_length=2000)
    cards: list[dict[str, str]] = []


@router.post("/decks")
def create_deck(body: DeckIn, ctx: AppContext = Depends(get_ctx)):
    with ctx.db.session() as s:
        d = FlashcardDeck(title=body.title.strip(), description=body.description, engine="manual")
        s.add(d)
        s.flush()
        for i, c in enumerate(body.cards):
            nc = study.normalize_card(c)
            if nc:
                s.add(Flashcard(deck_id=d.id, position=i, front=nc["front"], back=nc["back"],
                                explanation=nc["explanation"], topic=nc["topic"]))
        return _deck(d)


@router.get("/decks/{deck_id}")
def get_deck(deck_id: int, ctx: AppContext = Depends(get_ctx)):
    with ctx.db.session() as s:
        d = s.get(FlashcardDeck, deck_id)
        if not d:
            raise HTTPException(404, "Deck not found")
        cards = [_card(c) for c in d.cards]
        st = {"total": len(cards), "known": sum(c["status"] == "known" for c in cards),
              "difficult": sum(c["status"] == "difficult" for c in cards), "new": sum(c["status"] == "new" for c in cards)}
        return {**_deck(d, st), "cards": cards}


class DeckPatch(BaseModel):
    title: Optional[str] = Field(None, max_length=300)
    description: Optional[str] = Field(None, max_length=2000)


@router.patch("/decks/{deck_id}")
def update_deck(deck_id: int, body: DeckPatch, ctx: AppContext = Depends(get_ctx)):
    with ctx.db.session() as s:
        d = s.get(FlashcardDeck, deck_id)
        if not d:
            raise HTTPException(404, "Deck not found")
        if body.title is not None:
            d.title = body.title.strip() or d.title
        if body.description is not None:
            d.description = body.description
        d.updated_at = utcnow()
        return _deck(d)


@router.delete("/decks/{deck_id}")
def delete_deck(deck_id: int, ctx: AppContext = Depends(get_ctx)):
    with ctx.db.session() as s:
        d = s.get(FlashcardDeck, deck_id)
        if not d:
            raise HTTPException(404, "Deck not found")
        s.delete(d)
    return {"ok": True}


@router.post("/decks/{deck_id}/reset")
def reset_deck(deck_id: int, ctx: AppContext = Depends(get_ctx)):
    with ctx.db.session() as s:
        s.query(Flashcard).filter_by(deck_id=deck_id).update(
            {Flashcard.status: "new", Flashcard.box: 1, Flashcard.reviews: 0, Flashcard.correct: 0, Flashcard.last_reviewed_at: None})
    return get_deck(deck_id, ctx)


class CardIn(BaseModel):
    front: str = Field(min_length=1, max_length=2000)
    back: str = Field(min_length=1, max_length=4000)
    explanation: str = Field("", max_length=4000)
    topic: str = Field("", max_length=100)


@router.post("/decks/{deck_id}/cards")
def add_card(deck_id: int, body: CardIn, ctx: AppContext = Depends(get_ctx)):
    with ctx.db.session() as s:
        d = s.get(FlashcardDeck, deck_id)
        if not d:
            raise HTTPException(404, "Deck not found")
        pos = (s.query(func.max(Flashcard.position)).filter_by(deck_id=deck_id).scalar() or 0) + 1
        c = Flashcard(deck_id=deck_id, position=pos, front=body.front.strip(), back=body.back.strip(),
                      explanation=body.explanation.strip(), topic=body.topic.strip())
        s.add(c)
        d.updated_at = utcnow()
        s.flush()
        return _card(c)


class CardPatch(BaseModel):
    front: Optional[str] = Field(None, max_length=2000)
    back: Optional[str] = Field(None, max_length=4000)
    explanation: Optional[str] = Field(None, max_length=4000)
    topic: Optional[str] = Field(None, max_length=100)
    status: Optional[str] = Field(None, pattern="^(new|known|difficult)$")
    review: Optional[bool] = None  # True = answered correctly, False = missed


@router.patch("/cards/{card_id}")
def update_card(card_id: int, body: CardPatch, ctx: AppContext = Depends(get_ctx)):
    with ctx.db.session() as s:
        c = s.get(Flashcard, card_id)
        if not c:
            raise HTTPException(404, "Card not found")
        for field in ("front", "back", "explanation", "topic"):
            v = getattr(body, field)
            if v is not None:
                setattr(c, field, v.strip())
        if body.status is not None:
            c.status = body.status
            if body.status == "known":
                c.box = min(5, c.box + 1)
            elif body.status == "difficult":
                c.box = 1
        if body.review is not None:
            c.reviews += 1
            c.correct += 1 if body.review else 0
            c.box = min(5, c.box + 1) if body.review else 1
        if body.status is not None or body.review is not None:
            c.last_reviewed_at = utcnow()
            c.deck.last_studied_at = utcnow()
        return _card(c)


@router.delete("/cards/{card_id}")
def delete_card(card_id: int, ctx: AppContext = Depends(get_ctx)):
    with ctx.db.session() as s:
        c = s.get(Flashcard, card_id)
        if not c:
            raise HTTPException(404, "Card not found")
        s.delete(c)
    return {"ok": True}


@router.get("/decks/{deck_id}/export")
def export_deck(deck_id: int, format: str = "json", ctx: AppContext = Depends(get_ctx)):
    deck = get_deck(deck_id, ctx)
    name = safe_filename(deck["title"], format if format in ("json", "csv") else "tsv")
    if format == "json":
        payload = {"torz_deck": 1, "title": deck["title"], "description": deck["description"],
                   "cards": [{k: c[k] for k in ("front", "back", "explanation", "topic")} for c in deck["cards"]]}
        return Response(json.dumps(payload, ensure_ascii=False, indent=2), media_type="application/json",
                        headers={"Content-Disposition": f'attachment; filename="{name}"'})
    buf = io.StringIO()
    delim = "\t" if format == "tsv" else ","
    w = csv.writer(buf, delimiter=delim)
    if format == "csv":
        w.writerow(["front", "back", "explanation", "topic"])
    for c in deck["cards"]:
        w.writerow([c["front"], c["back"], c["explanation"], c["topic"]])
    return Response(buf.getvalue(), media_type="text/csv" if format == "csv" else "text/tab-separated-values",
                    headers={"Content-Disposition": f'attachment; filename="{name}"'})


@router.post("/decks/import")
async def import_deck(file: UploadFile = File(...), ctx: AppContext = Depends(get_ctx)):
    raw = await file.read(5 * 1024 * 1024 + 1)
    if len(raw) > 5 * 1024 * 1024:
        raise HTTPException(413, "Deck files are limited to 5 MB.")
    text = raw.decode("utf-8-sig", "replace")
    name = (file.filename or "Imported deck").rsplit(".", 1)[0]
    cards: list[dict[str, str]] = []
    title = name
    desc = ""
    if (file.filename or "").lower().endswith(".json") or text.lstrip().startswith(("{", "[")):
        try:
            data = json.loads(text)
        except ValueError:
            raise HTTPException(422, "The JSON file could not be parsed.")
        items = data.get("cards", []) if isinstance(data, dict) else data
        if isinstance(data, dict):
            title = str(data.get("title") or title)
            desc = str(data.get("description") or "")
        cards = [c for c in items if isinstance(c, dict)]
    else:
        first_line = text.splitlines()[0] if text.strip() else ""
        delim = "\t" if "\t" in first_line else ","
        reader = csv.reader(io.StringIO(text), delimiter=delim)
        rows = [r for r in reader if r and any(x.strip() for x in r)]
        if rows and [x.strip().lower() for x in rows[0][:2]] == ["front", "back"]:
            rows = rows[1:]
        for r in rows:
            if len(r) >= 2:
                cards.append({"front": r[0], "back": r[1], "explanation": r[2] if len(r) > 2 else "",
                              "topic": r[3] if len(r) > 3 else ""})
    valid = [c for c in (study.normalize_card(c) for c in cards) if c]
    if not valid:
        raise HTTPException(422, "No flashcards were found. Use JSON from TORZ AI, or CSV/TSV with front and back columns.")
    d = create_deck(DeckIn(title=title[:300], description=desc[:2000], cards=valid), ctx)
    return {**d, "imported": len(valid)}


# ------------------------------------------------------------------------------------------------ quizzes

def _question(q: QuizQuestion) -> dict:
    return {"id": q.id, "position": q.position, "type": q.type, "difficulty": q.difficulty, "question": q.prompt,
            "options": QuizQuestion.loads(q.options_json, []), "answer": q.answer, "explanation": q.explanation,
            "source_quote": q.source_quote, "points": q.points}


def _quiz(z: Quiz, full: bool = False) -> dict:
    attempts = [a for a in z.attempts if a.status == "completed"]
    best = max((a.score / a.max_score for a in attempts if a.max_score), default=None)
    out = {"id": z.id, "kind": z.kind, "title": z.title, "engine": z.engine, "provider": z.provider, "model": z.model,
           "settings": Quiz.loads(z.settings_json, {}), "question_count": len(z.questions), "attempts": len(attempts),
           "best_score": round(best * 100, 1) if best is not None else None, "created_at": _dt(z.created_at),
           "source_file_id": z.source_file_id}
    if full:
        out["questions"] = [_question(q) for q in z.questions]
    return out


@router.get("/quizzes")
def list_quizzes(kind: str = "", ctx: AppContext = Depends(get_ctx)):
    with ctx.db.session() as s:
        qry = s.query(Quiz)
        if kind:
            qry = qry.filter(Quiz.kind == kind)
        return {"quizzes": [_quiz(z) for z in qry.order_by(Quiz.created_at.desc()).limit(300)]}


@router.get("/quizzes/{quiz_id}")
def get_quiz(quiz_id: int, ctx: AppContext = Depends(get_ctx)):
    with ctx.db.session() as s:
        z = s.get(Quiz, quiz_id)
        if not z:
            raise HTTPException(404, "Quiz not found")
        return _quiz(z, full=True)


class QuizPatch(BaseModel):
    title: str = Field(min_length=1, max_length=300)


@router.patch("/quizzes/{quiz_id}")
def rename_quiz(quiz_id: int, body: QuizPatch, ctx: AppContext = Depends(get_ctx)):
    with ctx.db.session() as s:
        z = s.get(Quiz, quiz_id)
        if not z:
            raise HTTPException(404, "Quiz not found")
        z.title = body.title.strip()
        return _quiz(z)


@router.delete("/quizzes/{quiz_id}")
def delete_quiz(quiz_id: int, ctx: AppContext = Depends(get_ctx)):
    with ctx.db.session() as s:
        z = s.get(Quiz, quiz_id)
        if not z:
            raise HTTPException(404, "Quiz not found")
        s.delete(z)
    return {"ok": True}


@router.post("/quizzes/{quiz_id}/regenerate")
async def regenerate_quiz(quiz_id: int, ctx: AppContext = Depends(get_ctx)):
    """Create a new quiz/test with fresh questions from the same source material and settings."""
    with ctx.db.session() as s:
        z = s.get(Quiz, quiz_id)
        if not z:
            raise HTTPException(404, "Quiz not found")
        settings = Quiz.loads(z.settings_json, {})
        src = Source(z.source_text, z.title, file_id=z.source_file_id)
        kind, engine, title = z.kind, z.engine, z.title
    if not src.text.strip():
        raise HTTPException(400, "The original material is not available for this quiz.")
    base = title.split(" (retake")[0]
    n = 2
    with ctx.db.session() as s:
        n += s.query(func.count(Quiz.id)).filter(Quiz.title.like(f"{base} (retake%")).scalar() or 0
    return sse(study.create_quiz(ctx, src, kind, int(settings.get("count", 10)), settings.get("types") or ["multiple_choice"],
                                 settings.get("difficulty", "mixed"), engine, f"{base} (retake {n})",
                                 int(settings.get("time_limit_min", 0))))


class CheckIn(BaseModel):
    question_id: int
    answer: str = Field("", max_length=10000)


@router.post("/quizzes/{quiz_id}/check")
async def check_answer(quiz_id: int, body: CheckIn, ctx: AppContext = Depends(get_ctx)):
    with ctx.db.session() as s:
        z = s.get(Quiz, quiz_id)
        q = s.get(QuizQuestion, body.question_id)
        if not z or not q or q.quiz_id != quiz_id:
            raise HTTPException(404, "Question not found")
    return await study.grade_question(ctx, z, q, body.answer)


class AttemptIn(BaseModel):
    answers: dict[str, str] = {}
    results: dict[str, dict[str, Any]] = {}  # optional pre-graded results from per-question checks
    duration_s: int = Field(0, ge=0)
    time_limit_s: int = Field(0, ge=0)
    timed_out: bool = False


@router.post("/quizzes/{quiz_id}/attempts")
async def submit_attempt(quiz_id: int, body: AttemptIn, ctx: AppContext = Depends(get_ctx)):
    with ctx.db.session() as s:
        z = s.get(Quiz, quiz_id)
        if not z:
            raise HTTPException(404, "Quiz not found")
        questions = list(z.questions)
    results = []
    for q in questions:
        ans = body.answers.get(str(q.id), "")
        pre = body.results.get(str(q.id))
        if pre and q.type in ("short_answer", "definition", "written") and pre.get("answer") == ans:
            r = dict(pre)
            r["score"] = max(0.0, min(float(q.points), float(r.get("score", 0))))
        else:
            r = await study.grade_question(ctx, z, q, ans)
        results.append(r)
    score = round(sum(float(r["score"]) for r in results), 2)
    max_score = sum(q.points for q in questions)
    with ctx.db.session() as s:
        a = QuizAttempt(quiz_id=quiz_id, answers_json=QuizAttempt.dumps(body.answers),
                        results_json=QuizAttempt.dumps(results), score=score, max_score=max_score,
                        time_limit_s=body.time_limit_s, duration_s=body.duration_s,
                        status="completed", finished_at=utcnow())
        s.add(a)
        s.flush()
        aid = a.id
    from ..services.common import record_run

    tool = "practice_test" if z.kind == "practice_test" else "quiz"
    record_run(ctx, tool, z.title, f"Score {score}/{max_score}", output_json={"attempt_id": aid, "quiz_id": quiz_id},
               settings={"action": "attempt"}, engine=z.engine, title=f"Attempt: {z.title}")
    return {"id": aid, "quiz_id": quiz_id, "score": score, "max_score": max_score,
            "percent": round(100 * score / max_score, 1) if max_score else 0, "results": results,
            "duration_s": body.duration_s, "timed_out": body.timed_out}


def _attempt(a: QuizAttempt, z: Quiz | None = None, full: bool = False) -> dict:
    out = {"id": a.id, "quiz_id": a.quiz_id, "score": a.score, "max_score": a.max_score,
           "percent": round(100 * a.score / a.max_score, 1) if a.max_score else 0, "duration_s": a.duration_s,
           "time_limit_s": a.time_limit_s, "finished_at": _dt(a.finished_at)}
    if z is not None:
        out.update({"quiz_title": z.title, "kind": z.kind})
    if full:
        out["results"] = QuizAttempt.loads(a.results_json, [])
        out["answers"] = QuizAttempt.loads(a.answers_json, {})
    return out


@router.get("/quizzes/{quiz_id}/attempts")
def quiz_attempts(quiz_id: int, ctx: AppContext = Depends(get_ctx)):
    with ctx.db.session() as s:
        z = s.get(Quiz, quiz_id)
        if not z:
            raise HTTPException(404, "Quiz not found")
        return {"attempts": [_attempt(a, z) for a in sorted(z.attempts, key=lambda a: a.started_at, reverse=True)]}


@router.get("/attempts")
def all_attempts(kind: str = "", ctx: AppContext = Depends(get_ctx)):
    with ctx.db.session() as s:
        qry = s.query(QuizAttempt, Quiz).join(Quiz, Quiz.id == QuizAttempt.quiz_id)
        if kind:
            qry = qry.filter(Quiz.kind == kind)
        return {"attempts": [_attempt(a, z) for a, z in qry.order_by(QuizAttempt.started_at.desc()).limit(300)]}


@router.get("/attempts/{attempt_id}")
def get_attempt(attempt_id: int, ctx: AppContext = Depends(get_ctx)):
    with ctx.db.session() as s:
        a = s.get(QuizAttempt, attempt_id)
        if not a:
            raise HTTPException(404, "Attempt not found")
        return _attempt(a, a.quiz, full=True)


@router.get("/quizzes/{quiz_id}/shuffled")
def shuffled(quiz_id: int, ctx: AppContext = Depends(get_ctx)):
    """Questions in random order with multiple-choice options reshuffled (for retakes)."""
    data = get_quiz(quiz_id, ctx)
    rng = random.Random()
    qs = data["questions"]
    rng.shuffle(qs)
    for q in qs:
        if q["type"] == "multiple_choice":
            rng.shuffle(q["options"])
    return data


# ------------------------------------------------------------------------------------------------ study guides

def _guide(g: StudyGuide, full: bool = False) -> dict:
    data = StudyGuide.loads(g.data_json, {})
    out = {"id": g.id, "title": g.title, "engine": g.engine, "provider": g.provider, "model": g.model,
           "created_at": _dt(g.created_at), "updated_at": _dt(g.updated_at),
           "topic_count": len(data.get("topics", [])), "term_count": len(data.get("vocabulary", []))}
    if full:
        out["data"] = data
    return out


@router.get("/guides")
def list_guides(ctx: AppContext = Depends(get_ctx)):
    with ctx.db.session() as s:
        return {"guides": [_guide(g) for g in s.query(StudyGuide).order_by(StudyGuide.updated_at.desc()).limit(300)]}


@router.get("/guides/{guide_id}")
def get_guide(guide_id: int, ctx: AppContext = Depends(get_ctx)):
    with ctx.db.session() as s:
        g = s.get(StudyGuide, guide_id)
        if not g:
            raise HTTPException(404, "Study guide not found")
        return _guide(g, True)


class GuidePatch(BaseModel):
    title: Optional[str] = Field(None, max_length=300)
    data: Optional[dict[str, Any]] = None


@router.patch("/guides/{guide_id}")
def update_guide(guide_id: int, body: GuidePatch, ctx: AppContext = Depends(get_ctx)):
    with ctx.db.session() as s:
        g = s.get(StudyGuide, guide_id)
        if not g:
            raise HTTPException(404, "Study guide not found")
        if body.title is not None:
            g.title = body.title.strip() or g.title
        if body.data is not None:
            g.data_json = StudyGuide.dumps(body.data)
        g.updated_at = utcnow()
        return _guide(g, True)


@router.delete("/guides/{guide_id}")
def delete_guide(guide_id: int, ctx: AppContext = Depends(get_ctx)):
    with ctx.db.session() as s:
        g = s.get(StudyGuide, guide_id)
        if not g:
            raise HTTPException(404, "Study guide not found")
        s.delete(g)
    return {"ok": True}


def guide_to_html(data: dict[str, Any]) -> str:
    import html as h

    e = h.escape
    parts = []
    if data.get("overview"):
        parts.append(f"<h2>Unit overview</h2><p>{e(data['overview'])}</p>")
    if data.get("topics"):
        parts.append("<h2>Main topics</h2>")
        for t in data["topics"]:
            parts.append(f"<h3>{e(t.get('name', ''))}</h3>")
            if t.get("summary"):
                parts.append(f"<p>{e(t['summary'])}</p>")
            if t.get("key_points"):
                parts.append("<ul>" + "".join(f"<li><p>{e(k)}</p></li>" for k in t["key_points"]) + "</ul>")
    sections = [("vocabulary", "Important vocabulary", "term", "definition"),
                ("key_concepts", "Key concepts", "concept", "explanation")]
    for key, label, a, b in sections:
        if data.get(key):
            parts.append(f"<h2>{label}</h2><ul>" + "".join(
                f"<li><p><strong>{e(i.get(a, ''))}</strong> — {e(i.get(b, ''))}</p></li>" for i in data[key]) + "</ul>")
    for key, label in (("examples", "Examples"), ("facts", "Important facts"), ("common_mistakes", "Common mistakes")):
        if data.get(key):
            parts.append(f"<h2>{label}</h2><ul>" + "".join(f"<li><p>{e(x)}</p></li>" for x in data[key]) + "</ul>")
    if data.get("review_questions"):
        parts.append("<h2>Review questions</h2><ol>" + "".join(
            f"<li><p><strong>{e(q.get('question', ''))}</strong><br>{e(q.get('answer', ''))}</p></li>"
            for q in data["review_questions"]) + "</ol>")
    return "".join(parts)


@router.get("/guides/{guide_id}/export")
def export_guide(guide_id: int, format: str = "pdf", ctx: AppContext = Depends(get_ctx)):
    if format not in EXPORT_FORMATS:
        raise HTTPException(400, "Unsupported format")
    g = get_guide(guide_id, ctx)
    data, mime, ext = export(g["title"], guide_to_html(g["data"]), format)
    return Response(data, media_type=mime, headers={"Content-Disposition": f'attachment; filename="{safe_filename(g["title"], ext)}"'})
