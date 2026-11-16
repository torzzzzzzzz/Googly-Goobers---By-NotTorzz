// Bridge between the TORZ AI web app (localhost) and the extension.
// Only activates on pages served by TORZ AI (they carry a <meta name="torz-token">).
(() => {
  if (!document.querySelector('meta[name="torz-token"]') && !/TORZ AI/.test(document.title)) return;
  const version = chrome.runtime.getManifest().version;
  document.documentElement.dataset.torzExtension = version;
  const post = (type, data = {}) => window.postMessage({ source: "torz-extension", type, ...data }, window.location.origin);

  chrome.runtime.sendMessage({ type: "bridge:hello" }).then((r) => {
    post("HELLO", { version });
    if (r?.state) post("PROGRESS", { progress: r.state });
  }).catch(() => {});

  window.addEventListener("message", (e) => {
    if (e.source !== window || e.origin !== window.location.origin || e.data?.source !== "torz-app") return;
    const { type } = e.data;
    if (type === "PING") post("HELLO", { version });
    else if (type === "JOB_READY") chrome.runtime.sendMessage({ type: "bridge:job_ready", jobId: e.data.jobId }).catch(() => {});
    else if (type === "CONTROL") chrome.runtime.sendMessage({ type: "bridge:control", action: e.data.action }).catch(() => {});
  });

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === "bridge:progress") post("PROGRESS", { progress: msg.progress });
  });
})();
