import { describe, expect, it } from "vitest";
import { htmlToText, renderMarkdown, sanitizeHtml, textToHtml } from "../markdown";

describe("markdown rendering", () => {
  it("renders model markdown", () => {
    const html = renderMarkdown("# Title\n\n- **bold** item");
    expect(html).toContain("<h1>Title</h1>");
    expect(html).toContain("<strong>bold</strong>");
  });
  it("strips scripts and event handlers from model output", () => {
    const html = renderMarkdown('Hi <script>alert(1)</script><img src=x onerror="alert(2)"> [x](javascript:alert(3))');
    expect(html).not.toContain("<script");
    expect(html).not.toContain("onerror");
    expect(html).not.toContain("javascript:");
    expect(sanitizeHtml('<a href="javascript:x()">a</a>')).not.toContain("javascript:");
  });
  it("converts plain text to paragraphs and back", () => {
    const html = textToHtml("First para\nline two\n\nSecond <para>");
    expect(html).toBe("<p>First para<br>line two</p><p>Second &lt;para&gt;</p>");
    expect(htmlToText(html)).toBe("First para\nline two\n\nSecond <para>");
  });
});
