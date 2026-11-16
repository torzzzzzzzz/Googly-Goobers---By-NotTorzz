"""BM25 passage retrieval over the user's documents."""
from __future__ import annotations

import math
from collections import Counter
from dataclasses import dataclass

from .text import chunk_text, stem, tokens


@dataclass
class Passage:
    source: str  # human label, e.g. document title
    source_id: str  # e.g. "file:3" / "doc:5" / "text"
    index: int
    text: str
    score: float = 0.0

    def as_dict(self) -> dict:
        return {"source": self.source, "source_id": self.source_id, "index": self.index, "text": self.text,
                "score": round(self.score, 3)}


def build_passages(sources: list[tuple[str, str, str]], size: int = 900) -> list[Passage]:
    """sources: (label, source_id, text)."""
    out: list[Passage] = []
    for label, sid, text in sources:
        for i, chunk in enumerate(chunk_text(text, size, overlap_sentences=1)):
            out.append(Passage(label, sid, i, chunk))
    return out


def bm25_rank(passages: list[Passage], query: str, k: int = 6, k1: float = 1.4, b: float = 0.75) -> list[Passage]:
    q = [stem(t) for t in tokens(query)]
    if not passages:
        return []
    if not q:
        return passages[:k]
    docs = [[stem(t) for t in tokens(p.text)] for p in passages]
    n = len(docs)
    avgdl = sum(len(d) for d in docs) / n or 1.0
    df: Counter = Counter()
    for d in docs:
        df.update(set(d))
    idf = {t: math.log(1 + (n - df[t] + 0.5) / (df[t] + 0.5)) for t in set(q)}
    scored = []
    for p, d in zip(passages, docs):
        tf = Counter(d)
        dl = len(d) or 1
        s = 0.0
        for t in q:
            if t in tf:
                s += idf[t] * tf[t] * (k1 + 1) / (tf[t] + k1 * (1 - b + b * dl / avgdl))
        p.score = s
        scored.append(p)
    scored.sort(key=lambda p: -p.score)
    top = [p for p in scored if p.score > 0][:k]
    return top
