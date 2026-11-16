import { useMemo } from "react";
import { alignSentences, changeStats, wordDiff, type Segment } from "../../lib/diff";
import { cx } from "../ui";

function Segments({ segs, side }: { segs: Segment[]; side: "left" | "right" }) {
  return (
    <>
      {segs.map((s, i) => {
        if (s.kind === "same") return <span key={i}>{s.text}</span>;
        if (side === "left" && s.kind === "del") return <span key={i} className="diff-del">{s.text}</span>;
        if (side === "right" && s.kind === "add") return <span key={i} className="diff-add">{s.text}</span>;
        return null;
      })}
    </>
  );
}

/** Side-by-side comparison: changed sentences are tinted, changed words highlighted. */
export function SideBySideDiff({ original, revised }: { original: string; revised: string }) {
  const rows = useMemo(() => alignSentences(original, revised), [original, revised]);
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line text-[0.92rem] leading-relaxed">
      <div className="bg-surface px-4 py-2.5 label">Original</div>
      <div className="bg-surface px-4 py-2.5 label">Rewritten</div>
      {rows.map((r, i) => (
        <div key={i} className="contents">
          <div className={cx("whitespace-pre-wrap bg-surface px-4 py-1.5 text-ink-2", r.changed && "bg-[color-mix(in_srgb,var(--bad)_4%,var(--surface))]")}>
            {r.original === null ? <span className="text-faint">—</span> : r.words ? <Segments segs={r.words} side="left" /> : r.changed ? <span className="diff-del">{r.original}</span> : r.original}
          </div>
          <div className={cx("whitespace-pre-wrap bg-surface px-4 py-1.5 text-ink", r.changed && "bg-[color-mix(in_srgb,var(--good)_4%,var(--surface))]")}>
            {r.revised === null ? <span className="text-faint">—</span> : r.words ? <Segments segs={r.words} side="right" /> : r.changed ? <span className="diff-add">{r.revised}</span> : r.revised}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Revised text with changed sentences highlighted (single column). */
export function HighlightedRevision({ original, revised, showWords = true }: { original: string; revised: string; showWords?: boolean }) {
  const rows = useMemo(() => alignSentences(original, revised), [original, revised]);
  return (
    <div className="whitespace-pre-wrap text-[0.95rem] leading-relaxed text-ink">
      {rows.map((r, i) =>
        r.revised === null ? null : r.changed ? (
          <span key={i} className="sent-changed" title={r.original ? `Original: ${r.original.trim()}` : "New sentence"}>
            {showWords && r.original ? <Segments segs={wordDiff(r.original, r.revised)} side="right" /> : r.revised}
          </span>
        ) : (
          <span key={i}>{r.revised}</span>
        ),
      )}
    </div>
  );
}

export function ChangeSummary({ original, revised }: { original: string; revised: string }) {
  const s = useMemo(() => changeStats(original, revised), [original, revised]);
  return (
    <span className="text-xs text-muted">
      {s.changedSentences} of {s.sentences} sentences changed · ~{s.changePercent}% of words
    </span>
  );
}
