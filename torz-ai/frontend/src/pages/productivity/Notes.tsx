import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { NotebookPen, Pin, Plus, Search, Trash2 } from "lucide-react";
import { del, get, patch, post } from "../../lib/api";
import { timeAgo } from "../../lib/format";
import { useAIStatus, usePersistentState, useStreamRun, useToolVisit } from "../../lib/hooks";
import { Badge, Button, Card, cx, EmptyState, IconButton, Input, Segmented, Skeleton, Tabs, useUi } from "../../components/ui";
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

export default function Notes() {
  useToolVisit("notes");
  const loc = useLocation() as { state?: { fileId?: number; fileName?: string; tab?: string } };
  const [tab, setTab] = useState<"generate" | "library">(loc.state?.tab === "library" ? "library" : "generate");
  const notes = useQuery<{ notes: any[]; tags: string[] }>({ queryKey: ["notes"], queryFn: () => get("/api/notes") });
  return (
    <Page wide>
      <ToolHeader toolId="notes" />
      <div className="mb-5">
        <Tabs value={tab} onChange={setTab} tabs={[{ value: "generate", label: "Generate notes" }, { value: "library", label: "Notes library", count: notes.data?.notes.length }]} />
      </div>
      {tab === "generate" ? <Generate /> : <Library />}
    </Page>
  );
}

function Generate() {
  const nav = useNavigate();
  const ai = useAIStatus();
  const qc = useQueryClient();
  const [source, setSource] = usePersistentState<SourceValue>("notes:source", { mode: "text", text: "" });
  const [detail, setDetail] = usePersistentState<"brief" | "standard" | "detailed">("notes:detail", "standard");
  const [engine, setEngine] = usePersistentState<EngineChoice>("notes:engine", "ai");
  const run = useStreamRun<{ note_id: number }>((r) => {
    qc.invalidateQueries({ queryKey: ["notes"] });
    nav(`/notes/${r.note_id}`);
  });
  useInitialSource(setSource);
  useEffect(() => {
    if (ai.data && !ai.data.ok && engine === "ai") setEngine("offline");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ai.data?.ok]);
  const go = (eng: EngineChoice = engine) => run.start("/api/tools/notes", { ...sourceBody(source), detail, engine: eng, title: sourceTitle(source) });

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
      <SourcePicker value={source} onChange={setSource} minHeight="min-h-[360px]" />
      <div className="space-y-4">
        <Card className="space-y-4 p-4">
          <div>
            <div className="label mb-2">Detail</div>
            <Segmented value={detail} onChange={setDetail} options={[{ value: "brief", label: "Brief" }, { value: "standard", label: "Standard" }, { value: "detailed", label: "Detailed" }]} />
          </div>
          <EngineToggle value={engine} onChange={setEngine} />
          <div className="rounded-xl border border-line bg-bg-2 p-3 text-xs text-muted">
            Notes include: main topic, overview, key concepts, definitions, key information, dates, people, examples, arguments and things to remember. You can edit everything afterwards.
          </div>
          <Button variant="primary" size="lg" className="w-full" icon={<NotebookPen className="size-4" />} loading={run.status === "running"} disabled={!sourceReady(source)} onClick={() => go()}>
            Generate notes
          </Button>
        </Card>
        {run.status === "running" && <Card><WorkingIndicator progress={run.progress} label="Writing notes" /></Card>}
        {run.status === "error" && run.error && <RunError error={run.error} onRetry={() => go()} onOffline={() => { setEngine("offline"); go("offline"); }} />}
      </div>
    </div>
  );
}

function Library() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const { confirm, toast } = useUi();
  const [q, setQ] = useState("");
  const [tag, setTag] = useState("");
  const notes = useQuery<{ notes: any[]; tags: string[] }>({ queryKey: ["notes", q, tag], queryFn: () => get("/api/notes", { q, tag }) });

  const create = async () => {
    const n = await post<{ id: number }>("/api/notes", { title: "Untitled note", content_html: "" });
    qc.invalidateQueries({ queryKey: ["notes"] });
    nav(`/notes/${n.id}`);
  };
  const remove = async (n: any) => {
    if (!(await confirm({ title: `Delete “${n.title}”?`, message: "This note will be permanently deleted.", danger: true, confirmLabel: "Delete" }))) return;
    await del(`/api/notes/${n.id}`);
    qc.invalidateQueries({ queryKey: ["notes"] });
    toast("Note deleted");
  };
  const togglePin = async (n: any) => {
    await patch(`/api/notes/${n.id}`, { pinned: !n.pinned });
    qc.invalidateQueries({ queryKey: ["notes"] });
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search notes" className="pl-9" aria-label="Search notes" />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(notes.data?.tags ?? []).map((t) => (
            <button key={t} onClick={() => setTag(tag === t ? "" : t)} className={cx("rounded-full border px-2.5 py-1 text-xs", tag === t ? "border-accent/40 bg-accent-soft text-ink" : "border-line text-muted hover:text-ink")}>#{t}</button>
          ))}
        </div>
        <Button className="ml-auto" icon={<Plus className="size-4" />} onClick={create}>New note</Button>
      </div>
      {notes.isLoading && <div className="grid gap-3 md:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-36" />)}</div>}
      {notes.data?.notes.length === 0 && (
        <Card><EmptyState icon={<NotebookPen />} title={q || tag ? "No matching notes" : "No notes yet"} description="Generate notes from any material or start a blank note." action={<Button icon={<Plus className="size-4" />} onClick={create}>New note</Button>} /></Card>
      )}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {notes.data?.notes.map((n) => (
          <Card key={n.id} className="card-hover group relative flex flex-col p-4">
            <Link to={`/notes/${n.id}`} className="flex-1">
              <div className="flex items-start gap-2 pr-14">
                {n.pinned && <Pin className="mt-1 size-3.5 shrink-0 fill-current text-accent" />}
                <div className="font-semibold text-ink">{n.title}</div>
              </div>
              <p className="mt-2 line-clamp-3 text-sm text-muted">{n.snippet || "Empty note"}</p>
            </Link>
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {n.tags.map((t: string) => <Badge key={t}>#{t}</Badge>)}
              {n.engine === "offline" && <Badge>Offline engine</Badge>}
              <span className="ml-auto text-xs text-faint">{timeAgo(n.updated_at)}</span>
            </div>
            <div className="absolute right-2 top-2 flex opacity-0 transition group-hover:opacity-100">
              <IconButton label={n.pinned ? "Unpin" : "Pin"} onClick={() => togglePin(n)}><Pin className="size-3.5" /></IconButton>
              <IconButton label="Delete note" onClick={() => remove(n)}><Trash2 className="size-3.5" /></IconButton>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
