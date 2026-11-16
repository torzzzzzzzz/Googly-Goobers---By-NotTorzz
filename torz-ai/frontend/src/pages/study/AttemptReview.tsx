import { useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ListChecks, RefreshCw, RotateCcw, Trophy } from "lucide-react";
import { get } from "../../lib/api";
import { formatDateTime, formatDuration } from "../../lib/format";
import { useStreamRun } from "../../lib/hooks";
import { Alert, Button, Card, cx, IconButton, ProgressBar, Spinner } from "../../components/ui";
import { Page, RunError, WorkingIndicator } from "../../components/tool/ToolKit";
import { ReviewItem } from "./QuizPlayer";

export default function AttemptReview() {
  const { id } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const loc = useLocation() as { state?: { timedOut?: boolean } };
  const [onlyWrong, setOnlyWrong] = useState(false);
  const attempt = useQuery<any>({ queryKey: ["attempt", id], queryFn: () => get(`/api/attempts/${id}`) });
  const quiz = useQuery<any>({ queryKey: ["quiz", attempt.data?.quiz_id], queryFn: () => get(`/api/quizzes/${attempt.data.quiz_id}`), enabled: !!attempt.data });
  const regen = useStreamRun<{ quiz_id: number }>((r) => {
    qc.invalidateQueries({ queryKey: ["quizzes"] });
    nav(`/practice-test/${r.quiz_id}`);
  });
  if (attempt.isLoading || quiz.isLoading) return <div className="grid h-[60vh] place-items-center"><Spinner className="size-6" /></div>;
  if (!attempt.data || !quiz.data) return <Page><Alert tone="bad">This attempt could not be loaded.</Alert></Page>;
  const a = attempt.data;
  const base = quiz.data.kind === "practice_test" ? "/practice-test" : "/quiz";
  const results: any[] = a.results;
  const byId = Object.fromEntries(results.map((r) => [r.question_id, r]));
  const questions = quiz.data.questions.filter((q: any) => !onlyWrong || !byId[q.id]?.correct);
  return (
    <Page>
      <div className="mb-4 flex items-center gap-2">
        <IconButton label="Back" onClick={() => nav(base)}><ArrowLeft className="size-4" /></IconButton>
        <h1 className="text-[1.25rem] font-semibold">{a.quiz_title}</h1>
      </div>
      {loc.state?.timedOut && <Alert tone="warn" className="mb-4">Time ran out — the test was submitted automatically.</Alert>}
      <Card className="mb-5 p-7 text-center">
        <Trophy className={cx("mx-auto size-9", a.percent >= 80 ? "text-warn" : "text-accent")} />
        <div className="mt-2 text-[2.3rem] font-semibold tabular-nums">{a.percent}%</div>
        <div className="text-sm text-muted">{a.score} / {a.max_score} points · {formatDuration(a.duration_s)} · {formatDateTime(a.finished_at)}</div>
        <div className="mx-auto mt-4 max-w-sm"><ProgressBar value={a.percent} /></div>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Button icon={<ListChecks className="size-4" />} variant={onlyWrong ? "soft" : "secondary"} onClick={() => setOnlyWrong((v) => !v)}>{onlyWrong ? "Show all" : "Only incorrect"}</Button>
          <Button icon={<RotateCcw className="size-4" />} onClick={() => nav(`${base}/${a.quiz_id}`)}>Retake same test</Button>
          <Button variant="primary" icon={<RefreshCw className="size-4" />} loading={regen.status === "running"} onClick={() => regen.start(`/api/quizzes/${a.quiz_id}/regenerate`, {})}>Retake with new questions</Button>
        </div>
        {regen.status === "running" && <WorkingIndicator progress={regen.progress} label="Writing new questions" />}
        {regen.status === "error" && regen.error && <div className="mt-4 text-left"><RunError error={regen.error} /></div>}
      </Card>
      <div className="space-y-3">
        {questions.map((q: any) => <ReviewItem key={q.id} q={q} r={byId[q.id]} n={quiz.data.questions.indexOf(q) + 1} />)}
      </div>
    </Page>
  );
}
