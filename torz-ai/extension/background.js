// TORZ AI companion extension — service worker.
// Engines for the AutoTyper:
//   keyboard      : Chrome debugger protocol Input.insertText (trusted input; works in Google Docs and most editors).
//                   Chrome shows "TORZ AI started debugging this browser" while it runs.
//   compatibility : content script in a field the user right-clicked ("Type prepared text here").

const DEFAULT_BASE = "http://127.0.0.1:8765";
const VERSION = chrome.runtime.getManifest().version;

let typing = null; // current typing session
const bridgeTabs = new Set();
let tokenCache = null;

// ------------------------------------------------------------------------------------------------ setup

function setupMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: "torz-root", title: "TORZ AI", contexts: ["selection", "editable"] });
    const items = [
      ["improve", "Improve writing"],
      ["humanize", "Rewrite naturally (Humanizer)"],
      ["paraphrase", "Paraphrase"],
      ["grammar", "Fix grammar"],
      ["summarize", "Summarize"],
      ["send", "Send to TORZ AI (new document)"],
    ];
    for (const [id, title] of items) {
      chrome.contextMenus.create({ id: `assist:${id}`, parentId: "torz-root", title, contexts: ["selection"] });
    }
    chrome.contextMenus.create({ id: "sep1", parentId: "torz-root", type: "separator", contexts: ["editable"] });
    chrome.contextMenus.create({ id: "type-here", parentId: "torz-root", title: "Type prepared text here (AutoTyper)", contexts: ["editable"] });
  });
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
}

chrome.runtime.onInstalled.addListener(setupMenus);
chrome.runtime.onStartup.addListener(setupMenus);

// ------------------------------------------------------------------------------------------------ backend helpers

export async function getBase() {
  const { baseUrl } = await chrome.storage.local.get("baseUrl");
  return (baseUrl || DEFAULT_BASE).replace(/\/$/, "");
}

async function getToken(force = false) {
  if (tokenCache && !force) return tokenCache;
  const r = await fetch(`${await getBase()}/api/session`);
  if (!r.ok) throw new Error(`TORZ AI refused the connection (${r.status})`);
  tokenCache = (await r.json()).token;
  return tokenCache;
}

async function backend(path, init = {}) {
  const token = await getToken();
  const r = await fetch(`${await getBase()}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", "X-TORZ-Token": token, ...(init.headers || {}) },
  });
  if (r.status === 401) {
    tokenCache = null;
  }
  if (!r.ok) throw new Error(`TORZ AI error ${r.status}`);
  return r.json();
}

// ------------------------------------------------------------------------------------------------ state broadcast

function publicState() {
  if (!typing) return null;
  const { stop, paused, resolveResume, ...rest } = typing;
  return { ...rest, status: typing.status };
}

async function broadcast() {
  const s = publicState();
  chrome.runtime.sendMessage({ type: "typer:state", state: s }).catch(() => {});
  for (const tabId of [...bridgeTabs]) {
    chrome.tabs
      .sendMessage(tabId, { type: "bridge:progress", progress: s && { jobId: s.jobId, status: s.status, typed: s.typed, total: s.total, target: s.target, error: s.error } })
      .catch(() => bridgeTabs.delete(tabId));
  }
  await chrome.storage.session.set({ typing: s });
}

async function reportJob() {
  if (!typing?.jobId) return;
  const map = { typing: "typing", paused: "paused", done: "done", stopped: "stopped", error: "error", countdown: "typing" };
  try {
    await backend(`/api/autotyper/jobs/${typing.jobId}`, { method: "PATCH", body: JSON.stringify({ status: map[typing.status] || "typing", progress: typing.typed }) });
  } catch {
    /* backend offline: typing still works */
  }
}

// ------------------------------------------------------------------------------------------------ timing

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

async function waitWhilePaused() {
  while (typing && typing.paused && !typing.stop) await sleep(120);
}

// ------------------------------------------------------------------------------------------------ keyboard engine (debugger)

async function cdp(target, method, params) {
  return chrome.debugger.sendCommand(target, method, params || {});
}

async function pressKey(target, key, code, vk, modifiers = 0, text) {
  const base = { key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers };
  await cdp(target, "Input.dispatchKeyEvent", { type: text ? "keyDown" : "rawKeyDown", ...base, ...(text ? { text, unmodifiedText: text } : {}) });
  await cdp(target, "Input.dispatchKeyEvent", { type: "keyUp", ...base });
}

chrome.debugger.onDetach.addListener((source, reason) => {
  if (typing && typing.engine === "keyboard" && source.tabId === typing.tabId && ["typing", "paused", "countdown"].includes(typing.status)) {
    typing.stop = true;
    typing.detachReason = reason === "canceled_by_user" ? "Typing was stopped from Chrome's debugging banner." : "The page was closed or navigated.";
  }
});

async function runKeyboard(text, settings) {
  const target = { tabId: typing.tabId };
  try {
    await chrome.debugger.attach(target, "1.3");
  } catch (e) {
    throw new Error(/Cannot access|chrome:\/\/|Cannot attach/i.test(String(e?.message)) ? "TORZ AI can't type on this page (browser pages and the Chrome Web Store are protected)." : String(e?.message || e));
  }
  try {
    try {
      const r = await cdp(target, "Runtime.evaluate", { expression: "location.host + ' — ' + document.title", returnByValue: true });
      typing.target = r?.result?.value || typing.target;
    } catch {
      /* ignore */
    }
    await broadcast();
    const chars = Array.from(text);
    for (let i = typing.typed; i < chars.length; i++) {
      await waitWhilePaused();
      if (!typing || typing.stop) break;
      const ch = chars[i];
      if (ch === "\r") continue;
      if (ch === "\n") await pressKey(target, "Enter", "Enter", 13, 0, "\r");
      else await cdp(target, "Input.insertText", { text: ch });
      typing.typed = i + 1;
      if (typing.typed % 6 === 0) broadcast();
      await sleep(delayFor(ch, settings));
    }
  } finally {
    await chrome.debugger.detach(target).catch(() => {});
  }
}

// ------------------------------------------------------------------------------------------------ compatibility engine (content script)

async function injectAgent(tabId, frameId = 0) {
  await chrome.scripting.executeScript({ target: { tabId, frameIds: [frameId] }, files: ["agent.js"] });
}

function toAgent(tabId, frameId, msg) {
  return chrome.tabs.sendMessage(tabId, msg, { frameId });
}

// ------------------------------------------------------------------------------------------------ typing control

async function startTyping({ text, settings, jobId, engine, countdown = 3 }) {
  if (typing && ["typing", "paused", "countdown"].includes(typing.status)) throw new Error("Already typing. Stop the current job first.");
  if (!text || !text.trim()) throw new Error("There is no text to type.");
  let tabId;
  let frameId = 0;
  let target = "";
  if (engine === "compatibility") {
    const { typeTarget } = await chrome.storage.session.get("typeTarget");
    if (!typeTarget) throw new Error("Right-click inside the text field and choose TORZ AI → “Type prepared text here” first.");
    ({ tabId, frameId } = typeTarget);
    target = typeTarget.desc || "Selected field";
  } else {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab?.id) throw new Error("No active tab found.");
    tabId = tab.id;
    target = tab.title || "Active tab";
  }
  typing = { status: "countdown", engine, tabId, frameId, jobId: jobId || null, typed: 0, total: Array.from(text).length, target, error: "", paused: false, stop: false, countdown, startedAt: Date.now() };
  await broadcast();
  for (let n = countdown; n > 0; n--) {
    typing.countdown = n;
    await broadcast();
    await sleep(1000);
    if (typing.stop) {
      typing.status = "stopped";
      await broadcast();
      return;
    }
  }
  typing.status = "typing";
  typing.countdown = 0;
  await broadcast();
  reportJob();
  try {
    if (engine === "compatibility") {
      const res = await toAgent(tabId, frameId, { type: "agent:type", text, settings });
      if (res?.error) throw new Error(res.error);
      return; // progress continues via agent:progress messages
    }
    await runKeyboard(text, settings);
    typing.status = typing.stop ? "stopped" : "done";
    if (typing.detachReason) typing.error = typing.detachReason;
  } catch (e) {
    typing.status = "error";
    typing.error = String(e?.message || e);
  }
  await broadcast();
  reportJob();
}

async function control(action) {
  if (!typing) return;
  if (typing.engine === "compatibility" && ["typing", "paused"].includes(typing.status)) {
    await toAgent(typing.tabId, typing.frameId, { type: "agent:control", action }).catch(() => {});
  }
  if (action === "pause" && typing.status === "typing") {
    typing.paused = true;
    typing.status = "paused";
  } else if (action === "resume" && typing.status === "paused") {
    typing.paused = false;
    typing.status = "typing";
  } else if (action === "stop") {
    typing.stop = true;
    typing.paused = false;
    if (["countdown", "paused", "typing"].includes(typing.status) && typing.engine === "compatibility") typing.status = "stopped";
  }
  await broadcast();
  reportJob();
}

async function undoTyping() {
  if (!typing) throw new Error("Nothing to undo.");
  if (typing.engine === "compatibility") {
    const r = await toAgent(typing.tabId, typing.frameId, { type: "agent:undo-typing" });
    if (r?.error) throw new Error(r.error);
    return { ok: true, message: "Restored the field to how it was before typing." };
  }
  const target = { tabId: typing.tabId };
  await chrome.debugger.attach(target, "1.3");
  try {
    const mac = navigator.userAgentData?.platform === "macOS" || /Mac/.test(navigator.platform);
    await pressKey(target, "z", "KeyZ", 90, mac ? 4 : 2);
  } finally {
    await chrome.debugger.detach(target).catch(() => {});
  }
  return { ok: true, message: "Sent one Undo (Ctrl+Z). Press again to undo more." };
}

// ------------------------------------------------------------------------------------------------ context menu

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab?.id) return;
  // Must be called synchronously inside the user gesture.
  chrome.sidePanel.open({ tabId: tab.id }).catch(() => {});
  handleMenu(info, tab).catch((e) => chrome.runtime.sendMessage({ type: "panel:error", message: String(e?.message || e) }).catch(() => {}));
});

async function handleMenu(info, tab) {
  const frameId = info.frameId ?? 0;
  let captured = null;
  try {
    await injectAgent(tab.id, frameId);
  } catch {
    /* protected page — fall back to selectionText only */
  }
  if (info.menuItemId === "type-here") {
    captured = await toAgent(tab.id, frameId, { type: "agent:mark-target" }).catch(() => null);
    if (!captured?.ok) throw new Error("TORZ AI could not access that field. Try the Keyboard engine instead.");
    await chrome.storage.session.set({ typeTarget: { tabId: tab.id, frameId, desc: captured.desc } });
    chrome.runtime.sendMessage({ type: "panel:show", view: "typer", engine: "compatibility" }).catch(() => {});
    return;
  }
  captured = await toAgent(tab.id, frameId, { type: "agent:capture" }).catch(() => null);
  const action = String(info.menuItemId).split(":")[1];
  const assist = {
    id: Date.now(),
    action,
    text: (captured?.text || info.selectionText || "").trim(),
    tabId: tab.id,
    frameId,
    editable: !!captured?.editable,
    pageTitle: tab.title || "",
  };
  await chrome.storage.session.set({ assist });
  chrome.runtime.sendMessage({ type: "panel:show", view: "assist" }).catch(() => {});
}

// ------------------------------------------------------------------------------------------------ messages

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    switch (msg?.type) {
      case "bridge:hello":
        if (sender.tab?.id) bridgeTabs.add(sender.tab.id);
        return { version: VERSION, state: publicState() };
      case "bridge:job_ready":
        await chrome.storage.session.set({ lastJobId: msg.jobId });
        chrome.runtime.sendMessage({ type: "job:ready", jobId: msg.jobId }).catch(() => {});
        return { ok: true };
      case "bridge:control":
      case "typer:control":
        await control(msg.action);
        return { ok: true };
      case "panel:get-state": {
        const s = await chrome.storage.session.get(["assist", "typeTarget", "lastJobId"]);
        return { typing: publicState(), ...s, version: VERSION };
      }
      case "typer:start":
        startTyping(msg).catch(async (e) => {
          if (typing) {
            typing.status = "error";
            typing.error = String(e?.message || e);
            await broadcast();
          }
        });
        return { ok: true };
      case "typer:undo":
        return await undoTyping();
      case "typer:reset":
        if (typing && !["typing", "paused", "countdown"].includes(typing.status)) typing = null;
        await broadcast();
        return { ok: true };
      case "agent:progress":
        if (typing && sender.tab?.id === typing.tabId) {
          typing.typed = msg.typed;
          if (msg.status && msg.status !== typing.status) {
            typing.status = msg.status;
            if (msg.error) typing.error = msg.error;
            reportJob();
          }
          await broadcast();
        }
        return { ok: true };
      case "assist:replace": {
        const { assist } = await chrome.storage.session.get("assist");
        if (!assist) throw new Error("The original selection is no longer available.");
        const r = await toAgent(assist.tabId, assist.frameId, { type: "agent:replace", text: msg.text });
        if (r?.error) throw new Error(r.error);
        return r;
      }
      case "assist:undo": {
        const { assist } = await chrome.storage.session.get("assist");
        if (!assist) throw new Error("Nothing to undo.");
        const r = await toAgent(assist.tabId, assist.frameId, { type: "agent:undo-replace" });
        if (r?.error) throw new Error(r.error);
        return r;
      }
      case "assist:clear":
        await chrome.storage.session.remove("assist");
        return { ok: true };
      case "settings:reset-token":
        tokenCache = null;
        return { ok: true };
      default:
        return { error: "Unknown message" };
    }
  })().then(
    (r) => sendResponse(r),
    (e) => sendResponse({ error: String(e?.message || e) }),
  );
  return true;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  bridgeTabs.delete(tabId);
  if (typing && typing.tabId === tabId && ["typing", "paused", "countdown"].includes(typing.status)) {
    typing.stop = true;
    typing.status = "stopped";
    typing.error = "The tab was closed.";
    broadcast();
  }
});

// Hook used by the automated extension tests (e2e/extension.spec.ts). Harmless in normal use.
globalThis.__torz = { startTyping, control, undoTyping, handleMenu, state: publicState };
