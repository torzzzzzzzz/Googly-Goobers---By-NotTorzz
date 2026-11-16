// TORZ AI page agent: injected only when the user invokes TORZ AI on a page (context menu).
// Captures the selection, replaces it after the user confirms in the side panel, and runs the
// compatibility typing engine inside the field the user chose.
(() => {
  if (window.__torzAgent) return;
  window.__torzAgent = true;

  let captured = null; // { kind: 'input'|'ce'|'page', el, start, end, range, text }
  let lastReplace = null;
  let typeTarget = null; // { kind, el, range? }
  let typing = null;
  let typingSnapshot = null;

  const isTextInput = (el) =>
    el && ((el.tagName === "TEXTAREA") || (el.tagName === "INPUT" && /^(text|search|email|url|tel|)$/i.test(el.type || "")));
  const editableRoot = (node) => {
    let el = node && (node.nodeType === 1 ? node : node.parentElement);
    while (el && el !== document.documentElement) {
      if (el.isContentEditable && (!el.parentElement || !el.parentElement.isContentEditable)) return el;
      el = el.parentElement;
    }
    return null;
  };
  const describe = (el) => {
    if (!el) return "page";
    const label = el.getAttribute("aria-label") || el.getAttribute("placeholder") || el.name || el.id || "";
    const kind = el.tagName === "TEXTAREA" ? "text area" : el.tagName === "INPUT" ? "text field" : "editor";
    return `${kind}${label ? ` “${String(label).slice(0, 40)}”` : ""} on ${location.host}`;
  };

  function capture() {
    const el = document.activeElement;
    if (isTextInput(el) && el.selectionStart !== el.selectionEnd) {
      captured = { kind: "input", el, start: el.selectionStart, end: el.selectionEnd, text: el.value.slice(el.selectionStart, el.selectionEnd) };
      return { ok: true, text: captured.text, editable: !el.readOnly && !el.disabled };
    }
    const sel = window.getSelection();
    if (sel && sel.rangeCount && !sel.isCollapsed) {
      const range = sel.getRangeAt(0).cloneRange();
      const root = editableRoot(range.commonAncestorContainer);
      captured = { kind: root ? "ce" : "page", el: root, range, text: sel.toString() };
      return { ok: true, text: captured.text, editable: !!root };
    }
    captured = null;
    return { ok: false, text: "", editable: false };
  }

  function insertAtSelection(text) {
    // execCommand keeps the browser's native undo stack working (Ctrl+Z).
    if (document.execCommand("insertText", false, text)) return true;
    return false;
  }

  function replace(text) {
    if (!captured) return { error: "The original selection is no longer available. Select the text again." };
    if (captured.kind === "page") return { error: "That text is not editable on this page. Copy the result instead." };
    if (captured.kind === "input") {
      const el = captured.el;
      if (!document.contains(el)) return { error: "The text field is no longer on the page." };
      if (el.value.slice(captured.start, captured.end) !== captured.text) return { error: "The text changed since you selected it. Select it again." };
      el.focus();
      el.setSelectionRange(captured.start, captured.end);
      if (!insertAtSelection(text)) {
        el.setRangeText(text, captured.start, captured.end, "end");
        el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertReplacementText", data: text }));
      }
      lastReplace = { kind: "input", el, start: captured.start, end: captured.start + text.length, original: captured.text };
      captured = null;
      return { ok: true };
    }
    const el = captured.el;
    if (!el || !document.contains(el)) return { error: "The editor is no longer on the page." };
    el.focus();
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(captured.range);
    if (!insertAtSelection(text)) {
      captured.range.deleteContents();
      captured.range.insertNode(document.createTextNode(text));
      el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertReplacementText" }));
      lastReplace = { kind: "manual", el };
    } else {
      lastReplace = { kind: "ce", el };
    }
    captured = null;
    return { ok: true };
  }

  function undoReplace() {
    if (!lastReplace) return { error: "Nothing to undo." };
    const r = lastReplace;
    lastReplace = null;
    if (r.kind === "input") {
      if (!document.contains(r.el)) return { error: "The field is gone." };
      r.el.focus();
      r.el.setSelectionRange(r.start, r.end);
      if (!document.execCommand("insertText", false, r.original)) {
        r.el.setRangeText(r.original, r.start, r.end, "end");
        r.el.dispatchEvent(new InputEvent("input", { bubbles: true }));
      }
      return { ok: true };
    }
    r.el.focus();
    return document.execCommand("undo") ? { ok: true } : { error: "Use Ctrl+Z in the page to undo." };
  }

  // ---------------------------------------------------------------------------------------------- typing (compatibility engine)

  function markTarget() {
    const el = document.activeElement;
    if (isTextInput(el)) {
      typeTarget = { kind: "input", el };
      return { ok: true, desc: describe(el) };
    }
    const root = editableRoot(el) || editableRoot(window.getSelection()?.anchorNode);
    if (root) {
      const sel = window.getSelection();
      typeTarget = { kind: "ce", el: root, range: sel && sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null };
      return { ok: true, desc: describe(root) };
    }
    return { ok: false };
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  function delayFor(ch, s) {
    const base = 60000 / (Math.max(10, s.wpm || 70) * 5);
    let d = s.natural_rhythm !== false ? base * (0.55 + Math.random() * 0.9) : base;
    if (s.pause_on_punctuation !== false) {
      if (/[.!?]/.test(ch)) d += base * 4;
      else if (/[,;:]/.test(ch)) d += base * 1.5;
      else if (ch === "\n") d += base * 3;
    }
    return d;
  }

  function typeChar(ch) {
    const t = typeTarget;
    if (t.kind === "input") {
      if (document.activeElement !== t.el) t.el.focus();
      if (ch === "\n" && t.el.tagName === "INPUT") return;
      if (!document.execCommand("insertText", false, ch)) {
        const s = t.el.selectionStart ?? t.el.value.length;
        const e = t.el.selectionEnd ?? s;
        t.el.setRangeText(ch, s, e, "end");
        t.el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: ch }));
      }
      return;
    }
    if (document.activeElement !== t.el && !t.el.contains(document.activeElement)) t.el.focus();
    if (ch === "\n") {
      if (!document.execCommand("insertParagraph")) document.execCommand("insertLineBreak");
    } else if (!document.execCommand("insertText", false, ch)) {
      const sel = window.getSelection();
      if (sel.rangeCount) {
        const r = sel.getRangeAt(0);
        r.deleteContents();
        const node = document.createTextNode(ch);
        r.insertNode(node);
        r.setStartAfter(node);
        r.collapse(true);
        sel.removeAllRanges();
        sel.addRange(r);
        t.el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: ch }));
      }
    }
  }

  async function runTyping(text, settings) {
    if (!typeTarget || !document.contains(typeTarget.el)) return { error: "The chosen field is no longer on the page. Right-click it again." };
    const t = typeTarget;
    typingSnapshot = t.kind === "input" ? { value: t.el.value } : { html: t.el.innerHTML };
    t.el.focus();
    if (t.kind === "ce" && t.range) {
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(t.range);
    }
    const chars = Array.from(text);
    typing = { paused: false, stop: false, typed: 0 };
    const report = (status, error) => chrome.runtime.sendMessage({ type: "agent:progress", typed: typing.typed, total: chars.length, status, error }).catch(() => {});
    (async () => {
      try {
        for (let i = 0; i < chars.length; i++) {
          while (typing.paused && !typing.stop) await sleep(120);
          if (typing.stop) break;
          if (chars[i] !== "\r") typeChar(chars[i]);
          typing.typed = i + 1;
          if (typing.typed % 6 === 0) report("typing");
          await sleep(delayFor(chars[i], settings));
        }
        report(typing.stop ? "stopped" : "done");
      } catch (e) {
        report("error", String(e?.message || e));
      }
    })();
    return { ok: true };
  }

  function undoTyping() {
    if (!typeTarget || !typingSnapshot) return { error: "Nothing to undo." };
    const t = typeTarget;
    if (t.kind === "input") {
      t.el.value = typingSnapshot.value;
      t.el.dispatchEvent(new InputEvent("input", { bubbles: true }));
    } else {
      t.el.innerHTML = typingSnapshot.html;
      t.el.dispatchEvent(new InputEvent("input", { bubbles: true }));
    }
    typingSnapshot = null;
    return { ok: true };
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    try {
      switch (msg?.type) {
        case "agent:capture":
          sendResponse(capture());
          break;
        case "agent:replace":
          sendResponse(replace(msg.text));
          break;
        case "agent:undo-replace":
          sendResponse(undoReplace());
          break;
        case "agent:mark-target":
          sendResponse(markTarget());
          break;
        case "agent:type":
          runTyping(msg.text, msg.settings || {}).then(sendResponse);
          return true;
        case "agent:control":
          if (typing) {
            if (msg.action === "pause") typing.paused = true;
            if (msg.action === "resume") typing.paused = false;
            if (msg.action === "stop") typing.stop = true;
          }
          sendResponse({ ok: true });
          break;
        case "agent:undo-typing":
          sendResponse(undoTyping());
          break;
        default:
          return false;
      }
    } catch (e) {
      sendResponse({ error: String(e?.message || e) });
    }
    return false;
  });
})();
