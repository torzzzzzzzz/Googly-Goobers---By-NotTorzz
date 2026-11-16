import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardCheck, Ellipsis, Pencil, Play, RefreshCw, Trash2 } from "lucide-react";
import { del, get, patch } from "../../lib/api";
import { timeAgo } from "../../lib/format";
import { useAIStatus, usePersistentState, useStreamRun, useToolVisit } from "../../lib/hooks";
import { useSettings } from "../../lib/settings";
import { Badge, Button, Card, EmptyState, IconButton, Menu, Skeleton, Tabs, useUi } from "../../components/ui";
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
import { QuestionSettings, type Difficulty } from "../../components/tool/StudyGen";

export default function QuizGenerator() {
  useToolVisit("quiz");
  const [tab, setTab] = useState<"create" | "library">("create");
  const quizzes = useQuery<{ quizzes: any[] }>({ queryKey: ["quizzes", "quiz"], queryFn: () => get("/api/quizzes", { kind: "quiz" }) });
  return (
    <Page wide>
      <ToolHeader toolId="quiz" />
      <div className="mb-5">
        <Tabs value={tab} onChange={setTab} tabs={[{ value: "create", label: "Create quiz" }, { value: "library", label: "My quizzes", count: quizzes.data?.quizzes.length }]} />
      </div>
      {tab === "create" ? <CreateQuiz kind="quiz" /> : <QuizLibrary kind="quiz" basePath="/quiz" />}
    </Page>
  );
}

export function CreateQuiz({ kind }: { kind: "quiz" | "practice_test" }) {
  const nav = useNavigate();
  const ai = useAIStatus();
  const qc = useQueryClient();
  const { settings } = useSettings();
  const key = kind === "quiz" ? "quiz" : "test";
  const [source, setSource] = usePersistentState<SourceValue>(`${key}:source`, { mode: "text", text: "" });
  const [count, setCount] = usePersistentState(`${key}:count`, kind === "quiz" ? settings?.study.question_count ?? 10 : 15);
  const [types, setTypes] = usePersistentState<string[]>(`${key}:types`, kind === "quiz" ? ["multiple_choice", "true_false", "fill_blank"] : ["multiple_choice", "true_false", "short_answer", "written"]);
  const [difficulty, setDifficulty] = usePersistentState<Difficulty>(`${key}:difficulty`, (settings?.study.difficulty as Difficulty) ?? "mixed");
  const [engine, setEngine] = usePersistentState<EngineChoice>(`${key}:engine`, "ai");
  const [timeLimit, setTimeLimit] = usePersistentState(`${key}:time`, 20);
  const [title, setTitle] = useState("");
  useInitialSource(setSource);
  const { toast } = useUi();
  const run = useStreamRun<{ quiz_id: number; count: number; requested: number }>((r) => {
    qc.invalidateQueries({ queryKey: ["quizzes"] });
    if (r.count < r.requested) toast(`Created ${r.count} of ${r.requested} questions — the rest weren't clearly supported by your material and were discarded.`, "info");
    nav(kind === "quiz" ? `/quiz/${r.quiz_id}` : `/practice-test/${r.quiz_id}`, { state: { generated: r } });
  });
  useEffect(() => {
    if (ai.data && !ai.data.ok && engine === "ai") setEngine("offline");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ai.data?.ok]);

  const available = kind === "quiz" ? ["multiple_choice", "true_false", "short_answer", "fill_blank", "definition"] : ["multiple_choice", "true_false", "short_answer", "fill_blank", "definition", "written"];
  const go = (eng: EngineChoice = engine) =>
    run.start("/api/tools/quiz", { ...sourceBody(source), title: title || sourceTitle(source), count, types: types.filter((t) => available.includes(t)), difficulty, engine: eng, kind, time_limit_min: kind === "practice_test" ? timeLimit : 0 });

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
      <SourcePicker value={source} onChange={setSource} minHeight="min-h-[380px]" />
      <div className="space-y-4">
        <Card className="space-y-4 p-4">
          <QuestionSettings count={count} setCount={setCount} types={types} setTypes={setTypes} difficulty={difficulty} setDifficulty={setDifficulty} available={available} title={title} setTitle={setTitle} />
          {kind === "practice_test" && (
            <div>
              <div className="label mb-2">Time limit</div>
              <select className="input" value={timeLimit} onChange={(e) => setTimeLimit(Number(e.target.value))} aria-label="Time limit">
                {[0, 10, 15, 20, 30, 45, 60, 90].map((m) => <option key={m} value={m}>{m ? `${m} minutes` : "No time limit"}</option>)}
              </select>
            </div>
          )}
          <EngineToggle value={engine} onChange={setEngine} />
          <Button variant="primary" size="lg" className="w-full" icon={<ClipboardCheck className="size-4" />} loading={run.status === "running"} disabled={!sourceReady(source) || types.length === 0} onClick={() => go()}>
            {kind === "quiz" ? "Generate quiz" : "Generate practice test"}
          </Button>
          <p className="text-xs text-muted">Every question is checked against your material; questions that can't be traced back to it are discarded.</p>
        </Card>
        {run.status === "running" && <Card><WorkingIndicator progress={run.progress} label="Writing questions" /></Card>}
        {run.status === "error" && run.error && <RunError error={run.error} onRetry={() => go()} onOffline={() => { setEngine("offline"); go("offline"); }} />}
      </div>
    </div>
  );
}

export function QuizLibrary({ kind, basePath }: { kind: "quiz" | "practice_test"; basePath: string }) {
  const nav = useNavigate();
  const qc = useQueryClient();
  const { confirm, toast } = useUi();
  const q = useQuery<{ quizzes: any[] }>({ queryKey: ["quizzes", kind], queryFn: () => get("/api/quizzes", { kind }) });
  const regen = useStreamRun<{ quiz_id: number }>((r) => {
    qc.invalidateQueries({ queryKey: ["quizzes"] });
    nav(`${basePath}/${r.quiz_id}`);
  });
  const [regenId, setRegenId] = useState<number | null>(null);

  if (q.isLoading) return <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20" />)}</div>;
  if (!q.data?.quizzes.length)
    return <Card><EmptyState icon={<ClipboardCheck />} title={kind === "quiz" ? "No quizzes yet" : "No practice tests yet"} description="Generate one from your notes, a PDF or any text." /></Card>;
  return (
    <div className="space-y-2">
      {regen.status === "running" && <Card><WorkingIndicator progress={regen.progress} label="Writing new questions" /></Card>}
      {regen.status === "error" && regen.error && <RunError error={regen.error} />}
      {q.data.quizzes.map((z) => (
        <Card key={z.id} className="flex flex-wrap items-center gap-4 px-4 py-3">
          <div className="grid size-10 place-items-center rounded-xl border border-line bg-surface-2"><ClipboardCheck className="size-4 text-accent" /></div>
          <Link to={`${basePath}/${z.id}`} className="min-w-0 flex-1">
            <div className="truncate font-medium text-ink">{z.title}</div>
            <div className="text-xs text-muted">{z.question_count} questions · {z.settings.difficulty ?? "mixed"} · {timeAgo(z.created_at)}</div>
          </Link>
          <div className="flex items-center gap-2">
            {z.engine === "offline" && <Badge>Offline engine</Badge>}
            {z.best_score !== null ? <Badge tone={z.best_score >= 80 ? "good" : z.best_score >= 50 ? "warn" : "bad"}>Best {z.best_score}%</Badge> : <Badge>Not taken</Badge>}
            <span className="text-xs text-faint">{z.attempts} attempt{z.attempts === 1 ? "" : "s"}</span>
          </div>
          <Button size="sm" variant="soft" icon={<Play className="size-3.5" />} onClick={() => nav(`${basePath}/${z.id}`)}>{z.attempts ? "Retake" : "Start"}</Button>
          <Menu
            trigger={(t) => <IconButton label="Options" onClick={t}><Ellipsis className="size-4" /></IconButton>}
            items={[
              { label: "New questions from same material", icon: <RefreshCw />, disabled: regen.status === "running", onClick: () => { setRegenId(z.id); regen.start(`/api/quizzes/${z.id}/regenerate`, {}); } },
              { label: "Rename", icon: <Pencil />, onClick: async () => { const t = await confirm({ title: "Rename", input: { label: "Title", initial: z.title }, confirmLabel: "Save" }); if (typeof t === "string") { await patch(`/api/quizzes/${z.id}`, { title: t }); qc.invalidateQueries({ queryKey: ["quizzes"] }); } } },
              "divider",
              { label: "Delete", icon: <Trash2 />, danger: true, onClick: async () => { if (await confirm({ title: `Delete “${z.title}”?`, message: "Its attempts and scores are deleted too.", danger: true, confirmLabel: "Delete" })) { await del(`/api/quizzes/${z.id}`); qc.invalidateQueries({ queryKey: ["quizzes"] }); toast("Deleted"); } } },
            ]}
          />
          {regenId === z.id && regen.status === "running" && <span className="w-full text-xs text-muted">Generating new questions…</span>}
        </Card>
      ))}
    </div>
  );
}
