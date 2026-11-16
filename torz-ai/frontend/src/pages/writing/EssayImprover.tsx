import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { ArrowRightLeft, ClipboardCheck, PenLine, Square } from "lucide-react";
import { usePersistentState, useStreamRun, useToolVisit } from "../../lib/hooks";
import { Button, Card, Checkbox, cx, EmptyState, Segmented, Tabs } from "../../components/ui";
import { HighlightedRevision, SideBySideDiff, ChangeSummary } from "../../components/tool/DiffView";
import { HistoryButton, ModelBadge, OutputActions, Page, RunError, TextPanel, ToolHeader, WorkingIndicator } from "../../components/tool/ToolKit";

const FOCUS = ["thesis", "structure", "transitions", "evidence", "conclusion", "clarity", "grammar", "word choice"];
const SCORE_LABELS: Record<string, string> = { thesis: "Thesis", structure: "Structure", evidence: "Evidence", clarity: "Clarity", grammar: "Grammar", style: "Style" };

interface Feedback {
  overall: string;
  scores: Record<string, number>;
  strengths: string[];
  improvements: string[];
}

export default function EssayImprover() {
  useToolVisit("essay");
  const [text, setText] = usePersistentState("essay:text", "");
  const [focus, setFocus] = usePersistentState<string[]>("essay:focus", ["thesis", "structure", "transitions", "clarity"]);
  const [level, setLevel] = usePersistentState<"light" | "moderate" | "strong">("essay:level", "moderate");
  const [tab, setTab] = useState<"feedback" | "improved">("feedback");
  const [view, setView] = useState<"highlight" | "side" | "clean">("highlight");
  const [lastInput, setLastInput] = useState("");
  const fb = useStreamRun<{ feedback: Feedback }>();
  const loc = useLocation() as { state?: { text?: string } };
  useEffect(() => {
    if (loc.state?.text) setText(loc.state.text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const imp = useStreamRun();

  const getFeedback = () => {
    setTab("feedback");
    fb.start("/api/tools/essay/feedback", { text, focus });
  };
  const improve = () => {
    setTab("improved");
    setLastInput(text);
    imp.start("/api/tools/essay/improve", { text, focus, level });
  };
  const feedback = fb.result?.feedback;
  const avg = feedback ? Object.values(feedback.scores).reduce((a, b) => a + b, 0) / Math.max(1, Object.values(feedback.scores).length) : 0;

  return (
    <Page wide>
      <ToolHeader
        toolId="essay"
        actions={
          <HistoryButton
            toolId="essay"
            onSelect={(e) => {
              setText(e.input_text);
              if (e.output_json?.feedback) {
                setTab("feedback");
                fb.setState({ status: "done", text: "", meta: { model: e.model, provider: e.provider }, progress: null, error: null, passages: null, result: { feedback: e.output_json.feedback } });
              } else {
                setTab("improved");
                setLastInput(e.input_text);
                imp.setState({ status: "done", text: e.output_text, meta: { model: e.model, provider: e.provider }, progress: null, error: null, passages: null, result: { output: e.output_text } });
              }
            }}
          />
        }
      />
      <Card className="mb-4 grid gap-5 p-4 lg:grid-cols-[1fr_auto]">
        <div>
          <div className="label mb-2">Focus on</div>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {FOCUS.map((f) => (
              <Checkbox key={f} checked={focus.includes(f)} onChange={(v) => setFocus(v ? [...focus, f] : focus.filter((x) => x !== f))} label={f[0].toUpperCase() + f.slice(1)} />
            ))}
          </div>
        </div>
        <div>
          <div className="label mb-2">Revision depth</div>
          <Segmented value={level} onChange={setLevel} options={[{ value: "light", label: "Light" }, { value: "moderate", label: "Moderate" }, { value: "strong", label: "Thorough" }]} />
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <TextPanel value={text} onChange={setText} label="Your essay" minHeight="min-h-[460px]" placeholder="Paste your essay here…" />
          <div className="mt-4 flex justify-end gap-2">
            <Button size="lg" icon={<ClipboardCheck className="size-4" />} onClick={getFeedback} loading={fb.status === "running"} disabled={!text.trim()}>Get feedback</Button>
            <Button variant="primary" size="lg" icon={<PenLine className="size-4" />} onClick={improve} loading={imp.status === "running"} disabled={!text.trim()}>Improve essay</Button>
          </div>
        </div>

        <div className="card flex min-h-[520px] flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 pt-1">
            <Tabs value={tab} onChange={setTab} tabs={[{ value: "feedback", label: "Feedback" }, { value: "improved", label: "Improved version" }]} />
            <div className="flex items-center gap-1">
              <ModelBadge meta={tab === "feedback" ? fb.meta : imp.meta} />
              {tab === "improved" && imp.status === "done" && (
                <>
                  <Segmented size="sm" value={view} onChange={setView} options={[{ value: "clean", label: "Clean" }, { value: "highlight", label: "Changes" }, { value: "side", label: <ArrowRightLeft className="size-3.5" /> }]} />
                  <OutputActions text={imp.text} title="Improved essay" />
                </>
              )}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto border-t border-line px-5 py-4">
            {tab === "feedback" && (
              <>
                {fb.status === "idle" && <EmptyState icon={<ClipboardCheck />} title="Get an instructor-style review" description="Scores for thesis, structure, evidence, clarity, grammar and style, plus specific improvements." />}
                {fb.status === "running" && <WorkingIndicator progress={fb.progress} label="Reading your essay" />}
                {fb.status === "error" && fb.error && <RunError error={fb.error} onRetry={getFeedback} />}
                {feedback && (
                  <div className="space-y-5">
                    <div className="flex items-center gap-4">
                      <div className="grid size-16 shrink-0 place-items-center rounded-2xl border border-line bg-surface-2">
                        <div className="text-center">
                          <div className="text-xl font-bold text-ink tabular-nums">{avg.toFixed(1)}</div>
                          <div className="text-[0.62rem] text-muted">/ 10</div>
                        </div>
                      </div>
                      <p className="text-sm text-ink-2">{feedback.overall}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      {Object.entries(feedback.scores).map(([k, v]) => (
                        <div key={k} className="rounded-xl border border-line p-3">
                          <div className="flex justify-between text-xs"><span className="text-muted">{SCORE_LABELS[k] ?? k}</span><span className="font-semibold text-ink tabular-nums">{v}/10</span></div>
                          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-3">
                            <div className={cx("h-full rounded-full", v >= 7 ? "bg-good" : v >= 5 ? "bg-warn" : "bg-bad")} style={{ width: `${v * 10}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                    <div>
                      <div className="label mb-2">Strengths</div>
                      <ul className="space-y-1.5 text-sm text-ink-2">{feedback.strengths.map((s, i) => <li key={i} className="flex gap-2"><span className="text-good">✓</span>{s}</li>)}</ul>
                    </div>
                    <div>
                      <div className="label mb-2">How to improve</div>
                      <ul className="space-y-1.5 text-sm text-ink-2">{feedback.improvements.map((s, i) => <li key={i} className="flex gap-2"><span className="text-accent">→</span>{s}</li>)}</ul>
                    </div>
                    <Button variant="soft" icon={<PenLine className="size-4" />} onClick={improve}>Apply these improvements</Button>
                  </div>
                )}
              </>
            )}
            {tab === "improved" && (
              <>
                {imp.status === "idle" && <EmptyState icon={<PenLine />} title="No revision yet" description="Press Improve essay to get a revised version with every change highlighted." />}
                {imp.status === "running" && !imp.text && <WorkingIndicator progress={imp.progress} label="Revising" />}
                {imp.status === "running" && imp.text && (
                  <>
                    <div className="stream-caret whitespace-pre-wrap text-[0.95rem] leading-relaxed">{imp.text}</div>
                    <Button className="mt-3" size="sm" icon={<Square className="size-3" />} onClick={imp.cancel}>Stop</Button>
                  </>
                )}
                {imp.status === "error" && imp.error && <RunError error={imp.error} onRetry={improve} />}
                {imp.status === "done" && (
                  <>
                    <div className="mb-3"><ChangeSummary original={lastInput} revised={imp.text} /></div>
                    {view === "clean" && <div className="whitespace-pre-wrap text-[0.95rem] leading-relaxed">{imp.text}</div>}
                    {view === "highlight" && <HighlightedRevision original={lastInput} revised={imp.text} />}
                    {view === "side" && <SideBySideDiff original={lastInput} revised={imp.text} />}
                    <div className="mt-4 flex gap-2">
                      <Button size="sm" variant="soft" onClick={() => setText(imp.text)}>Use as my essay</Button>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </Page>
  );
}
