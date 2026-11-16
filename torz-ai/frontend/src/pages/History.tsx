import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Ellipsis, History as HistoryIcon, Pencil, RotateCcw, Search, Trash2 } from "lucide-react";
import { del, get, patch } from "../lib/api";
import { formatDateTime } from "../lib/format";
import { useDebounced } from "../lib/hooks";
import { TOOL_BY_ID, toolName } from "../lib/tools";
import { Badge, Button, Card, EmptyState, IconButton, Input, Menu, Select, Skeleton, useUi } from "../components/ui";
import { Page, useCopy } from "../components/tool/ToolKit";

const PAGE = 30;

export function reusePath(e: { tool: string; output_json?: any }): string {
  const t = TOOL_BY_ID[e.tool];
  return t?.path ?? "/";
}

export default function History() {
  const [params, setParams] = useSearchParams();
  const tool = params.get("tool") ?? "";
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const dq = useDebounced(q, 250);
  const qc = useQueryClient();
  const nav = useNavigate();
  const copy = useCopy();
  const { confirm, toast } = useUi();
  const data = useQuery<{ entries: any[]; total: number; tools: Record<string, number> }>({
    queryKey: ["history", "page", tool, dq, page],
    queryFn: () => get("/api/history", { tool, q: dq, limit: PAGE, offset: page * PAGE }),
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["history"] });

  const reuse = async (id: number) => {
    const e = await get(`/api/history/${id}`);
    nav(reusePath(e), { state: { text: e.input_text } });
  };

  return (
    <Page wide>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[1.45rem] font-semibold tracking-tight">History</h1>
          <p className="mt-1 text-sm text-muted">Every result you've generated, stored only on this computer.</p>
        </div>
        <Button variant="danger" icon={<Trash2 className="size-4" />} disabled={!data.data?.total} onClick={async () => {
          if (await confirm({ title: tool ? `Clear ${toolName(tool)} history?` : "Clear all history?", message: "History entries are deleted permanently. Your documents, notes, decks and quizzes are not affected.", danger: true, confirmLabel: "Clear history" })) {
            const r = await del("/api/history", tool ? { tool } : undefined);
            refresh();
            toast(`Deleted ${r.deleted} entries`);
          }
        }}>{tool ? "Clear this tool's history" : "Clear all history"}</Button>
      </div>
      <div className="mb-4 flex flex-wrap gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
          <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder="Search inputs, outputs and titles" className="pl-9" aria-label="Search history" />
        </div>
        <Select value={tool} onChange={(e) => { setParams(e.target.value ? { tool: e.target.value } : {}); setPage(0); }} className="w-60" aria-label="Filter by tool">
          <option value="">All tools</option>
          {Object.entries(data.data?.tools ?? {}).map(([t, n]) => <option key={t} value={t}>{toolName(t)} ({n})</option>)}
        </Select>
      </div>
      {data.isLoading && <div className="space-y-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-16" />)}</div>}
      {data.data?.entries.length === 0 && <Card><EmptyState icon={<HistoryIcon />} title={q || tool ? "Nothing matches" : "No history yet"} description="Results from every tool are saved here automatically (you can turn this off in Settings → Privacy)." /></Card>}
      <div className="space-y-2">
        {data.data?.entries.map((e) => {
          const t = TOOL_BY_ID[e.tool];
          return (
            <Card key={e.id} className="flex items-center gap-4 px-4 py-3">
              <div className="grid size-10 shrink-0 place-items-center rounded-xl border border-line bg-surface-2">{t ? <t.icon className="size-4 text-accent" /> : <HistoryIcon className="size-4" />}</div>
              <Link to={`/history/${e.id}`} className="min-w-0 flex-1">
                <div className="truncate font-medium text-ink">{e.title}</div>
                <div className="truncate text-xs text-muted">{e.preview}</div>
              </Link>
              <div className="hidden shrink-0 text-right text-xs md:block">
                <div className="text-ink-2">{toolName(e.tool)}</div>
                <div className="text-faint">{formatDateTime(e.created_at)}</div>
              </div>
              <Badge className="hidden lg:inline-flex">{e.engine === "offline" ? "Offline engine" : e.model || e.engine}</Badge>
              <Menu
                trigger={(tg) => <IconButton label="Entry options" onClick={tg}><Ellipsis className="size-4" /></IconButton>}
                items={[
                  { label: "Open", icon: <HistoryIcon />, onClick: () => nav(`/history/${e.id}`) },
                  { label: "Copy result", icon: <Copy />, onClick: async () => copy((await get(`/api/history/${e.id}`)).output_text) },
                  { label: "Reuse input", icon: <RotateCcw />, onClick: () => reuse(e.id) },
                  { label: "Rename", icon: <Pencil />, onClick: async () => { const ti = await confirm({ title: "Rename entry", input: { label: "Title", initial: e.title }, confirmLabel: "Save" }); if (typeof ti === "string") { await patch(`/api/history/${e.id}`, { title: ti }); refresh(); } } },
                  "divider",
                  { label: "Delete", icon: <Trash2 />, danger: true, onClick: async () => { await del(`/api/history/${e.id}`); refresh(); } },
                ]}
              />
            </Card>
          );
        })}
      </div>
      {(data.data?.total ?? 0) > PAGE && (
        <div className="mt-5 flex items-center justify-center gap-3 text-sm">
          <Button size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Button>
          <span className="text-muted">Page {page + 1} of {Math.ceil((data.data?.total ?? 0) / PAGE)}</span>
          <Button size="sm" disabled={(page + 1) * PAGE >= (data.data?.total ?? 0)} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      )}
    </Page>
  );
}
