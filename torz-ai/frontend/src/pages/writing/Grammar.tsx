import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { BookMarked, Check, CheckCheck, Copy, PenLine, SpellCheck, X } from "lucide-react";
import { useAIStatus, usePersistentState, useStreamRun, useToolVisit } from "../../lib/hooks";
import { useSettings } from "../../lib/settings";
import { Badge, Button, Card, cx, EmptyState, Switch } from "../../components/ui";
import { EngineToggle, HistoryButton, ModelBadge, Page, RunError, TextPanel, ToolHeader, useCopy, WorkingIndicator, type EngineChoice } from "../../components/tool/ToolKit";

interface Issue {
  id: string;
  offset: number;
  length: number;
  original: string;
  replacements: string[];
  category: string;
  message: string;
  explanation?: string;
  source: string;
}

const CAT: Record<string, { label: string; color: string }> = {
  spelling: { label: "Spelling", color: "var(--bad)" },
  grammar: { label: "Grammar", color: "var(--warn)" },
  agreement: { label: "Agreement", color: "var(--warn)" },
  tense: { label: "Verb tense", color: "var(--warn)" },
  missing_word: { label: "Missing word", color: "var(--warn)" },
  repetition: { label: "Repeated word", color: "var(--warn)" },
  punctuation: { label: "Punctuation", color: "var(--accent)" },
  capitalization: { label: "Capitalization", color: "var(--accent)" },
  style: { label: "Style", color: "var(--muted)" },
};

export default function Grammar() {
  useToolVisit("grammar");
  const ai = useAIStatus();
  const { settings, update } = useSettings();
  const [text, setText] = usePersistentState("grammar:text", "");
  const [engine, setEngine] = usePersistentState<EngineChoice>("grammar:engine", "ai");
  const [explain, setExplain] = usePersistentState("grammar:explain", true);
  const [issues, setIssues] = useState<Issue[] | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [accepted, setAccepted] = useState(0);
  const copy = useCopy();
  const run = useStreamRun<{ issues: Issue[]; corrected: string }>((res) => {
    setIssues(res.issues);
    setAccepted(0);
  });

  const loc = useLocation() as { state?: { text?: string } };
  useEffect(() => {
    if (loc.state?.text) setText(loc.state.text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (ai.data && !ai.data.ok && engine === "ai" && !text) setEngine("offline");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ai.data?.ok]);

  const check = (eng: EngineChoice = engine) => {
    if (!text.trim()) return;
    setIssues(null);
    run.start("/api/tools/grammar", { text, engine: eng, explain });
  };

  const applyIssue = (iss: Issue, replacement: string) => {
    if (text.slice(iss.offset, iss.offset + iss.length) !== iss.original) return;
    const delta = replacement.length - iss.length;
    setText(text.slice(0, iss.offset) + replacement + text.slice(iss.offset + iss.length));
    setIssues((list) => (list ?? []).filter((i) => i.id !== iss.id).map((i) => (i.offset > iss.offset ? { ...i, offset: i.offset + delta } : i)));
    setAccepted((n) => n + 1);
  };
  const dismiss = (iss: Issue) => setIssues((list) => (list ?? []).filter((i) => i.id !== iss.id));
  const applyAll = () => {
    if (!issues) return;
    let t = text;
    let n = 0;
    for (const iss of [...issues].sort((a, b) => b.offset - a.offset)) {
      if (!iss.replacements.length || (filter !== "all" && iss.category !== filter)) continue;
      if (t.slice(iss.offset, iss.offset + iss.length) !== iss.original) continue;
      t = t.slice(0, iss.offset) + iss.replacements[0] + t.slice(iss.offset + iss.length);
      n++;
    }
    setText(t);
    setIssues((list) => (list ?? []).filter((i) => !i.replacements.length || (filter !== "all" && i.category !== filter)));
    setAccepted((a) => a + n);
  };
  const addToDictionary = async (word: string, iss: Issue) => {
    const dict = Array.from(new Set([...(settings?.writing.dictionary ?? []), word]));
    await update({ writing: { dictionary: dict } });
    dismiss(iss);
  };

  const visible = (issues ?? []).filter((i) => filter === "all" || i.category === filter);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const i of issues ?? []) c[i.category] = (c[i.category] ?? 0) + 1;
    return c;
  }, [issues]);
  const reviewing = issues !== null;

  return (
    <Page wide>
      <ToolHeader
        toolId="grammar"
        actions={
          <HistoryButton
            toolId="grammar"
            onSelect={(e) => {
              setText(e.input_text);
              setIssues(e.output_json?.issues ?? []);
              run.setState({ status: "done", text: "", meta: { provider: e.provider, model: e.model, engine: e.engine }, progress: null, error: null, passages: null, result: null });
            }}
          />
        }
      />
      <Card className="mb-4 flex flex-wrap items-center justify-between gap-4 p-4">
        <EngineToggle value={engine} onChange={setEngine} />
        {engine === "ai" && <div className="w-64"><Switch checked={explain} onChange={setExplain} label="Explain each correction" /></div>}
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1fr_400px]">
        <div>
          {!reviewing ? (
            <TextPanel value={text} onChange={setText} minHeight="min-h-[440px]" disabled={run.status === "running"} placeholder="Paste or type text to proofread…" />
          ) : (
            <div className="card flex min-h-[500px] flex-col overflow-hidden">
              <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="label">Review</span>
                  <ModelBadge meta={run.meta} />
                </div>
                <div className="flex gap-1.5">
                  <Button size="sm" variant="ghost" icon={<Copy className="size-3.5" />} onClick={() => copy(text)}>Copy text</Button>
                  <Button size="sm" icon={<PenLine className="size-3.5" />} onClick={() => setIssues(null)}>Edit text</Button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto whitespace-pre-wrap px-5 py-4 text-[0.98rem] leading-[1.8] text-ink">
                <HighlightedText text={text} issues={issues!} active={active} onPick={setActive} />
              </div>
            </div>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="primary" size="lg" icon={<SpellCheck className="size-4" />} loading={run.status === "running"} disabled={!text.trim()} onClick={() => check()}>
              {reviewing ? "Check again" : "Check text"}
            </Button>
          </div>
        </div>

        <div className="card flex max-h-[calc(100vh-180px)] flex-col overflow-hidden lg:sticky lg:top-20">
          <div className="border-b border-line px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="font-semibold text-ink">{reviewing ? `${issues!.length} suggestion${issues!.length === 1 ? "" : "s"}` : "Suggestions"}</div>
              {reviewing && issues!.some((i) => i.replacements.length) && (
                <Button size="sm" variant="soft" icon={<CheckCheck className="size-3.5" />} onClick={applyAll}>Accept all</Button>
              )}
            </div>
            {reviewing && Object.keys(counts).length > 0 && (
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>All {issues!.length}</FilterChip>
                {Object.entries(counts).map(([c, n]) => (
                  <FilterChip key={c} active={filter === c} onClick={() => setFilter(c)} color={CAT[c]?.color}>{CAT[c]?.label ?? c} {n}</FilterChip>
                ))}
              </div>
            )}
          </div>
          <div className="flex-1 space-y-2 overflow-y-auto p-3">
            {run.status === "running" && <WorkingIndicator progress={run.progress} label="Proofreading" />}
            {run.status === "error" && run.error && <RunError error={run.error} onRetry={() => check()} onOffline={() => { setEngine("offline"); check("offline"); }} />}
            {run.status === "idle" && !reviewing && <EmptyState icon={<SpellCheck />} title="No suggestions yet" description="Paste your text and press Check text." />}
            {reviewing && issues!.length === 0 && (
              <EmptyState icon={<CheckCheck />} title={accepted ? `All done — ${accepted} fix${accepted === 1 ? "" : "es"} applied` : "No issues found"} description="Your text looks clean." />
            )}
            {visible.map((iss) => (
              <div
                key={iss.id}
                onClick={() => setActive(iss.id)}
                className={cx("cursor-pointer rounded-xl border p-3 transition", active === iss.id ? "border-accent/40 bg-accent-soft" : "border-line hover:border-line-strong")}
              >
                <div className="flex items-center gap-2">
                  <span className="size-2 rounded-full" style={{ background: CAT[iss.category]?.color ?? "var(--muted)" }} />
                  <span className="text-xs font-medium text-muted">{CAT[iss.category]?.label ?? iss.category}</span>
                  {iss.source === "offline" && <Badge className="ml-auto">rule</Badge>}
                </div>
                <div className="mt-2 text-sm">
                  {iss.original && <span className="diff-del">{iss.original.length > 60 ? iss.original.slice(0, 60) + "…" : iss.original}</span>}
                  {iss.replacements[0] !== undefined && iss.category !== "style" && (
                    <>
                      <span className="mx-1.5 text-faint">→</span>
                      <span className="diff-add">{iss.replacements[0] || "(remove)"}</span>
                    </>
                  )}
                </div>
                <div className="mt-1.5 text-xs text-ink-2">{iss.explanation ?? iss.message}</div>
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {iss.replacements.slice(0, 3).map((r, k) => (
                    <Button key={k} size="sm" variant={k === 0 ? "soft" : "ghost"} icon={k === 0 ? <Check className="size-3.5" /> : undefined} onClick={(e) => { e.stopPropagation(); applyIssue(iss, r); }}>
                      {k === 0 ? "Accept" : r || "(remove)"}
                    </Button>
                  ))}
                  <Button size="sm" variant="ghost" icon={<X className="size-3.5" />} onClick={(e) => { e.stopPropagation(); dismiss(iss); }}>
                    {iss.replacements.length ? "Reject" : "Dismiss"}
                  </Button>
                  {iss.category === "spelling" && (
                    <Button size="sm" variant="ghost" icon={<BookMarked className="size-3.5" />} onClick={(e) => { e.stopPropagation(); addToDictionary(iss.original, iss); }}>
                      Add to dictionary
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Page>
  );
}

function FilterChip({ active, onClick, children, color }: { active: boolean; onClick: () => void; children: React.ReactNode; color?: string }) {
  return (
    <button onClick={onClick} className={cx("flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.72rem] font-medium transition", active ? "border-accent/40 bg-accent-soft text-ink" : "border-line text-muted hover:text-ink")}>
      {color && <span className="size-1.5 rounded-full" style={{ background: color }} />}
      {children}
    </button>
  );
}

function HighlightedText({ text, issues, active, onPick }: { text: string; issues: Issue[]; active: string | null; onPick: (id: string) => void }) {
  const parts: React.ReactNode[] = [];
  let pos = 0;
  for (const iss of [...issues].sort((a, b) => a.offset - b.offset)) {
    if (iss.offset < pos) continue;
    if (iss.offset > pos) parts.push(text.slice(pos, iss.offset));
    const color = CAT[iss.category]?.color ?? "var(--muted)";
    parts.push(
      <mark
        key={iss.id}
        onClick={() => onPick(iss.id)}
        className={cx("cursor-pointer rounded-[3px] bg-transparent px-px text-inherit transition", active === iss.id && "bg-accent-soft")}
        style={{ textDecoration: `underline wavy ${color}`, textUnderlineOffset: "4px", textDecorationThickness: "1.5px" }}
        title={iss.message}
      >
        {text.slice(iss.offset, iss.offset + iss.length) || "␣"}
      </mark>,
    );
    pos = iss.offset + iss.length;
  }
  parts.push(text.slice(pos));
  return <>{parts}</>;
}
