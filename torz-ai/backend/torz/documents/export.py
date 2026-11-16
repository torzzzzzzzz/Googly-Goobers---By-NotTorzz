"""Export documents and notes to TXT, Markdown, HTML, DOCX and PDF."""
from __future__ import annotations

import html as htmlmod
import io
import re
import sys
from html.parser import HTMLParser
from pathlib import Path
from typing import Any

EXPORT_FORMATS = {
    "txt": ("text/plain; charset=utf-8", "txt"),
    "md": ("text/markdown; charset=utf-8", "md"),
    "html": ("text/html; charset=utf-8", "html"),
    "docx": ("application/vnd.openxmlformats-officedocument.wordprocessingml.document", "docx"),
    "pdf": ("application/pdf", "pdf"),
}

BLOCK_TAGS = {"p", "h1", "h2", "h3", "h4", "h5", "h6", "li", "blockquote", "pre", "div", "br", "hr", "tr"}


# ------------------------------------------------------------------------------------------------ HTML model

class _Node:
    def __init__(self, tag: str, attrs: dict[str, str] | None = None, parent: "_Node | None" = None):
        self.tag = tag
        self.attrs = attrs or {}
        self.children: list[Any] = []
        self.parent = parent


class _TreeBuilder(HTMLParser):
    VOID = {"br", "hr", "img", "input", "meta", "link"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = _Node("root")
        self.cur = self.root

    def handle_starttag(self, tag, attrs):
        node = _Node(tag, {k: v or "" for k, v in attrs}, self.cur)
        self.cur.children.append(node)
        if tag not in self.VOID:
            self.cur = node

    def handle_endtag(self, tag):
        n = self.cur
        while n is not None and n.tag != tag:
            n = n.parent
        if n is not None and n.parent is not None:
            self.cur = n.parent

    def handle_data(self, data):
        self.cur.children.append(data)


def parse_html(html: str) -> _Node:
    b = _TreeBuilder()
    b.feed(html or "")
    b.close()
    return b.root


def looks_like_html(s: str) -> bool:
    return bool(re.search(r"<(p|h[1-6]|ul|ol|li|div|br|strong|em|blockquote)\b", s or "", re.I))


def text_to_html(text: str) -> str:
    """Convert plain text / light Markdown into simple HTML paragraphs."""
    out = []
    lines = (text or "").replace("\r\n", "\n").split("\n")
    in_list: str | None = None
    para: list[str] = []

    def inline(s: str) -> str:
        s = htmlmod.escape(s)
        s = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", s)
        s = re.sub(r"(?<!\*)\*(?!\s)(.+?)(?<!\s)\*(?!\*)", r"<em>\1</em>", s)
        s = re.sub(r"`([^`]+)`", r"<code>\1</code>", s)
        return s

    def flush_para():
        nonlocal para
        if para:
            out.append("<p>" + "<br>".join(inline(p) for p in para) + "</p>")
            para = []

    def close_list():
        nonlocal in_list
        if in_list:
            out.append(f"</{in_list}>")
            in_list = None

    for line in lines:
        st = line.strip()
        if not st:
            flush_para()
            close_list()
            continue
        m = re.match(r"^(#{1,6})\s+(.*)$", st)
        if m:
            flush_para()
            close_list()
            lvl = min(len(m.group(1)), 3)
            out.append(f"<h{lvl}>{inline(m.group(2))}</h{lvl}>")
            continue
        m = re.match(r"^(?:[-*•])\s+(.*)$", st)
        m2 = re.match(r"^\d+[.)]\s+(.*)$", st)
        if m or m2:
            flush_para()
            kind = "ul" if m else "ol"
            if in_list != kind:
                close_list()
                out.append(f"<{kind}>")
                in_list = kind
            out.append(f"<li><p>{inline((m or m2).group(1))}</p></li>")
            continue
        if st.startswith(">"):
            flush_para()
            close_list()
            out.append(f"<blockquote><p>{inline(st.lstrip('> '))}</p></blockquote>")
            continue
        close_list()
        para.append(st)
    flush_para()
    close_list()
    return "".join(out)


def html_to_text(html: str) -> str:
    root = parse_html(html)
    out: list[str] = []

    def walk(node: Any, list_stack: list[list[Any]]):
        if isinstance(node, str):
            out.append(node)
            return
        tag = node.tag
        if tag == "br":
            out.append("\n")
            return
        if tag in ("ul", "ol"):
            list_stack.append([tag, 0])
            out.append("\n")
            for c in node.children:
                walk(c, list_stack)
            list_stack.pop()
            out.append("\n")
            return
        if tag == "li":
            kind = list_stack[-1] if list_stack else ["ul", 0]
            kind[1] += 1
            indent = "  " * max(0, len(list_stack) - 1)
            out.append(f"\n{indent}" + ("- " if kind[0] == "ul" else f"{kind[1]}. "))
            for c in node.children:
                if isinstance(c, _Node) and c.tag == "p":
                    for cc in c.children:
                        walk(cc, list_stack)
                else:
                    walk(c, list_stack)
            return
        block = tag in BLOCK_TAGS or tag in ("ul", "ol", "table")
        if block:
            out.append("\n\n")
        for c in node.children:
            walk(c, list_stack)
        if block:
            out.append("\n\n")

    walk(root, [])
    txt = "".join(out)
    txt = re.sub(r"[ \t]+\n", "\n", txt)
    txt = re.sub(r"\n{3,}", "\n\n", txt)
    return txt.strip()


def html_to_markdown(html: str) -> str:
    root = parse_html(html)

    def inline(node: Any) -> str:
        if isinstance(node, str):
            return node
        inner = "".join(inline(c) for c in node.children)
        t = node.tag
        if t in ("strong", "b"):
            return f"**{inner}**" if inner.strip() else inner
        if t in ("em", "i"):
            return f"*{inner}*" if inner.strip() else inner
        if t in ("s", "del", "strike"):
            return f"~~{inner}~~"
        if t == "code":
            return f"`{inner}`"
        if t == "a":
            return f"[{inner}]({node.attrs.get('href', '')})"
        if t == "br":
            return "  \n"
        if t == "mark":
            return f"=={inner}=="
        return inner

    lines: list[str] = []

    def block(node: Any, depth: int = 0, ordered: bool = False):
        if isinstance(node, str):
            if node.strip():
                lines.append(node.strip())
            return
        t = node.tag
        if t in ("h1", "h2", "h3", "h4", "h5", "h6"):
            lines.append("#" * int(t[1]) + " " + "".join(inline(c) for c in node.children).strip())
            lines.append("")
        elif t == "p":
            lines.append("".join(inline(c) for c in node.children).strip())
            lines.append("")
        elif t in ("ul", "ol"):
            n = 0
            for c in node.children:
                if isinstance(c, _Node) and c.tag == "li":
                    n += 1
                    prefix = "  " * depth + (f"{n}. " if t == "ol" else "- ")
                    texts, nested = [], []
                    for cc in c.children:
                        if isinstance(cc, _Node) and cc.tag in ("ul", "ol"):
                            nested.append(cc)
                        elif isinstance(cc, _Node) and cc.tag == "p":
                            texts.append("".join(inline(x) for x in cc.children))
                        else:
                            texts.append(inline(cc))
                    lines.append(prefix + " ".join(x.strip() for x in texts if x.strip()))
                    for ns in nested:
                        block(ns, depth + 1)
            lines.append("")
        elif t == "blockquote":
            inner = html_to_markdown("".join(_serialize(c) for c in node.children))
            lines.extend("> " + ln if ln else ">" for ln in inner.splitlines())
            lines.append("")
        elif t == "pre":
            lines.append("```")
            lines.append(html_to_text(_serialize(node)))
            lines.append("```")
            lines.append("")
        elif t == "hr":
            lines.append("---")
            lines.append("")
        else:
            has_block = any(isinstance(c, _Node) and (c.tag in BLOCK_TAGS or c.tag in ("ul", "ol")) for c in node.children)
            if has_block or t == "root":
                for c in node.children:
                    block(c, depth)
            else:
                txt = inline(node).strip()
                if txt:
                    lines.append(txt)
                    lines.append("")

    block(root)
    md = "\n".join(lines)
    return re.sub(r"\n{3,}", "\n\n", md).strip() + "\n"


def _serialize(node: Any) -> str:
    if isinstance(node, str):
        return htmlmod.escape(node)
    attrs = "".join(f' {k}="{htmlmod.escape(v)}"' for k, v in node.attrs.items())
    inner = "".join(_serialize(c) for c in node.children)
    return f"<{node.tag}{attrs}>{inner}</{node.tag}>"


def standalone_html(title: str, body_html: str) -> str:
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>{htmlmod.escape(title)}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
body{{font-family:Georgia,'Times New Roman',serif;max-width:760px;margin:48px auto;padding:0 20px;line-height:1.65;color:#1b1f2a}}
h1,h2,h3{{font-family:'Segoe UI',Arial,sans-serif;line-height:1.25}} blockquote{{border-left:3px solid #9aa4b5;margin:0;padding-left:16px;color:#4a5263}}
code{{background:#f1f3f7;padding:1px 4px;border-radius:4px}} mark{{background:#fff3a3}}
</style></head><body><h1>{htmlmod.escape(title)}</h1>
{body_html}
</body></html>"""


# ------------------------------------------------------------------------------------------------ DOCX

def html_to_docx(title: str, html: str) -> bytes:
    import docx
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    from docx.shared import Pt

    d = docx.Document()
    style = d.styles["Normal"]
    style.font.name = "Calibri"
    style.font.size = Pt(11)
    d.core_properties.title = title
    d.add_heading(title, level=0)
    root = parse_html(html)
    align_map = {"center": WD_ALIGN_PARAGRAPH.CENTER, "right": WD_ALIGN_PARAGRAPH.RIGHT,
                 "justify": WD_ALIGN_PARAGRAPH.JUSTIFY}

    def add_runs(par, node: Any, fmt: dict[str, bool]):
        if isinstance(node, str):
            if node:
                r = par.add_run(node)
                r.bold = fmt.get("b") or None
                r.italic = fmt.get("i") or None
                r.underline = fmt.get("u") or None
                if fmt.get("s"):
                    r.font.strike = True
                if fmt.get("code"):
                    r.font.name = "Consolas"
                if fmt.get("mark"):
                    from docx.enum.text import WD_COLOR_INDEX

                    r.font.highlight_color = WD_COLOR_INDEX.YELLOW
            return
        t = node.tag
        f = dict(fmt)
        if t in ("strong", "b"):
            f["b"] = True
        elif t in ("em", "i"):
            f["i"] = True
        elif t == "u":
            f["u"] = True
        elif t in ("s", "del", "strike"):
            f["s"] = True
        elif t == "code":
            f["code"] = True
        elif t == "mark":
            f["mark"] = True
        elif t == "br":
            par.add_run().add_break()
            return
        for c in node.children:
            add_runs(par, c, f)

    def set_align(par, node):
        st = node.attrs.get("style", "")
        m = re.search(r"text-align:\s*(\w+)", st)
        if m and m.group(1) in align_map:
            par.alignment = align_map[m.group(1)]

    def block(node: Any, list_style: str | None = None, level: int = 0):
        if isinstance(node, str):
            if node.strip():
                p = d.add_paragraph()
                add_runs(p, node, {})
            return
        t = node.tag
        if t in ("h1", "h2", "h3", "h4", "h5", "h6"):
            p = d.add_heading(level=min(int(t[1]), 4))
            for c in node.children:
                add_runs(p, c, {})
            set_align(p, node)
        elif t == "p":
            p = d.add_paragraph(style=list_style) if list_style else d.add_paragraph()
            for c in node.children:
                add_runs(p, c, {})
            set_align(p, node)
        elif t in ("ul", "ol"):
            st = "List Bullet" if t == "ul" else "List Number"
            if level > 0:
                st += f" {min(level + 1, 3)}"
            for c in node.children:
                if isinstance(c, _Node) and c.tag == "li":
                    inline_children = [x for x in c.children if not (isinstance(x, _Node) and x.tag in ("ul", "ol", "p"))]
                    paras = [x for x in c.children if isinstance(x, _Node) and x.tag == "p"]
                    if paras:
                        for pnode in paras:
                            p = d.add_paragraph(style=st)
                            for cc in pnode.children:
                                add_runs(p, cc, {})
                    elif inline_children:
                        p = d.add_paragraph(style=st)
                        for cc in inline_children:
                            add_runs(p, cc, {})
                    for x in c.children:
                        if isinstance(x, _Node) and x.tag in ("ul", "ol"):
                            block(x, level=level + 1)
        elif t == "blockquote":
            for c in node.children:
                if isinstance(c, _Node) and c.tag == "p":
                    p = d.add_paragraph(style="Quote")
                    for cc in c.children:
                        add_runs(p, cc, {})
                else:
                    block(c)
        elif t == "pre":
            p = d.add_paragraph()
            add_runs(p, html_to_text(_serialize(node)), {"code": True})
        elif t == "hr":
            d.add_paragraph("―" * 20).alignment = WD_ALIGN_PARAGRAPH.CENTER
        else:
            for c in node.children:
                block(c, list_style, level)

    block(root)
    buf = io.BytesIO()
    d.save(buf)
    return buf.getvalue()


# ------------------------------------------------------------------------------------------------ PDF

_FONT_CANDIDATES = [
    ("C:/Windows/Fonts/arial.ttf", "C:/Windows/Fonts/arialbd.ttf", "C:/Windows/Fonts/ariali.ttf", "C:/Windows/Fonts/arialbi.ttf"),
    ("C:/Windows/Fonts/segoeui.ttf", "C:/Windows/Fonts/segoeuib.ttf", "C:/Windows/Fonts/segoeuii.ttf", "C:/Windows/Fonts/segoeuiz.ttf"),
    ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
     "/usr/share/fonts/truetype/dejavu/DejaVuSans-Oblique.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-BoldOblique.ttf"),
    ("/System/Library/Fonts/Supplemental/Arial.ttf", "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
     "/System/Library/Fonts/Supplemental/Arial Italic.ttf", "/System/Library/Fonts/Supplemental/Arial Bold Italic.ttf"),
]


def _find_font() -> tuple[str, ...] | None:
    windir = None
    if sys.platform == "win32":
        import os

        windir = os.environ.get("WINDIR", "C:/Windows").replace("\\", "/")
    for cand in _FONT_CANDIDATES:
        paths = tuple(p.replace("C:/Windows", windir) if windir else p for p in cand)
        if Path(paths[0]).exists():
            return paths
    return None


def html_to_pdf(title: str, html: str) -> bytes:
    from fpdf import FPDF

    pdf = FPDF(format="A4")
    pdf.set_margins(20, 20, 20)
    pdf.set_auto_page_break(True, 20)
    pdf.add_page()
    font = _find_font()
    family = "Helvetica"
    if font:
        family = "TorzSans"
        regular, bold, italic, bolditalic = font
        pdf.add_font(family, "", regular)
        pdf.add_font(family, "B", bold if Path(bold).exists() else regular)
        pdf.add_font(family, "I", italic if Path(italic).exists() else regular)
        pdf.add_font(family, "BI", bolditalic if Path(bolditalic).exists() else regular)
    body = html or ""
    # fpdf2's HTML renderer understands a basic subset; strip attributes it does not need.
    body = re.sub(r"<(\w+)\s+[^>]*>", r"<\1>", body)
    body = re.sub(r"</?(mark|span|div|u|s|code)>", "", body)
    body = re.sub(r"<li>\s*<p>(.*?)</p>\s*</li>", r"<li>\1</li>", body, flags=re.S)
    if not font:
        body = body.encode("latin-1", "replace").decode("latin-1")
        title = title.encode("latin-1", "replace").decode("latin-1")
    pdf.set_font(family, "B", 18)
    pdf.multi_cell(0, 9, title)
    pdf.ln(4)
    pdf.set_font(family, "", 11)
    try:
        pdf.write_html(body, font_family=family)
    except Exception:
        pdf.set_font(family, "", 11)
        pdf.multi_cell(0, 6, html_to_text(body))
    return bytes(pdf.output())


def export(title: str, html: str, fmt: str) -> tuple[bytes, str, str]:
    """Returns (data, mime, extension)."""
    if fmt not in EXPORT_FORMATS:
        raise ValueError(f"Unsupported export format: {fmt}")
    mime, ext = EXPORT_FORMATS[fmt]
    if fmt == "txt":
        data = (title + "\n\n" + html_to_text(html)).encode("utf-8")
    elif fmt == "md":
        data = (f"# {title}\n\n" + html_to_markdown(html)).encode("utf-8")
    elif fmt == "html":
        data = standalone_html(title, html).encode("utf-8")
    elif fmt == "docx":
        data = html_to_docx(title, html)
    else:
        data = html_to_pdf(title, html)
    return data, mime, ext


def safe_filename(name: str, ext: str) -> str:
    base = re.sub(r"[^\w\- .()]+", "", name or "").strip(" .") or "document"
    return f"{base[:80]}.{ext}"
