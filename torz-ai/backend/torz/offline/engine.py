"""Offline (non-AI) generators for summaries, notes, flashcards, quizzes and study guides.

Everything here is extractive: output is built from sentences and terms that literally appear in the
source text. The UI labels these results "Offline engine" so they are never mistaken for AI output.
"""
from __future__ import annotations

import random
import re
from typing import Any

from .analyze import (
    ARGUMENT_MARKERS,
    EXAMPLE_MARKERS,
    REMEMBER_MARKERS,
    Analysis,
    analyze,
    best_sentence_for,
    fact_sentences,
    find_dates,
    find_names,
    guess_title,
    marker_sentences,
    top_sentences,
)
from .text import stem, tokens, word_count, words

# ------------------------------------------------------------------------------------------------ summaries


def summarize(text: str, fmt: str = "short", target_words: int = 0) -> str:
    an = analyze(text)
    if not an.sentences:
        return ""
    total = word_count(text)
    if fmt == "vocabulary":
        return _vocabulary_md(an, limit=max(5, min(30, (target_words or 200) // 12)))
    if fmt == "facts":
        facts = fact_sentences(an, limit=max(4, min(25, (target_words or 200) // 20)))
        if not facts:
            facts = [s.text for s in top_sentences(an, target_words or 150)]
        return "\n".join(f"- {f}" for f in facts)
    if fmt == "arguments":
        args = marker_sentences(an, ARGUMENT_MARKERS, limit=max(3, min(15, (target_words or 200) // 25)))
        if not args:
            return "No explicit arguments or claims were detected in this text. Main points:\n\n" + "\n".join(
                f"- {s.text}" for s in top_sentences(an, target_words or 120))
        return "\n".join(f"- {a}" for a in args)

    defaults = {"short": min(80, max(40, total // 8)), "detailed": max(150, total // 4),
                "bullets": max(80, total // 6), "paragraph": max(80, total // 6)}
    budget = target_words or defaults.get(fmt, 100)
    chosen = top_sentences(an, budget)
    if fmt == "bullets":
        return "\n".join(f"- {s.text}" for s in chosen)
    if fmt == "detailed":
        paras: dict[int, list[str]] = {}
        for s in chosen:
            paras.setdefault(s.para, []).append(s.text)
        return "\n\n".join(" ".join(v) for _, v in sorted(paras.items()))
    return " ".join(s.text for s in chosen)


def _vocabulary_md(an: Analysis, limit: int) -> str:
    lines = []
    seen = set()
    for term, definition, _ in an.definitions:
        lines.append(f"- **{term}**: {definition}")
        seen.add(term.lower())
    for kw, _ in an.keywords:
        if len(lines) >= limit:
            break
        if kw.lower() in seen:
            continue
        ctx = best_sentence_for(an, kw)
        if ctx:
            lines.append(f"- **{kw}**: used in “{ctx}”")
            seen.add(kw.lower())
    return "\n".join(lines[:limit]) or "No key vocabulary could be identified."


# ------------------------------------------------------------------------------------------------ notes


def notes(text: str, detail: str = "standard") -> dict[str, Any]:
    an = analyze(text)
    scale = {"brief": 0.6, "detailed": 1.6}.get(detail, 1.0)
    n = lambda k: max(2, int(k * scale))  # noqa: E731
    kws = an.keywords
    concepts = []
    for kw, _ in kws[: n(8)]:
        s = best_sentence_for(an, kw)
        if s:
            concepts.append({"name": kw[:1].upper() + kw[1:], "explanation": s})
    return {
        "title": guess_title(text, an),
        "main_topic": ", ".join(k for k, _ in kws[:3]),
        "overview": " ".join(s.text for s in top_sentences(an, int(70 * scale))),
        "key_concepts": concepts,
        "definitions": [{"term": t, "definition": d} for t, d, _ in an.definitions[: n(12)]],
        "key_information": [s.text for s in top_sentences(an, int(160 * scale))],
        "dates": [{"date": d, "event": s} for d, s in find_dates(an.sentences)[: n(10)]],
        "people": [{"name": nm, "significance": s} for nm, s in find_names(an.sentences, limit=n(8))],
        "examples": marker_sentences(an, EXAMPLE_MARKERS, n(5)),
        "arguments": marker_sentences(an, ARGUMENT_MARKERS, n(5)),
        "remember": marker_sentences(an, REMEMBER_MARKERS, n(5)) or fact_sentences(an, n(4)),
    }


# ------------------------------------------------------------------------------------------------ cloze helpers


def _cloze(sentence: str, term: str) -> str | None:
    pat = re.compile(rf"\b{re.escape(term)}\b", re.I)
    if not pat.search(sentence):
        return None
    return pat.sub("_____", sentence, count=1)


def _term_pool(an: Analysis) -> list[str]:
    pool = [t for t, _, _ in an.definitions] + [k for k, _ in an.keywords]
    out, seen = [], set()
    for p in pool:
        key = p.lower()
        if key not in seen and len(p) > 2:
            seen.add(key)
            out.append(p)
    return out


def _distractors(term: str, pool: list[str], k: int, rng: random.Random) -> list[str]:
    tw = len(term.split())
    cap = term[:1].isupper()
    cands = [p for p in pool if p.lower() != term.lower() and stem(p) != stem(term)]
    similar = [p for p in cands if len(p.split()) == tw and p[:1].isupper() == cap]
    rest = [p for p in cands if p not in similar]
    rng.shuffle(similar)
    rng.shuffle(rest)
    return (similar + rest)[:k]


def _cloze_items(an: Analysis, rng: random.Random, limit: int) -> list[tuple[str, str, str]]:
    """(cloze sentence, answer term, original sentence) for the best-ranked sentences."""
    pool = _term_pool(an)
    items = []
    used_sent = set()
    used_terms = set()
    for i in an.ranked():
        s = an.sentences[i]
        if i in used_sent or not (6 <= len(words(s.text)) <= 45):
            continue
        for term in pool:
            if term.lower() in used_terms:
                continue
            cz = _cloze(s.text, term)
            if cz and len(term) < len(s.text) * 0.5:
                items.append((cz, term, s.text))
                used_sent.add(i)
                used_terms.add(term.lower())
                break
        if len(items) >= limit:
            break
    return items


# ------------------------------------------------------------------------------------------------ flashcards


def flashcards(text: str, count: int = 15, seed: int | None = None) -> list[dict[str, str]]:
    an = analyze(text)
    rng = random.Random(seed)
    cards: list[dict[str, str]] = []
    for term, definition, idx in an.definitions:
        cards.append({"front": f"What is {term}?" if len(term.split()) <= 4 else term, "back": definition,
                      "explanation": "", "topic": _topic_for(an, idx), "source_quote": an.sentences[idx].text})
        if len(cards) >= count:
            return cards
    for cz, term, orig in _cloze_items(an, rng, count - len(cards)):
        cards.append({"front": f"Fill in the blank: {cz}", "back": term, "explanation": orig,
                      "topic": term if len(term.split()) <= 3 else "Key facts", "source_quote": orig})
    return cards[:count]


def _topic_for(an: Analysis, idx: int) -> str:
    st = {stem(t) for t in tokens(an.sentences[idx].text)}
    for kw, _ in an.keywords[:8]:
        if {stem(t) for t in tokens(kw)} & st:
            return kw[:1].upper() + kw[1:]
    return "General"


# ------------------------------------------------------------------------------------------------ quizzes


def quiz(text: str, plan: dict[str, int], difficulty: str = "mixed", seed: int | None = None) -> list[dict[str, Any]]:
    an = analyze(text)
    rng = random.Random(seed)
    pool = _term_pool(an)
    total = sum(plan.values())
    clozes = _cloze_items(an, rng, total * 2 + 4)
    rng.shuffle(clozes)
    defs = list(an.definitions)
    out: list[dict[str, Any]] = []

    def diff_for(k: int) -> str:
        if difficulty != "mixed":
            return difficulty
        return ["easy", "medium", "hard"][k % 3]

    def take_cloze():
        return clozes.pop() if clozes else None

    for qtype, n in plan.items():
        for k in range(n):
            q: dict[str, Any] | None = None
            if qtype == "definition" and defs:
                term, definition, idx = defs.pop(0)
                q = {"type": "definition", "question": f"Define “{term}” as it is used in the material.",
                     "options": [], "answer": definition, "explanation": f"The material states: {an.sentences[idx].text}",
                     "source_quote": an.sentences[idx].text}
            elif qtype == "short_answer" and defs:
                term, definition, idx = defs.pop(0)
                q = {"type": "short_answer", "question": f"In one sentence, explain what {term} is.",
                     "options": [], "answer": definition, "explanation": f"The material states: {an.sentences[idx].text}",
                     "source_quote": an.sentences[idx].text}
            else:
                item = take_cloze()
                if not item:
                    continue
                cz, term, orig = item
                if qtype == "multiple_choice":
                    dis = _distractors(term, pool, 3, rng)
                    if len(dis) < 2:
                        q = {"type": "fill_blank", "question": cz, "options": [], "answer": term,
                             "explanation": f"The material states: {orig}", "source_quote": orig}
                    else:
                        opts = dis + [term]
                        rng.shuffle(opts)
                        q = {"type": "multiple_choice", "question": f"Which term completes the statement? {cz}",
                             "options": opts, "answer": term, "explanation": f"The material states: {orig}",
                             "source_quote": orig}
                elif qtype == "true_false":
                    make_false = rng.random() < 0.5
                    dis = _distractors(term, pool, 1, rng) if make_false else []
                    if make_false and dis:
                        stmt = re.sub(rf"\b{re.escape(term)}\b", dis[0], orig, count=1, flags=re.I)
                        q = {"type": "true_false", "question": f"True or false: {stmt}", "options": ["True", "False"],
                             "answer": "False", "explanation": f"The material actually says: {orig}", "source_quote": orig}
                    else:
                        q = {"type": "true_false", "question": f"True or false: {orig}", "options": ["True", "False"],
                             "answer": "True", "explanation": "This statement appears in the material.", "source_quote": orig}
                elif qtype in ("short_answer", "definition", "written"):
                    q = {"type": "short_answer", "question": f"What word or phrase completes this statement? {cz}",
                         "options": [], "answer": term, "explanation": f"The material states: {orig}", "source_quote": orig}
                else:  # fill_blank
                    q = {"type": "fill_blank", "question": cz, "options": [], "answer": term,
                         "explanation": f"The material states: {orig}", "source_quote": orig}
            if q:
                q["difficulty"] = diff_for(len(out))
                out.append(q)
    return out


# ------------------------------------------------------------------------------------------------ study guide


def study_guide(text: str) -> dict[str, Any]:
    an = analyze(text)
    rng = random.Random(7)
    topics = []
    for kw, _ in an.keywords[:6]:
        st = {stem(t) for t in tokens(kw)}
        related = [s.text for i, s in enumerate(an.sentences)
                   if st <= {stem(t) for t in tokens(s.text)} and 5 <= len(words(s.text)) <= 60]
        if related:
            topics.append({"name": kw[:1].upper() + kw[1:], "summary": related[0], "key_points": related[1:4]})
    review = []
    for cz, term, _orig in _cloze_items(an, rng, 8):
        review.append({"question": cz, "answer": term})
    for term, definition, _ in an.definitions[:5]:
        review.append({"question": f"What is {term}?", "answer": definition})
    return {
        "title": guess_title(text, an),
        "overview": " ".join(s.text for s in top_sentences(an, 90)),
        "topics": topics,
        "vocabulary": [{"term": t, "definition": d} for t, d, _ in an.definitions[:20]],
        "key_concepts": [{"concept": k[:1].upper() + k[1:], "explanation": best_sentence_for(an, k)}
                         for k, _ in an.keywords[:10] if best_sentence_for(an, k)],
        "examples": marker_sentences(an, EXAMPLE_MARKERS, 6),
        "facts": fact_sentences(an, 10),
        "common_mistakes": [],
        "review_questions": review,
    }


# ------------------------------------------------------------------------------------------------ grading


def grade_text_answer(student: str, model_answer: str, question: str = "") -> dict[str, Any]:
    """Approximate grading by coverage of the model answer's key word stems.

    Words that already appear in the question are not required in the answer (the student does not
    need to repeat "the Calvin cycle" when asked where the Calvin cycle takes place).
    """
    a = {stem(t) for t in tokens(student or "")}
    b = {stem(t) for t in tokens(model_answer or "")}
    q = {stem(t) for t in tokens(question or "")}
    required = (b - q) or b
    if not b:
        return {"score": 0.0, "verdict": "incorrect", "feedback": "No reference answer is available."}
    if not a:
        return {"score": 0.0, "verdict": "incorrect", "feedback": f"No answer given. Expected: {model_answer}"}
    recall = len(a & required) / len(required)
    if recall >= 0.6:
        return {"score": 1.0, "verdict": "correct", "feedback": "Your answer covers the key points (approximate offline grading)."}
    if recall >= 0.3:
        return {"score": 0.5, "verdict": "partially_correct",
                "feedback": f"Partly correct (approximate offline grading). Reference answer: {model_answer}"}
    return {"score": 0.0, "verdict": "incorrect", "feedback": f"Reference answer: {model_answer}"}
