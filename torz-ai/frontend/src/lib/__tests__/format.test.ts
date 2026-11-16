import { describe, expect, it } from "vitest";
import { countWords, formatBytes, formatDuration, plural, timeAgo } from "../format";

describe("format helpers", () => {
  it("counts words including unicode and contractions", () => {
    expect(countWords("Hello world")).toBe(2);
    expect(countWords("Don't stop — café au lait, naïve résumé")).toBe(7);
    expect(countWords("")).toBe(0);
  });
  it("formats durations, bytes and plurals", () => {
    expect(formatDuration(65)).toBe("1:05");
    expect(formatDuration(3725)).toBe("1:02:05");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(plural(1, "card")).toBe("1 card");
    expect(plural(3, "card")).toBe("3 cards");
  });
  it("describes relative times", () => {
    expect(timeAgo(new Date().toISOString())).toBe("just now");
    expect(timeAgo(new Date(Date.now() - 5 * 60_000).toISOString())).toBe("5 min ago");
    expect(timeAgo(null)).toBe("");
  });
});
