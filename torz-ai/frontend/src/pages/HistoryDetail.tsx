import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Copy, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { del, get, patch } from "../lib/api";
import { formatDateTime } from "../lib/format";
import { renderMarkdown } from "../lib/markdown";
import { toolName } from "../lib/tools";
import { Badge, Button, Card, EmptyState, IconButton, Spinner, useUi } from "../components/ui";
import { ModelBadge, OutputActions, Page, useCopy } from "../components/tool/ToolKit";
import { reusePath } from "./History";

function linkFor(e: any): { label: string; to: string } | null {
  const j = e.output_json ?? {};
  if (j.note_id) return { label: "Open note", to: `/notes/${j.note_id}` };
  if (j.deck_id) return { label: "Open deck", to: `/flashcards/${j.deck_id}` };
  if (j.guide_id) return { label: "Open study guide", to: `/study-guide/${j.guide_id}` };
  if (j.attempt_id) return { label: "Open results", to: `/attempts/${j.attempt_id}` };
  if (j.quiz_id) return { label: e.tool === "practice_test" ? "Open test" : "Open quiz", to: e.tool === "practice_test" ? `/practice-test/${j.quiz_id}` : `/quiz/${j.quiz_id}` };
  return null;
}

export default function HistoryDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const copy = useCopy();
  const { confirm } = useUi();
  const q = useQuery<any>({ queryKey: ["history-entry", id], queryFn: () => get(`/api/history/${id}`) });
  if (q.isLoading) return <div className="grid h-[60vh] place-items-center"><Spinner className="size-6" /></div>;
  if (!q.data) return <Page><EmptyState title="Entry not found" action={<Button onClick={() => nav("/history")}>Back to history</Button>} /></Page>;
  const e = q.data;
  const link = linkFor(e);
  const settings = Object.entries(e.settings ?? {}).filter(([, v]) => v !== "" && v !== null && !(Array.isArray(v) && !v.length));
  return (
    <Page wide>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <IconButton label="Back" onClick={() => nav("/history")}><ArrowLeft className="size-4" /></IconButton>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[1.3rem] font-semibold">{e.title}</h1>
          <div className="text-xs text-muted">{toolName(e.tool)} · {formatDateTime(e.created_at)}{e.duration_ms ? ` · ${(e.duration_ms / 1000).toFixed(1)}s` : ""}</div>
        </div>
        <ModelBadge meta={{ model: e.model, provider: e.provider, engine: e.engine }} />
        {link && <Button variant="soft" icon={<ArrowRight className="size-4" />} onClick={() => nav(link.to)}>{link.label}</Button>}
        <Button icon={<RotateCcw className="size-4" />} onClick={() => nav(reusePath(e), { state: { text: e.input_text } })}>Reuse input</Button>
        <IconButton label="Rename" onClick={async () => { const t = await confirm({ title: "Rename entry", input: { label: "Title", initial: e.title }, confirmLabel: "Save" }); if (typeof t === "string") { await patch(`/api/history/${e.id}`, { title: t }); q.refetch(); qc.invalidateQueries({ queryKey: ["history"] }); } }}><Pencil className="size-4" /></IconButton>
        <IconButton label="Delete" onClick={async () => { if (await confirm({ title: "Delete this entry?", danger: true, confirmLabel: "Delete" })) { await del(`/api/history/${e.id}`); qc.invalidateQueries({ queryKey: ["history"] }); nav("/history"); } }}><Trash2 className="size-4" /></IconButton>
      </div>
      {settings.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-1.5">
          {settings.map(([k, v]) => <Badge key={k}>{k.replace(/_/g, " ")}: {Array.isArray(v) ? v.join(", ") : String(v)}</Badge>)}
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="flex flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <span className="label">Input</span>
            <IconButton label="Copy input" onClick={() => copy(e.input_text)}><Copy className="size-4" /></IconButton>
          </div>
          <div className="max-h-[65vh] overflow-y-auto whitespace-pre-wrap px-4 py-3 text-sm leading-relaxed text-ink-2">{e.input_text}</div>
        </Card>
        <Card className="flex flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <span className="label">Output</span>
            <OutputActions text={e.output_text} title={e.title} />
          </div>
          <div className="max-h-[65vh] overflow-y-auto px-4 py-3">
            {e.output_json?.issues ? (
              <div className="space-y-2 text-sm">
                <div className="whitespace-pre-wrap leading-relaxed text-ink">{e.output_text}</div>
                <div className="label mt-4">{e.output_json.issues.length} corrections</div>
                {e.output_json.issues.map((i: any) => <div key={i.id} className="text-ink-2"><span className="diff-del">{i.original}</span> → <span className="diff-add">{i.replacements[0] ?? ""}</span> <span className="text-xs text-muted">{i.message}</span></div>)}
              </div>
            ) : e.output_json?.passages ? (
              <div className="space-y-2">
                {e.output_text && <div className="prose-torz text-sm" dangerouslySetInnerHTML={{ __html: renderMarkdown(e.output_text) }} />}
                {e.output_json.passages.map((p: any, i: number) => <div key={i} className="rounded-lg border border-line p-2.5 text-xs text-ink-2"><b>[{i + 1}] {p.source}</b><div className="mt-1">{p.text}</div></div>)}
              </div>
            ) : (
              <div className="prose-torz text-[0.92rem]" dangerouslySetInnerHTML={{ __html: renderMarkdown(e.output_text || "_No text output_") }} />
            )}
          </div>
        </Card>
      </div>
    </Page>
  );
}
