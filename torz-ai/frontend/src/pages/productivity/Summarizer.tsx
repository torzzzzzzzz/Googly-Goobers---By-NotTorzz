import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { FileText, Square } from "lucide-react";
import { useAIStatus, usePersistentState, useStreamRun, useToolVisit } from "../../lib/hooks";
import { renderMarkdown } from "../../lib/markdown";
import { Button, Card, cx, EmptyState, Segmented, Slider } from "../../components/ui";
import {
  EngineToggle,
  HistoryButton,
  ModelBadge,
  OutputActions,
  Page,
  RunError,
  SourcePicker,
  sourceBody,
  sourceReady,
  sourceTitle,
  ToolHeader,
  WorkingIndicator,
  type EngineChoice,
  type SourceValue,
} from "../../components/tool/ToolKit";

type Format = "short" | "detailed" | "bullets" | "paragraph" | "facts" | "arguments" | "vocabulary";
const FORMATS: { value: Format; label: string }[] = [
  { value: "short", label: "Short" },
  { value: "detailed", label: "Detailed" },
  { value: "bullets", label: "Bullet points" },
  { value: "paragraph", label: "Paragraph" },
  { value: "facts", label: "Key facts" },
  { value: "arguments", label: "Main arguments" },
  { value: "vocabulary", label: "Key vocabulary" },
];
const LENGTHS = [0, 60, 120, 250, 450, 800];
const LENGTH_LABELS = ["Auto", "Very short", "Short", "Medium", "Long", "Very long"];

export default function Summarizer() {
  useToolVisit("summarizer");
  const loc = useLocation() as { state?: { fileId?: number; fileName?: string; text?: string } };
  const ai = useAIStatus();
  const [source, setSource] = usePersistentState<SourceValue>("summarizer:source", { mode: "text", text: "" });
  const [format, setFormat] = usePersistentState<Format>("summarizer:format", "bullets");
  const [lengthIdx, setLengthIdx] = usePersistentState("summarizer:length", 0);
  const [engine, setEngine] = usePersistentState<EngineChoice>("summarizer:engine", "ai");
  const run = useStreamRun<{ output: string; stats: { words_in: number; words_out: number; sections?: number } }>();

  useEffect(() => {
    if (loc.state?.fileId) setSource({ mode: "file", text: "", fileId: loc.state.fileId, fileName: loc.state.fileName });
    else if (loc.state?.text) setSource({ mode: "text", text: loc.state.text });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (ai.data && !ai.data.ok && engine === "ai") setEngine("offline");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ai.data?.ok]);

  const go = (eng: EngineChoice = engine) => run.start("/api/tools/summarize", { ...sourceBody(source), format, length: LENGTHS[lengthIdx], engine: eng, title: sourceTitle(source) });
  const stats = run.result?.stats;

  return (
    <Page wide>
      <ToolHeader
        toolId="summarizer"
        actions={
          <HistoryButton
            toolId="summarizer"
            onSelect={(e) => {
              setSource({ mode: "text", text: e.input_text });
              if (e.settings?.format) setFormat(e.settings.format);
              run.setState({ status: "done", text: e.output_text, meta: { model: e.model, provider: e.provider, engine: e.engine }, progress: null, error: null, passages: null, result: { output: e.output_text, stats: { words_in: e.words_in, words_out: e.words_out } } });
            }}
          />
        }
      />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="space-y-4">
          <SourcePicker value={source} onChange={setSource} minHeight="min-h-[300px]" />
          <Card className="space-y-4 p-4">
            <div>
              <div className="label mb-2">Format</div>
              <Segmented size="sm" value={format} onChange={setFormat} options={FORMATS} />
            </div>
            <div>
              <div className="label mb-3">Length: {LENGTH_LABELS[lengthIdx]}{LENGTHS[lengthIdx] ? ` (~${LENGTHS[lengthIdx]} words)` : ""}</div>
              <Slider value={lengthIdx} onChange={setLengthIdx} min={0} max={5} labels={["Auto", "", "", "", "", "Very long"]} />
            </div>
            <EngineToggle value={engine} onChange={setEngine} />
            <div className="flex justify-end gap-2">
              {run.status === "running" && <Button icon={<Square className="size-3.5" />} onClick={run.cancel}>Stop</Button>}
              <Button variant="primary" size="lg" icon={<FileText className="size-4" />} loading={run.status === "running"} disabled={!sourceReady(source)} onClick={() => go()}>
                Summarize
              </Button>
            </div>
          </Card>
        </div>

        <div className="card flex min-h-[560px] flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <div className="flex items-center gap-2">
              <span className="label">Summary</span>
              <ModelBadge meta={run.meta} />
            </div>
            <OutputActions text={run.status === "done" ? run.text : ""} title={`Summary - ${sourceTitle(source) || "text"}`} />
          </div>
          <div className="flex-1 overflow-y-auto px-6 py-5">
            {run.status === "idle" && <EmptyState icon={<FileText />} title="Your summary will appear here" description="Paste text, upload a PDF/DOCX, or pick one of your documents. Long documents are summarized section by section." />}
            {run.status === "running" && !run.text && <WorkingIndicator progress={run.progress} label="Summarizing" />}
            {run.text && (run.status === "running" || run.status === "done") && (
              <div className={cx("prose-torz", run.status === "running" && "stream-caret")} dangerouslySetInnerHTML={{ __html: renderMarkdown(run.text) }} />
            )}
            {run.status === "error" && run.error && <RunError error={run.error} onRetry={() => go()} onOffline={() => { setEngine("offline"); go("offline"); }} />}
          </div>
          {run.status === "done" && stats && (
            <div className="flex flex-wrap gap-x-5 gap-y-1 border-t border-line px-4 py-2 text-xs text-muted">
              <span>{stats.words_in.toLocaleString()} → {stats.words_out.toLocaleString()} words</span>
              {stats.words_in > 0 && <span>{Math.max(0, Math.round(100 - (100 * stats.words_out) / stats.words_in))}% shorter</span>}
              {stats.sections && stats.sections > 1 && <span>{stats.sections} sections combined</span>}
            </div>
          )}
        </div>
      </div>
    </Page>
  );
}
