import DOMPurify from "dompurify";
import { marked } from "marked";

marked.setOptions({ gfm: true, breaks: false });

/** Render model output (Markdown) to sanitized HTML. */
export function renderMarkdown(md: string): string {
  const html = marked.parse(md ?? "", { async: false }) as string;
  return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
}

export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html ?? "", { USE_PROFILES: { html: true } });
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Plain text (with blank-line paragraphs) → simple HTML for the rich editor. */
export function textToHtml(text: string): string {
  const looksMd = /^(#{1,6}\s|[-*]\s|\d+\.\s|>\s)/m.test(text) || /\*\*[^*]+\*\*/.test(text);
  if (looksMd) return renderMarkdown(text);
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

export function htmlToText(html: string): string {
  const div = document.createElement("div");
  div.innerHTML = sanitizeHtml(html.replace(/<\/(p|h[1-6]|li|blockquote|pre)>/gi, "</$1>\n\n").replace(/<br\s*\/?>/gi, "\n"));
  return (div.textContent ?? "").replace(/\n{3,}/g, "\n\n").trim();
}
