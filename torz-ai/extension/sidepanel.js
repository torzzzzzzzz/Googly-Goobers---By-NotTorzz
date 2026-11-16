// TORZ AI side panel.
const $ = (id) => document.getElementById(id);
const DEFAULT_BASE = "http://127.0.0.1:8765";
let token = null;
let assistCtrl = null;
let currentAssist = null;
let currentJobId = null;

async function base() {
  const { baseUrl } = await chrome.storage.local.get("baseUrl");
  return (baseUrl || DEFAULT_BASE).replace(/\/$/, "");
}

async function getToken(force = false) {
  if (token && !force) return token;
  const r = await fetch(`${await base()}/api/session`);
  if (!r.ok) throw new Error(`TORZ AI refused the connection (${r.status}).`);
  token = (await r.json()).token;
  return token;
}

async function api(path, init = {}) {
  const t = await getToken();
  const r = await fetch(`${await base()}${path}`, { ...init, headers: { "Content-Type": "application/json", "X-TORZ-Token": t, ...(init.headers || {}) } });
  if (!r.ok) {
    let msg = `Error ${r.status}`;
    try { msg = (await r.json()).detail || msg; } catch { /* not JSON */ }
    throw new Error(msg);
  }
  return r.json();
}

async function stream(path, body, onEvent, signal) {
  const t = await getToken();
  const r = await fetch(`${await base()}${path}`, { method: "POST", headers: { "Content-Type": "application/json", "X-TORZ-Token": t }, body: JSON.stringify(body), signal });
  if (!r.ok || !r.body) {
    let msg = `Error ${r.status}`;
    try { msg = (await r.json()).detail || msg; } catch { /* not JSON */ }
    onEvent({ type: "error", message: msg });
    return;
  }
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const chunk = buf.slice(0, i);
      buf = buf.slice(i + 2);
      for (const line of chunk.split("\n")) if (line.startsWith("data:")) { try { onEvent(JSON.parse(line.slice(5))); } catch { /* skip */ } }
    }
  }
}

const send = (msg) => chrome.runtime.sendMessage(msg);

// ------------------------------------------------------------------------------------------------ connection

async function checkConnection() {
  const el = $("conn");
  try {
    const r = await fetch(`${await base()}/api/health`, { cache: "no-store" });
    const ok = r.ok && (await r.json()).app === "TORZ AI";
    el.className = ok ? "conn ok" : "conn bad";
    el.querySelector("b").textContent = ok ? "Connected" : "Not TORZ AI";
    el.title = ok ? `Connected to ${await base()}` : "Something else is running at that address";
    return ok;
  } catch {
    el.className = "conn bad";
    el.querySelector("b").textContent = "Offline";
    el.title = "Start TORZ AI (START.bat) and try again";
    return false;
  }
}

// ------------------------------------------------------------------------------------------------ tabs

function showTab(name) {
  document.querySelectorAll(".tabs button").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.id === `tab-${name}`));
}
document.querySelectorAll(".tabs button").forEach((b) => b.addEventListener("click", () => showTab(b.dataset.tab)));

// ------------------------------------------------------------------------------------------------ assist

const ACTIONS = {
  improve: { path: "/api/tools/assistant", body: (text) => ({ action: "improve", text }) },
  humanize: { path: "/api/tools/humanize", body: (text) => ({ text, mode: "standard" }) },
  paraphrase: { path: "/api/tools/paraphrase", body: (text) => ({ text, mode: "standard", strength: 3 }) },
  grammar: { path: "/api/tools/assistant", body: (text) => ({ action: "grammar", text }) },
  summarize: { path: "/api/tools/summarize", body: (text) => ({ text, format: "bullets", engine: "ai" }) },
};

function setAssistSource(a) {
  currentAssist = a;
  $("assist-empty").classList.toggle("hidden", !!a);
  $("assist-source").textContent = a ? `From: ${a.pageTitle || "page"}${a.editable ? " (editable — can be replaced)" : " (read-only text)"}` : "";
}

async function runAssist() {
  const text = $("assist-text").value.trim();
  const action = $("assist-action").value;
  if (!text) return;
  $("assist-out").classList.remove("hidden");
  $("assist-msg").textContent = "";
  $("assist-model").textContent = "";
  $("assist-replace").classList.add("hidden");
  $("assist-undo").classList.add("hidden");
  const out = $("assist-result");
  if (action === "send") {
    try {
      const esc = (s) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
      const html = text.split(/\n\s*\n/).map((p) => `<p>${esc(p)}</p>`).join("");
      const d = await api("/api/documents", { method: "POST", body: JSON.stringify({ title: (currentAssist?.pageTitle || "From the web").slice(0, 120), content_html: html }) });
      out.textContent = "Saved as a new document in TORZ AI.";
      chrome.tabs.create({ url: `${await base()}/documents/${d.id}` });
    } catch (e) {
      out.textContent = String(e.message || e);
    }
    return;
  }
  const spec = ACTIONS[action];
  out.textContent = "";
  out.classList.add("streaming");
  $("assist-run").disabled = true;
  $("assist-stop").classList.remove("hidden");
  assistCtrl = new AbortController();
  let finalText = "";
  try {
    await stream(spec.path, spec.body(text), (ev) => {
      if (ev.type === "meta" && ev.model) $("assist-model").textContent = ev.model;
      if (ev.type === "delta") out.textContent += ev.text;
      if (ev.type === "done") finalText = ev.output ?? out.textContent;
      if (ev.type === "error") {
        out.textContent = "";
        $("assist-msg").innerHTML = "";
        $("assist-msg").className = "small error";
        $("assist-msg").textContent = ev.kind === "no_model" || ev.kind === "unavailable" ? `${ev.message} Open TORZ AI → Settings → AI models.` : ev.message;
      }
    }, assistCtrl.signal);
  } catch (e) {
    if (e.name !== "AbortError") $("assist-msg").textContent = String(e.message || e);
  }
  out.classList.remove("streaming");
  $("assist-run").disabled = false;
  $("assist-stop").classList.add("hidden");
  if (finalText) {
    out.textContent = finalText;
    $("assist-msg").className = "small muted";
    if (currentAssist?.editable && currentAssist.text === text && action !== "summarize") {
      $("assist-replace").classList.remove("hidden");
      $("assist-msg").textContent = "Review the result, then press Replace selection to put it into the page.";
    }
  }
}

$("assist-run").addEventListener("click", runAssist);
$("assist-stop").addEventListener("click", () => assistCtrl?.abort());
$("assist-copy").addEventListener("click", async () => {
  await navigator.clipboard.writeText($("assist-result").textContent);
  $("assist-msg").textContent = "Copied.";
});
$("assist-replace").addEventListener("click", async () => {
  const r = await send({ type: "assist:replace", text: $("assist-result").textContent });
  if (r?.error) {
    $("assist-msg").className = "small error";
    $("assist-msg").textContent = r.error;
    return;
  }
  $("assist-replace").classList.add("hidden");
  $("assist-undo").classList.remove("hidden");
  $("assist-msg").className = "small muted";
  $("assist-msg").textContent = "Replaced. You can undo it here or with Ctrl+Z in the page.";
});
$("assist-undo").addEventListener("click", async () => {
  const r = await send({ type: "assist:undo" });
  $("assist-msg").textContent = r?.error || "Restored the original text.";
  $("assist-undo").classList.add("hidden");
});

async function loadAssist() {
  const st = await send({ type: "panel:get-state" });
  if (st?.assist && st.assist.id !== currentAssist?.id) {
    setAssistSource(st.assist);
    $("assist-text").value = st.assist.text;
    $("assist-action").value = st.assist.action;
    showTab("assist");
    if (st.assist.text) runAssist();
  }
}

// ------------------------------------------------------------------------------------------------ autotyper

const ENGINE_HELP = {
  keyboard: "Click into your document where the text should go, then press Start. You get a 3-second countdown to click back into the page. Chrome shows a “started debugging” banner while typing — that's how TORZ AI sends real keystrokes.",
  compatibility: "Right-click inside the target field and choose TORZ AI → “Type prepared text here”, then press Start. Works in normal text boxes and many web editors (not Google Docs).",
};

function updatePreview() {
  const t = $("typer-text").value;
  $("typer-preview-text").textContent = t ? t.slice(0, 600) + (t.length > 600 ? "…" : "") : "Nothing to type yet.";
  const words = (t.match(/\S+/g) || []).length;
  const wpm = Number($("typer-wpm").value);
  $("typer-meta").textContent = t ? `${words.toLocaleString()} words · about ${Math.max(1, Math.round(words / wpm))} min at ${wpm} WPM` : "";
}

async function loadJob() {
  try {
    const { job } = await api("/api/autotyper/jobs/latest");
    if (!job) {
      $("typer-meta").textContent = "No prepared text in TORZ AI yet. Open TORZ AI → AutoTyper → Send to extension, or paste text above.";
      return;
    }
    currentJobId = job.id;
    $("typer-text").value = job.text;
    $("typer-wpm").value = job.settings?.wpm ?? 70;
    $("wpm-label").textContent = $("typer-wpm").value;
    $("typer-natural").checked = job.settings?.natural_rhythm !== false;
    $("typer-punct").checked = job.settings?.pause_on_punctuation !== false;
    updatePreview();
    $("typer-meta").textContent = `“${job.title}” from TORZ AI · ` + $("typer-meta").textContent;
  } catch (e) {
    $("typer-meta").textContent = `Could not load from TORZ AI: ${e.message || e}`;
  }
}

function renderTyping(s) {
  const box = $("typer-status");
  if (!s) {
    box.classList.add("hidden");
    $("typer-start").disabled = false;
    return;
  }
  box.classList.remove("hidden");
  const active = ["typing", "paused", "countdown"].includes(s.status);
  $("typer-start").disabled = active;
  const labels = { countdown: `Starting in ${s.countdown}… click into your document`, typing: "Typing…", paused: "Paused", done: "Done", stopped: "Stopped", error: "Error" };
  $("typer-state").textContent = labels[s.status] || s.status;
  $("typer-count").textContent = `${(s.typed || 0).toLocaleString()} / ${(s.total || 0).toLocaleString()}`;
  $("typer-bar").style.width = `${(100 * (s.typed || 0)) / Math.max(1, s.total || 1)}%`;
  $("typer-target").textContent = s.target ? `Target: ${s.target}` : "";
  $("typer-error").textContent = s.error || "";
  $("typer-pause").classList.toggle("hidden", s.status !== "typing");
  $("typer-resume").classList.toggle("hidden", s.status !== "paused");
  $("typer-stop").classList.toggle("hidden", !active);
  $("typer-undo").classList.toggle("hidden", active || !(s.typed > 0));
  $("typer-new").classList.toggle("hidden", active);
}

$("typer-text").addEventListener("input", updatePreview);
$("typer-wpm").addEventListener("input", () => { $("wpm-label").textContent = $("typer-wpm").value; updatePreview(); });
$("typer-engine").addEventListener("change", () => { $("engine-help").textContent = ENGINE_HELP[$("typer-engine").value]; });
$("typer-load").addEventListener("click", () => loadJob());
$("typer-start").addEventListener("click", async () => {
  const text = $("typer-text").value;
  if (!text.trim()) return;
  const r = await send({
    type: "typer:start",
    text,
    jobId: currentJobId,
    engine: $("typer-engine").value,
    settings: { wpm: Number($("typer-wpm").value), natural_rhythm: $("typer-natural").checked, pause_on_punctuation: $("typer-punct").checked },
    countdown: 3,
  });
  if (r?.error) $("typer-error").textContent = r.error;
});
$("typer-pause").addEventListener("click", () => send({ type: "typer:control", action: "pause" }));
$("typer-resume").addEventListener("click", () => send({ type: "typer:control", action: "resume" }));
$("typer-stop").addEventListener("click", () => send({ type: "typer:control", action: "stop" }));
$("typer-undo").addEventListener("click", async () => {
  const r = await send({ type: "typer:undo" });
  $("typer-error").textContent = r?.error || "";
  if (r?.message) $("typer-target").textContent = r.message;
});
$("typer-new").addEventListener("click", async () => { await send({ type: "typer:reset" }); renderTyping(null); });

// ------------------------------------------------------------------------------------------------ settings

$("save-base").addEventListener("click", async () => {
  const v = $("base-url").value.trim().replace(/\/$/, "");
  if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(v)) {
    $("settings-msg").textContent = "Use a local address such as http://127.0.0.1:8765";
    return;
  }
  await chrome.storage.local.set({ baseUrl: v });
  token = null;
  await send({ type: "settings:reset-token" });
  $("settings-msg").textContent = (await checkConnection()) ? "Connected." : "Could not reach TORZ AI at that address.";
});
$("open-app").addEventListener("click", async () => chrome.tabs.create({ url: `${await base()}/` }));

// ------------------------------------------------------------------------------------------------ messages + init

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "typer:state") renderTyping(msg.state);
  if (msg?.type === "panel:show") {
    if (msg.view === "assist") loadAssist();
    if (msg.view === "typer") {
      showTab("typer");
      if (msg.engine) {
        $("typer-engine").value = msg.engine;
        $("engine-help").textContent = ENGINE_HELP[msg.engine] + " ✓ Field selected.";
      }
    }
  }
  if (msg?.type === "job:ready") {
    loadJob();
    showTab("typer");
  }
  if (msg?.type === "panel:error") $("assist-msg").textContent = msg.message;
});

(async () => {
  const { baseUrl } = await chrome.storage.local.get("baseUrl");
  $("base-url").value = baseUrl || DEFAULT_BASE;
  $("version").textContent = `Extension version ${chrome.runtime.getManifest().version}`;
  $("engine-help").textContent = ENGINE_HELP.keyboard;
  updatePreview();
  const ok = await checkConnection();
  setInterval(checkConnection, 15000);
  const st = await send({ type: "panel:get-state" });
  renderTyping(st?.typing);
  if (st?.assist) await loadAssist();
  else if (ok) {
    await loadJob();
    if (st?.lastJobId) showTab("typer");
  }
  if (st?.typeTarget) $("engine-help").textContent = ENGINE_HELP.keyboard;
})();
