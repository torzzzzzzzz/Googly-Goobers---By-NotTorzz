"""Extractive analysis: sentence ranking, keywords, definitions, dates, names, facts, arguments, examples."""
from __future__ import annotations

import math
import re
from collections import Counter, defaultdict
from dataclasses import dataclass, field

from .text import STOPWORDS, Sentence, split_sentences, stem, tokens, words

MONTHS = "January|February|March|April|May|June|July|August|September|October|November|December"
MONTHS_SHORT = "Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec"
DATE_RE = re.compile(
    rf"\b(?:(?:{MONTHS}|{MONTHS_SHORT})\.?\s+\d{{1,2}}(?:st|nd|rd|th)?,?\s+\d{{3,4}}"
    rf"|\d{{1,2}}(?:st|nd|rd|th)?\s+(?:{MONTHS})\s+\d{{3,4}}"
    rf"|(?:{MONTHS})\s+\d{{3,4}}"
    r"|\d{4}-\d{2}-\d{2}"
    r"|\d{1,2}/\d{1,2}/\d{2,4}"
    r"|(?:\d{1,2}(?:st|nd|rd|th)|[A-Z][a-z]+)\s+century"
    r"|\d{3,4}s"
    r"|\d{3,4}\s?(?:BCE|BC|CE|AD|B\.C\.|A\.D\.)"
    r"|(?:in|by|since|from|until|during|after|before|around|circa|c\.)\s+\d{3,4}\b)",
)
YEAR_ONLY = re.compile(r"\b(1[0-9]{3}|20[0-9]{2})\b")
NUMBER_RE = re.compile(r"\b\d[\d,.]*\s?(?:%|percent|million|billion|thousand|km|kg|m|cm|mm|°|degrees|years?|people|times)?")
DEF_PATTERNS = [
    re.compile(r"^(?:The |An? )?(?P<term>[A-Za-z][\w\-' ]{1,48}?)\s+(?:is|are)\s+(?:defined as|known as|called)\s+(?P<def>.{8,})$", re.I),
    re.compile(r"^(?:The term |The word )?(?:The |An? )?(?P<term>[A-Za-z][\w\-' ]{1,48}?)\s+(?:refers to|means|describes|is the process of|is a process|is the study of)\s+(?P<def>.{8,})$", re.I),
    re.compile(r"^(?:The |An? )?(?P<term>[A-Za-z][\w\-' ]{1,40}?)\s+(?:is|are|was|were)\s+(?P<def>(?:a|an|the|one of|any|those|that|when)\b.{8,})$", re.I),
    re.compile(r"^(?P<term>[A-Z][\w\-' ]{1,40}?)\s*[:–—-]\s+(?P<def>[A-Za-z].{8,})$"),
]
CALLED_RE = re.compile(r"^(?P<def>.{10,}?)\s+(?:is|are)\s+(?:called|known as|termed)\s+(?P<term>[\w\-' ]{2,40}?)[.]?$", re.I)
ARGUMENT_MARKERS = re.compile(
    r"\b(argue[sd]?|claim[sed]*|contend[sed]*|assert[sed]*|suggests?|shows? that|demonstrates?|evidence|therefore|"
    r"thus|consequently|because|as a result|should|must|conclude[sd]?|in contrast|however|on the other hand|"
    r"proves?|indicates?|believes?|position)\b",
    re.I,
)
EXAMPLE_MARKERS = re.compile(r"\b(for example|for instance|such as|e\.g\.|an example|to illustrate|like the)\b", re.I)
REMEMBER_MARKERS = re.compile(
    r"\b(important|remember|key|essential|crucial|note that|always|never|main|primary|fundamental|significant)\b", re.I
)
TITLE_WORDS = {"dr", "mr", "mrs", "ms", "prof", "president", "king", "queen", "sir", "general", "senator",
               "emperor", "saint", "st", "pope", "prince", "princess", "lord", "lady", "captain"}
NON_NAME_CAPS = {"The", "A", "An", "This", "That", "These", "Those", "It", "In", "On", "At", "For", "By", "As",
                 "If", "When", "While", "However", "But", "And", "Or", "Chapter", "Section", "Figure", "Table",
                 "Unit", "Lesson", "Part", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
                 "Sunday", "January", "February", "March", "April", "May", "June", "July", "August",
                 "September", "October", "November", "December", "I", "We", "They", "He", "She", "You"}


@dataclass
class Analysis:
    sentences: list[Sentence]
    scores: list[float]
    keywords: list[tuple[str, float]]
    definitions: list[tuple[str, str, int]] = field(default_factory=list)  # term, definition, sentence idx

    def ranked(self) -> list[int]:
        return sorted(range(len(self.sentences)), key=lambda i: -self.scores[i])


def _usable(s: Sentence) -> bool:
    n = len(words(s.text))
    return 4 <= n <= 70


def rank_sentences(sents: list[Sentence]) -> list[float]:
    """TextRank on TF-IDF stem vectors (centroid scoring for very long inputs)."""
    n = len(sents)
    if n == 0:
        return []
    bags = [Counter(stem(t) for t in tokens(s.text)) for s in sents]
    df: Counter = Counter()
    for b in bags:
        df.update(b.keys())
    idf = {t: math.log((n + 1) / (c + 0.5)) for t, c in df.items()}
    vecs = []
    for b in bags:
        v = {t: tf * idf[t] for t, tf in b.items()}
        norm = math.sqrt(sum(x * x for x in v.values())) or 1.0
        vecs.append({t: x / norm for t, x in v.items()})

    def cos(a: dict, b: dict) -> float:
        if len(a) > len(b):
            a, b = b, a
        return sum(x * b.get(t, 0.0) for t, x in a.items())

    if n <= 350:
        sim = [[0.0] * n for _ in range(n)]
        for i in range(n):
            for j in range(i + 1, n):
                c = cos(vecs[i], vecs[j])
                sim[i][j] = sim[j][i] = c
        out_sum = [sum(r) or 1.0 for r in sim]
        pr = [1.0 / n] * n
        for _ in range(30):
            pr = [0.15 / n + 0.85 * sum(sim[j][i] * pr[j] / out_sum[j] for j in range(n)) for i in range(n)]
        base = pr
    else:
        centroid: dict[str, float] = defaultdict(float)
        for v in vecs:
            for t, x in v.items():
                centroid[t] += x
        cn = math.sqrt(sum(x * x for x in centroid.values())) or 1.0
        centroid = {t: x / cn for t, x in centroid.items()}
        base = [cos(v, centroid) for v in vecs]

    mx = max(base) or 1.0
    scores = []
    for i, s in enumerate(sents):
        sc = base[i] / mx
        if i < 3:
            sc *= 1.15  # leading sentences tend to carry the topic
        if not _usable(s):
            sc *= 0.2
        if s.text.endswith("?"):
            sc *= 0.6
        scores.append(sc)
    return scores


def extract_keywords(text: str, limit: int = 25) -> list[tuple[str, float]]:
    """RAKE-style candidate phrases scored by frequency × idf-ish weight; keeps original casing."""
    sents = split_sentences(text)
    phrase_counts: Counter = Counter()
    surface: dict[str, Counter] = defaultdict(Counter)
    for s in sents:
        ws = words(s.text)
        current: list[str] = []
        for w in ws + ["."]:
            lw = w.lower()
            if lw in STOPWORDS or w == "." or w.isdigit() or len(w) < 2:
                if current:
                    for size in (1, 2, 3):
                        for k in range(0, len(current) - size + 1):
                            ph = current[k:k + size]
                            key = " ".join(stem(p) for p in ph)
                            phrase_counts[key] += 1
                            surface[key][" ".join(ph)] += 1
                    current = []
            else:
                current.append(w)
    if not phrase_counts:
        return []
    word_freq: Counter = Counter()
    for key, c in phrase_counts.items():
        if " " not in key:
            word_freq[key] = c
    scored = []
    for key, c in phrase_counts.items():
        parts = key.split()
        if len(parts) > 1 and c < 2:
            continue
        if len(parts) == 1 and len(key) < 4:
            continue
        sc = c * (1 + 0.6 * (len(parts) - 1)) * (sum(math.log(1 + word_freq.get(p, 1)) for p in parts) / len(parts))
        best = surface[key].most_common(1)[0][0]
        if best.isupper() and len(best) > 5:
            best = best.title()
        scored.append((best, sc, key))
    scored.sort(key=lambda x: -x[1])
    out: list[tuple[str, float]] = []
    used: list[set[str]] = []
    for best, sc, key in scored:
        ks = set(key.split())
        # skip phrases dominated by an already-chosen longer/shorter phrase
        if any(ks <= u or (len(ks) == 1 and ks & u) for u in used):
            continue
        out.append((best, sc))
        used.append(ks)
        if len(out) >= limit:
            break
    return out


def find_definitions(sents: list[Sentence]) -> list[tuple[str, str, int]]:
    out: list[tuple[str, str, int]] = []
    seen = set()
    for i, s in enumerate(sents):
        t = s.text.strip()
        m = CALLED_RE.match(t)
        cand = None
        if m:
            cand = (m.group("term").strip(), m.group("def").strip())
        else:
            for pat in DEF_PATTERNS:
                m = pat.match(t)
                if m:
                    cand = (m.group("term").strip(), m.group("def").strip())
                    break
        if not cand:
            continue
        term, definition = cand
        tw = term.split()
        if not (1 <= len(tw) <= 5) or term.lower() in STOPWORDS or tw[0].lower() in {"it", "this", "that", "there", "he", "she", "they", "we", "i", "you", "which", "what"}:
            continue
        definition = definition.rstrip(" .")
        if len(definition) < 8:
            continue
        key = term.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append((term[:1].upper() + term[1:], definition[:1].upper() + definition[1:] + ".", i))
    return out


def find_dates(sents: list[Sentence]) -> list[tuple[str, str]]:
    out = []
    seen = set()
    for s in sents:
        found = [m.group(0) for m in DATE_RE.finditer(s.text)]
        if not found:
            found = [m.group(0) for m in YEAR_ONLY.finditer(s.text)
                     if re.search(r"\b(in|on|by|since|year|from|until|founded|born|died|began|ended)\b", s.text, re.I)]
        for d in found[:2]:
            d = re.sub(r"^(in|by|since|from|until|during|after|before|around|circa|c\.)\s+", "", d, flags=re.I)
            key = (d, s.text[:60])
            if key in seen:
                continue
            seen.add(key)
            out.append((d, s.text))
    return out


def find_names(sents: list[Sentence], limit: int = 15) -> list[tuple[str, str]]:
    counts: Counter = Counter()
    first_sentence: dict[str, str] = {}
    for s in sents:
        ws = s.text.split()
        i = 0
        while i < len(ws):
            w = re.sub(r"[^\w.'\-]", "", ws[i])
            if w and w[0].isupper() and w not in NON_NAME_CAPS and not w.isupper():
                j = i
                parts = []
                while j < len(ws):
                    wj = re.sub(r"[^\w.'\-]", "", ws[j])
                    if wj and (wj[0].isupper() or wj in ("de", "van", "von", "da", "of")) and wj not in NON_NAME_CAPS:
                        parts.append(wj.rstrip("."))
                        if re.search(r"[,;:.!?)]$", ws[j]) and wj.lower().rstrip(".") not in TITLE_WORDS:
                            j += 1
                            break
                        j += 1
                    else:
                        break
                while parts and parts[-1] in ("de", "van", "von", "da", "of"):
                    parts.pop()
                if len(parts) >= 2 or (parts and parts[0].lower() in TITLE_WORDS and len(parts) > 1):
                    name = " ".join(parts)
                    if i > 0 or len(parts) >= 2:
                        counts[name] += 1
                        first_sentence.setdefault(name, s.text)
                i = max(j, i + 1)
            else:
                i += 1
    out = []
    for name, c in counts.most_common(limit * 2):
        lw = name.lower()
        if any(x in lw for x in ("university", "department", "chapter", "section")) and c < 2:
            continue
        out.append((name, first_sentence[name]))
        if len(out) >= limit:
            break
    return out


def analyze(text: str) -> Analysis:
    sents = [s for s in split_sentences(text) if words(s.text)]
    scores = rank_sentences(sents)
    kws = extract_keywords(text)
    defs = find_definitions(sents)
    return Analysis(sentences=sents, scores=scores, keywords=kws, definitions=defs)


def top_sentences(an: Analysis, max_words: int, filt=None) -> list[Sentence]:
    chosen: list[int] = []
    total = 0
    for i in an.ranked():
        s = an.sentences[i]
        if filt and not filt(s):
            continue
        if not _usable(s):
            continue
        n = len(words(s.text))
        if total + n > max_words and chosen:
            break
        chosen.append(i)
        total += n
    return [an.sentences[i] for i in sorted(chosen)]


def fact_sentences(an: Analysis, limit: int) -> list[str]:
    cands = [i for i in an.ranked() if _usable(an.sentences[i]) and
             (NUMBER_RE.search(an.sentences[i].text) or DATE_RE.search(an.sentences[i].text) or
              any(t in an.sentences[i].text for t, _, _ in an.definitions[:10]))]
    return [an.sentences[i].text for i in sorted(cands[:limit])]


def marker_sentences(an: Analysis, pattern: re.Pattern, limit: int) -> list[str]:
    cands = [i for i in an.ranked() if _usable(an.sentences[i]) and pattern.search(an.sentences[i].text)]
    return [an.sentences[i].text for i in sorted(cands[:limit])]


def best_sentence_for(an: Analysis, term: str) -> str:
    st = {stem(t) for t in tokens(term)}
    best, best_sc = "", -1.0
    for i, s in enumerate(an.sentences):
        ss = {stem(t) for t in tokens(s.text)}
        if st and st <= ss and _usable(s):
            sc = an.scores[i]
            if sc > best_sc:
                best, best_sc = s.text, sc
    return best


def guess_title(text: str, an: Analysis) -> str:
    for line in (text or "").strip().splitlines()[:5]:
        line = line.strip().lstrip("#").strip()
        if 3 <= len(line) <= 90 and not line.endswith((".", ",", ";")) and len(line.split()) <= 12:
            return line
    if an.keywords:
        return an.keywords[0][0][:1].upper() + an.keywords[0][0][1:]
    return "Untitled"
