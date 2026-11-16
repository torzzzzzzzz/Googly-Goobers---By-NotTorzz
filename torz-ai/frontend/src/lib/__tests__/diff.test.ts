import { describe, expect, it } from "vitest";
import { alignSentences, changeStats, splitSentences, wordDiff } from "../diff";

describe("diff utilities", () => {
  it("splits sentences without losing any characters", () => {
    const text = "Dr. Smith arrived. It rained!\n\nThen what? Nothing.";
    expect(splitSentences(text).join("")).toBe(text);
    expect(splitSentences(text)[0]).toContain("Dr. Smith arrived.");
  });

  it("marks changed sentences and keeps unchanged ones", () => {
    const a = "The cat sat. The dog ran. Birds sing.";
    const b = "The cat sat. The dog sprinted quickly. Birds sing.";
    const rows = alignSentences(a, b);
    expect(rows.map((r) => r.changed)).toEqual([false, true, false]);
    const changed = rows[1];
    expect(changed.words?.some((w) => w.kind === "add" && w.text.includes("sprinted"))).toBe(true);
    expect(changed.words?.some((w) => w.kind === "del" && w.text.includes("ran"))).toBe(true);
  });

  it("handles added and removed sentences", () => {
    const rows = alignSentences("One. Two.", "One. Two. Three.");
    expect(rows.at(-1)).toMatchObject({ original: null, changed: true });
    const stats = changeStats("One. Two.", "One. Two. Three.");
    expect(stats).toMatchObject({ sentences: 3, changedSentences: 1 });
    expect(stats.changePercent).toBeGreaterThan(0);
  });

  it("word diff reconstructs both sides", () => {
    const segs = wordDiff("a quick test", "a slow test");
    expect(segs.filter((s) => s.kind !== "add").map((s) => s.text).join("")).toBe("a quick test");
    expect(segs.filter((s) => s.kind !== "del").map((s) => s.text).join("")).toBe("a slow test");
  });
});
