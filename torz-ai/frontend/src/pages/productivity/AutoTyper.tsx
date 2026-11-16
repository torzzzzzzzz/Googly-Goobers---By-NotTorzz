import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Puzzle,
  CircleCheck,
  ExternalLink,
  FileText,
  Keyboard,
  Pause,
  Play,
  Plug,
  RotateCcw,
  Search,
  Square,
  Undo2,
} from "lucide-react";
import { get, post } from "../../lib/api";
import { countWords, formatDuration, timeAgo } from "../../lib/format";
import { usePersistentState, useToolVisit } from "../../lib/hooks";
import { htmlToText } from "../../lib/markdown";
import { Alert, Badge, Button, Card, cx, Input, Modal, ProgressBar, Segmented, Slider, Switch, Tabs, Textarea, useUi } from "../../components/ui";
import { Page, ToolHeader } from "../../components/tool/ToolKit";

// ------------------------------------------------------------------------------------------------ extension bridge

interface ExtState {
  installed: boolean;
  version?: string;
  progress?: { jobId?: number; status: string; typed: number; total: number; target?: string; error?: string };
}

function useExtensionBridge() {
  const [state, setState] = useState<ExtState>({ installed: !!document.documentElement.dataset.torzExtension, version: document.documentElement.dataset.torzExtension });
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.source !== window || e.data?.source !== "torz-extension") return;
      if (e.data.type === "HELLO") setState((s) => ({ ...s, installed: true, version: e.data.version }));
      if (e.data.type === "PROGRESS") setState((s) => ({ ...s, installed: true, progress: e.data.progress }));
    };
    window.addEventListener("message", onMsg);
    window.postMessage({ source: "torz-app", type: "PING" }, window.location.origin);
    const t = setInterval(() => !document.documentElement.dataset.torzExtension && window.postMessage({ source: "torz-app", type: "PING" }, window.location.origin), 3000);
    return () => {
      window.removeEventListener("message", onMsg);
      clearInterval(t);
    };
  }, []);
  const send = (type: string, payload: Record<string, unknown> = {}) => window.postMessage({ source: "torz-app", type, ...payload }, window.location.origin);
  return { ...state, send };
}

// ------------------------------------------------------------------------------------------------ page

export default function AutoTyper() {
  useToolVisit("autotyper");
  const loc = useLocation() as { state?: { text?: string; title?: string } };
  const [text, setText] = usePersistentState("autotyper:text", "");
  const [title, setTitle] = usePersistentState("autotyper:title", "");
  const [wpm, setWpm] = usePersistentState("autotyper:wpm", 70);
  const [natural, setNatural] = usePersistentState("autotyper:natural", true);
  const [pausePunct, setPausePunct] = usePersistentState("autotyper:punct", true);
  const [target, setTarget] = usePersistentState<"extension" | "gdocs">("autotyper:target", "extension");
  const [pickOpen, setPickOpen] = useState(false);

  useEffect(() => {
    if (loc.state?.text) {
      setText(loc.state.text);
      setTitle(loc.state.title ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const words = countWords(text);
  const minutes = words / Math.max(1, wpm);

  return (
    <Page wide>
      <ToolHeader toolId="autotyper" />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-4">
          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5">
              <span className="label">Text to type</span>
              <div className="flex gap-1.5">
                <Button size="sm" variant="ghost" icon={<FileText className="size-3.5" />} onClick={() => setPickOpen(true)}>Choose from TORZ AI</Button>
              </div>
            </div>
            <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste text, or choose a document, note or result from TORZ AI…" className="min-h-[300px] rounded-none border-0 bg-transparent px-4 focus:ring-0" aria-label="Text to type" />
            <div className="flex flex-wrap gap-x-4 border-t border-line px-4 py-2 text-xs text-muted">
              <span>{words.toLocaleString()} words · {text.length.toLocaleString()} characters</span>
              <span>About {formatDuration(minutes * 60)} at {wpm} WPM</span>
            </div>
          </Card>

          <Card className="space-y-5 p-5">
            <div>
              <div className="label mb-3">Typing speed: {wpm} words per minute</div>
              <Slider value={wpm} onChange={setWpm} min={20} max={240} step={5} labels={["20", "Slow", "Average", "Fast", "240"]} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Switch checked={natural} onChange={setNatural} label="Natural rhythm" description="Small random variation between keystrokes" />
              <Switch checked={pausePunct} onChange={setPausePunct} label="Pause after punctuation" description="Brief pauses after sentences and lines" />
            </div>
          </Card>

          <TypingPreview text={text} wpm={wpm} natural={natural} pausePunct={pausePunct} />
        </div>

        <div className="space-y-4">
          <Card className="p-4">
            <div className="label mb-2">Where to type</div>
            <Segmented value={target} onChange={setTarget} options={[{ value: "extension", label: "Any website (extension)" }, { value: "gdocs", label: "Google Docs API" }]} />
          </Card>
          {target === "extension" ? (
            <ExtensionTarget text={text} title={title} wpm={wpm} natural={natural} pausePunct={pausePunct} />
          ) : (
            <GoogleDocsTarget text={text} wpm={wpm} />
          )}
          <Alert tone="info" title="You stay in control">
            Typing only starts when you press Start, only into the document you choose, and you can pause or stop at any moment.
          </Alert>
        </div>
      </div>
      <PickTextModal open={pickOpen} onClose={() => setPickOpen(false)} onPick={(t, ti) => { setText(t); setTitle(ti); setPickOpen(false); }} />
    </Page>
  );
}

// ------------------------------------------------------------------------------------------------ preview

function delayFor(ch: string, wpm: number, natural: boolean, pausePunct: boolean): number {
  const base = 60000 / (wpm * 5);
  let d = natural ? base * (0.55 + Math.random() * 0.9) : base;
  if (pausePunct && /[.!?]/.test(ch)) d += base * 4;
  else if (pausePunct && /[,;:]/.test(ch)) d += base * 1.5;
  if (ch === "\n") d += base * 3;
  return d;
}

function TypingPreview({ text, wpm, natural, pausePunct }: { text: string; wpm: number; natural: boolean; pausePunct: boolean }) {
  const [pos, setPos] = useState(0);
  const [state, setState] = useState<"idle" | "running" | "paused">("idle");
  const timer = useRef<number | null>(null);
  const sample = text.slice(0, 1500);

  useEffect(() => {
    if (state !== "running") return;
    if (pos >= sample.length) {
      setState("idle");
      return;
    }
    timer.current = window.setTimeout(() => setPos((p) => p + 1), delayFor(sample[pos], wpm, natural, pausePunct));
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [state, pos, sample, wpm, natural, pausePunct]);

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <span className="label">Preview (in TORZ AI only)</span>
        <div className="flex gap-1.5">
          {state === "running" ? (
            <Button size="sm" icon={<Pause className="size-3.5" />} onClick={() => setState("paused")}>Pause</Button>
          ) : (
            <Button size="sm" icon={<Play className="size-3.5" />} disabled={!text} onClick={() => { if (pos >= sample.length) setPos(0); setState("running"); }}>{state === "paused" ? "Resume" : "Preview"}</Button>
          )}
          <Button size="sm" variant="ghost" icon={<RotateCcw className="size-3.5" />} onClick={() => { setState("idle"); setPos(0); }}>Reset</Button>
        </div>
      </div>
      <div className="min-h-[120px] whitespace-pre-wrap px-4 py-3 text-[0.92rem] leading-relaxed text-ink">
        {pos === 0 && state === "idle" ? <span className="text-faint">Press Preview to see how typing will look at this speed (first 1,500 characters).</span> : <span className={cx(state === "running" && "stream-caret")}>{sample.slice(0, pos)}</span>}
      </div>
    </Card>
  );
}

// ------------------------------------------------------------------------------------------------ extension target

function ExtensionTarget({ text, title, wpm, natural, pausePunct }: { text: string; title: string; wpm: number; natural: boolean; pausePunct: boolean }) {
  const ext = useExtensionBridge();
  const { toast } = useUi();
  const [jobId, setJobId] = useState<number | null>(null);
  const p = ext.progress;
  const active = p && (!jobId || p.jobId === jobId);

  const send = async () => {
    try {
      const job = await post<{ id: number }>("/api/autotyper/jobs", { title: title || text.slice(0, 50), text, wpm, natural_rhythm: natural, pause_on_punctuation: pausePunct });
      setJobId(job.id);
      ext.send("JOB_READY", { jobId: job.id });
      toast("Sent to the TORZ AI extension");
    } catch (e) {
      toast((e as Error).message, "bad");
    }
  };

  return (
    <Card className="space-y-4 p-5">
      <div className="flex items-center gap-3">
        <div className={cx("grid size-10 place-items-center rounded-xl", ext.installed ? "bg-good/10 text-good" : "bg-surface-3 text-muted")}><Puzzle className="size-5" /></div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-ink">TORZ AI browser extension</div>
          <div className="text-xs text-muted">{ext.installed ? `Connected · v${ext.version}` : "Not detected in this browser"}</div>
        </div>
        {ext.installed ? <Badge tone="good">Ready</Badge> : <Badge tone="warn">Install</Badge>}
      </div>
      {!ext.installed && (
        <div className="rounded-xl border border-line bg-bg-2 p-3 text-sm text-ink-2">
          <div className="mb-1.5 font-medium text-ink">Install once (about a minute)</div>
          <ol className="list-decimal space-y-1 pl-5 text-xs text-muted">
            <li>Open <code className="text-ink-2">chrome://extensions</code> (or <code className="text-ink-2">edge://extensions</code>).</li>
            <li>Turn on <span className="text-ink-2">Developer mode</span>.</li>
            <li>Click <span className="text-ink-2">Load unpacked</span> and choose the <code className="text-ink-2">torz-ai\extension</code> folder.</li>
            <li>Reload this page.</li>
          </ol>
        </div>
      )}
      <ol className="space-y-2 text-sm text-ink-2">
        <li className="flex gap-2.5"><Step n={1} />Press <b className="text-ink">Send to extension</b>.</li>
        <li className="flex gap-2.5"><Step n={2} />Open your document (Google Docs, a web form, an online editor) and click where the text should go.</li>
        <li className="flex gap-2.5"><Step n={3} />Click the TORZ AI icon in the toolbar to open the side panel, check the preview, and press <b className="text-ink">Start typing</b>.</li>
      </ol>
      <Button variant="primary" className="w-full" size="lg" icon={<Keyboard className="size-4" />} disabled={!text.trim()} onClick={send}>
        Send to extension
      </Button>
      {jobId && !active && <p className="text-center text-xs text-muted">Job #{jobId} is ready in the extension.</p>}
      {active && p && (
        <div className="rounded-xl border border-line p-3">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="font-medium capitalize text-ink">{p.status}</span>
            <span className="text-xs text-muted">{p.typed.toLocaleString()} / {p.total.toLocaleString()} characters</span>
          </div>
          <ProgressBar value={(100 * p.typed) / Math.max(1, p.total)} />
          {p.target && <div className="mt-2 truncate text-xs text-muted">Target: {p.target}</div>}
          {p.error && <div className="mt-2 text-xs text-bad">{p.error}</div>}
          {ext.installed && (p.status === "typing" || p.status === "paused") && (
            <div className="mt-3 flex gap-2">
              {p.status === "typing" ? <Button size="sm" icon={<Pause className="size-3.5" />} onClick={() => ext.send("CONTROL", { action: "pause" })}>Pause</Button> : <Button size="sm" icon={<Play className="size-3.5" />} onClick={() => ext.send("CONTROL", { action: "resume" })}>Resume</Button>}
              <Button size="sm" variant="danger" icon={<Square className="size-3" />} onClick={() => ext.send("CONTROL", { action: "stop" })}>Stop</Button>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

const Step = ({ n }: { n: number }) => <span className="grid size-5 shrink-0 place-items-center rounded-full bg-accent-soft text-[0.7rem] font-bold text-accent">{n}</span>;

// ------------------------------------------------------------------------------------------------ Google Docs API target

function GoogleDocsTarget({ text, wpm }: { text: string; wpm: number }) {
  const qc = useQueryClient();
  const { toast } = useUi();
  const status = useQuery<any>({ queryKey: ["gdocs-status"], queryFn: () => get("/api/gdocs/status"), refetchInterval: (q) => (q.state.data?.connected ? false : 4000) });
  const [clientJson, setClientJson] = useState("");
  const [search, setSearch] = useState("");
  const [docId, setDocId] = useState<string | null>(null);
  const [job, setJob] = useState<any>(null);
  const docs = useQuery<{ documents: any[] }>({ queryKey: ["gdocs-docs", search], queryFn: () => get("/api/gdocs/documents", { q: search }), enabled: !!status.data?.connected, retry: false });

  useEffect(() => {
    if (!job || !["running", "pending", "paused"].includes(job.status)) return;
    const t = setInterval(async () => setJob(await get(`/api/gdocs/jobs/${job.id}`)), 1000);
    return () => clearInterval(t);
  }, [job]);

  const act = async (action: string) => {
    try {
      setJob(await post(`/api/gdocs/jobs/${job.id}/${action}`));
    } catch (e) {
      toast((e as Error).message, "bad");
    }
  };

  const s = status.data;
  if (!s) return <Card className="p-5"><ProgressBar value={0} indeterminate /></Card>;

  if (!s.client_configured)
    return (
      <Card className="space-y-3 p-5">
        <div className="font-semibold text-ink">Connect Google Docs (one-time setup, free)</div>
        <ol className="list-decimal space-y-1.5 pl-5 text-xs text-muted">
          <li>Go to <a className="text-accent underline" href="https://console.cloud.google.com/" target="_blank" rel="noreferrer">Google Cloud Console</a>, create a project.</li>
          <li>Enable the <b className="text-ink-2">Google Docs API</b> and <b className="text-ink-2">Google Drive API</b>.</li>
          <li>OAuth consent screen: User type <b className="text-ink-2">External</b>, add yourself as a <b className="text-ink-2">test user</b>.</li>
          <li>Credentials → Create OAuth client ID → Application type <b className="text-ink-2">Desktop app</b>. Download the JSON.</li>
          <li>Paste the JSON below.</li>
        </ol>
        <Textarea rows={4} value={clientJson} onChange={(e) => setClientJson(e.target.value)} placeholder='{"installed":{"client_id":"…apps.googleusercontent.com", …}}' className="font-mono text-xs" />
        <Button variant="primary" disabled={clientJson.trim().length < 20} onClick={async () => { try { await post("/api/gdocs/client", { client_json: clientJson }); setClientJson(""); qc.invalidateQueries({ queryKey: ["gdocs-status"] }); } catch (e) { toast((e as Error).message, "bad"); } }}>Save client</Button>
        <p className="text-xs text-faint">Stored in your OS keychain / encrypted local storage. Tokens never leave this computer except to Google.</p>
      </Card>
    );

  if (!s.connected)
    return (
      <Card className="space-y-3 p-5">
        <div className="font-semibold text-ink">Sign in with Google</div>
        <p className="text-sm text-muted">TORZ AI will ask for permission to edit your Google Docs and see their names. Nothing is changed until you start typing.</p>
        <Button variant="primary" icon={<ExternalLink className="size-4" />} onClick={async () => { const r = await get("/api/gdocs/auth-url"); window.open(r.url, "_blank", "noopener"); }}>Connect Google account</Button>
        <p className="text-xs text-faint">Apps in Google's testing mode must reconnect every 7 days.</p>
        <Button size="sm" variant="ghost" onClick={async () => { await post("/api/gdocs/disconnect?forget_client=true"); qc.invalidateQueries({ queryKey: ["gdocs-status"] }); }}>Use a different OAuth client</Button>
      </Card>
    );

  const running = job && ["running", "pending", "paused"].includes(job.status);
  return (
    <Card className="space-y-4 p-5">
      <div className="flex items-center gap-2">
        <CircleCheck className="size-4 text-good" />
        <span className="text-sm font-semibold text-ink">Google account connected</span>
        <Button size="sm" variant="ghost" className="ml-auto" icon={<Plug className="size-3.5" />} onClick={async () => { await post("/api/gdocs/disconnect"); qc.invalidateQueries({ queryKey: ["gdocs-status"] }); }}>Disconnect</Button>
      </div>
      {!running && (
        <>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search your Google Docs" className="pl-9" />
          </div>
          <div className="max-h-56 space-y-1 overflow-y-auto">
            {docs.isError && <Alert tone="bad">{(docs.error as Error).message}</Alert>}
            {docs.data?.documents.map((d) => (
              <button key={d.id} onClick={() => setDocId(d.id)} className={cx("flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm", docId === d.id ? "border-accent/40 bg-accent-soft" : "border-transparent hover:bg-surface-2")}>
                <FileText className="size-4 shrink-0 text-accent" />
                <span className="min-w-0 flex-1 truncate">{d.name}</span>
                <span className="text-xs text-faint">{timeAgo(d.modifiedTime)}</span>
              </button>
            ))}
          </div>
          <p className="text-xs text-muted">Text is added at the end of the document in short bursts (Google allows about one edit per second).</p>
          <Button variant="primary" className="w-full" size="lg" icon={<Keyboard className="size-4" />} disabled={!docId || !text.trim()} onClick={async () => { try { setJob(await post("/api/gdocs/jobs", { doc_id: docId, text, wpm })); } catch (e) { toast((e as Error).message, "bad"); } }}>
            Start typing into Google Docs
          </Button>
        </>
      )}
      {job && (
        <div className="rounded-xl border border-line p-3">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="font-medium capitalize text-ink">{job.status}{job.doc_title ? ` · ${job.doc_title}` : ""}</span>
            <span className="text-xs text-muted">{Math.round(job.progress * 100)}%</span>
          </div>
          <ProgressBar value={job.progress * 100} />
          {job.error && <div className="mt-2 text-xs text-bad">{job.error}</div>}
          <div className="mt-3 flex flex-wrap gap-2">
            {job.status === "running" && <Button size="sm" icon={<Pause className="size-3.5" />} onClick={() => act("pause")}>Pause</Button>}
            {job.status === "paused" && <Button size="sm" icon={<Play className="size-3.5" />} onClick={() => act("resume")}>Resume</Button>}
            {running && <Button size="sm" variant="danger" icon={<Square className="size-3" />} onClick={() => act("stop")}>Stop</Button>}
            {job.can_undo && <Button size="sm" icon={<Undo2 className="size-3.5" />} onClick={() => act("undo")}>Undo insertion</Button>}
            {!running && <Button size="sm" variant="ghost" onClick={() => setJob(null)}>New job</Button>}
            <a href={`https://docs.google.com/document/d/${job.doc_id}/edit`} target="_blank" rel="noreferrer" className="ml-auto"><Button size="sm" variant="ghost" icon={<ExternalLink className="size-3.5" />}>Open doc</Button></a>
          </div>
        </div>
      )}
    </Card>
  );
}

// ------------------------------------------------------------------------------------------------ picker

function PickTextModal({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (text: string, title: string) => void }) {
  const [tab, setTab] = useState<"documents" | "notes" | "history">("documents");
  const docs = useQuery<any>({ queryKey: ["documents", "pick"], queryFn: () => get("/api/documents"), enabled: open && tab === "documents" });
  const notes = useQuery<any>({ queryKey: ["notes", "pick"], queryFn: () => get("/api/notes"), enabled: open && tab === "notes" });
  const hist = useQuery<any>({ queryKey: ["history", "pick"], queryFn: () => get("/api/history", { limit: 40 }), enabled: open && tab === "history" });
  const items = useMemo(() => {
    if (tab === "documents") return (docs.data?.documents ?? []).map((d: any) => ({ id: d.id, title: d.title, sub: `${d.word_count} words`, load: async () => (await get(`/api/documents/${d.id}`)).content_text }));
    if (tab === "notes") return (notes.data?.notes ?? []).map((n: any) => ({ id: n.id, title: n.title, sub: timeAgo(n.updated_at), load: async () => htmlToText((await get(`/api/notes/${n.id}`)).content_html) }));
    return (hist.data?.entries ?? []).filter((h: any) => h.words_out > 0).map((h: any) => ({ id: h.id, title: h.title, sub: `${h.tool} · ${timeAgo(h.created_at)}`, load: async () => (await get(`/api/history/${h.id}`)).output_text }));
  }, [tab, docs.data, notes.data, hist.data]);
  return (
    <Modal open={open} onClose={onClose} title="Choose text from TORZ AI" width="max-w-xl">
      <Tabs value={tab} onChange={setTab} tabs={[{ value: "documents", label: "Documents" }, { value: "notes", label: "Notes" }, { value: "history", label: "Results" }]} />
      <div className="mt-3 max-h-[50vh] space-y-1 overflow-y-auto">
        {items.length === 0 && <p className="py-8 text-center text-sm text-muted">Nothing here yet.</p>}
        {items.map((it: any) => (
          <button key={it.id} onClick={async () => onPick(await it.load(), it.title)} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-surface-2">
            <span className="min-w-0 flex-1 truncate text-sm text-ink">{it.title}</span>
            <span className="text-xs text-faint">{it.sub}</span>
          </button>
        ))}
      </div>
    </Modal>
  );
}
