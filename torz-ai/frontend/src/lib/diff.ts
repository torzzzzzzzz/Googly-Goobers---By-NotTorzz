import { diffArrays, diffWordsWithSpace } from "diff";

export interface Segment {
  text: string;
  kind: "same" | "add" | "del";
}

export interface AlignedSentence {
  original: string | null;
  revised: string | null;
  changed: boolean;
  words?: Segment[]; // inline word diff for changed pairs
}

/** Split into sentences, keeping trailing whitespace/newlines attached so text can be rebuilt exactly. */
export function splitSentences(text: string): string[] {
  if (!text) return [];
  const out: string[] = [];
  const re = /[^.!?\n]+(?:[.!?]+["'”’)\]]*|\n+|$)\s*/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m[0] === "") {
      re.lastIndex++;
      continue;
    }
    out.push(m[0]);
  }
  // Merge fragments that end with common abbreviations.
  const merged: string[] = [];
  for (const s of out) {
    const prev = merged[merged.length - 1];
    if (prev && /\b(?:Mr|Mrs|Ms|Dr|Prof|St|vs|etc|e\.g|i\.e|Fig|No)\.\s*$/.test(prev)) merged[merged.length - 1] = prev + s;
    else merged.push(s);
  }
  return merged;
}

const norm = (s: string) => s.trim().replace(/\s+/g, " ");

/** Align sentences of the original and revised text; mark which ones changed. */
export function alignSentences(original: string, revised: string): AlignedSentence[] {
  const a = splitSentences(original);
  const b = splitSentences(revised);
  const parts = diffArrays(a.map(norm), b.map(norm));
  const out: AlignedSentence[] = [];
  let ia = 0;
  let ib = 0;
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    const n = p.count ?? p.value.length;
    if (!p.added && !p.removed) {
      for (let k = 0; k < n; k++) out.push({ original: a[ia++], revised: b[ib++], changed: false });
      continue;
    }
    // Pair removed+added runs as modified sentences.
    if (p.removed && parts[i + 1]?.added) {
      const q = parts[i + 1];
      const m = q.count ?? q.value.length;
      const pairs = Math.max(n, m);
      for (let k = 0; k < pairs; k++) {
        const o = k < n ? a[ia++] : null;
        const r = k < m ? b[ib++] : null;
        out.push({ original: o, revised: r, changed: true, words: o && r ? wordDiff(o, r) : undefined });
      }
      i++;
      continue;
    }
    if (p.removed) for (let k = 0; k < n; k++) out.push({ original: a[ia++], revised: null, changed: true });
    else for (let k = 0; k < n; k++) out.push({ original: null, revised: b[ib++], changed: true });
  }
  return out;
}

export function wordDiff(a: string, b: string): Segment[] {
  return diffWordsWithSpace(a, b).map((p) => ({ text: p.value, kind: p.added ? "add" : p.removed ? "del" : "same" }));
}

export function changeStats(original: string, revised: string) {
  const aligned = alignSentences(original, revised);
  const total = aligned.filter((s) => s.revised !== null).length;
  const changed = aligned.filter((s) => s.changed && s.revised !== null).length;
  const words = diffWordsWithSpace(original, revised);
  let changedWords = 0;
  let totalWords = 0;
  for (const w of words) {
    const n = (w.value.match(/\S+/g) ?? []).length;
    if (!w.removed) totalWords += n;
    if (w.added) changedWords += n;
  }
  return { sentences: total, changedSentences: changed, changePercent: totalWords ? Math.round((100 * changedWords) / totalWords) : 0 };
}
