"""Rule-based proofreading engine (spelling via pyspellchecker's frequency dictionary + grammar rules).

Each issue: {id, offset, length, original, replacements, category, message, source}.
Categories: spelling, grammar, agreement, tense, punctuation, capitalization, repetition, missing_word, style.
"""
from __future__ import annotations

import re
import threading
from difflib import SequenceMatcher
from typing import Any, Iterable

from .text import split_sentences, words

_spell = None
_spell_lock = threading.Lock()


def _speller():
    global _spell
    with _spell_lock:
        if _spell is None:
            from spellchecker import SpellChecker

            _spell = SpellChecker(distance=2)
        return _spell


AN_EXCEPTIONS_A = re.compile(r"^(?:uni|use|usu|uti|eu|one|once|ewe|ure|ura|uro|u\b|ubi|ufo|uk\b|us\b)", re.I)
AN_EXCEPTIONS_AN = re.compile(r"^(?:hour|honest|honou?r|heir|herb\b|[aefhilmnorsx]\b|[aefhilmnorsx][A-Z0-9]|mba|fbi|nba|nfl|sat\b|mri|x-ray)", re.I)

PARTICIPLES = {
    "went": "gone", "ate": "eaten", "saw": "seen", "did": "done", "wrote": "written", "took": "taken",
    "came": "come", "began": "begun", "broke": "broken", "chose": "chosen", "drove": "driven", "gave": "given",
    "knew": "known", "ran": "run", "rode": "ridden", "spoke": "spoken", "stole": "stolen", "swam": "swum",
    "threw": "thrown", "wore": "worn", "forgot": "forgotten", "drank": "drunk", "sang": "sung", "rang": "rung",
    "fell": "fallen", "flew": "flown", "grew": "grown", "hid": "hidden", "shook": "shaken", "froze": "frozen",
    "bit": "bitten", "blew": "blown", "drew": "drawn", "showed": "shown", "sank": "sunk", "tore": "torn",
}
BASE_FROM_PAST = {"went": "go", "ate": "eat", "saw": "see", "wrote": "write", "took": "take", "came": "come",
                  "gave": "give", "knew": "know", "ran": "run", "spoke": "speak", "made": "make", "said": "say",
                  "got": "get", "found": "find", "thought": "think", "told": "tell", "bought": "buy",
                  "brought": "bring", "felt": "feel", "left": "leave", "kept": "keep", "began": "begin"}

# (pattern, replacement-function or string, category, message)
RULES: list[tuple[re.Pattern, Any, str, str]] = [
    (re.compile(r"\b(could|should|would|must|might|may)\s+of\b", re.I), lambda m: f"{m.group(1)} have", "grammar",
     "Use “have”, not “of”, after modal verbs."),
    (re.compile(r"\balot\b", re.I), "a lot", "spelling", "“A lot” is written as two words."),
    (re.compile(r"\birregardless\b", re.I), "regardless", "grammar", "Use “regardless”."),
    (re.compile(r"\b(more|less|better|worse|rather|other|greater|fewer|smaller|larger|bigger)\s+then\b", re.I),
     lambda m: f"{m.group(1)} than", "grammar", "Use “than” for comparisons."),
    (re.compile(r"\byour\s+(welcome|right|wrong|going|not|being|doing)\b", re.I),
     lambda m: f"{_case(m.group(0), 'you')}'re {m.group(1)}", "grammar", "Use “you're” (you are)."),
    (re.compile(r"\bit's\s+(own|self)\b", re.I), lambda m: f"{_case(m.group(0), 'its')} {m.group(1)}", "grammar",
     "Use “its” (possessive), not “it's” (it is)."),
    (re.compile(r"\btheir\s+(is|are|was|were|will be|has been)\b", re.I),
     lambda m: f"{_case(m.group(0), 'there')} {m.group(1)}", "grammar", "Use “there” before a form of “to be”."),
    (re.compile(r"\bwho's\s+(car|house|book|idea|turn|job|fault|name|phone|bag|dog|team)\b", re.I),
     lambda m: f"{_case(m.group(0), 'whose')} {m.group(1)}", "grammar", "Use “whose” for possession."),
    (re.compile(r"\b(he|she|it)\s+don'?t\b", re.I), lambda m: f"{m.group(1)} doesn't", "agreement",
     "Subject-verb agreement: use “doesn't” with he/she/it."),
    (re.compile(r"\b(they|we|you)\s+was\b", re.I), lambda m: f"{m.group(1)} were", "agreement",
     "Subject-verb agreement: use “were” with they/we/you."),
    (re.compile(r"\b(he|she|it)\s+were\b(?!\s+to\b)", re.I), lambda m: f"{m.group(1)} was", "agreement",
     "Subject-verb agreement: use “was” with he/she/it."),
    (re.compile(r"\b(he|she|it)\s+have\b", re.I), lambda m: f"{m.group(1)} has", "agreement",
     "Subject-verb agreement: use “has” with he/she/it."),
    (re.compile(r"\b(they|we|I|you)\s+has\b", re.I), lambda m: f"{m.group(1)} have", "agreement",
     "Subject-verb agreement: use “have” here."),
    (re.compile(r"\b(he|she|it)\s+are\b", re.I), lambda m: f"{m.group(1)} is", "agreement",
     "Subject-verb agreement: use “is” with he/she/it."),
    (re.compile(r"\b(they|we|you)\s+is\b", re.I), lambda m: f"{m.group(1)} are", "agreement",
     "Subject-verb agreement: use “are” with they/we/you."),
    (re.compile(r"\bI\s+is\b"), "I am", "agreement", "Use “I am”."),
    (re.compile(r"\bthere\s+is\s+(many|several|few|two|three|four|five|some people|lots)\b", re.I),
     lambda m: f"{_case(m.group(0), 'there')} are {m.group(1)}", "agreement", "Use “there are” with plural nouns."),
    (re.compile(r"\b(have|has|had|having)\s+(" + "|".join(PARTICIPLES) + r")\b", re.I),
     lambda m: f"{m.group(1)} {PARTICIPLES[m.group(2).lower()]}", "tense",
     "Use the past participle after have/has/had."),
    (re.compile(r"\b(did|does|do|didn't|doesn't|don't|to|will|can|could|should|would)\s+(" + "|".join(BASE_FROM_PAST) + r")\b", re.I),
     lambda m: f"{m.group(1)} {BASE_FROM_PAST[m.group(2).lower()]}", "tense",
     "Use the base form of the verb after this word."),
    (re.compile(r"\b(I|we|they|you)\s+(going|doing|trying|planning|working|looking|getting|thinking)\s+(to|on|for|at|about)\b"),
     lambda m: f"{m.group(1)} {'am' if m.group(1) == 'I' else 'are'} {m.group(2)} {m.group(3)}", "missing_word",
     "A helping verb seems to be missing."),
    (re.compile(r"\b(he|she|it)\s+(going|doing|trying|planning|working|looking|getting|thinking)\s+(to|on|for|at|about)\b", re.I),
     lambda m: f"{m.group(1)} is {m.group(2)} {m.group(3)}", "missing_word", "A helping verb seems to be missing."),
    (re.compile(r"\bin\s+order\s+(?!to\b|for\b|that\b|of\b)(\w+)", re.I), lambda m: f"in order to {m.group(1)}",
     "missing_word", "“In order” is normally followed by “to”."),
]

DAYS_MONTHS = re.compile(
    r"\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|april|june|july|august|"
    r"september|october|november|december)\b"
)
LEGIT_DOUBLES = {"had", "that", "is", "do", "will", "can", "bye", "no", "very", "so", "ha", "blah", "knock", "chop", "tut"}


def _case(src: str, word: str) -> str:
    return word[:1].upper() + word[1:] if src[:1].isupper() else word


def _issue(offset: int, original: str, replacements: list[str], category: str, message: str,
           source: str = "offline") -> dict[str, Any]:
    return {"offset": offset, "length": len(original), "original": original, "replacements": replacements,
            "category": category, "message": message, "source": source}


def _spelling(text: str, custom_words: Iterable[str]) -> list[dict[str, Any]]:
    sp = _speller()
    custom = {w.lower() for w in custom_words}
    out = []
    sent_starts = {s.start for s in split_sentences(text)}
    candidates = []
    for m in re.finditer(r"[A-Za-z][A-Za-z']*[A-Za-z]|[A-Za-z]", text):
        w = m.group(0)
        if len(w) < 3 or w.isupper() or w.lower() in custom:
            continue
        # Skip likely proper nouns: capitalised words that are not at a sentence start.
        if w[0].isupper() and m.start() not in sent_starts:
            continue
        if re.match(r"[\w.-]*@|https?:|www\.", text[max(0, m.start() - 8):m.end() + 4]):
            continue
        candidates.append(m)
    unknown = sp.unknown([m.group(0).lower().strip("'") for m in candidates])
    for m in candidates:
        w = m.group(0)
        lw = w.lower().strip("'")
        if lw not in unknown or "'" in lw:
            continue
        if w[0].isupper() and lw.capitalize() == w and len(w) > 3 and sp.correction(lw) is None:
            continue  # probably a name at sentence start
        cands = sp.candidates(lw) or set()
        ranked = sorted(cands, key=lambda c: (-sp.word_usage_frequency(c), c))[:4]
        best = sp.correction(lw)
        if best and best in ranked:
            ranked.remove(best)
            ranked.insert(0, best)
        if not ranked:
            continue
        reps = [_match_case(w, r) for r in ranked]
        out.append(_issue(m.start(), w, reps, "spelling", f"Possible spelling mistake: “{w}”."))
    return out


def _match_case(src: str, rep: str) -> str:
    if src.isupper():
        return rep.upper()
    if src[:1].isupper():
        return rep[:1].upper() + rep[1:]
    return rep


def _rules(text: str) -> list[dict[str, Any]]:
    out = []
    for pat, rep, cat, msg in RULES:
        for m in pat.finditer(text):
            r = rep(m) if callable(rep) else rep
            r = _match_case(m.group(0), r) if not callable(rep) else (r[:1].upper() + r[1:] if m.group(0)[:1].isupper() else r)
            if r != m.group(0):
                out.append(_issue(m.start(), m.group(0), [r], cat, msg))
    # a / an
    for m in re.finditer(r"\b(a|an|A|An)\s+([A-Za-z][\w-]*)", text):
        art, nxt = m.group(1), m.group(2)
        vowel = nxt[0].lower() in "aeiou"
        want_an = (vowel and not AN_EXCEPTIONS_A.match(nxt)) or bool(AN_EXCEPTIONS_AN.match(nxt))
        if art.lower() == "a" and want_an:
            out.append(_issue(m.start(1), art, [_match_case(art, "an")], "grammar",
                              f"Use “an” before a vowel sound: “an {nxt}”."))
        elif art.lower() == "an" and not want_an:
            out.append(_issue(m.start(1), art, [_match_case(art, "a")], "grammar",
                              f"Use “a” before a consonant sound: “a {nxt}”."))
    # repeated words
    for m in re.finditer(r"\b(\w+)(\s+)(\1)\b", text, re.I):
        if m.group(1).lower() in LEGIT_DOUBLES or m.group(1).isdigit():
            continue
        out.append(_issue(m.start(), m.group(0), [m.group(1)], "repetition", f"Repeated word: “{m.group(1)}”."))
    # capitalization
    for m in re.finditer(r"(?<![\w'])i(?![\w'])(?=\s|'m|'ve|'ll|'d)", text):
        out.append(_issue(m.start(), "i", ["I"], "capitalization", "The pronoun “I” is always capitalized."))
    for s in split_sentences(text):
        first = re.match(r"[\"'“(]*([a-z][\w']*)", s.text)
        if first and not re.match(r"(?:e\.g|i\.e|etc|vs|iphone|ipad|ebay|http)", first.group(1)):
            off = s.start + first.start(1)
            w = first.group(1)
            out.append(_issue(off, w, [w[:1].upper() + w[1:]], "capitalization",
                              "Start the sentence with a capital letter."))
        n = len(words(s.text))
        if n > 40:
            out.append(_issue(s.start, s.text[:40], [], "style",
                              f"Long sentence ({n} words). Consider splitting it for readability."))
    for m in DAYS_MONTHS.finditer(text):
        out.append(_issue(m.start(), m.group(0), [m.group(0).capitalize()], "capitalization",
                          "Days and months are capitalized."))
    # punctuation and spacing
    for m in re.finditer(r"[ \t]+([,.;:!?])(?!\d)", text):
        out.append(_issue(m.start(), m.group(0), [m.group(1)], "punctuation", "Remove the space before punctuation."))
    for m in re.finditer(r"([,;:])(?=[A-Za-z])", text):
        out.append(_issue(m.start(), m.group(0), [m.group(0) + " "], "punctuation", "Add a space after punctuation."))
    for m in re.finditer(r"(?<=[a-z])\.(?=[A-Z][a-z])", text):
        out.append(_issue(m.start(), ".", [". "], "punctuation", "Add a space after the period."))
    for m in re.finditer(r"([,;:])\1+|([!?])\2{2,}|(?<!\.)\.\.(?!\.)", text):
        rep = m.group(0)[0]
        out.append(_issue(m.start(), m.group(0), [rep], "punctuation", "Repeated punctuation mark."))
    for m in re.finditer(r"(?<=\S)  +(?=\S)", text):
        out.append(_issue(m.start(), m.group(0), [" "], "punctuation", "Extra space between words."))
    for para in re.finditer(r"[^\n]+", text):
        p = para.group(0).rstrip()
        if len(words(p)) >= 8 and p[-1:].isalnum() and not p.lstrip().startswith(("-", "*", "#", "•")):
            last = re.search(r"(\w+)\s*$", p)
            if last:
                off = para.start() + last.start(1)
                out.append(_issue(off, last.group(1), [last.group(1) + "."], "punctuation",
                                  "The sentence may be missing end punctuation."))
    return out


def dedupe(issues: list[dict[str, Any]]) -> list[dict[str, Any]]:
    priority = {"ai": 0, "offline": 1}
    cat_rank = {"spelling": 0, "agreement": 1, "tense": 1, "grammar": 2, "missing_word": 2, "repetition": 2,
                "capitalization": 3, "punctuation": 4, "style": 9}
    issues = sorted(issues, key=lambda i: (i["offset"], priority.get(i["source"], 1), cat_rank.get(i["category"], 5)))
    out: list[dict[str, Any]] = []
    for iss in issues:
        end = iss["offset"] + iss["length"]
        clash = None
        for o in out:
            o_end = o["offset"] + o["length"]
            if iss["offset"] < o_end and o["offset"] < end:
                clash = o
                break
        if clash is None:
            out.append(iss)
        elif iss["category"] != "style" and clash["category"] == "style":
            out.remove(clash)
            out.append(iss)
    out.sort(key=lambda i: i["offset"])
    for n, iss in enumerate(out):
        iss["id"] = f"i{n}"
    return out


def check(text: str, custom_words: Iterable[str] = ()) -> list[dict[str, Any]]:
    return dedupe(_rules(text) + _spelling(text, custom_words))


# ------------------------------------------------------------------------------------------------ AI diff → issues

_TOKEN = re.compile(r"\s+|\w+(?:['’]\w+)*|[^\w\s]")


def _tok(text: str) -> list[tuple[str, int]]:
    return [(m.group(0), m.start()) for m in _TOKEN.finditer(text)]


def _subseq(short: list[str], long: list[str]) -> bool:
    it = iter(long)
    return all(any(x == y for y in it) for x in short)


def categorize(orig: str, new: str) -> tuple[str, str]:
    o, n = orig.strip(), new.strip()
    if o.lower() == n.lower():
        return "capitalization", "Capitalization corrected."
    strip_p = lambda s: re.sub(r"[^\w\s]", "", s)  # noqa: E731
    if strip_p(o).split() == strip_p(n).split():
        return "punctuation", "Punctuation corrected."
    ow, nw = o.split(), n.split()
    owl, nwl = [w.lower() for w in ow], [w.lower() for w in nw]
    if len(ow) == 2 and owl[0] == owl[1] and len(nw) == 1:
        return "repetition", "Repeated word removed."
    if len(nw) > len(ow) and _subseq(owl, nwl):
        extra = [w for w in nw if w.lower() not in owl] or nw[len(ow):]
        return "missing_word", f"Missing word added: “{' '.join(extra)}”."
    if len(ow) > len(nw) and _subseq(nwl, owl):
        extra = [w for w in ow if w.lower() not in nwl] or ow[len(nw):]
        return "grammar", f"Unnecessary word removed: “{' '.join(extra)}”."
    if len(ow) == 1 and len(nw) == 1:
        ratio = SequenceMatcher(None, o.lower(), n.lower()).ratio()
        if ratio >= 0.6 and o.lower().strip(".,;:!?") in _speller().unknown([o.lower().strip(".,;:!?")]):
            return "spelling", f"Spelling: “{o}” → “{n}”."
        if ratio >= 0.5:
            return "grammar", f"Word form corrected: “{o}” → “{n}”."
    if len(ow) + len(nw) > 9:
        return "style", "Awkward sentence structure rephrased."
    return "grammar", f"“{o}” → “{n}”."


def diff_issues(original: str, corrected: str) -> list[dict[str, Any]]:
    """Turn a corrected version of `original` into positional issues (one per changed region)."""
    a = _tok(original)
    b = _tok(corrected)
    sm = SequenceMatcher(None, [t for t, _ in a], [t for t, _ in b], autojunk=False)
    out = []
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag == "equal":
            continue
        a_txt = "".join(t for t, _ in a[i1:i2])
        b_txt = "".join(t for t, _ in b[j1:j2])
        if not a_txt.strip() and not b_txt.strip():
            continue  # whitespace-only change
        if tag == "insert" or (not a_txt.strip()):
            # Anchor insertions to the previous word so the change is visible and applicable.
            k = i1 - 1
            while k >= 0 and a[k][0].isspace():
                k -= 1
            if k >= 0:
                start = a[k][1]
                anchor = "".join(t for t, _ in a[k:i2])
                orig_txt, new_txt = anchor, "".join(t for t, _ in a[k:i1]) + b_txt
            else:
                nxt_idx = next((x for x in range(i2, len(a)) if not a[x][0].isspace()), None)
                if nxt_idx is None:
                    continue
                start = a[i1][1] if i1 < len(a) else 0
                end_pos = a[nxt_idx][1] + len(a[nxt_idx][0])
                orig_txt = original[start:end_pos]
                new_txt = b_txt + original[a[i2][1]:end_pos] if i2 < len(a) else b_txt
            cat, msg = categorize(orig_txt, new_txt)
            out.append(_issue(start, orig_txt, [new_txt], cat, msg, source="ai"))
            continue
        if tag == "delete" or not b_txt.strip():
            # keep the whitespace in the span so deletion does not leave a double space
            start = a[i1][1]
            if a_txt.endswith(" ") or i1 == 0:
                orig_txt = a_txt
            else:
                # include preceding space instead
                if i1 > 0 and a[i1 - 1][0].isspace():
                    start = a[i1 - 1][1]
                    orig_txt = a[i1 - 1][0] + a_txt
                else:
                    orig_txt = a_txt
            prev_word = next((t for t, _ in reversed(a[:i1]) if not t.isspace()), "")
            if prev_word.lower() == a_txt.strip().lower():
                cat, msg = "repetition", f"Repeated word removed: “{prev_word}”."
            else:
                cat, msg = categorize(a_txt, "")
                if cat == "grammar" and not msg.startswith("Unnecessary"):
                    msg = f"Unnecessary word removed: “{a_txt.strip()}”."
            out.append(_issue(start, orig_txt, [""], cat, msg, source="ai"))
            continue
        start = a[i1][1]
        lead = len(a_txt) - len(a_txt.lstrip())
        start += lead
        a_s, b_s = a_txt.strip(), b_txt.strip()
        cat, msg = categorize(a_s, b_s)
        out.append(_issue(start, a_s, [b_s], cat, msg, source="ai"))
    return out


def apply_issues(text: str, issues: list[dict[str, Any]]) -> str:
    """Apply first replacement of each issue (non-overlapping), from the end of the text backwards."""
    out = text
    for iss in sorted(issues, key=lambda i: -i["offset"]):
        if not iss.get("replacements"):
            continue
        o, l = iss["offset"], iss["length"]
        if out[o:o + l] != iss["original"]:
            continue
        out = out[:o] + iss["replacements"][0] + out[o + l:]
    return out
