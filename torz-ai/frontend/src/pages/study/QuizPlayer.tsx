import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, CircleCheck, CircleX, ListChecks, Quote, RefreshCw, RotateCcw, Trophy } from "lucide-react";
import { get, post } from "../../lib/api";
import { formatDuration } from "../../lib/format";
import { usePersistentState, useStreamRun, useToolVisit } from "../../lib/hooks";
import { useSettings } from "../../lib/settings";
import { Badge, Button, Card, cx, IconButton, Input, ProgressBar, Spinner, Switch, Textarea } from "../../components/ui";
import { ModelBadge, Page, RunError, WorkingIndicator } from "../../components/tool/ToolKit";
import { QTYPE_LABEL } from "../../components/tool/StudyGen";

interface Question {
  id: number;
  type: string;
  difficulty: string;
  question: string;
  options: string[];
  answer: string;
  explanation: string;
  source_quote: string;
  points: number;
}
interface Result {
  question_id: number;
  correct: boolean;
  score: number;
  verdict: string;
  feedback: string;
  model_answer: string;
  explanation: string;
  answer: string;
  points: number;
}

export default function QuizPlayer() {
  useToolVisit("quiz");
  const { id } = useParams();
  const quizId = Number(id);
  const nav = useNavigate();
  const qc = useQueryClient();
  const { settings } = useSettings();
  const [quiz, setQuiz] = useState<any>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [idx, setIdx] = useState(0);
  const [answer, setAnswer] = useState("");
  const [results, setResults] = useState<Record<number, Result>>({});
  const [checking, setChecking] = useState(false);
  const [finished, setFinished] = useState<null | { score: number; max: number; percent: number; duration: number }>(null);
  const [reviewWrong, setReviewWrong] = useState(false);
  const [autoNext, setAutoNext] = usePersistentState("quiz:autoNext", settings?.study.auto_advance ?? true);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(Date.now());
  const advanceTimer = useRef<number | null>(null);
  const regen = useStreamRun<{ quiz_id: number }>((r) => {
    qc.invalidateQueries({ queryKey: ["quizzes"] });
    nav(`/quiz/${r.quiz_id}`);
  });

  const load = async (shuffled: boolean) => {
    try {
      const data = await get(shuffled ? `/api/quizzes/${quizId}/shuffled` : `/api/quizzes/${quizId}`);
      setQuiz(data);
      setQuestions(data.questions);
      setIdx(0);
      setAnswer("");
      setResults({});
      setFinished(null);
      setReviewWrong(false);
      started.current = Date.now();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  useEffect(() => {
    load(false);
    return () => {
      if (advanceTimer.current) window.clearTimeout(advanceTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quizId]);

  const q = questions[idx];
  const res = q ? results[q.id] : undefined;
  const score = useMemo(() => Object.values(results).reduce((a, r) => a + r.score, 0), [results]);
  const answered = Object.keys(results).length;

  const submit = async (value = answer) => {
    if (!q || res || checking) return;
    setChecking(true);
    try {
      const r = await post<Result>(`/api/quizzes/${quizId}/check`, { question_id: q.id, answer: value });
      setResults((m) => ({ ...m, [q.id]: r }));
      if (autoNext && r.correct && idx < questions.length - 1) advanceTimer.current = window.setTimeout(() => next(), 1400);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setChecking(false);
    }
  };

  const next = () => {
    if (advanceTimer.current) window.clearTimeout(advanceTimer.current);
    if (idx < questions.length - 1) {
      setIdx((i) => i + 1);
      setAnswer("");
    }
  };

  const finish = async () => {
    const answers = Object.fromEntries(Object.values(results).map((r) => [String(r.question_id), r.answer]));
    const pre = Object.fromEntries(Object.values(results).map((r) => [String(r.question_id), r]));
    const duration = Math.round((Date.now() - started.current) / 1000);
    const a = await post(`/api/quizzes/${quizId}/attempts`, { answers, results: pre, duration_s: duration });
    setFinished({ score: a.score, max: a.max_score, percent: a.percent, duration });
    qc.invalidateQueries({ queryKey: ["quizzes"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!q || finished) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (res && e.key === "Enter") {
        e.preventDefault();
        if (idx < questions.length - 1) next();
        else finish();
        return;
      }
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (!res && q.options.length && /^[1-6]$/.test(e.key)) {
        const opt = q.options[Number(e.key) - 1];
        if (opt) {
          setAnswer(opt);
          submit(opt);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (error) return <Page><RunError error={{ kind: "bad_request", message: error }} /></Page>;
  if (!quiz) return <div className="grid h-[60vh] place-items-center"><Spinner className="size-6" /></div>;
  if (!questions.length) return <Page><Card className="p-8 text-center text-muted">This quiz has no questions.</Card></Page>;

  // ------------------------------------------------------------------ results screen
  if (finished) {
    const wrong = questions.filter((qq) => results[qq.id] && !results[qq.id].correct);
    const list = reviewWrong ? wrong : questions;
    return (
      <Page>
        <Card className="mb-5 p-8 text-center">
          <Trophy className={cx("mx-auto size-10", finished.percent >= 80 ? "text-warn" : "text-accent")} />
          <div className="mt-3 text-[2.4rem] font-semibold tracking-tight tabular-nums">{finished.percent}%</div>
          <div className="text-muted">{finished.score} of {finished.max} points · {formatDuration(finished.duration)}</div>
          <div className="mx-auto mt-4 max-w-sm"><ProgressBar value={finished.percent} /></div>
          <p className="mt-4 text-sm text-ink-2">{finished.percent >= 90 ? "Excellent work!" : finished.percent >= 70 ? "Nice — a little review and you've got it." : "Keep going — review the explanations below and retake."}</p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Button icon={<ListChecks className="size-4" />} variant={reviewWrong ? "soft" : "secondary"} onClick={() => setReviewWrong((v) => !v)} disabled={!wrong.length}>
              {reviewWrong ? "Show all questions" : `Review incorrect (${wrong.length})`}
            </Button>
            <Button icon={<RotateCcw className="size-4" />} onClick={() => load(true)}>Retake quiz</Button>
            <Button variant="primary" icon={<RefreshCw className="size-4" />} loading={regen.status === "running"} onClick={() => regen.start(`/api/quizzes/${quizId}/regenerate`, {})}>New questions</Button>
          </div>
          {regen.status === "running" && <WorkingIndicator progress={regen.progress} label="Writing new questions" />}
          {regen.status === "error" && regen.error && <div className="mt-4 text-left"><RunError error={regen.error} /></div>}
        </Card>
        <div className="space-y-3">
          {list.map((qq) => <ReviewItem key={qq.id} q={qq} r={results[qq.id]} n={questions.indexOf(qq) + 1} />)}
        </div>
      </Page>
    );
  }

  // ------------------------------------------------------------------ question screen
  return (
    <Page>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <IconButton label="Back to quizzes" onClick={() => nav("/quiz")}><ArrowLeft className="size-4" /></IconButton>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[1.25rem] font-semibold">{quiz.title}</h1>
          <div className="text-xs text-muted">Question {idx + 1} of {questions.length} · Score {score}/{answered}</div>
        </div>
        <ModelBadge meta={{ model: quiz.model, provider: quiz.provider, engine: quiz.engine }} />
        <div className="w-56"><Switch checked={autoNext} onChange={setAutoNext} label="Auto-advance when correct" /></div>
      </div>
      <ProgressBar value={(100 * (idx + (res ? 1 : 0))) / questions.length} className="mb-6" />

      <Card className="p-7" key={q.id}>
        <div className="mb-4 flex items-center gap-2">
          <Badge tone="accent">{QTYPE_LABEL[q.type] ?? q.type}</Badge>
          <Badge>{q.difficulty}</Badge>
        </div>
        <h2 className="text-[1.2rem] font-medium leading-relaxed text-ink">{q.question}</h2>

        <div className="mt-6">
          {q.options.length > 0 ? (
            <div className="grid gap-2.5">
              {q.options.map((o, i) => {
                const chosen = (res ? res.answer : answer) === o;
                const isAnswer = !!res && o === q.answer;
                return (
                  <button
                    key={o}
                    disabled={!!res || checking}
                    onClick={() => {
                      setAnswer(o);
                      submit(o);
                    }}
                    className={cx(
                      "flex items-center gap-3 rounded-xl border px-4 py-3 text-left text-[0.95rem] transition",
                      !res && "border-line hover:border-accent/50 hover:bg-surface-2",
                      res && isAnswer && "border-good/50 bg-good/10",
                      res && chosen && !isAnswer && "border-bad/50 bg-bad/10",
                      res && !chosen && !isAnswer && "border-line opacity-60",
                    )}
                  >
                    <span className="grid size-7 shrink-0 place-items-center rounded-lg border border-line bg-surface-2 text-xs font-semibold text-muted">{i + 1}</span>
                    <span className="flex-1 text-ink">{o}</span>
                    {res && isAnswer && <CircleCheck className="size-5 text-good" />}
                    {res && chosen && !isAnswer && <CircleX className="size-5 text-bad" />}
                  </button>
                );
              })}
            </div>
          ) : (
            <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="flex flex-col gap-3">
              {q.type === "fill_blank" ? (
                <Input autoFocus value={answer} onChange={(e) => setAnswer(e.target.value)} disabled={!!res} placeholder="Type the missing word or phrase" />
              ) : (
                <Textarea autoFocus rows={3} value={answer} onChange={(e) => setAnswer(e.target.value)} disabled={!!res} placeholder="Type your answer" onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }} />
              )}
              {!res && <Button type="submit" variant="primary" className="self-end" loading={checking} disabled={!answer.trim()}>Submit answer</Button>}
            </form>
          )}
        </div>

        {checking && q.options.length > 0 && <div className="mt-4 flex items-center gap-2 text-sm text-muted"><Spinner /> Checking…</div>}

        {res && (
          <div className={cx("mt-6 animate-rise rounded-xl border p-4", res.correct ? "border-good/30 bg-good/[0.07]" : res.verdict === "partially_correct" ? "border-warn/30 bg-warn/[0.07]" : "border-bad/30 bg-bad/[0.07]")}>
            <div className="flex items-center gap-2 font-semibold">
              {res.correct ? <CircleCheck className="size-5 text-good" /> : <CircleX className={cx("size-5", res.verdict === "partially_correct" ? "text-warn" : "text-bad")} />}
              {res.correct ? "Correct!" : res.verdict === "partially_correct" ? "Partly correct" : "Not quite"}
            </div>
            {!res.correct && <div className="mt-2 text-sm text-ink-2"><span className="text-muted">Answer: </span>{q.answer}</div>}
            {res.feedback && !q.options.length && <div className="mt-1.5 text-sm text-ink-2">{res.feedback}</div>}
            {q.explanation && <div className="mt-2 text-sm text-ink-2">{q.explanation}</div>}
            {q.source_quote && <div className="mt-2 flex gap-2 text-xs text-muted"><Quote className="mt-0.5 size-3.5 shrink-0" />“{q.source_quote}”</div>}
          </div>
        )}
      </Card>

      <div className="mt-5 flex items-center justify-between">
        <span className="text-xs text-muted">{q.options.length ? "Tip: press 1–4 to answer, Enter for next" : "Press Enter to submit"}</span>
        {res && (idx < questions.length - 1 ? (
          <Button variant="primary" icon={<ArrowRight className="size-4" />} onClick={next}>Next question</Button>
        ) : (
          <Button variant="primary" icon={<Trophy className="size-4" />} onClick={finish}>See results</Button>
        ))}
      </div>
    </Page>
  );
}

export function ReviewItem({ q, r, n }: { q: Question; r?: Result; n: number }) {
  return (
    <Card className="p-5">
      <div className="flex items-start gap-3">
        {r?.correct ? <CircleCheck className="mt-0.5 size-5 shrink-0 text-good" /> : <CircleX className={cx("mt-0.5 size-5 shrink-0", r?.verdict === "partially_correct" ? "text-warn" : "text-bad")} />}
        <div className="min-w-0 flex-1">
          <div className="text-xs text-muted">Question {n} · {QTYPE_LABEL[q.type] ?? q.type}{r ? ` · ${r.score}/${r.points} pts` : ""}</div>
          <div className="mt-1 font-medium text-ink">{q.question}</div>
          <div className="mt-2 grid gap-1 text-sm">
            <div><span className="text-muted">Your answer: </span><span className={r?.correct ? "text-good" : "text-ink-2"}>{r?.answer || <i className="text-faint">no answer</i>}</span></div>
            {!r?.correct && <div><span className="text-muted">Correct answer: </span><span className="text-ink">{q.answer}</span></div>}
            {r?.feedback && <div className="text-ink-2">{r.feedback}</div>}
            {q.explanation && <div className="text-ink-2">{q.explanation}</div>}
          </div>
        </div>
      </div>
    </Card>
  );
}
