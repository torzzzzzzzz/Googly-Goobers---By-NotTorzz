import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { FileText, FileUp, MessageCircleQuestion, NotebookPen, Plus, Send, Trash2, X } from "lucide-react";
import { get, upload } from "../../lib/api";
import { useAIStatus, usePersistentState, useStreamRun, useToolVisit } from "../../lib/hooks";
import { renderMarkdown } from "../../lib/markdown";
import { Badge, Button, Card, cx, EmptyState, IconButton, Modal, Tabs, Textarea, useUi } from "../../components/ui";
import { EngineToggle, ModelBadge, Page, RunError, ToolHeader, WorkingIndicator, type EngineChoice } from "../../components/tool/ToolKit";

interface Src {
  type: "file" | "document" | "note" | "text";
  id?: number;
  text?: string;
  label: string;
}
interface Turn {
  q: string;
  a: string;
  passages: any[];
  meta?: any;
  engine: string;
}

export default function QA() {
  useToolVisit("qa");
  const loc = useLocation() as { state?: { fileId?: number; fileName?: string; text?: string } };
  const ai = useAIStatus();
  const { toast } = useUi();
  const [sources, setSources] = usePersistentState<Src[]>("qa:sources", []);
  const [turns, setTurns] = usePersistentState<Turn[]>("qa:turns", []);
  const [engine, setEngine] = usePersistentState<EngineChoice>("qa:engine", "ai");
  const [question, setQuestion] = useState("");
  const [pick, setPick] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const run = useStreamRun<{ output: string; engine: string }>((r) => {
    setTurns((t) => [...t, { q: pending ?? "", a: r.output, passages: runRef.current.passages ?? [], meta: runRef.current.meta, engine: r.engine }]);
    setPending(null);
  });
  const runRef = useRef(run);
  runRef.current = run;

  useEffect(() => {
    if (loc.state?.fileId) setSources((s) => (s.some((x) => x.type === "file" && x.id === loc.state!.fileId) ? s : [...s, { type: "file", id: loc.state!.fileId, label: loc.state!.fileName ?? "File" }]));
    else if (loc.state?.text) setSources((s) => [...s, { type: "text", text: loc.state!.text, label: "Pasted text" }]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (ai.data && !ai.data.ok && engine === "ai") setEngine("offline");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ai.data?.ok]);
  useEffect(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), [turns.length, run.text]);

  const ask = (q = question, eng: EngineChoice = engine) => {
    if (!q.trim() || !sources.length) return;
    setPending(q);
    setQuestion("");
    run.start("/api/tools/qa", {
      question: q,
      sources: sources.map((s) => ({ type: s.type, id: s.id, text: s.text, label: s.label })),
      history: eng === "ai" ? turns.filter((t) => t.engine === "ai").slice(-4).map((t) => [t.q, t.a]) : [],
      engine: eng,
    });
  };

  const addFile = async (f?: File) => {
    if (!f) return;
    try {
      const r = await upload<any>("/api/files", f);
      setSources((s) => [...s, { type: "file", id: r.id, label: r.filename }]);
    } catch (e) {
      toast((e as Error).message, "bad");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <Page wide>
      <ToolHeader toolId="qa" actions={turns.length > 0 && <Button size="sm" variant="ghost" icon={<Trash2 className="size-4" />} onClick={() => setTurns([])}>Clear conversation</Button>} />
      <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
        <div className="space-y-4">
          <Card className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="label">Sources ({sources.length})</span>
              <div className="flex gap-1">
                <IconButton label="Upload a file" onClick={() => fileRef.current?.click()}><FileUp className="size-4" /></IconButton>
                <IconButton label="Add from library" onClick={() => setPick(true)}><Plus className="size-4" /></IconButton>
              </div>
              <input ref={fileRef} type="file" hidden accept=".pdf,.docx,.txt,.md,.markdown,.png,.jpg,.jpeg" onChange={(e) => addFile(e.target.files?.[0])} />
            </div>
            {sources.length === 0 && <p className="py-4 text-center text-sm text-muted">Add the documents you want to ask about.</p>}
            <div className="space-y-1.5">
              {sources.map((s, i) => (
                <div key={i} className="flex items-center gap-2 rounded-lg border border-line px-2.5 py-2 text-sm">
                  {s.type === "note" ? <NotebookPen className="size-4 shrink-0 text-muted" /> : <FileText className="size-4 shrink-0 text-muted" />}
                  <span className="min-w-0 flex-1 truncate text-ink">{s.label}</span>
                  <button aria-label={`Remove ${s.label}`} onClick={() => setSources(sources.filter((_, j) => j !== i))} className="text-faint hover:text-ink"><X className="size-3.5" /></button>
                </div>
              ))}
            </div>
          </Card>
          <Card className="p-4"><EngineToggle value={engine} onChange={setEngine} /></Card>
        </div>

        <Card className="flex h-[calc(100vh-200px)] min-h-[520px] flex-col overflow-hidden">
          <div className="flex-1 space-y-5 overflow-y-auto p-5">
            {turns.length === 0 && run.status === "idle" && (
              <EmptyState icon={<MessageCircleQuestion />} title="Ask anything about your documents" description="Answers cite the passages they come from, like [1]. If your documents don't contain the answer, TORZ AI will say so." />
            )}
            {turns.map((t, i) => <TurnView key={i} t={t} />)}
            {pending && (
              <div className="space-y-3">
                <Bubble>{pending}</Bubble>
                {run.status === "running" && !run.text && <WorkingIndicator label={engine === "offline" ? "Searching your documents" : "Reading your documents"} />}
                {run.text && run.status === "running" && <div className="prose-torz stream-caret text-[0.95rem]" dangerouslySetInnerHTML={{ __html: renderMarkdown(run.text) }} />}
                {run.status === "error" && run.error && <RunError error={run.error} onRetry={() => ask(pending)} onOffline={() => { setEngine("offline"); ask(pending, "offline"); }} />}
              </div>
            )}
            <div ref={endRef} />
          </div>
          <form onSubmit={(e) => { e.preventDefault(); ask(); }} className="flex items-end gap-2 border-t border-line p-3">
            <Textarea rows={2} value={question} onChange={(e) => setQuestion(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(); } }} placeholder={sources.length ? "Ask a question about your sources…" : "Add a source first"} disabled={!sources.length} className="flex-1" aria-label="Question" />
            <Button type="submit" variant="primary" size="lg" icon={<Send className="size-4" />} loading={run.status === "running"} disabled={!question.trim() || !sources.length}>Ask</Button>
          </form>
        </Card>
      </div>
      <PickSources open={pick} onClose={() => setPick(false)} onAdd={(s) => { setSources((cur) => [...cur, ...s.filter((x) => !cur.some((c) => c.type === x.type && c.id === x.id))]); setPick(false); }} />
    </Page>
  );
}

function Bubble({ children }: { children: React.ReactNode }) {
  return <div className="ml-auto w-fit max-w-[80%] rounded-2xl rounded-br-md bg-accent-soft px-4 py-2.5 text-[0.95rem] text-ink">{children}</div>;
}

function TurnView({ t }: { t: Turn }) {
  const [open, setOpen] = useState<number | null>(null);
  const html = renderMarkdown(t.a).replace(/\[(\d+)\]/g, '<sup class="text-accent font-semibold">[$1]</sup>');
  return (
    <div className="space-y-3">
      <Bubble>{t.q}</Bubble>
      <div>
        <div className="mb-1.5 flex items-center gap-2"><ModelBadge meta={{ ...(t.meta ?? {}), engine: t.engine }} /></div>
        {t.engine === "offline" ? (
          <p className="text-sm text-ink-2">{t.passages.length ? "Most relevant passages from your documents (offline search, no AI model):" : "No passages matched that question."}</p>
        ) : (
          <div className="prose-torz text-[0.95rem]" dangerouslySetInnerHTML={{ __html: html }} />
        )}
        {t.passages.length > 0 && (
          <div className="mt-3 space-y-1.5">
            {t.passages.map((p: any) => (
              <button key={p.n} onClick={() => setOpen(open === p.n ? null : p.n)} className="block w-full rounded-xl border border-line p-3 text-left text-sm transition hover:bg-surface-2">
                <div className="flex items-center gap-2 text-xs text-muted">
                  <Badge tone="accent">[{p.n}]</Badge>
                  <span className="truncate">{p.source}</span>
                </div>
                <div className={cx("mt-1.5 text-ink-2", open === p.n || t.engine === "offline" ? "" : "line-clamp-2")}>{p.text}</div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PickSources({ open, onClose, onAdd }: { open: boolean; onClose: () => void; onAdd: (s: Src[]) => void }) {
  const [tab, setTab] = useState<"files" | "documents" | "notes" | "text">("files");
  const [sel, setSel] = useState<Src[]>([]);
  const [text, setText] = useState("");
  const files = useQuery<any>({ queryKey: ["files"], queryFn: () => get("/api/files"), enabled: open });
  const docs = useQuery<any>({ queryKey: ["documents", "qa"], queryFn: () => get("/api/documents"), enabled: open });
  const notes = useQuery<any>({ queryKey: ["notes", "qa"], queryFn: () => get("/api/notes"), enabled: open });
  const items: Src[] =
    tab === "files" ? (files.data?.files ?? []).map((f: any) => ({ type: "file", id: f.id, label: f.filename }))
    : tab === "documents" ? (docs.data?.documents ?? []).map((d: any) => ({ type: "document", id: d.id, label: d.title }))
    : tab === "notes" ? (notes.data?.notes ?? []).map((n: any) => ({ type: "note", id: n.id, label: n.title }))
    : [];
  const toggle = (s: Src) => setSel((cur) => (cur.some((c) => c.type === s.type && c.id === s.id) ? cur.filter((c) => !(c.type === s.type && c.id === s.id)) : [...cur, s]));
  return (
    <Modal open={open} onClose={onClose} title="Add sources" width="max-w-xl" footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!sel.length && !text.trim()} onClick={() => { onAdd([...sel, ...(text.trim() ? [{ type: "text" as const, text, label: text.slice(0, 40) + "…" }] : [])]); setSel([]); setText(""); }}>Add {sel.length + (text.trim() ? 1 : 0) || ""}</Button></>}>
      <Tabs value={tab} onChange={setTab} tabs={[{ value: "files", label: "Files" }, { value: "documents", label: "Documents" }, { value: "notes", label: "Notes" }, { value: "text", label: "Paste text" }]} />
      <div className="mt-3 max-h-[45vh] space-y-1 overflow-y-auto">
        {tab === "text" ? (
          <Textarea rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste text to ask about" />
        ) : items.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">Nothing here yet.</p>
        ) : (
          items.map((s) => (
            <label key={`${s.type}-${s.id}`} className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 hover:bg-surface-2">
              <input type="checkbox" checked={sel.some((c) => c.type === s.type && c.id === s.id)} onChange={() => toggle(s)} className="accent-[var(--accent)]" />
              <span className="truncate text-sm text-ink">{s.label}</span>
            </label>
          ))
        )}
      </div>
    </Modal>
  );
}
