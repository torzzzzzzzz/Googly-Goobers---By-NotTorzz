"""Deterministic stand-in for a language model, speaking the Ollama HTTP API.

Used ONLY by automated tests (pytest via httpx.MockTransport, and the browser E2E suite via
fake_ollama_server.py) so they are fast and reproducible. Live-model tests use a real Ollama.
Responses are derived from the request so outputs stay grounded in the supplied text.
"""
from __future__ import annotations

import json
import re
from typing import Any

FAKE_MODEL = "fake-model:latest"
UNGROUNDED_QUESTION = "What is the capital city of the planet Mars?"


def _user_text(messages: list[dict[str, str]]) -> str:
    return next((m["content"] for m in reversed(messages) if m["role"] == "user"), "")


def _system(messages: list[dict[str, str]]) -> str:
    return "\n".join(m["content"] for m in messages if m["role"] == "system")


def _sentences(text: str) -> list[str]:
    parts = re.split(r"(?<=[.!?])\s+", re.sub(r"\s+", " ", text).strip())
    return [p.strip() for p in parts if len(p.split()) >= 4]


def _after(text: str, marker: str) -> str:
    i = text.find(marker)
    return text[i + len(marker):].strip() if i >= 0 else text


def _key_word(sentence: str) -> str:
    words = [w.strip(".,;:()\"'") for w in sentence.split()]
    long = [w for w in words if len(w) >= 6 and w.isalpha()]
    return (long or words)[-1]


def rewrite(text: str) -> str:
    out = text
    for a, b in [("utilization", "use"), ("utilize", "use"), ("very important", "crucial"), ("It is important to note that ", ""),
                 ("Furthermore, ", "Also, "), ("in order to", "to"), ("a lot of", "many")]:
        out = out.replace(a, b)
    if out == text:
        out = re.sub(r"\bvery\b", "really", out, count=1)
    if out == text:
        out = out.rstrip(".") + ", clearly."
    return out


def proofread(text: str) -> str:
    fixes = [(r"\bteh\b", "the"), (r"\bdont\b", "doesn't"), (r"\brecieve\b", "receive"), (r"(?<![\w'])i(?![\w'])", "I"),
             (r"\btheir is\b", "there is"), (r"\bTheir is\b", "There is"), (r"\bgoes\b(?= to the)", "go")]
    out = text
    for pat, rep in fixes:
        out = re.sub(pat, rep, out)
    return out


def quiz_json(user: str) -> dict[str, Any]:
    material = _after(user, "Study material:")
    sents = _sentences(material) or [material]
    n = int(re.search(r"Write exactly (\d+) questions", user).group(1)) if re.search(r"Write exactly (\d+) questions", user) else 3
    plan = re.findall(r"- (\d+) × (\w+)", user) or [(str(n), "multiple_choice")]
    qs = []
    avoid = _after(user, "Do not repeat these existing questions:").split("Study material:")[0] if "Do not repeat" in user else ""
    k = len([ln for ln in avoid.splitlines() if ln.startswith("- ")])
    for count, qtype in plan:
        for _ in range(int(count)):
            s = sents[k % len(sents)]
            k += 1
            kw = _key_word(s)
            others = [_key_word(x) for x in sents if _key_word(x) != kw][:3]
            while len(others) < 3:
                others.append(f"option{len(others)}")
            if qtype == "multiple_choice":
                qs.append({"type": "multiple_choice", "difficulty": "medium", "question": f"Which word completes this statement: {s.replace(kw, '_____', 1)}",
                           "options": [kw] + others[:3], "answer": kw, "explanation": f"The material says: {s}", "source_quote": s})
            elif qtype == "true_false":
                qs.append({"type": "true_false", "difficulty": "easy", "question": s, "options": ["True", "False"], "answer": "True",
                           "explanation": "Stated in the material.", "source_quote": s})
            elif qtype == "fill_blank":
                qs.append({"type": "fill_blank", "difficulty": "medium", "question": s.replace(kw, "_____", 1), "options": [],
                           "answer": kw, "explanation": f"The material says: {s}", "source_quote": s})
            else:
                qs.append({"type": qtype, "difficulty": "hard", "question": f"Explain this idea from the material: {s[:80]}", "options": [],
                           "answer": s, "explanation": "See the material.", "source_quote": s})
    qs.append({"type": "multiple_choice", "difficulty": "easy", "question": UNGROUNDED_QUESTION, "options": ["Olympus", "Gale", "Jezero", "None"],
               "answer": "None", "explanation": "Invented.", "source_quote": "Mars has a capital city."})
    return {"questions": qs}


def cards_json(user: str) -> dict[str, Any]:
    material = _after(user, "Material:")
    n = int(re.search(r"Create exactly (\d+) flashcards", user).group(1)) if re.search(r"Create exactly (\d+) flashcards", user) else 5
    sents = _sentences(material) or [material]
    cards = []
    for i in range(n):
        s = sents[i % len(sents)]
        kw = _key_word(s)
        front = f"{s.replace(kw, '_____', 1)} (card {i + 1})" if i >= len(sents) else s.replace(kw, "_____", 1)
        cards.append({"front": front, "back": kw, "explanation": s, "topic": "Material", "source_quote": s})
    return {"cards": cards}


def notes_json(user: str) -> dict[str, Any]:
    text = _after(user, "Text:")
    sents = _sentences(text) or [text]
    return {
        "title": "Notes: " + " ".join(sents[0].split()[:5]),
        "main_topic": " ".join(sents[0].split()[:6]),
        "overview": " ".join(sents[:2]),
        "key_concepts": [{"name": _key_word(s), "explanation": s} for s in sents[:3]],
        "definitions": [{"term": _key_word(sents[0]), "definition": sents[0]}],
        "key_information": sents[:4],
        "dates": [{"date": m, "event": s} for s in sents for m in re.findall(r"\b1[0-9]{3}\b|\b20[0-9]{2}\b", s)][:3],
        "people": [],
        "examples": [],
        "arguments": [],
        "remember": sents[-1:],
    }


def guide_json(user: str) -> dict[str, Any]:
    text = _after(user, "Course material:")
    sents = _sentences(text) or [text]
    return {
        "title": "Study guide",
        "overview": " ".join(sents[:2]),
        "topics": [{"name": _key_word(s).title(), "summary": s, "key_points": [s]} for s in sents[:3]],
        "vocabulary": [{"term": _key_word(s), "definition": s} for s in sents[:3]],
        "key_concepts": [{"concept": _key_word(sents[0]), "explanation": sents[0]}],
        "examples": [],
        "facts": sents[:3],
        "common_mistakes": ["Confusing the two stages described in the material."],
        "review_questions": [{"question": f"What does the material say about {_key_word(s)}?", "answer": s} for s in sents[:2]],
    }


def respond(messages: list[dict[str, str]], wants_json: bool) -> str:
    system = _system(messages)
    user = _user_text(messages)
    if "exam questions" in system:
        return json.dumps(quiz_json(user))
    if "study flashcards" in system:
        return json.dumps(cards_json(user))
    if "organized study notes" in system:
        return json.dumps(notes_json(user))
    if "study guide" in system:
        return json.dumps(guide_json(user))
    if "grade a student's written answer" in system:
        model = re.search(r"Model answer: (.*)", user)
        student = re.search(r"Student answer: (.*)", user)
        mw = set((model.group(1) if model else "").lower().split())
        sw = set((student.group(1) if student else "").lower().split())
        score = round(len(mw & sw) / max(1, len(mw)), 2)
        return json.dumps({"score": score, "verdict": "correct" if score >= 0.6 else "incorrect", "feedback": "Compared with the model answer."})
    if "grading an essay" in system:
        return json.dumps({"overall": "A clear essay with room to improve.", "scores": {"thesis": 7, "structure": 6, "evidence": 5, "clarity": 7, "grammar": 8, "style": 6},
                           "strengths": ["Clear topic"], "improvements": ["Add specific evidence"]})
    if "explain proofreading corrections" in system:
        items = [{"original": a, "corrected": b, "explanation": f"Corrected “{a}”."} for a, b in re.findall(r'"(.*?)" -> "(.*?)"', user)]
        return json.dumps({"items": items})
    if "meticulous proofreader" in system:
        return proofread(_after(user, "Proofread and correct this text:"))
    if "answer questions using ONLY the numbered passages" in system:
        return "According to your documents, this is covered in the first passage [1]."
    if "combine partial summaries" in system or "summarize documents" in system:
        body = _after(user, ":")
        sents = _sentences(body) or [body]
        return "\n".join(f"- {s}" for s in sents[:3])
    if "writing tutor" in system:
        return "- **Clarity:** Simplified wording."
    if wants_json:
        return json.dumps({"result": "ok"})
    for marker in ("Rewrite this text:", "Paraphrase this text:", "Simplify this text:", "Revise this essay:", "Text:"):
        if marker in user:
            return "Here is the rewritten text:\n\n" + rewrite(_after(user, marker))
    return "This is a short essay written by the fake model.\n\nIt has two paragraphs."


def ollama_chat_response(payload: dict[str, Any]) -> tuple[str, bool]:
    content = respond(payload.get("messages", []), payload.get("format") is not None)
    return content, bool(payload.get("stream", True))


def ndjson_chunks(model: str, content: str, size: int = 12) -> list[bytes]:
    out = []
    for i in range(0, len(content), size):
        out.append((json.dumps({"model": model, "message": {"role": "assistant", "content": content[i:i + size]}, "done": False}) + "\n").encode())
    out.append((json.dumps({"model": model, "message": {"role": "assistant", "content": ""}, "done": True, "eval_count": 10}) + "\n").encode())
    return out


def tags() -> dict[str, Any]:
    return {"models": [{"name": FAKE_MODEL, "size": 123456789, "details": {"parameter_size": "1B", "family": "fake"}}]}
