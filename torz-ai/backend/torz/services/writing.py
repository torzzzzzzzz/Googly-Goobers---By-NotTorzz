"""Writing tools: humanizer, paraphraser, rewriter, simplifier, essay improver, assistant, grammar."""
from __future__ import annotations

import re
import time
from typing import Any, AsyncIterator, Callable

from ..ai import prompts as P
from ..ai.base import ChatMessage
from ..offline import grammar as G
from ..offline.text import chunk_text, readability, split_paragraphs, word_count
from .common import AppContext, record_run

CITATION_RE = re.compile(
    r"\((?:[A-Z][A-Za-z'\-]+(?:\s+(?:et al\.|and|&)\s*[A-Z]?[A-Za-z'\-]*)*,?\s+(?:\d{4}[a-z]?|n\.d\.)(?:,\s*(?:p|pp)\.\s*[\d\-–]+)?"
    r"(?:;\s*[^)]+)?)\)|\[\d+(?:[\-–,]\s*\d+)*\]|[¹²³⁴⁵⁶⁷⁸⁹⁰]+"
)
QUOTE_RE = re.compile(r"[\"“]([^\"”]{8,400})[\"”]")
NUMBER_RE = re.compile(r"\b\d+(?:[.,]\d+)*%?")


def _chunk_limit(ctx: AppContext) -> int:
    # Output needs roughly the same room as input, so use about half the safe context.
    return max(800, min(ctx.ai.context_chars() // 2, 6000))


async def _rewrite_stream(ctx: AppContext, text: str, build: Callable[[str], list[ChatMessage]],
                          temperature: float, state: dict[str, Any]) -> AsyncIterator[dict[str, Any]]:
    """Rewrite text chunk by chunk (paragraph groups), streaming deltas; stores parts in state['parts']."""
    chunks = chunk_text(text, _chunk_limit(ctx))
    state["parts"] = []
    yield {"type": "progress", "stage": "Rewriting", "current": 0, "total": len(chunks)}
    for i, chunk in enumerate(chunks):
        buf = ""
        async for ev in ctx.ai.stream(build(chunk), ctx.ai.gen_options(temperature=temperature)):
            if ev["type"] == "meta":
                if "meta" not in state:
                    state["meta"] = ev
                    yield ev
                continue
            buf += ev["text"]
            yield {"type": "delta", "text": ev["text"]}
        cleaned = P.clean_output(buf, chunk)
        if not cleaned.strip():
            from ..ai.base import ProviderError

            raise ProviderError("bad_output", "The model returned an empty response. Try again or pick another model.")
        state["parts"].append(cleaned)
        if i < len(chunks) - 1:
            yield {"type": "delta", "text": "\n\n"}
        yield {"type": "progress", "stage": "Rewriting", "current": i + 1, "total": len(chunks)}


def preservation_report(original: str, output: str, keep_terms: list[str], opts: dict[str, Any]) -> list[dict[str, Any]]:
    report = []

    def check(name: str, items: list[str], present: Callable[[str], bool], enabled: bool = True):
        if not enabled:
            return
        uniq = list(dict.fromkeys(i.strip() for i in items if i.strip()))
        if not uniq:
            return
        missing = [i for i in uniq if not present(i)]
        report.append({"check": name, "total": len(uniq), "kept": len(uniq) - len(missing), "missing": missing[:20]})

    norm_out = re.sub(r"\s+", " ", output)
    check("Citations", CITATION_RE.findall(original), lambda c: c in output, opts.get("preserve_citations", True))
    check("Quotations", QUOTE_RE.findall(original),
          lambda q: re.sub(r"\s+", " ", q) in norm_out, opts.get("preserve_quotes", True))
    check("Key terms", keep_terms, lambda t: t.lower() in output.lower())
    check("Numbers", NUMBER_RE.findall(original), lambda n: n in output, opts.get("preserve_meaning", True))
    p_in, p_out = len(split_paragraphs(original)), len(split_paragraphs(output))
    if opts.get("preserve_paragraphs", True):
        report.append({"check": "Paragraphs", "total": p_in, "kept": min(p_in, p_out), "missing": [],
                       "note": f"{p_in} → {p_out}"})
    return report


def _stats(original: str, output: str) -> dict[str, Any]:
    w_in, w_out = word_count(original), word_count(output)
    return {
        "words_in": w_in,
        "words_out": w_out,
        "length_ratio": round(w_out / w_in, 2) if w_in else 0,
        "readability_in": readability(original),
        "readability_out": readability(output),
    }


async def _finish(ctx: AppContext, tool: str, original: str, output: str, settings: dict[str, Any],
                  state: dict[str, Any], started: float, extra: dict[str, Any] | None = None) -> dict[str, Any]:
    meta = state.get("meta") or {}
    hid = record_run(ctx, tool, original, output, settings=settings, provider=meta.get("provider", ""),
                     model=meta.get("model", ""), started=started)
    done = {"type": "done", "output": output, "history_id": hid, "provider": meta.get("provider"),
            "model": meta.get("model"), "stats": _stats(original, output)}
    if extra:
        done.update(extra)
    return done


# ------------------------------------------------------------------------------------------------ humanizer

async def humanize(ctx: AppContext, text: str, mode: str, options: dict[str, Any]) -> AsyncIterator[dict[str, Any]]:
    started = time.time()
    lang = ctx.settings.language_instruction()
    keep = [t.strip() for t in options.get("keep_terms") or [] if t.strip()]
    temp = {"simple": 0.4, "standard": 0.7, "enhanced": 0.85}.get(mode, 0.7)
    state: dict[str, Any] = {}
    async for ev in _rewrite_stream(ctx, text, lambda c: P.humanizer_messages(c, mode, options, lang), temp, state):
        yield ev
    output = "\n\n".join(state["parts"])
    report = preservation_report(text, output, keep, options)
    yield await _finish(ctx, "humanizer", text, output, {"mode": mode, **options}, state, started, {"report": report})


async def paraphrase(ctx: AppContext, text: str, mode: str, strength: int, keep_terms: list[str]) -> AsyncIterator[dict[str, Any]]:
    started = time.time()
    lang = ctx.settings.language_instruction()
    state: dict[str, Any] = {}
    temp = 0.5 + 0.08 * int(strength)
    async for ev in _rewrite_stream(ctx, text, lambda c: P.paraphrase_messages(c, mode, strength, keep_terms, lang), temp, state):
        yield ev
    output = "\n\n".join(state["parts"])
    report = preservation_report(text, output, keep_terms, {"preserve_citations": True, "preserve_quotes": False,
                                                             "preserve_meaning": True, "preserve_paragraphs": True})
    yield await _finish(ctx, "paraphraser", text, output, {"mode": mode, "strength": strength, "keep_terms": keep_terms},
                        state, started, {"report": report})


async def rewrite(ctx: AppContext, text: str, tone: str, length: str, audience: str, instructions: str) -> AsyncIterator[dict[str, Any]]:
    started = time.time()
    lang = ctx.settings.language_instruction()
    state: dict[str, Any] = {}
    async for ev in _rewrite_stream(ctx, text, lambda c: P.rewriter_messages(c, tone, length, audience, instructions, lang), 0.7, state):
        yield ev
    output = "\n\n".join(state["parts"])
    yield await _finish(ctx, "rewriter", text, output, {"tone": tone, "length": length, "audience": audience,
                                                         "instructions": instructions}, state, started)


async def simplify(ctx: AppContext, text: str, level: str) -> AsyncIterator[dict[str, Any]]:
    started = time.time()
    lang = ctx.settings.language_instruction()
    state: dict[str, Any] = {}
    async for ev in _rewrite_stream(ctx, text, lambda c: P.simplifier_messages(c, level, lang), 0.4, state):
        yield ev
    output = "\n\n".join(state["parts"])
    yield await _finish(ctx, "simplifier", text, output, {"level": level}, state, started)


# ------------------------------------------------------------------------------------------------ essay

def _validate_feedback(data: Any) -> dict[str, Any]:
    if not isinstance(data, dict):
        raise ValueError("expected an object")
    scores_in = data.get("scores") or {}
    scores = {}
    for k in ("thesis", "structure", "evidence", "clarity", "grammar", "style"):
        try:
            v = float(scores_in.get(k, 0))
        except (TypeError, ValueError):
            v = 0
        if 0 < v <= 1:
            v *= 10
        scores[k] = int(max(1, min(10, round(v)))) if v else 0
    if not any(scores.values()):
        raise ValueError("missing scores")
    as_list = lambda v: [str(x).strip() for x in (v if isinstance(v, list) else [v]) if str(x).strip()]  # noqa: E731
    return {"overall": str(data.get("overall") or "").strip(), "scores": scores,
            "strengths": as_list(data.get("strengths"))[:8], "improvements": as_list(data.get("improvements"))[:10]}


async def essay_feedback(ctx: AppContext, text: str, focus: list[str]) -> dict[str, Any]:
    started = time.time()
    snippet = text if len(text) <= ctx.ai.context_chars() else text[: ctx.ai.context_chars()]
    data, res = await ctx.ai.chat_json(P.essay_feedback_messages(snippet, focus), P.ESSAY_FEEDBACK_SCHEMA,
                                       validate=_validate_feedback, temperature=0.3)
    record_run(ctx, "essay", text, data.get("overall", ""), output_json={"feedback": data},
               settings={"focus": focus, "action": "feedback"}, provider=res.provider, model=res.model, started=started,
               title="Feedback: " + text.strip()[:50])
    return {"feedback": data, "provider": res.provider, "model": res.model,
            "readability": readability(text)}


async def essay_improve(ctx: AppContext, text: str, focus: list[str], level: str) -> AsyncIterator[dict[str, Any]]:
    started = time.time()
    lang = ctx.settings.language_instruction()
    state: dict[str, Any] = {}
    async for ev in _rewrite_stream(ctx, text, lambda c: P.essay_improve_messages(c, focus, level, lang), 0.6, state):
        yield ev
    output = "\n\n".join(state["parts"])
    yield await _finish(ctx, "essay", text, output, {"focus": focus, "level": level}, state, started)


# ------------------------------------------------------------------------------------------------ assistant

async def assistant(ctx: AppContext, action: str, text: str, instruction: str, context: str,
                    explain: bool) -> AsyncIterator[dict[str, Any]]:
    started = time.time()
    lang = ctx.settings.language_instruction()
    state: dict[str, Any] = {}
    temp = 0.3 if action == "grammar" else 0.7
    async for ev in _rewrite_stream(ctx, text, lambda c: P.assistant_messages(action, c, instruction, context, lang), temp, state):
        yield ev
    output = "\n\n".join(state["parts"])
    extra: dict[str, Any] = {}
    if explain and action != "continue":
        yield {"type": "progress", "stage": "Explaining changes", "current": 0, "total": 1}
        res = await ctx.ai.chat(P.explain_changes_messages(text[:5000], output[:5000]), ctx.ai.gen_options(temperature=0.3))
        extra["explanation"] = P.clean_output(res.text)
    yield await _finish(ctx, "assistant", text, output, {"action": action, "instruction": instruction}, state, started, extra)


async def compose(ctx: AppContext, topic: str, essay_type: str, words: int, audience: str, points: str) -> AsyncIterator[dict[str, Any]]:
    started = time.time()
    lang = ctx.settings.language_instruction()
    buf = ""
    meta: dict[str, Any] = {}
    async for ev in ctx.ai.stream(P.essay_writer_messages(topic, essay_type, words, audience, points, lang),
                                  ctx.ai.gen_options(temperature=0.75, max_tokens=int(words * 2.2) + 200)):
        if ev["type"] == "meta":
            meta = ev
            yield ev
            continue
        buf += ev["text"]
        yield ev
    output = P.clean_output(buf)
    hid = record_run(ctx, "assistant", topic, output, settings={"action": "compose", "essay_type": essay_type,
                                                                  "words": words}, provider=meta.get("provider", ""),
                     model=meta.get("model", ""), started=started, title="Essay: " + topic[:50])
    yield {"type": "done", "output": output, "history_id": hid, "provider": meta.get("provider"), "model": meta.get("model")}


async def explain_mistakes(ctx: AppContext, text: str) -> AsyncIterator[dict[str, Any]]:
    started = time.time()
    buf = ""
    meta: dict[str, Any] = {}
    async for ev in ctx.ai.stream(P.explain_mistakes_messages(text[: ctx.ai.context_chars()]), ctx.ai.gen_options(temperature=0.3)):
        if ev["type"] == "meta":
            meta = ev
            yield ev
            continue
        buf += ev["text"]
        yield ev
    output = P.clean_output(buf)
    hid = record_run(ctx, "assistant", text, output, settings={"action": "explain_mistakes"},
                     provider=meta.get("provider", ""), model=meta.get("model", ""), started=started)
    yield {"type": "done", "output": output, "history_id": hid, "provider": meta.get("provider"), "model": meta.get("model")}


# ------------------------------------------------------------------------------------------------ grammar

def _paragraph_groups(text: str, limit: int) -> list[tuple[int, int]]:
    """Contiguous (start, end) spans of whole paragraphs, each at most ~limit chars."""
    spans = [(m.start(), m.end()) for m in re.finditer(r"[^\n]+(?:\n(?!\s*\n)[^\n]*)*", text)]
    groups: list[tuple[int, int]] = []
    cur_start = None
    cur_end = None
    for s, e in spans:
        if cur_start is None:
            cur_start, cur_end = s, e
        elif e - cur_start > limit:
            groups.append((cur_start, cur_end))
            cur_start, cur_end = s, e
        else:
            cur_end = e
    if cur_start is not None:
        groups.append((cur_start, cur_end))
    return groups


def _custom_words(ctx: AppContext) -> list[str]:
    return list((ctx.settings.get("writing") or {}).get("dictionary") or [])


def _summary(issues: list[dict[str, Any]]) -> dict[str, int]:
    out: dict[str, int] = {}
    for i in issues:
        out[i["category"]] = out.get(i["category"], 0) + 1
    return out


async def grammar(ctx: AppContext, text: str, engine: str, explain: bool) -> AsyncIterator[dict[str, Any]]:
    started = time.time()
    if engine == "offline":
        issues = G.check(text, _custom_words(ctx))
        corrected = G.apply_issues(text, issues)
        hid = record_run(ctx, "grammar", text, corrected, output_json={"issues": issues}, settings={"engine": "offline"},
                         engine="offline", started=started)
        yield {"type": "done", "engine": "offline", "issues": issues, "corrected": corrected, "history_id": hid,
               "summary": _summary(issues), "provider": None, "model": None}
        return

    lang = ctx.settings.language_instruction()
    groups = _paragraph_groups(text, max(600, min(ctx.ai.context_chars() // 2, 4000)))
    corrected_parts: list[str] = []
    meta: dict[str, Any] = {}
    yield {"type": "progress", "stage": "Proofreading", "current": 0, "total": len(groups)}
    pos = 0
    for gi, (s, e) in enumerate(groups):
        corrected_parts.append(text[pos:s])
        chunk = text[s:e]
        res = await ctx.ai.chat(P.grammar_messages(chunk, lang), ctx.ai.gen_options(temperature=0.1))
        if not meta:
            meta = {"provider": res.provider, "model": res.model}
            yield {"type": "meta", **meta}
        fixed = P.clean_output(res.text, chunk)
        # Guard against a model that rewrote far too much or returned something unrelated.
        if not fixed.strip() or word_count(fixed) < 0.5 * word_count(chunk) or word_count(fixed) > 1.6 * word_count(chunk) + 5:
            fixed = chunk
        corrected_parts.append(fixed)
        pos = e
        yield {"type": "progress", "stage": "Proofreading", "current": gi + 1, "total": len(groups)}
    corrected_parts.append(text[pos:])
    corrected = "".join(corrected_parts)
    issues = G.diff_issues(text, corrected)
    style = [i for i in G.check(text, _custom_words(ctx)) if i["category"] == "style"]
    issues = G.dedupe(issues + style)
    if explain:
        targets = [i for i in issues if i["category"] != "style" and i["replacements"]][:30]
        if targets:
            yield {"type": "progress", "stage": "Explaining corrections", "current": 0, "total": 1}
            try:
                data, _ = await ctx.ai.chat_json(
                    P.grammar_explain_messages([(i["original"], i["replacements"][0]) for i in targets]),
                    P.GRAMMAR_EXPLAIN_SCHEMA, temperature=0.2)
                items = data.get("items", []) if isinstance(data, dict) else []
                for iss, item in zip(targets, items):
                    if isinstance(item, dict) and item.get("explanation"):
                        iss["explanation"] = str(item["explanation"]).strip()[:300]
            except Exception:
                pass  # explanations are optional; corrections still stand
    hid = record_run(ctx, "grammar", text, corrected, output_json={"issues": issues}, settings={"engine": "ai"},
                     provider=meta.get("provider", ""), model=meta.get("model", ""), started=started)
    yield {"type": "done", "engine": "ai", "issues": issues, "corrected": corrected, "history_id": hid,
           "summary": _summary(issues), **meta}
