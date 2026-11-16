import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Ellipsis, FileUp, Layers, Pencil, Play, Plus, RotateCcw, Trash2 } from "lucide-react";
import { del, downloadFrom, get, patch, post, upload } from "../../lib/api";
import { timeAgo } from "../../lib/format";
import { useAIStatus, usePersistentState, useStreamRun, useToolVisit } from "../../lib/hooks";
import { Badge, Button, Card, EmptyState, Field, IconButton, Input, Menu, Segmented, Skeleton, Tabs, useUi } from "../../components/ui";
import {
  EngineToggle,
  Page,
  RunError,
  SourcePicker,
  sourceBody,
  sourceReady,
  sourceTitle,
  ToolHeader,
  useInitialSource,
  WorkingIndicator,
  type EngineChoice,
  type SourceValue,
} from "../../components/tool/ToolKit";

export default function Flashcards() {
  useToolVisit("flashcards");
  const [tab, setTab] = useState<"create" | "decks">("create");
  const decks = useQuery<{ decks: any[] }>({ queryKey: ["decks"], queryFn: () => get("/api/decks") });
  return (
    <Page wide>
      <ToolHeader toolId="flashcards" />
      <div className="mb-5">
        <Tabs value={tab} onChange={setTab} tabs={[{ value: "create", label: "Create flashcards" }, { value: "decks", label: "My decks", count: decks.data?.decks.length }]} />
      </div>
      {tab === "create" ? <Create /> : <Decks />}
    </Page>
  );
}

function Create() {
  const nav = useNavigate();
  const ai = useAIStatus();
  const qc = useQueryClient();
  const [source, setSource] = usePersistentState<SourceValue>("flash:source", { mode: "text", text: "" });
  const [count, setCount] = usePersistentState("flash:count", 15);
  const [style, setStyle] = usePersistentState<"qa" | "term" | "mixed">("flash:style", "mixed");
  const [engine, setEngine] = usePersistentState<EngineChoice>("flash:engine", "ai");
  const [title, setTitle] = useState("");
  useInitialSource(setSource);
  const { toast } = useUi();
  const run = useStreamRun<{ deck_id: number; count: number; requested: number }>((r) => {
    qc.invalidateQueries({ queryKey: ["decks"] });
    if (r.count < r.requested) toast(`Created ${r.count} of ${r.requested} cards — the rest weren't clearly supported by your material.`, "info");
    nav(`/flashcards/${r.deck_id}`);
  });
  useEffect(() => {
    if (ai.data && !ai.data.ok && engine === "ai") setEngine("offline");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ai.data?.ok]);
  const go = (eng: EngineChoice = engine) => run.start("/api/tools/flashcards", { ...sourceBody(source), count, style, engine: eng, title: title || sourceTitle(source) });

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
      <SourcePicker value={source} onChange={setSource} minHeight="min-h-[380px]" />
      <div className="space-y-4">
        <Card className="space-y-4 p-4">
          <Field label="Deck title (optional)"><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Uses the material's title if empty" /></Field>
          <div>
            <div className="label mb-2">Number of cards</div>
            <div className="flex items-center gap-2">
              <Segmented size="sm" value={String(count)} onChange={(v) => setCount(Number(v))} options={["10", "15", "20", "30", "50"].map((v) => ({ value: v, label: v }))} />
              <Input type="number" min={1} max={200} value={count} onChange={(e) => setCount(Math.max(1, Math.min(200, Number(e.target.value) || 1)))} className="w-20" aria-label="Number of cards" />
            </div>
          </div>
          <div>
            <div className="label mb-2">Card style</div>
            <Segmented size="sm" value={style} onChange={setStyle} options={[{ value: "mixed", label: "Mixed" }, { value: "qa", label: "Question → answer" }, { value: "term", label: "Term → definition" }]} />
          </div>
          <EngineToggle value={engine} onChange={setEngine} />
          <Button variant="primary" size="lg" className="w-full" icon={<Layers className="size-4" />} loading={run.status === "running"} disabled={!sourceReady(source)} onClick={() => go()}>Generate flashcards</Button>
        </Card>
        {run.status === "running" && <Card><WorkingIndicator progress={run.progress} label="Writing flashcards" /></Card>}
        {run.status === "error" && run.error && <RunError error={run.error} onRetry={() => go()} onOffline={() => { setEngine("offline"); go("offline"); }} />}
      </div>
    </div>
  );
}

function Decks() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const { confirm, toast } = useUi();
  const fileRef = useRef<HTMLInputElement>(null);
  const decks = useQuery<{ decks: any[] }>({ queryKey: ["decks"], queryFn: () => get("/api/decks") });
  const refresh = () => qc.invalidateQueries({ queryKey: ["decks"] });

  const importDeck = async (f?: File) => {
    if (!f) return;
    try {
      const d = await upload<any>("/api/decks/import", f);
      refresh();
      toast(`Imported ${d.imported} cards`);
    } catch (e) {
      toast((e as Error).message, "bad");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };
  const newDeck = async () => {
    const t = await confirm({ title: "New deck", input: { label: "Deck title", placeholder: "e.g. Spanish verbs" }, confirmLabel: "Create" });
    if (typeof t === "string") {
      const d = await post("/api/decks", { title: t });
      refresh();
      nav(`/flashcards/${d.id}`, { state: { mode: "edit" } });
    }
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap justify-end gap-2">
        <Button icon={<FileUp className="size-4" />} onClick={() => fileRef.current?.click()}>Import deck</Button>
        <Button icon={<Plus className="size-4" />} onClick={newDeck}>New empty deck</Button>
        <input ref={fileRef} type="file" hidden accept=".json,.csv,.tsv,.txt" onChange={(e) => importDeck(e.target.files?.[0])} />
      </div>
      {decks.isLoading && <div className="grid gap-3 md:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-40" />)}</div>}
      {decks.data?.decks.length === 0 && <Card><EmptyState icon={<Layers />} title="No decks yet" description="Generate flashcards from your material, import a deck (JSON/CSV), or create one by hand." /></Card>}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {decks.data?.decks.map((d) => {
          const pct = d.total ? Math.round((100 * d.known) / d.total) : 0;
          return (
            <Card key={d.id} className="flex flex-col p-5">
              <div className="flex items-start gap-3">
                <Link to={`/flashcards/${d.id}`} className="min-w-0 flex-1">
                  <div className="truncate font-semibold text-ink">{d.title}</div>
                  <div className="mt-0.5 text-xs text-muted">{d.total} cards · {d.last_studied_at ? `studied ${timeAgo(d.last_studied_at)}` : "not studied yet"}</div>
                </Link>
                <Menu
                  trigger={(t) => <IconButton label="Deck options" onClick={t}><Ellipsis className="size-4" /></IconButton>}
                  items={[
                    { label: "Rename", icon: <Pencil />, onClick: async () => { const t = await confirm({ title: "Rename deck", input: { label: "Title", initial: d.title }, confirmLabel: "Save" }); if (typeof t === "string") { await patch(`/api/decks/${d.id}`, { title: t }); refresh(); } } },
                    { label: "Export JSON", icon: <Download />, onClick: () => downloadFrom(`/api/decks/${d.id}/export`, { format: "json" }) },
                    { label: "Export CSV", icon: <Download />, onClick: () => downloadFrom(`/api/decks/${d.id}/export`, { format: "csv" }) },
                    { label: "Export for Anki (TSV)", icon: <Download />, onClick: () => downloadFrom(`/api/decks/${d.id}/export`, { format: "tsv" }) },
                    { label: "Reset progress", icon: <RotateCcw />, onClick: async () => { await post(`/api/decks/${d.id}/reset`); refresh(); } },
                    "divider",
                    { label: "Delete deck", icon: <Trash2 />, danger: true, onClick: async () => { if (await confirm({ title: `Delete “${d.title}”?`, danger: true, confirmLabel: "Delete" })) { await del(`/api/decks/${d.id}`); refresh(); } } },
                  ]}
                />
              </div>
              <div className="mt-4 flex h-2 overflow-hidden rounded-full bg-surface-3" aria-label={`${d.known} known, ${d.difficult} difficult, ${d.new} new`}>
                <div className="bg-good" style={{ width: `${(100 * d.known) / Math.max(1, d.total)}%` }} />
                <div className="bg-warn" style={{ width: `${(100 * d.difficult) / Math.max(1, d.total)}%` }} />
              </div>
              <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted">
                <span><span className="mr-1 inline-block size-2 rounded-full bg-good" />{d.known} known</span>
                <span><span className="mr-1 inline-block size-2 rounded-full bg-warn" />{d.difficult} difficult</span>
                <span><span className="mr-1 inline-block size-2 rounded-full bg-surface-3 ring-1 ring-line-strong" />{d.new} new</span>
                <span className="ml-auto font-medium text-ink-2">{pct}%</span>
              </div>
              <div className="mt-4 flex items-center gap-2">
                {d.engine === "offline" && <Badge>Offline engine</Badge>}
                <Button size="sm" variant="soft" className="ml-auto" icon={<Play className="size-3.5" />} onClick={() => nav(`/flashcards/${d.id}`)}>Study</Button>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
