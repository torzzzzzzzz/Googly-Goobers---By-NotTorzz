"""Productivity and study tools: summaries, notes, quizzes/tests, flashcards, study guides, Q&A, grading."""
from __future__ import annotations

import html
import random
import re
import time
from difflib import SequenceMatcher
from typing import Any, AsyncIterator

from ..ai import prompts as P
from ..ai.base import ProviderError
from ..db.models import (
    Flashcard,
    FlashcardDeck,
    Note,
    Quiz,
    QuizQuestion,
    StudyGuide,
    Summary,
)
from ..offline import engine as OFF
from ..offline.retrieval import Passage, bm25_rank, build_passages
from ..offline.text import chunk_text, content_overlap, normalize_ws, stem, tokens, word_count
from .common import AppContext, Source, record_run, title_from_text


def _json_chunk_limit(ctx: AppContext) -> int:
    # JSON outputs are long; keep the input part of each request modest.
    return max(1200, min(int(ctx.ai.context_chars() * 0.55), 9000))


def _source_stems(text: str) -> set[str]:
    return {stem(t) for t in tokens(text)}


# ------------------------------------------------------------------------------------------------ summarizer

async def summarize(ctx: AppContext, src: Source, fmt: str, target_words: int, engine: str) -> AsyncIterator[dict[str, Any]]:
    started = time.time()
    text = src.text
    if engine == "offline":
        out = OFF.summarize(text, fmt, target_words)
        if not out.strip():
            raise ValueError("The offline engine could not find enough complete sentences to summarize.")
        yield {"type": "meta", "provider": None, "model": None, "engine": "offline"}
        yield {"type": "delta", "text": out}
        sid, hid = _save_summary(ctx, src, fmt, target_words, out, "offline", "", "", started)
        yield {"type": "done", "output": out, "engine": "offline", "summary_id": sid, "history_id": hid,
               "stats": {"words_in": word_count(text), "words_out": word_count(out)}}
        return

    lang = ctx.settings.language_instruction()
    limit = ctx.ai.context_chars()
    chunks = chunk_text(text, limit)
    meta: dict[str, Any] = {}
    if len(chunks) > 1:
        partials: list[str] = []
        per_chunk = max(80, min(400, (target_words or 300) * 2 // len(chunks) + 60))
        partial_fmt = "facts" if fmt in ("facts", "vocabulary") else ("arguments" if fmt == "arguments" else "detailed")
        for i, chunk in enumerate(chunks):
            yield {"type": "progress", "stage": "Reading sections", "current": i, "total": len(chunks)}
            res = await ctx.ai.chat(P.summary_messages(chunk, partial_fmt, per_chunk, lang, partial=True),
                                    ctx.ai.gen_options(temperature=0.2))
            if not meta:
                meta = {"provider": res.provider, "model": res.model}
            partials.append(P.clean_output(res.text))
        # Combine recursively if the partials are still too long.
        while len("\n\n".join(partials)) > limit and len(partials) > 1:
            grouped = []
            for k in range(0, len(partials), 4):
                res = await ctx.ai.chat(P.summary_combine_messages(partials[k:k + 4], "detailed", 400, lang),
                                        ctx.ai.gen_options(temperature=0.2))
                grouped.append(P.clean_output(res.text))
            partials = grouped
        yield {"type": "progress", "stage": "Writing final summary", "current": len(chunks), "total": len(chunks)}
        msgs = P.summary_combine_messages(partials, fmt, target_words, lang)
    else:
        msgs = P.summary_messages(text, fmt, target_words, lang)
    buf = ""
    max_tok = int((target_words or 600) * 2.5) + 300
    async for ev in ctx.ai.stream(msgs, ctx.ai.gen_options(temperature=0.3, max_tokens=max_tok)):
        if ev["type"] == "meta":
            meta = {"provider": ev["provider"], "model": ev["model"]}
            yield {**ev, "engine": "ai"}
            continue
        buf += ev["text"]
        yield ev
    out = P.clean_output(buf)
    sid, hid = _save_summary(ctx, src, fmt, target_words, out, "ai", meta.get("provider", ""), meta.get("model", ""), started)
    yield {"type": "done", "output": out, "engine": "ai", "summary_id": sid, "history_id": hid, **meta,
           "stats": {"words_in": word_count(text), "words_out": word_count(out), "sections": len(chunks)}}


def _save_summary(ctx, src: Source, fmt, target_words, out, engine, provider, model, started):
    hid = record_run(ctx, "summarizer", src.text, out, settings={"format": fmt, "length": target_words},
                     engine=engine, provider=provider, model=model, started=started, title=src.title,
                     source_file_id=src.file_id)
    with ctx.db.session() as s:
        sm = Summary(history_id=hid, source_file_id=src.file_id, title=src.title, format=fmt, length=target_words or 0,
                     content=out, engine=engine, provider=provider, model=model)
        s.add(sm)
        s.flush()
        return sm.id, hid


# ------------------------------------------------------------------------------------------------ notes

NOTE_LIST_KEYS = ["key_concepts", "definitions", "key_information", "dates", "people", "examples", "arguments", "remember"]
NOTE_PAIR_KEYS = {"key_concepts": ("name", "explanation"), "definitions": ("term", "definition"),
                  "dates": ("date", "event"), "people": ("name", "significance")}


def _norm_notes(data: Any) -> dict[str, Any]:
    if not isinstance(data, dict):
        raise ValueError("expected an object")
    out: dict[str, Any] = {k: str(data.get(k) or "").strip() for k in ("title", "main_topic", "overview")}
    for key in NOTE_LIST_KEYS:
        raw = data.get(key) or []
        if not isinstance(raw, list):
            raw = [raw]
        items = []
        if key in NOTE_PAIR_KEYS:
            a, b = NOTE_PAIR_KEYS[key]
            for it in raw:
                if isinstance(it, dict):
                    va = str(it.get(a) or next(iter(it.values()), "") or "").strip()
                    vb = str(it.get(b) or (list(it.values())[1] if len(it) > 1 else "") or "").strip()
                elif isinstance(it, str) and ":" in it:
                    va, vb = (x.strip() for x in it.split(":", 1))
                else:
                    continue
                if va and vb:
                    items.append({a: va, b: vb})
        else:
            items = [str(it).strip() if not isinstance(it, dict) else " ".join(str(v) for v in it.values()).strip()
                     for it in raw]
            items = [i for i in items if i]
        out[key] = items
    if not (out["overview"] or any(out[k] for k in NOTE_LIST_KEYS)):
        raise ValueError("the notes were empty")
    return out


def _merge_notes(parts: list[dict[str, Any]]) -> dict[str, Any]:
    merged = dict(parts[0])
    for p in parts[1:]:
        for key in NOTE_LIST_KEYS:
            seen = {str(x).lower() for x in merged[key]}
            for item in p[key]:
                k = str(item).lower()
                if k not in seen:
                    merged[key].append(item)
                    seen.add(k)
    return merged


NOTE_SECTIONS = [
    ("key_concepts", "Key concepts"), ("definitions", "Definitions"), ("key_information", "Key information"),
    ("dates", "Important dates"), ("people", "Important people"), ("examples", "Examples"),
    ("arguments", "Main arguments"), ("remember", "Things to remember"),
]


def notes_to_html(data: dict[str, Any]) -> str:
    e = html.escape
    parts = []
    if data.get("main_topic"):
        parts.append(f"<p><strong>Main topic:</strong> {e(data['main_topic'])}</p>")
    if data.get("overview"):
        parts.append(f"<h2>Overview</h2><p>{e(data['overview'])}</p>")
    for key, label in NOTE_SECTIONS:
        items = data.get(key) or []
        if not items:
            continue
        parts.append(f"<h2>{label}</h2><ul>")
        for it in items:
            if isinstance(it, dict):
                a, b = NOTE_PAIR_KEYS[key]
                parts.append(f"<li><p><strong>{e(str(it.get(a, '')))}</strong> — {e(str(it.get(b, '')))}</p></li>")
            else:
                parts.append(f"<li><p>{e(str(it))}</p></li>")
        parts.append("</ul>")
    return "".join(parts)


async def smart_notes(ctx: AppContext, src: Source, detail: str, engine: str) -> AsyncIterator[dict[str, Any]]:
    started = time.time()
    provider = model = ""
    if engine == "offline":
        yield {"type": "progress", "stage": "Analysing text", "current": 0, "total": 1}
        data = OFF.notes(src.text, detail)
    else:
        lang = ctx.settings.language_instruction()
        chunks = chunk_text(src.text, _json_chunk_limit(ctx))
        parts = []
        for i, chunk in enumerate(chunks):
            yield {"type": "progress", "stage": "Writing notes", "current": i, "total": len(chunks)}
            data, res = await ctx.ai.chat_json(P.notes_messages(chunk, detail, lang), P.NOTES_SCHEMA, validate=_norm_notes)
            provider, model = res.provider, res.model
            if i == 0:
                yield {"type": "meta", "provider": provider, "model": model, "engine": "ai"}
            parts.append(data)
        data = _merge_notes(parts)
        if len(parts) > 1:
            overviews = " ".join(p["overview"] for p in parts if p["overview"])
            res = await ctx.ai.chat(P.summary_messages(overviews, "paragraph", 120, lang), ctx.ai.gen_options(temperature=0.3))
            data["overview"] = P.clean_output(res.text)
    title = data.get("title") or src.title
    content_html = notes_to_html(data)
    from ..documents.export import html_to_text

    with ctx.db.session() as s:
        note = Note(title=title[:300], content_html=content_html, content_text=html_to_text(content_html),
                    data_json=Note.dumps(data), source_file_id=src.file_id, engine=engine,
                    provider=provider, model=model)
        s.add(note)
        s.flush()
        note_id = note.id
    hid = record_run(ctx, "notes", src.text, html_to_text(content_html), output_json={"note_id": note_id},
                     settings={"detail": detail}, engine=engine, provider=provider, model=model, started=started,
                     title=title, source_file_id=src.file_id)
    with ctx.db.session() as s:
        s.get(Note, note_id).history_id = hid
    yield {"type": "done", "note_id": note_id, "title": title, "data": data, "content_html": content_html,
           "engine": engine, "provider": provider or None, "model": model or None, "history_id": hid}


# ------------------------------------------------------------------------------------------------ quiz / test generation

TYPE_ALIASES = {
    "mcq": "multiple_choice", "multiple choice": "multiple_choice", "multiple-choice": "multiple_choice",
    "multiplechoice": "multiple_choice", "tf": "true_false", "true/false": "true_false", "true or false": "true_false",
    "truefalse": "true_false", "true-false": "true_false", "fill in the blank": "fill_blank", "fill-in-the-blank": "fill_blank",
    "fill_in_the_blank": "fill_blank", "fillblank": "fill_blank", "short answer": "short_answer", "short": "short_answer",
    "open": "written", "essay": "written", "long_answer": "written",
}
BLANK_RE = re.compile(r"_{2,}|\[\s*blank\s*\]|\(\s*blank\s*\)|\.{4,}", re.I)


def plan_types(count: int, types: list[str]) -> dict[str, int]:
    types = [t for t in types if t in P.QUESTION_TYPES] or ["multiple_choice"]
    plan = {t: count // len(types) for t in types}
    for t in types[: count % len(types)]:
        plan[t] += 1
    return {t: n for t, n in plan.items() if n > 0}


def _norm_answer(s: str) -> str:
    return re.sub(r"[^\w\s]", "", (s or "").lower()).strip()


def normalize_question(q: Any, rng: random.Random) -> dict[str, Any] | None:
    if not isinstance(q, dict):
        return None
    qtype = str(q.get("type") or "").strip().lower().replace(" ", "_") if q.get("type") else ""
    qtype = TYPE_ALIASES.get(qtype.replace("_", " "), TYPE_ALIASES.get(qtype, qtype))
    if qtype not in P.QUESTION_TYPES:
        qtype = "multiple_choice" if q.get("options") else "short_answer"
    question = str(q.get("question") or q.get("prompt") or "").strip()
    answer = q.get("answer")
    if isinstance(answer, bool):
        answer = "True" if answer else "False"
    if isinstance(answer, list):
        answer = answer[0] if answer else ""
    answer = str(answer or q.get("correct_answer") or "").strip()
    options = [str(o).strip() for o in (q.get("options") or []) if str(o).strip()]
    if len(question) < 8 or not answer:
        return None
    if qtype == "multiple_choice":
        options = [re.sub(r"^\(?[A-Fa-f][).:]\s+", "", o) for o in options]
        options = list(dict.fromkeys(options))
        m = re.fullmatch(r"(?:option\s*)?\(?([A-Fa-f])\)?[.):]?", answer.strip(), re.I)
        if m and len(options) >= 2:
            idx = ord(m.group(1).upper()) - 65
            if idx < len(options):
                answer = options[idx]
        answer = re.sub(r"^\(?[A-Fa-f][).:]\s+", "", answer)
        match = next((o for o in options if _norm_answer(o) == _norm_answer(answer)), None)
        if match is None:
            best = max(options, key=lambda o: SequenceMatcher(None, _norm_answer(o), _norm_answer(answer)).ratio(), default=None)
            if best and SequenceMatcher(None, _norm_answer(best), _norm_answer(answer)).ratio() >= 0.85:
                match = best
        if match is None or len(options) < 3:
            return None
        answer = match
        options = options[:6]
        if answer not in options:
            options[-1] = answer
        rng.shuffle(options)
    elif qtype == "true_false":
        a = answer.strip().lower().rstrip(".")
        if a in ("true", "t", "yes", "correct"):
            answer = "True"
        elif a in ("false", "f", "no", "incorrect"):
            answer = "False"
        else:
            return None
        options = ["True", "False"]
        question = re.sub(r"^true\s+or\s+false\s*[:?-]?\s*", "", question, flags=re.I)
    elif qtype == "fill_blank":
        if BLANK_RE.search(question):
            question = BLANK_RE.sub("_____", question, count=1)
        elif re.search(rf"\b{re.escape(answer)}\b", question, re.I):
            question = re.sub(rf"\b{re.escape(answer)}\b", "_____", question, count=1, flags=re.I)
        else:
            qtype = "short_answer"
        options = []
    else:
        options = []
    diff = str(q.get("difficulty") or "medium").lower()
    if diff not in ("easy", "medium", "hard"):
        diff = "medium"
    return {"type": qtype, "difficulty": diff, "question": question, "options": options, "answer": answer,
            "explanation": str(q.get("explanation") or "").strip(), "source_quote": str(q.get("source_quote") or "").strip()}


def grounded(q: dict[str, Any], src_stems: set[str]) -> bool:
    quote = q.get("source_quote") or ""
    if quote and content_overlap(quote, src_stems) >= 0.75:
        return True
    probe = q["question"] + " " + (q["answer"] if q["type"] != "true_false" else "")
    return content_overlap(probe, src_stems) >= 0.6


def _parse_questions(data: Any) -> list[Any]:
    if isinstance(data, dict):
        for key in ("questions", "quiz", "items"):
            if isinstance(data.get(key), list):
                return data[key]
        if "question" in data:
            return [data]
    if isinstance(data, list):
        return data
    raise ValueError("no 'questions' list in the response")


def _similar(a: str, b: str) -> bool:
    return SequenceMatcher(None, _norm_answer(a), _norm_answer(b)).ratio() > 0.85


async def generate_questions(ctx: AppContext, text: str, count: int, types: list[str], difficulty: str,
                             engine: str, progress: list[dict[str, Any]], meta: dict[str, Any]) -> list[dict[str, Any]]:
    plan = plan_types(count, types)
    rng = random.Random()
    if engine == "offline":
        qs = OFF.quiz(text, plan, difficulty)
        if not qs:
            raise ValueError("The offline engine could not build questions from this text. Try a longer passage.")
        return qs[:count]
    lang = ctx.settings.language_instruction()
    chunks = chunk_text(text, _json_chunk_limit(ctx)) or [text]
    stems_by_chunk = [_source_stems(c) for c in chunks]
    # Build batches of ≤5 questions spread across chunks proportionally to their length.
    remaining = dict(plan)
    questions: list[dict[str, Any]] = []
    attempts = 0
    order = sorted(range(len(chunks)), key=lambda i: -len(chunks[i]))
    ci = 0
    while sum(remaining.values()) > 0 and attempts < max(4, len(chunks) + count // 4 + 2):
        attempts += 1
        batch: dict[str, int] = {}
        for t in list(remaining):
            take = min(remaining[t], 5 - sum(batch.values()))
            if take > 0:
                batch[t] = take
        idx = order[ci % len(order)]
        ci += 1
        progress.append({"type": "progress", "stage": "Writing questions", "current": len(questions), "total": count})
        try:
            raw, res = await ctx.ai.chat_json(
                P.quiz_messages(chunks[idx], batch, difficulty, [q["question"] for q in questions], lang),
                P.QUIZ_SCHEMA, validate=_parse_questions, temperature=0.5)
        except ProviderError as exc:
            if exc.kind == "bad_output" and questions:
                continue
            raise
        meta.setdefault("provider", res.provider)
        meta.setdefault("model", res.model)
        for item in raw:
            q = normalize_question(item, rng)
            if not q or not grounded(q, stems_by_chunk[idx]):
                continue
            if remaining.get(q["type"], 0) <= 0:
                # wrong type: accept only if another requested type still needs questions and it matches
                continue
            if any(_similar(q["question"], o["question"]) for o in questions):
                continue
            if difficulty in ("easy", "medium", "hard"):
                q["difficulty"] = difficulty
            questions.append(q)
            remaining[q["type"]] -= 1
    if not questions:
        raise ProviderError("bad_output", "The model could not produce valid questions grounded in this material. "
                                          "Try again, use a larger model, or switch to the offline engine.")
    # Interleave question types for variety.
    by_type: dict[str, list[dict[str, Any]]] = {}
    for q in questions:
        by_type.setdefault(q["type"], []).append(q)
    mixed = []
    while any(by_type.values()):
        for t in list(by_type):
            if by_type[t]:
                mixed.append(by_type[t].pop(0))
    return mixed[:count]


async def create_quiz(ctx: AppContext, src: Source, kind: str, count: int, types: list[str], difficulty: str,
                      engine: str, title: str = "", time_limit_min: int = 0) -> AsyncIterator[dict[str, Any]]:
    started = time.time()
    tool = "practice_test" if kind == "practice_test" else "quiz"
    progress: list[dict[str, Any]] = []
    meta: dict[str, Any] = {}
    yield {"type": "progress", "stage": "Reading material", "current": 0, "total": count}
    import asyncio

    task = asyncio.create_task(generate_questions(ctx, src.text, count, types, difficulty, engine, progress, meta))
    sent = 0
    while not task.done():
        await asyncio.sleep(0.25)
        while sent < len(progress):
            yield progress[sent]
            sent += 1
    questions = task.result()
    settings = {"count": count, "types": types, "difficulty": difficulty, "time_limit_min": time_limit_min}
    with ctx.db.session() as s:
        quiz = Quiz(kind=kind, title=(title or src.title or "Quiz")[:300], source_text=src.text,
                    source_file_id=src.file_id, settings_json=Quiz.dumps(settings), engine=engine,
                    provider=meta.get("provider", ""), model=meta.get("model", ""))
        s.add(quiz)
        s.flush()
        for i, q in enumerate(questions):
            s.add(QuizQuestion(quiz_id=quiz.id, position=i, type=q["type"], difficulty=q["difficulty"],
                               prompt=q["question"], options_json=QuizQuestion.dumps(q["options"]), answer=q["answer"],
                               explanation=q["explanation"], source_quote=q["source_quote"],
                               points=2.0 if q["type"] == "written" else 1.0))
        quiz_id = quiz.id
    hid = record_run(ctx, tool, src.text, f"{len(questions)} questions", output_json={"quiz_id": quiz_id},
                     settings=settings, engine=engine, provider=meta.get("provider", ""), model=meta.get("model", ""),
                     started=started, title=title or src.title, source_file_id=src.file_id)
    yield {"type": "done", "quiz_id": quiz_id, "count": len(questions), "requested": count, "engine": engine,
           "provider": meta.get("provider"), "model": meta.get("model"), "history_id": hid}


# ------------------------------------------------------------------------------------------------ grading

def grade_objective(q: QuizQuestion, answer: str) -> dict[str, Any] | None:
    a = (answer or "").strip()
    if q.type in ("multiple_choice", "true_false"):
        ok = _norm_answer(a) == _norm_answer(q.answer)
        # The correct answer is returned separately (model_answer); no duplicate feedback text.
        return {"correct": ok, "score": q.points if ok else 0.0, "verdict": "correct" if ok else "incorrect", "feedback": ""}
    if q.type == "fill_blank":
        na, nb = _norm_answer(a), _norm_answer(q.answer)
        ok = bool(na) and (na == nb or SequenceMatcher(None, na, nb).ratio() >= 0.85 or
                           (len(nb.split()) > 1 and {stem(x) for x in na.split()} == {stem(x) for x in nb.split()}))
        return {"correct": ok, "score": q.points if ok else 0.0, "verdict": "correct" if ok else "incorrect", "feedback": ""}
    return None


async def grade_question(ctx: AppContext, quiz: Quiz, q: QuizQuestion, answer: str) -> dict[str, Any]:
    res = grade_objective(q, answer)
    if res is None:
        if quiz.engine == "offline":
            g = OFF.grade_text_answer(answer, q.answer, q.prompt)
            graded_by = "offline"
        else:
            if not (answer or "").strip():
                g = {"score": 0.0, "verdict": "incorrect", "feedback": f"No answer given. Model answer: {q.answer}"}
                graded_by = "rule"
            else:
                try:
                    data, r = await ctx.ai.chat_json(P.grade_messages(q.prompt, q.answer, answer, q.source_quote or quiz.source_text[:2500]),
                                                     P.GRADE_SCHEMA, temperature=0.1)
                    score = float(data.get("score", 0)) if isinstance(data, dict) else 0.0
                    if score > 1:
                        score = score / 10 if score <= 10 else 1.0
                    verdict = str(data.get("verdict") or ("correct" if score >= 0.8 else "partially_correct" if score >= 0.4 else "incorrect"))
                    g = {"score": max(0.0, min(1.0, score)), "verdict": verdict, "feedback": str(data.get("feedback") or "").strip()}
                    graded_by = f"{r.provider}:{r.model}"
                except ProviderError:
                    g = OFF.grade_text_answer(answer, q.answer, q.prompt)
                    graded_by = "offline"
        res = {"correct": g["verdict"] == "correct", "score": round(g["score"] * q.points, 2),
               "verdict": g["verdict"], "feedback": g["feedback"], "graded_by": graded_by}
    res.update({"question_id": q.id, "answer": answer, "model_answer": q.answer, "explanation": q.explanation,
                "points": q.points})
    return res


# ------------------------------------------------------------------------------------------------ flashcards

def _parse_cards(data: Any) -> list[Any]:
    if isinstance(data, dict):
        for key in ("cards", "flashcards", "items"):
            if isinstance(data.get(key), list):
                return data[key]
    if isinstance(data, list):
        return data
    raise ValueError("no 'cards' list in the response")


def normalize_card(c: Any) -> dict[str, str] | None:
    if not isinstance(c, dict):
        return None
    front = str(c.get("front") or c.get("question") or c.get("term") or "").strip()
    back = str(c.get("back") or c.get("answer") or c.get("definition") or "").strip()
    if len(front) < 2 or len(back) < 1 or _norm_answer(front) == _norm_answer(back):
        return None
    return {"front": front[:600], "back": back[:1200], "explanation": str(c.get("explanation") or "").strip()[:1200],
            "topic": str(c.get("topic") or "").strip()[:80] or "General", "source_quote": str(c.get("source_quote") or "").strip()}


async def generate_cards(ctx: AppContext, text: str, count: int, style: str, engine: str,
                         progress: list[dict[str, Any]], meta: dict[str, Any]) -> list[dict[str, str]]:
    if engine == "offline":
        cards = OFF.flashcards(text, count)
        if not cards:
            raise ValueError("The offline engine could not find definitions or key facts for flashcards in this text.")
        return cards
    lang = ctx.settings.language_instruction()
    chunks = chunk_text(text, _json_chunk_limit(ctx)) or [text]
    cards: list[dict[str, str]] = []
    total_len = sum(len(c) for c in chunks)
    attempts = 0
    ci = 0
    while len(cards) < count and attempts < len(chunks) + 3 + count // 10:
        attempts += 1
        idx = ci % len(chunks)
        ci += 1
        share = max(3, round(count * len(chunks[idx]) / total_len)) if attempts <= len(chunks) else count - len(cards)
        want = min(10, share, count - len(cards))
        progress.append({"type": "progress", "stage": "Writing flashcards", "current": len(cards), "total": count})
        try:
            raw, res = await ctx.ai.chat_json(P.flashcard_messages(chunks[idx], want, style, [c["front"] for c in cards], lang),
                                              P.FLASHCARD_SCHEMA, validate=_parse_cards, temperature=0.5)
        except ProviderError as exc:
            if exc.kind == "bad_output" and cards:
                continue
            raise
        meta.setdefault("provider", res.provider)
        meta.setdefault("model", res.model)
        stems = _source_stems(chunks[idx])
        for item in raw:
            c = normalize_card(item)
            if not c:
                continue
            ok = (c["source_quote"] and content_overlap(c["source_quote"], stems) >= 0.75) or \
                content_overlap(c["front"] + " " + c["back"], stems) >= 0.55
            if not ok or any(_similar(c["front"], o["front"]) for o in cards):
                continue
            cards.append(c)
            if len(cards) >= count:
                break
    if not cards:
        raise ProviderError("bad_output", "The model could not produce flashcards grounded in this material. "
                                          "Try again, use a larger model, or switch to the offline engine.")
    return cards[:count]


async def create_deck(ctx: AppContext, src: Source, count: int, style: str, engine: str, title: str = "") -> AsyncIterator[dict[str, Any]]:
    started = time.time()
    progress: list[dict[str, Any]] = []
    meta: dict[str, Any] = {}
    import asyncio

    yield {"type": "progress", "stage": "Reading material", "current": 0, "total": count}
    task = asyncio.create_task(generate_cards(ctx, src.text, count, style, engine, progress, meta))
    sent = 0
    while not task.done():
        await asyncio.sleep(0.25)
        while sent < len(progress):
            yield progress[sent]
            sent += 1
    cards = task.result()
    with ctx.db.session() as s:
        deck = FlashcardDeck(title=(title or src.title or "Flashcards")[:300], description=f"Generated from {src.title}"[:500],
                             source_file_id=src.file_id, engine=engine, provider=meta.get("provider", ""),
                             model=meta.get("model", ""))
        s.add(deck)
        s.flush()
        for i, c in enumerate(cards):
            s.add(Flashcard(deck_id=deck.id, position=i, front=c["front"], back=c["back"],
                            explanation=c.get("explanation", ""), topic=c.get("topic", "")))
        deck_id = deck.id
    hid = record_run(ctx, "flashcards", src.text, f"{len(cards)} flashcards", output_json={"deck_id": deck_id},
                     settings={"count": count, "style": style}, engine=engine, provider=meta.get("provider", ""),
                     model=meta.get("model", ""), started=started, title=title or src.title, source_file_id=src.file_id)
    yield {"type": "done", "deck_id": deck_id, "count": len(cards), "requested": count, "engine": engine,
           "provider": meta.get("provider"), "model": meta.get("model"), "history_id": hid}


# ------------------------------------------------------------------------------------------------ study guide

GUIDE_LISTS = ["topics", "vocabulary", "key_concepts", "examples", "facts", "common_mistakes", "review_questions"]
GUIDE_PAIRS = {"vocabulary": ("term", "definition"), "key_concepts": ("concept", "explanation"),
               "review_questions": ("question", "answer")}


def _norm_guide(data: Any) -> dict[str, Any]:
    if not isinstance(data, dict):
        raise ValueError("expected an object")
    out: dict[str, Any] = {"title": str(data.get("title") or "").strip(), "overview": str(data.get("overview") or "").strip()}
    for key in GUIDE_LISTS:
        raw = data.get(key) or []
        if not isinstance(raw, list):
            raw = [raw]
        items: list[Any] = []
        for it in raw:
            if key == "topics":
                if isinstance(it, dict) and (it.get("name") or it.get("title")):
                    kp = it.get("key_points") or it.get("points") or []
                    items.append({"name": str(it.get("name") or it.get("title")).strip(),
                                  "summary": str(it.get("summary") or "").strip(),
                                  "key_points": [str(x).strip() for x in (kp if isinstance(kp, list) else [kp]) if str(x).strip()]})
                elif isinstance(it, str) and it.strip():
                    items.append({"name": it.strip(), "summary": "", "key_points": []})
            elif key in GUIDE_PAIRS:
                a, b = GUIDE_PAIRS[key]
                if isinstance(it, dict):
                    vals = list(it.values())
                    va = str(it.get(a) or (vals[0] if vals else "")).strip()
                    vb = str(it.get(b) or (vals[1] if len(vals) > 1 else "")).strip()
                    if va and vb:
                        items.append({a: va, b: vb})
            else:
                s = str(it).strip() if not isinstance(it, dict) else " ".join(str(v) for v in it.values()).strip()
                if s:
                    items.append(s)
        out[key] = items
    if not (out["overview"] or out["topics"] or out["vocabulary"]):
        raise ValueError("the study guide was empty")
    return out


async def create_study_guide(ctx: AppContext, src: Source, engine: str, title: str = "") -> AsyncIterator[dict[str, Any]]:
    started = time.time()
    provider = model = ""
    if engine == "offline":
        yield {"type": "progress", "stage": "Analysing material", "current": 0, "total": 1}
        data = OFF.study_guide(src.text)
    else:
        lang = ctx.settings.language_instruction()
        chunks = chunk_text(src.text, _json_chunk_limit(ctx)) or [src.text]
        parts = []
        for i, chunk in enumerate(chunks):
            yield {"type": "progress", "stage": "Building study guide", "current": i, "total": len(chunks)}
            d, res = await ctx.ai.chat_json(P.study_guide_messages(chunk, lang), P.STUDY_GUIDE_SCHEMA, validate=_norm_guide)
            provider, model = res.provider, res.model
            if i == 0:
                yield {"type": "meta", "provider": provider, "model": model, "engine": "ai"}
            parts.append(d)
        data = parts[0]
        for p in parts[1:]:
            for key in GUIDE_LISTS:
                data[key].extend(p[key])
        if len(parts) > 1:
            res = await ctx.ai.chat(P.summary_messages(" ".join(p["overview"] for p in parts), "paragraph", 150, lang),
                                    ctx.ai.gen_options(temperature=0.3))
            data["overview"] = P.clean_output(res.text)
    data["title"] = title or data.get("title") or src.title
    with ctx.db.session() as s:
        g = StudyGuide(title=data["title"][:300], data_json=StudyGuide.dumps(data), source_file_id=src.file_id,
                       engine=engine, provider=provider, model=model)
        s.add(g)
        s.flush()
        gid = g.id
    hid = record_run(ctx, "study_guide", src.text, data.get("overview", ""), output_json={"guide_id": gid},
                     engine=engine, provider=provider, model=model, started=started, title=data["title"],
                     source_file_id=src.file_id)
    yield {"type": "done", "guide_id": gid, "data": data, "engine": engine, "provider": provider or None,
           "model": model or None, "history_id": hid}


# ------------------------------------------------------------------------------------------------ Q&A

async def answer_question(ctx: AppContext, question: str, sources: list[tuple[str, str, str]],
                          history: list[tuple[str, str]], engine: str) -> AsyncIterator[dict[str, Any]]:
    started = time.time()
    passages = build_passages(sources)
    budget = max(2500, int(ctx.ai.context_chars() * 0.7))
    # Use history to improve retrieval for follow-up questions.
    query = question + " " + " ".join(q for q, _ in history[-1:])
    ranked = bm25_rank(passages, query, k=8)
    chosen: list[Passage] = []
    used = 0
    for p in ranked:
        if used + len(p.text) > budget and chosen:
            break
        chosen.append(p)
        used += len(p.text)
    if not chosen and passages and len(sources) and sum(len(t) for _, _, t in sources) <= budget:
        chosen = passages[: max(1, budget // 900)]
    yield {"type": "passages", "passages": [dict(p.as_dict(), n=i + 1) for i, p in enumerate(chosen)]}
    if engine == "offline":
        out = ""
        hid = record_run(ctx, "qa", question, "\n\n".join(p.text for p in chosen),
                         output_json={"passages": [p.as_dict() for p in chosen]}, engine="offline", started=started)
        yield {"type": "done", "output": out, "engine": "offline", "history_id": hid, "found": bool(chosen)}
        return
    if not chosen:
        msg = "I couldn't find anything related to that question in the selected documents."
        yield {"type": "delta", "text": msg}
        yield {"type": "done", "output": msg, "engine": "ai", "found": False}
        return
    lang = ctx.settings.language_instruction()
    buf = ""
    meta: dict[str, Any] = {}
    async for ev in ctx.ai.stream(P.qa_messages(question, [(i + 1, p.text) for i, p in enumerate(chosen)], history, lang),
                                  ctx.ai.gen_options(temperature=0.2)):
        if ev["type"] == "meta":
            meta = ev
            yield {**ev, "engine": "ai"}
            continue
        buf += ev["text"]
        yield ev
    out = P.clean_output(buf)
    hid = record_run(ctx, "qa", question, out, output_json={"passages": [p.as_dict() for p in chosen]},
                     provider=meta.get("provider", ""), model=meta.get("model", ""), started=started)
    yield {"type": "done", "output": out, "engine": "ai", "history_id": hid, "found": True,
           "provider": meta.get("provider"), "model": meta.get("model")}


__all__ = [
    "summarize", "smart_notes", "create_quiz", "grade_question", "grade_objective", "create_deck",
    "create_study_guide", "answer_question", "notes_to_html", "normalize_question", "plan_types",
    "normalize_card", "title_from_text", "normalize_ws",
]
