"""Text utilities: sentence splitting, tokenization, stopwords, readability, chunking."""
from __future__ import annotations

import math
import re
from dataclasses import dataclass

STOPWORDS = set(
    """a about above after again against all also am an and any are aren't as at be because been before being
    below between both but by can can't cannot could couldn't did didn't do does doesn't doing don't down during
    each few for from further had hadn't has hasn't have haven't having he he'd he'll he's her here here's hers
    herself him himself his how how's however i i'd i'll i'm i've if in into is isn't it it's its itself just
    let's like may me might more most much must mustn't my myself no nor not now of off often on once one only
    or other ought our ours ourselves out over own same shall shan't she she'd she'll she's should shouldn't so
    some such than that that's the their theirs them themselves then there there's these they they'd they'll
    they're they've this those though through thus to too under until up upon us use used using very was
    wasn't we we'd we'll we're we've were weren't what what's when when's where where's which while who who's
    whom whose why why's will with within without won't would wouldn't yet you you'd you'll you're you've your
    yours yourself yourselves also many first second new two three another every even still well therefore
    since either neither via etc e.g i.e""".split()
)

_ABBREV = {"mr", "mrs", "ms", "dr", "prof", "sr", "jr", "st", "vs", "etc", "e.g", "i.e", "fig", "no", "vol",
           "inc", "ltd", "co", "corp", "jan", "feb", "mar", "apr", "jun", "jul", "aug", "sep", "sept", "oct",
           "nov", "dec", "u.s", "u.k", "approx", "dept", "est", "al"}

WORD_RE = re.compile(r"[A-Za-zÀ-ÖØ-öø-ÿ0-9]+(?:['’\-][A-Za-zÀ-ÖØ-öø-ÿ0-9]+)*")


def words(text: str) -> list[str]:
    return WORD_RE.findall(text)


def word_count(text: str) -> int:
    return len(words(text or ""))


def tokens(text: str) -> list[str]:
    """Lower-cased content tokens without stopwords."""
    return [w.lower() for w in words(text) if w.lower() not in STOPWORDS and len(w) > 1 and not w.isdigit()]


def stem(word: str) -> str:
    """Tiny suffix-stripping stemmer, good enough for matching and ranking."""
    w = word.lower()
    for suf in ("ational", "ization", "fulness", "ousness", "iveness", "ations", "ation", "ments", "ment",
                "ness", "ities", "ity", "ings", "ing", "edly", "ed", "ies", "es", "ly", "s"):
        if w.endswith(suf) and len(w) - len(suf) >= 3:
            if suf == "ies":
                return w[: -len(suf)] + "y"
            return w[: -len(suf)]
    return w


def stems(text: str) -> list[str]:
    return [stem(t) for t in tokens(text)]


@dataclass
class Sentence:
    text: str
    start: int
    end: int
    para: int


def split_paragraphs(text: str) -> list[str]:
    return [p.strip() for p in re.split(r"\n\s*\n", text or "") if p.strip()]


def split_sentences(text: str) -> list[Sentence]:
    """Rule-based sentence splitter that respects abbreviations, decimals and quotes."""
    out: list[Sentence] = []
    if not text:
        return out
    para_starts = [0] + [m.end() for m in re.finditer(r"\n\s*\n", text)]

    def para_of(pos: int) -> int:
        idx = 0
        for i, s in enumerate(para_starts):
            if s <= pos:
                idx = i
        return idx

    start = 0
    n = len(text)
    i = 0
    while i < n:
        ch = text[i]
        boundary = False
        end = i + 1
        if ch in ".!?…":
            j = i + 1
            while j < n and text[j] in ".!?…\"'”’)]":
                j += 1
            if j >= n or text[j].isspace():
                # check abbreviation / initials / decimals
                prev = re.search(r"([A-Za-z.]+)\.$", text[start : i + 1]) if ch == "." else None
                tok = prev.group(1).lower().rstrip(".") if prev else ""
                is_abbrev = tok in _ABBREV or (len(tok) == 1 and tok.isalpha())
                k = j
                while k < n and text[k] in " \t":
                    k += 1
                next_lower = k < n and text[k].islower()
                if not is_abbrev and not next_lower:
                    boundary = True
                    end = j
        elif ch == "\n":
            # line breaks that look like list items / headings end a sentence
            k = i + 1
            if k < n and (text[k] == "\n" or re.match(r"\s*(?:[-*•]|\d+[.)])\s", text[k:k + 6])):
                boundary = True
                end = i
            else:
                # A short line followed by a capitalised line is a heading or list entry; longer lines are
                # treated as soft wraps (common in PDF text).
                line_start = text.rfind("\n", 0, i) + 1
                line = text[max(line_start, start):i].strip()
                nxt = text[k:k + 1]
                if line and len(line) < 60 and nxt[:1].isupper() and not re.search(r"[,;:]$", line):
                    boundary = True
                    end = i
        if boundary:
            seg = text[start:end]
            stripped = seg.strip()
            if stripped:
                lead = len(seg) - len(seg.lstrip())
                out.append(Sentence(stripped, start + lead, start + lead + len(stripped), para_of(start + lead)))
            start = end
            i = end
            continue
        i += 1
    seg = text[start:]
    if seg.strip():
        lead = len(seg) - len(seg.lstrip())
        out.append(Sentence(seg.strip(), start + lead, start + lead + len(seg.strip()), para_of(start + lead)))
    return out


def sentence_texts(text: str) -> list[str]:
    return [s.text for s in split_sentences(text)]


def syllables(word: str) -> int:
    w = word.lower()
    w = re.sub(r"[^a-z]", "", w)
    if not w:
        return 0
    if len(w) <= 3:
        return 1
    w = re.sub(r"(?:[^laeiouy]es|ed|[^laeiouy]e)$", "", w)
    w = re.sub(r"^y", "", w)
    groups = re.findall(r"[aeiouy]{1,2}", w)
    return max(1, len(groups))


def readability(text: str) -> dict[str, float]:
    ws = words(text)
    sents = [s for s in split_sentences(text) if words(s.text)]
    if not ws or not sents:
        return {"words": 0, "sentences": 0, "avg_sentence_length": 0, "flesch_reading_ease": 0, "grade_level": 0,
                "long_sentences": 0}
    syl = sum(syllables(w) for w in ws)
    wps = len(ws) / len(sents)
    spw = syl / len(ws)
    fre = 206.835 - 1.015 * wps - 84.6 * spw
    fk = 0.39 * wps + 11.8 * spw - 15.59
    long_s = sum(1 for s in sents if len(words(s.text)) > 25)
    return {
        "words": len(ws),
        "sentences": len(sents),
        "avg_sentence_length": round(wps, 1),
        "flesch_reading_ease": round(max(0.0, min(100.0, fre)), 1),
        "grade_level": round(max(0.0, fk), 1),
        "long_sentences": long_s,
    }


def chunk_text(text: str, max_chars: int, overlap_sentences: int = 0) -> list[str]:
    """Split text into chunks of at most ~max_chars, on paragraph then sentence boundaries."""
    text = (text or "").strip()
    if len(text) <= max_chars:
        return [text] if text else []
    chunks: list[str] = []
    current: list[str] = []
    size = 0
    for para in split_paragraphs(text):
        pieces = [para] if len(para) <= max_chars else sentence_texts(para)
        for piece in pieces:
            if len(piece) > max_chars:  # pathological long sentence
                for k in range(0, len(piece), max_chars):
                    if current:
                        chunks.append("\n\n".join(current))
                        current, size = [], 0
                    chunks.append(piece[k:k + max_chars])
                continue
            if size + len(piece) + 2 > max_chars and current:
                chunks.append("\n\n".join(current))
                tail = current[-overlap_sentences:] if overlap_sentences else []
                current, size = list(tail), sum(len(t) for t in tail)
            current.append(piece)
            size += len(piece) + 2
    if current:
        chunks.append("\n\n".join(current))
    return chunks


def normalize_ws(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").strip()


def content_overlap(fragment: str, source_tokens: set[str]) -> float:
    """Fraction of the fragment's content stems that occur in the source."""
    fs = [stem(t) for t in tokens(fragment)]
    if not fs:
        return 0.0
    return sum(1 for t in fs if t in source_tokens) / len(fs)


def idf_weights(docs: list[list[str]]) -> dict[str, float]:
    n = len(docs)
    df: dict[str, int] = {}
    for d in docs:
        for t in set(d):
            df[t] = df.get(t, 0) + 1
    return {t: math.log(1 + (n - c + 0.5) / (c + 0.5)) for t, c in df.items()}
