import { useEffect, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { ArrowRightLeft, CircleCheck, Square, TriangleAlert } from "lucide-react";
import { countWords } from "../../lib/format";
import { usePersistentState, useStreamRun, useToolVisit } from "../../lib/hooks";
import { Button, Card, cx, Kbd, Segmented } from "../ui";
import { ChangeSummary, HighlightedRevision, SideBySideDiff } from "./DiffView";
import { HistoryButton, ModelBadge, OutputActions, Page, RunError, TextPanel, ToolHeader, WorkingIndicator } from "./ToolKit";

export interface RewriteResult {
  output: string;
  history_id: number;
  provider: string;
  model: string;
  stats?: {
    words_in: number;
    words_out: number;
    length_ratio: number;
    readability_in: Readability;
    readability_out: Readability;
  };
  report?: { check: string; total: number; kept: number; missing: string[]; note?: string }[];
  explanation?: string;
}

export interface Readability {
  words: number;
  sentences: number;
  avg_sentence_length: number;
  flesch_reading_ease: number;
  grade_level: number;
  long_sentences: number;
}

type View = "clean" | "highlight" | "side";

export function RewriteTool({
  toolId,
  endpoint,
  buildBody,
  options,
  actionLabel,
  actionIcon,
  outputLabel = "Result",
  disclaimer,
  onRestoreSettings,
  showReadability = false,
}: {
  toolId: string;
  endpoint: string;
  buildBody: (text: string) => Record<string, unknown>;
  options: ReactNode;
  actionLabel: string;
  actionIcon: ReactNode;
  outputLabel?: string;
  disclaimer?: ReactNode;
  onRestoreSettings?: (settings: Record<string, any>) => void;
  showReadability?: boolean;
}) {
  useToolVisit(toolId);
  const loc = useLocation() as { state?: { text?: string } };
  const [input, setInput] = usePersistentState(`${toolId}:input`, "");
  const [view, setView] = usePersistentState<View>(`${toolId}:view`, "highlight");
  const [lastInput, setLastInput] = useState("");
  const run = useStreamRun<RewriteResult>();

  useEffect(() => {
    if (loc.state?.text) setInput(loc.state.text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const go = () => {
    if (!input.trim() || run.status === "running") return;
    setLastInput(input);
    run.start(endpoint, buildBody(input));
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") go();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const output = run.text;
  const done = run.status === "done" && !!run.result;

  return (
    <Page wide>
      <ToolHeader
        toolId={toolId}
        actions={
          <HistoryButton
            toolId={toolId}
            onSelect={(e) => {
              setInput(e.input_text);
              setLastInput(e.input_text);
              onRestoreSettings?.(e.settings ?? {});
              run.setState({ status: "done", text: e.output_text, meta: { provider: e.provider, model: e.model, engine: e.engine }, progress: null, error: null, passages: null, result: { output: e.output_text } as RewriteResult });
            }}
          />
        }
      />

      <Card className="mb-4 p-4">{options}</Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <TextPanel value={input} onChange={setInput} minHeight="min-h-[420px]" disabled={run.status === "running"} />

        <div className="card flex min-h-[420px] flex-col overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2">
            <div className="flex items-center gap-2">
              <span className="label">{outputLabel}</span>
              <ModelBadge meta={run.meta} />
            </div>
            <div className="flex items-center gap-1">
              {done && (
                <Segmented
                  size="sm"
                  value={view}
                  onChange={setView}
                  options={[
                    { value: "clean", label: "Clean" },
                    { value: "highlight", label: "Changes" },
                    { value: "side", label: <ArrowRightLeft className="size-3.5" />, title: "Side-by-side comparison" },
                  ]}
                />
              )}
              <OutputActions text={done ? output : ""} title={`${toolId} result`} />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-3.5" aria-live="polite">
            {run.status === "idle" && (
              <div className="grid h-full place-items-center text-center text-sm text-muted">
                <div>
                  <div>Your result will appear here.</div>
                  <div className="mt-2 text-xs text-faint">Press <Kbd>Ctrl</Kbd> + <Kbd>Enter</Kbd> to run.</div>
                </div>
              </div>
            )}
            {run.status === "running" && !output && <WorkingIndicator progress={run.progress} label="Thinking" />}
            {run.status === "running" && output && <div className="stream-caret whitespace-pre-wrap text-[0.95rem] leading-relaxed text-ink">{output}</div>}
            {run.status === "error" && run.error && (
              <div className="space-y-3">
                {output && <div className="whitespace-pre-wrap text-[0.95rem] leading-relaxed text-ink-2">{output}</div>}
                <RunError error={run.error} onRetry={go} />
              </div>
            )}
            {done && view === "clean" && <div className="whitespace-pre-wrap text-[0.95rem] leading-relaxed text-ink">{output}</div>}
            {done && view === "highlight" && <HighlightedRevision original={lastInput} revised={output} />}
            {done && view === "side" && <SideBySideDiff original={lastInput} revised={output} />}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-2 text-xs text-muted">
            <span>{countWords(output).toLocaleString()} words</span>
            {done && lastInput && <ChangeSummary original={lastInput} revised={output} />}
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-muted">{disclaimer}</div>
        <div className="flex gap-2">
          {run.status === "running" && (
            <Button icon={<Square className="size-3.5" />} onClick={run.cancel}>Stop</Button>
          )}
          <Button variant="primary" size="lg" icon={actionIcon} onClick={go} loading={run.status === "running"} disabled={!input.trim()}>
            {actionLabel}
          </Button>
        </div>
      </div>

      {done && run.result?.explanation && (
        <Card className="mt-4 p-5">
          <div className="label mb-2">What changed and why</div>
          <div className="whitespace-pre-wrap text-sm text-ink-2">{run.result.explanation}</div>
        </Card>
      )}

      {done && (run.result?.report?.length || (showReadability && run.result?.stats)) ? (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {run.result?.report && run.result.report.length > 0 && <PreservationReport report={run.result.report} />}
          {run.result?.stats && <ReadabilityCard stats={run.result.stats} />}
        </div>
      ) : done && run.result?.stats ? (
        <div className="mt-4 grid gap-4 md:grid-cols-2"><ReadabilityCard stats={run.result.stats} /></div>
      ) : null}
    </Page>
  );
}

function PreservationReport({ report }: { report: NonNullable<RewriteResult["report"]> }) {
  return (
    <Card className="p-5">
      <div className="label mb-3">Preservation check</div>
      <div className="space-y-2.5">
        {report.map((r) => {
          const ok = r.check === "Paragraphs" ? r.kept === r.total : r.missing.length === 0;
          return (
            <div key={r.check}>
              <div className="flex items-center gap-2 text-sm">
                {ok ? <CircleCheck className="size-4 text-good" /> : <TriangleAlert className="size-4 text-warn" />}
                <span className="text-ink">{r.check}</span>
                <span className="ml-auto text-xs text-muted">{r.note ?? `${r.kept}/${r.total} kept`}</span>
              </div>
              {r.missing.length > 0 && (
                <div className="ml-6 mt-1 text-xs text-warn">Changed or missing: {r.missing.slice(0, 6).map((m) => `“${m}”`).join(", ")}</div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function ReadabilityCard({ stats }: { stats: NonNullable<RewriteResult["stats"]> }) {
  const rows: { label: string; a: number; b: number; better: "up" | "down" }[] = [
    { label: "Reading ease (0–100)", a: stats.readability_in.flesch_reading_ease, b: stats.readability_out.flesch_reading_ease, better: "up" },
    { label: "Grade level", a: stats.readability_in.grade_level, b: stats.readability_out.grade_level, better: "down" },
    { label: "Avg. sentence length", a: stats.readability_in.avg_sentence_length, b: stats.readability_out.avg_sentence_length, better: "down" },
    { label: "Words", a: stats.words_in, b: stats.words_out, better: "down" },
  ];
  return (
    <Card className="p-5">
      <div className="label mb-3">Readability, before → after</div>
      <table className="w-full text-sm">
        <tbody>
          {rows.map((r) => {
            const delta = r.b - r.a;
            const improved = r.better === "up" ? delta > 0 : delta < 0;
            return (
              <tr key={r.label} className="border-b border-line last:border-0">
                <td className="py-1.5 text-ink-2">{r.label}</td>
                <td className="py-1.5 text-right tabular-nums text-muted">{r.a}</td>
                <td className="px-2 text-faint">→</td>
                <td className={cx("py-1.5 text-right font-medium tabular-nums", delta === 0 ? "text-ink" : improved ? "text-good" : "text-ink")}>{r.b}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}
