import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Cpu,
  FilePlus,
  FileText,
  GripVertical,
  Layers,
  Search,
  Star,
  WandSparkles,
} from "lucide-react";
import { get, post, put } from "../lib/api";
import { compact, greeting, plural, timeAgo } from "../lib/format";
import { useAIStatus, useFavorites } from "../lib/hooks";
import { useSettings } from "../lib/settings";
import { CATEGORIES, TOOLS, TOOL_BY_ID, toolName, type ToolDef } from "../lib/tools";
import { Badge, Button, Card, cx, EmptyState, Input, SectionTitle, Skeleton, useUi } from "../components/ui";
import { FavoriteStar, Page } from "../components/tool/ToolKit";

interface DashboardData {
  profile: { name: string };
  favorites: string[];
  recent_tools: { tool_id: string; count: number; last_used_at: string }[];
  recent_documents: { id: number; title: string; updated_at: string; word_count: number }[];
  recent_files: { id: number; filename: string; created_at: string; pages: number }[];
  recent_history: { id: number; tool: string; title: string; created_at: string; engine: string; model: string }[];
  stats: {
    runs_week: number; runs_total: number; words_total: number; words_week: number;
    daily: { date: string; runs: number }[]; top_tools: { tool_id: string; runs: number }[];
    average_score: number | null; attempts: number; documents: number; notes: number; decks: number; cards: number;
    cards_known: number; quizzes: number; tests: number; guides: number; files: number; history: number;
  };
}

export default function Dashboard() {
  const q = useQuery<DashboardData>({ queryKey: ["dashboard"], queryFn: () => get("/api/dashboard") });
  const { settings } = useSettings();
  const nav = useNavigate();
  const { toast } = useUi();
  const name = settings?.profile.name;
  const d = q.data;

  const newDoc = async () => {
    try {
      const doc = await post<{ id: number }>("/api/documents", { title: "Untitled document" });
      nav(`/documents/${doc.id}`);
    } catch (e) {
      toast((e as Error).message, "bad");
    }
  };

  return (
    <Page wide>
      {/* hero */}
      <div className="relative mb-7 overflow-hidden rounded-3xl border border-line bg-surface px-8 py-7 shadow-card">
        <div className="pointer-events-none absolute -right-20 -top-24 size-80 rounded-full accent-gradient opacity-[0.09] blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 left-1/3 size-72 rounded-full bg-accent-2 opacity-[0.06] blur-3xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div>
            <div className="text-sm text-muted">{new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</div>
            <h1 className="mt-1 text-[2rem] font-semibold tracking-tight text-ink">
              {greeting()}{name ? <>, <span className="gradient-text">{name}</span></> : ""}
            </h1>
            <p className="mt-1.5 max-w-xl text-[0.95rem] text-muted">
              Everything runs on your machine. Pick up where you left off, or start something new.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" icon={<WandSparkles className="size-4" />} onClick={() => nav("/humanizer")}>Improve writing</Button>
            <Button icon={<FileText className="size-4" />} onClick={() => nav("/summarizer")}>Summarize</Button>
            <Button icon={<Layers className="size-4" />} onClick={() => nav("/flashcards")}>Flashcards</Button>
            <Button icon={<ClipboardCheck className="size-4" />} onClick={() => nav("/quiz")}>Quiz</Button>
            <Button icon={<FilePlus className="size-4" />} onClick={newDoc}>New document</Button>
          </div>
        </div>
      </div>

      {/* stats */}
      <div className="mb-7 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {!d ? (
          [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[104px] rounded-2xl" />)
        ) : (
          <>
            <Stat label="Words processed" value={compact(d.stats.words_total)} sub={`${compact(d.stats.words_week)} this week`} />
            <Stat label="Tool runs this week" value={d.stats.runs_week.toLocaleString()} sub={`${d.stats.runs_total.toLocaleString()} all time`} />
            <Stat label="Library" value={(d.stats.documents + d.stats.notes).toLocaleString()} sub={`${plural(d.stats.documents, "document")} · ${plural(d.stats.notes, "note")} · ${plural(d.stats.files, "file")}`} />
            <Stat
              label="Study progress"
              value={d.stats.cards ? `${Math.round((100 * d.stats.cards_known) / d.stats.cards)}%` : "—"}
              sub={`${d.stats.cards_known}/${d.stats.cards} cards known${d.stats.average_score !== null ? ` · avg score ${d.stats.average_score}%` : ""}`}
            />
          </>
        )}
      </div>

      <div className="mb-7 grid gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <SectionTitle title="Activity" subtitle="Tool runs per day, last 14 days" />
          {d ? <ActivityChart data={d.stats.daily} /> : <Skeleton className="h-44" />}
        </Card>
        <AIStatusCard />
      </div>

      {/* favorites */}
      <FavoritesSection favorites={d?.favorites ?? []} />

      <div className="mb-8 grid gap-4 lg:grid-cols-3">
        <Card className="p-5">
          <SectionTitle title="Recently used" />
          {d && d.recent_tools.length === 0 && <p className="py-6 text-center text-sm text-muted">Tools you open will show up here.</p>}
          <div className="space-y-1">
            {d?.recent_tools.slice(0, 6).map((r) => {
              const t = TOOL_BY_ID[r.tool_id];
              if (!t) return null;
              return (
                <Link key={r.tool_id} to={t.path} className="flex items-center gap-3 rounded-xl px-2.5 py-2 transition hover:bg-surface-2">
                  <t.icon className="size-4 text-accent" />
                  <span className="flex-1 text-sm text-ink">{t.name}</span>
                  <span className="text-xs text-faint">{timeAgo(r.last_used_at)}</span>
                </Link>
              );
            })}
          </div>
        </Card>
        <Card className="p-5">
          <SectionTitle title="Recent documents" action={<Link to="/documents" className="text-xs text-accent hover:underline">All documents</Link>} />
          {d && d.recent_documents.length === 0 && d.recent_files.length === 0 && (
            <EmptyState className="py-6" title="No documents yet" action={<Button size="sm" onClick={newDoc} icon={<FilePlus className="size-3.5" />}>New document</Button>} />
          )}
          <div className="space-y-1">
            {d?.recent_documents.map((doc) => (
              <Link key={doc.id} to={`/documents/${doc.id}`} className="flex items-center gap-3 rounded-xl px-2.5 py-2 transition hover:bg-surface-2">
                <FileText className="size-4 text-muted" />
                <span className="min-w-0 flex-1 truncate text-sm text-ink">{doc.title}</span>
                <span className="text-xs text-faint">{timeAgo(doc.updated_at)}</span>
              </Link>
            ))}
            {d?.recent_files.map((f) => (
              <Link key={`f${f.id}`} to={`/pdf/${f.id}`} className="flex items-center gap-3 rounded-xl px-2.5 py-2 transition hover:bg-surface-2">
                <FileText className="size-4 text-accent-2" />
                <span className="min-w-0 flex-1 truncate text-sm text-ink">{f.filename}</span>
                <span className="text-xs text-faint">{timeAgo(f.created_at)}</span>
              </Link>
            ))}
          </div>
        </Card>
        <Card className="p-5">
          <SectionTitle title="Recent results" action={<Link to="/history" className="text-xs text-accent hover:underline">History</Link>} />
          {d && d.recent_history.length === 0 && <p className="py-6 text-center text-sm text-muted">Your writing and study results will appear here.</p>}
          <div className="space-y-1">
            {d?.recent_history.map((h) => (
              <Link key={h.id} to={`/history/${h.id}`} className="block rounded-xl px-2.5 py-2 transition hover:bg-surface-2">
                <div className="truncate text-sm text-ink">{h.title}</div>
                <div className="text-xs text-faint">{toolName(h.tool)} · {timeAgo(h.created_at)}</div>
              </Link>
            ))}
          </div>
        </Card>
      </div>

      <AllTools />
    </Page>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <Card className="p-5">
      <div className="label">{label}</div>
      <div className="mt-2 text-[1.75rem] font-semibold tracking-tight text-ink tabular-nums">{value}</div>
      <div className="mt-0.5 truncate text-xs text-muted" title={sub}>{sub}</div>
    </Card>
  );
}

/** Single-series bar chart: one hue, rounded data-ends, per-bar hover tooltip, table fallback for screen readers. */
function ActivityChart({ data }: { data: { date: string; runs: number }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(4, ...data.map((d) => d.runs));
  const niceMax = Math.ceil(max / 4) * 4;
  const W = 640;
  const H = 170;
  const pad = { l: 28, r: 8, t: 10, b: 24 };
  const bw = (W - pad.l - pad.r) / data.length;
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / niceMax);
  const total = data.reduce((a, b) => a + b.runs, 0);
  const label = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });

  if (total === 0)
    return <EmptyState className="py-8" title="No activity yet" description="Run any tool and your daily activity will be charted here." />;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Tool runs per day over the last 14 days, ${total} in total`}>
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={pad.l} x2={W - pad.r} y1={y(niceMax * f)} y2={y(niceMax * f)} stroke="var(--border)" strokeDasharray={f === 0 ? undefined : "3 4"} />
            <text x={pad.l - 6} y={y(niceMax * f) + 3.5} textAnchor="end" fontSize="10" fill="var(--faint)">{niceMax * f}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const x = pad.l + i * bw + 1;
          const w = bw - 2; // 2px surface gap between bars
          const top = y(d.runs);
          const h = H - pad.b - top;
          const r = Math.min(4, w / 2, h);
          return (
            <g key={d.date} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={pad.l + i * bw} y={pad.t} width={bw} height={H - pad.t - pad.b} fill="transparent" />
              {d.runs > 0 && (
                <path
                  d={`M${x},${H - pad.b} V${top + r} Q${x},${top} ${x + r},${top} H${x + w - r} Q${x + w},${top} ${x + w},${top + r} V${H - pad.b} Z`}
                  fill="var(--accent)"
                  opacity={hover === null || hover === i ? 0.9 : 0.45}
                />
              )}
              {(i % 2 === 0 || i === data.length - 1) && (
                <text x={pad.l + i * bw + bw / 2} y={H - 7} textAnchor="middle" fontSize="10" fill="var(--faint)">{label(d.date)}</text>
              )}
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <div className="pointer-events-none absolute -top-2 rounded-lg border border-line bg-surface-3 px-2.5 py-1.5 text-xs shadow-pop" style={{ left: `${((pad.l + hover * bw + bw / 2) / W) * 100}%`, transform: "translate(-50%, -100%)" }}>
          <div className="text-muted">{label(data[hover].date)}</div>
          <div className="font-semibold text-ink">{data[hover].runs} run{data[hover].runs === 1 ? "" : "s"}</div>
        </div>
      )}
      <table className="sr-only">
        <caption>Tool runs per day</caption>
        <tbody>{data.map((d) => <tr key={d.date}><th>{d.date}</th><td>{d.runs}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

function AIStatusCard() {
  const st = useAIStatus();
  const nav = useNavigate();
  const d = st.data;
  return (
    <Card className="flex flex-col p-5">
      <SectionTitle title="AI engine" />
      {!d && !st.isError && <Skeleton className="h-24" />}
      {st.isError && <p className="text-sm text-bad">The TORZ AI server is not reachable.</p>}
      {d && (
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <div className={cx("grid size-11 place-items-center rounded-xl", d.ok ? "bg-accent-soft text-accent" : "bg-warn/10 text-warn")}>
              <Cpu className="size-5" />
            </div>
            <div className="min-w-0">
              <div className="truncate font-semibold text-ink">{d.ok ? (d.fallback ? d.fallback.model : d.model) : "Not connected"}</div>
              <div className="text-xs text-muted">{d.provider_label}</div>
            </div>
            <Badge tone={d.ok ? "good" : "warn"} className="ml-auto">{d.ok ? (d.local ? "Local" : "Cloud") : "Setup needed"}</Badge>
          </div>
          <p className="mt-3 text-sm text-muted">{d.message}</p>
        </div>
      )}
      <Button className="mt-4 w-full" onClick={() => nav("/settings/ai")} icon={<Cpu className="size-4" />}>
        {d?.ok ? "Manage models" : "Set up AI"}
      </Button>
    </Card>
  );
}

function FavoritesSection({ favorites }: { favorites: string[] }) {
  const fav = useFavorites();
  const qc = useQueryClient();
  const [dragId, setDragId] = useState<string | null>(null);
  const list = (fav.data?.favorites ?? favorites).filter((id) => TOOL_BY_ID[id]);

  const save = async (ids: string[]) => {
    qc.setQueryData(["favorites"], { favorites: ids });
    const res = await put<{ favorites: string[] }>("/api/favorites", { tool_ids: ids });
    qc.setQueryData(["favorites"], res);
  };
  const move = (id: string, dir: -1 | 1) => {
    const i = list.indexOf(id);
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    save(next);
  };

  return (
    <div className="mb-7">
      <SectionTitle title={<span className="flex items-center gap-2"><Star className="size-4 fill-current text-warn" /> Favorites</span>} subtitle={list.length > 1 ? "Drag to rearrange" : undefined} />
      {list.length === 0 ? (
        <Card className="px-5 py-6 text-sm text-muted">Star any tool (☆ next to its name) to pin it here and in the sidebar.</Card>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {list.map((id, i) => {
            const t = TOOL_BY_ID[id];
            return (
              <div
                key={id}
                draggable
                onDragStart={() => setDragId(id)}
                onDragEnd={() => setDragId(null)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (!dragId || dragId === id) return;
                  const next = list.filter((x) => x !== dragId);
                  next.splice(next.indexOf(id) + (list.indexOf(dragId) < list.indexOf(id) ? 1 : 0), 0, dragId);
                  save(next);
                }}
                className={cx("card card-hover group relative p-4", dragId === id && "opacity-50")}
                data-testid={`favorite-${id}`}
              >
                <Link to={t.path} className="block">
                  <t.icon className="size-5 text-accent" />
                  <div className="mt-3 text-sm font-semibold text-ink">{t.name}</div>
                </Link>
                <div className="absolute right-2 top-2 flex items-center opacity-0 transition group-hover:opacity-100">
                  <button aria-label={`Move ${t.name} left`} onClick={() => move(id, -1)} disabled={i === 0} className="rounded p-1 text-faint hover:text-ink disabled:opacity-30"><ChevronLeft className="size-3.5" /></button>
                  <GripVertical className="size-3.5 cursor-grab text-faint" />
                  <button aria-label={`Move ${t.name} right`} onClick={() => move(id, 1)} disabled={i === list.length - 1} className="rounded p-1 text-faint hover:text-ink disabled:opacity-30"><ChevronRight className="size-3.5" /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AllTools() {
  const [filter, setFilter] = useState("");
  const shown = useMemo(() => {
    const s = filter.trim().toLowerCase();
    return s ? TOOLS.filter((t) => `${t.name} ${t.description}`.toLowerCase().includes(s)) : TOOLS;
  }, [filter]);
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[1.15rem] font-semibold tracking-tight">All tools</h2>
          <p className="text-sm text-muted">17 tools, all unlimited and private.</p>
        </div>
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
          <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Find a tool" className="pl-9" aria-label="Find a tool" />
        </div>
      </div>
      {shown.length === 0 && <Card className="p-6 text-center text-sm text-muted">No tool matches “{filter}”.</Card>}
      {CATEGORIES.map((c) => {
        const tools = shown.filter((t) => t.category === c.id);
        if (!tools.length) return null;
        return (
          <section key={c.id} className="mb-7">
            <div className="mb-3 flex items-baseline gap-3">
              <h3 className="label !text-[0.75rem] !text-ink-2">{c.label}</h3>
              <span className="text-xs text-faint">{c.blurb}</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {tools.map((t) => <ToolCard key={t.id} t={t} />)}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function ToolCard({ t }: { t: ToolDef }) {
  return (
    <Link to={t.path} className="card card-hover group relative flex flex-col p-4" data-testid={`tool-card-${t.id}`}>
      <div className="flex items-start justify-between">
        <div className="grid size-10 place-items-center rounded-xl border border-line bg-surface-2 transition group-hover:border-accent/30">
          <t.icon className="size-[1.1rem] text-accent" />
        </div>
        <FavoriteStar toolId={t.id} className="-mr-1 -mt-1" />
      </div>
      <div className="mt-3 text-[0.92rem] font-semibold text-ink">{t.name}</div>
      <p className="mt-1 line-clamp-2 text-[0.8rem] leading-relaxed text-muted">{t.description}</p>
      <div className="mt-auto flex items-center gap-2 pt-3">
        {t.offline && <Badge>Works offline</Badge>}
        <ArrowRight className="ml-auto size-4 text-faint transition group-hover:translate-x-0.5 group-hover:text-accent" />
      </div>
    </Link>
  );
}
