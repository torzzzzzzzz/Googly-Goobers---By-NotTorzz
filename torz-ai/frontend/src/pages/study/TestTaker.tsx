import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, BrainCircuit, Clock, Send } from "lucide-react";
import { get, post } from "../../lib/api";
import { formatDuration } from "../../lib/format";
import { useToolVisit } from "../../lib/hooks";
import { Alert, Badge, Button, Card, cx, IconButton, Input, Select, Spinner, Textarea, useUi } from "../../components/ui";
import { ModelBadge, Page, WorkingIndicator } from "../../components/tool/ToolKit";
import { QTYPE_LABEL } from "../../components/tool/StudyGen";

export default function TestTaker() {
  useToolVisit("practice_test");
  const { id } = useParams();
  const testId = Number(id);
  const nav = useNavigate();
  const qc = useQueryClient();
  const { confirm, toast } = useUi();
  const [test, setTest] = useState<any>(null);
  const [phase, setPhase] = useState<"intro" | "taking" | "grading">("intro");
  const [limitMin, setLimitMin] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef(0);
  const submitted = useRef(false);

  useEffect(() => {
    get(`/api/quizzes/${testId}/shuffled`).then((t) => {
      setTest(t);
      setLimitMin(t.settings?.time_limit_min ?? 0);
    }).catch((e) => toast(e.message, "bad"));
  }, [testId, toast]);

  useEffect(() => {
    if (phase !== "taking") return;
    const t = setInterval(() => setElapsed(Math.round((Date.now() - startedAt.current) / 1000)), 500);
    return () => clearInterval(t);
  }, [phase]);

  const remaining = limitMin ? limitMin * 60 - elapsed : null;
  useEffect(() => {
    if (phase === "taking" && remaining !== null && remaining <= 0) void submit(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining, phase]);

  const submit = async (timedOut = false) => {
    if (submitted.current) return;
    const unanswered = test.questions.filter((q: any) => !(answers[String(q.id)] ?? "").trim()).length;
    if (!timedOut && unanswered && !(await confirm({ title: "Submit test?", message: `${unanswered} question${unanswered === 1 ? " is" : "s are"} unanswered.`, confirmLabel: "Submit anyway" }))) return;
    submitted.current = true;
    setPhase("grading");
    try {
      const a = await post(`/api/quizzes/${testId}/attempts`, { answers, duration_s: Math.round((Date.now() - startedAt.current) / 1000), time_limit_s: limitMin * 60, timed_out: timedOut });
      qc.invalidateQueries({ queryKey: ["quizzes"] });
      qc.invalidateQueries({ queryKey: ["attempts"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      nav(`/attempts/${a.id}`, { replace: true, state: { timedOut } });
    } catch (e) {
      submitted.current = false;
      setPhase("taking");
      toast((e as Error).message, "bad");
    }
  };

  if (!test) return <div className="grid h-[60vh] place-items-center"><Spinner className="size-6" /></div>;
  const total = test.questions.length;
  const done = test.questions.filter((q: any) => (answers[String(q.id)] ?? "").trim()).length;
  const written = test.questions.filter((q: any) => ["short_answer", "definition", "written"].includes(q.type)).length;

  if (phase === "intro")
    return (
      <Page>
        <Card className="mx-auto max-w-2xl p-8">
          <div className="flex items-center gap-3">
            <IconButton label="Back" onClick={() => nav("/practice-test")}><ArrowLeft className="size-4" /></IconButton>
            <BrainCircuit className="size-6 text-accent" />
            <h1 className="text-[1.35rem] font-semibold">{test.title}</h1>
          </div>
          <div className="mt-5 grid grid-cols-3 gap-3 text-center">
            <div className="rounded-xl border border-line p-3"><div className="text-xl font-semibold">{total}</div><div className="text-xs text-muted">questions</div></div>
            <div className="rounded-xl border border-line p-3"><div className="text-xl font-semibold">{test.questions.reduce((a: number, q: any) => a + q.points, 0)}</div><div className="text-xs text-muted">points</div></div>
            <div className="rounded-xl border border-line p-3"><div className="text-xl font-semibold">{written}</div><div className="text-xs text-muted">written answers</div></div>
          </div>
          <div className="mt-5">
            <div className="label mb-2">Time limit</div>
            <Select value={limitMin} onChange={(e) => setLimitMin(Number(e.target.value))} className="max-w-xs">
              {[0, 5, 10, 15, 20, 30, 45, 60, 90].map((m) => <option key={m} value={m}>{m ? `${m} minutes` : "No time limit"}</option>)}
            </Select>
          </div>
          <ul className="mt-5 list-disc space-y-1 pl-5 text-sm text-muted">
            <li>Answer in any order. Multiple-choice, true/false and fill-in-the-blank are graded instantly.</li>
            <li>Written answers are graded {test.engine === "offline" ? "approximately by keyword coverage (offline engine)" : "by your AI model, with feedback"}.</li>
            {limitMin > 0 && <li>The test submits automatically when time runs out.</li>}
          </ul>
          <Button variant="primary" size="lg" className="mt-6 w-full" onClick={() => { startedAt.current = Date.now(); setPhase("taking"); }}>Start test</Button>
        </Card>
      </Page>
    );

  if (phase === "grading")
    return <Page><Card className="mx-auto max-w-xl"><WorkingIndicator label={written ? "Grading your answers" : "Scoring"} /></Card></Page>;

  return (
    <Page wide>
      <div className="grid gap-5 lg:grid-cols-[1fr_260px]">
        <div>
          <div className="mb-4 flex items-center gap-3">
            <h1 className="min-w-0 flex-1 truncate text-[1.25rem] font-semibold">{test.title}</h1>
            <ModelBadge meta={{ model: test.model, provider: test.provider, engine: test.engine }} />
          </div>
          <div className="space-y-4">
            {test.questions.map((q: any, i: number) => (
              <Card key={q.id} id={`q-${q.id}`} className="scroll-mt-24 p-6">
                <div className="mb-3 flex items-center gap-2 text-xs">
                  <span className="font-semibold text-ink">Question {i + 1}</span>
                  <Badge tone="accent">{QTYPE_LABEL[q.type] ?? q.type}</Badge>
                  <span className="text-muted">{q.points} pt{q.points === 1 ? "" : "s"}</span>
                </div>
                <div className="mb-4 text-[1.02rem] leading-relaxed text-ink">{q.question}</div>
                {q.options.length > 0 ? (
                  <div className="grid gap-2">
                    {q.options.map((o: string) => (
                      <label key={o} className={cx("flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-2.5 text-sm transition", answers[String(q.id)] === o ? "border-accent/50 bg-accent-soft" : "border-line hover:bg-surface-2")}>
                        <input type="radio" name={`q${q.id}`} checked={answers[String(q.id)] === o} onChange={() => setAnswers((a) => ({ ...a, [String(q.id)]: o }))} className="accent-[var(--accent)]" />
                        {o}
                      </label>
                    ))}
                  </div>
                ) : q.type === "fill_blank" ? (
                  <Input value={answers[String(q.id)] ?? ""} onChange={(e) => setAnswers((a) => ({ ...a, [String(q.id)]: e.target.value }))} placeholder="Missing word or phrase" />
                ) : (
                  <Textarea rows={q.type === "written" ? 6 : 3} value={answers[String(q.id)] ?? ""} onChange={(e) => setAnswers((a) => ({ ...a, [String(q.id)]: e.target.value }))} placeholder={q.type === "written" ? "Write a full answer…" : "Your answer"} />
                )}
              </Card>
            ))}
          </div>
          <div className="mt-5 flex justify-end"><Button variant="primary" size="lg" icon={<Send className="size-4" />} onClick={() => submit()}>Submit test</Button></div>
        </div>
        <div className="lg:sticky lg:top-20 lg:self-start">
          <Card className="p-4">
            <div className={cx("flex items-center gap-2 text-[1.6rem] font-semibold tabular-nums", remaining !== null && remaining < 60 ? "text-bad" : "text-ink")}>
              <Clock className="size-5 text-muted" />
              {remaining !== null ? formatDuration(Math.max(0, remaining)) : formatDuration(elapsed)}
            </div>
            <div className="text-xs text-muted">{remaining !== null ? "remaining" : "elapsed"}</div>
            {remaining !== null && remaining < 60 && remaining > 0 && <Alert tone="warn" className="mt-3">Less than a minute left.</Alert>}
            <div className="mt-4 text-sm text-ink-2">{done} of {total} answered</div>
            <div className="mt-3 grid grid-cols-6 gap-1.5">
              {test.questions.map((q: any, i: number) => (
                <a key={q.id} href={`#q-${q.id}`} className={cx("grid h-8 place-items-center rounded-lg border text-xs font-medium", (answers[String(q.id)] ?? "").trim() ? "border-accent/40 bg-accent-soft text-accent" : "border-line text-muted hover:bg-surface-2")}>{i + 1}</a>
              ))}
            </div>
            <Button variant="primary" className="mt-4 w-full" icon={<Send className="size-4" />} onClick={() => submit()}>Submit</Button>
          </Card>
        </div>
      </div>
    </Page>
  );
}
