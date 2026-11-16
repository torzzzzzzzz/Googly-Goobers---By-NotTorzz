import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { GraduationCap, Trash2 } from "lucide-react";
import { del, get } from "../../lib/api";
import { timeAgo } from "../../lib/format";
import { useAIStatus, usePersistentState, useStreamRun, useToolVisit } from "../../lib/hooks";
import { Badge, Button, Card, EmptyState, Field, IconButton, Input, Tabs, useUi } from "../../components/ui";
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

export default function StudyGuide() {
  useToolVisit("study_guide");
  const [tab, setTab] = useState<"create" | "library">("create");
  const guides = useQuery<{ guides: any[] }>({ queryKey: ["guides"], queryFn: () => get("/api/guides") });
  return (
    <Page wide>
      <ToolHeader toolId="study_guide" />
      <div className="mb-5">
        <Tabs value={tab} onChange={setTab} tabs={[{ value: "create", label: "Create study guide" }, { value: "library", label: "My study guides", count: guides.data?.guides.length }]} />
      </div>
      {tab === "create" ? <Create /> : <Library guides={guides.data?.guides} />}
    </Page>
  );
}

function Create() {
  const nav = useNavigate();
  const ai = useAIStatus();
  const qc = useQueryClient();
  const [source, setSource] = usePersistentState<SourceValue>("guide:source", { mode: "text", text: "" });
  const [engine, setEngine] = usePersistentState<EngineChoice>("guide:engine", "ai");
  const [title, setTitle] = useState("");
  useInitialSource(setSource);
  const run = useStreamRun<{ guide_id: number }>((r) => {
    qc.invalidateQueries({ queryKey: ["guides"] });
    nav(`/study-guide/${r.guide_id}`);
  });
  useEffect(() => {
    if (ai.data && !ai.data.ok && engine === "ai") setEngine("offline");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ai.data?.ok]);
  const go = (eng: EngineChoice = engine) => run.start("/api/tools/study-guide", { ...sourceBody(source), engine: eng, title: title || sourceTitle(source) });
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
      <SourcePicker value={source} onChange={setSource} minHeight="min-h-[380px]" />
      <div className="space-y-4">
        <Card className="space-y-4 p-4">
          <Field label="Title (optional)"><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Unit 4: Cell Biology" /></Field>
          <div className="rounded-xl border border-line bg-bg-2 p-3 text-xs text-muted">Includes: unit overview, main topics, vocabulary, key concepts, examples, important facts, common mistakes and review questions — with quick-review and detailed-study views.</div>
          <EngineToggle value={engine} onChange={setEngine} />
          {engine === "offline" && <p className="text-xs text-muted">The offline engine cannot infer common mistakes; that section stays empty.</p>}
          <Button variant="primary" size="lg" className="w-full" icon={<GraduationCap className="size-4" />} loading={run.status === "running"} disabled={!sourceReady(source)} onClick={() => go()}>Build study guide</Button>
        </Card>
        {run.status === "running" && <Card><WorkingIndicator progress={run.progress} label="Organizing your material" /></Card>}
        {run.status === "error" && run.error && <RunError error={run.error} onRetry={() => go()} onOffline={() => { setEngine("offline"); go("offline"); }} />}
      </div>
    </div>
  );
}

function Library({ guides }: { guides?: any[] }) {
  const qc = useQueryClient();
  const { confirm } = useUi();
  if (!guides?.length) return <Card><EmptyState icon={<GraduationCap />} title="No study guides yet" description="Build one from your notes, a textbook chapter or a PDF." /></Card>;
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {guides.map((g) => (
        <Card key={g.id} className="card-hover group relative p-5">
          <Link to={`/study-guide/${g.id}`} className="block">
            <GraduationCap className="size-5 text-accent" />
            <div className="mt-3 font-semibold text-ink">{g.title}</div>
            <div className="mt-1 text-xs text-muted">{g.topic_count} topics · {g.term_count} terms · {timeAgo(g.created_at)}</div>
            {g.engine === "offline" && <Badge className="mt-2">Offline engine</Badge>}
          </Link>
          <IconButton label="Delete guide" className="absolute right-3 top-3 opacity-0 group-hover:opacity-100" onClick={async () => { if (await confirm({ title: `Delete “${g.title}”?`, danger: true, confirmLabel: "Delete" })) { await del(`/api/guides/${g.id}`); qc.invalidateQueries({ queryKey: ["guides"] }); } }}>
            <Trash2 className="size-4" />
          </IconButton>
        </Card>
      ))}
    </div>
  );
}
