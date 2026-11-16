import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, BookOpenCheck, ChevronDown, ClipboardCheck, Download, Eye, Layers, TriangleAlert, Zap } from "lucide-react";
import { downloadFrom, get } from "../../lib/api";
import { useToolVisit } from "../../lib/hooks";
import { Button, Card, cx, EmptyState, IconButton, Menu, Segmented, Spinner, useUi } from "../../components/ui";
import { ModelBadge } from "../../components/tool/ToolKit";

export default function GuideView() {
  useToolVisit("study_guide");
  const { id } = useParams();
  const nav = useNavigate();
  const { toast } = useUi();
  const g = useQuery<any>({ queryKey: ["guide", id], queryFn: () => get(`/api/guides/${id}`) });
  const [mode, setMode] = useState<"quick" | "detailed">("quick");
  const asText = useMemo(() => {
    const d = g.data?.data;
    if (!d) return "";
    const parts = [d.overview, ...(d.topics ?? []).map((t: any) => `${t.name}. ${t.summary} ${(t.key_points ?? []).join(" ")}`), ...(d.vocabulary ?? []).map((v: any) => `${v.term}: ${v.definition}`), ...(d.key_concepts ?? []).map((k: any) => `${k.concept}: ${k.explanation}`), ...(d.facts ?? [])];
    return parts.join("\n\n");
  }, [g.data]);

  if (g.isLoading) return <div className="grid h-[60vh] place-items-center"><Spinner className="size-6" /></div>;
  if (!g.data) return <div className="p-10"><EmptyState title="Study guide not found" action={<Button onClick={() => nav("/study-guide")}>Back</Button>} /></div>;
  const d = g.data.data;

  return (
    <div className="mx-auto max-w-[1050px] animate-rise px-6 py-7">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <IconButton label="Back" onClick={() => nav("/study-guide")}><ArrowLeft className="size-4" /></IconButton>
        <h1 className="min-w-0 flex-1 text-[1.5rem] font-semibold tracking-tight">{g.data.title}</h1>
        <ModelBadge meta={{ model: g.data.model, provider: g.data.provider, engine: g.data.engine }} />
      </div>
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Segmented value={mode} onChange={setMode} options={[{ value: "quick", label: <span className="flex items-center gap-1.5"><Zap className="size-3.5" /> Quick review</span> }, { value: "detailed", label: <span className="flex items-center gap-1.5"><BookOpenCheck className="size-3.5" /> Detailed study</span> }]} />
        <div className="ml-auto flex gap-2">
          <Button size="sm" icon={<Layers className="size-3.5" />} onClick={() => nav("/flashcards", { state: { text: asText } })}>Make flashcards</Button>
          <Button size="sm" icon={<ClipboardCheck className="size-3.5" />} onClick={() => nav("/quiz", { state: { text: asText } })}>Make quiz</Button>
          <Menu trigger={(t) => <Button size="sm" icon={<Download className="size-3.5" />} onClick={t}>Export</Button>} items={["pdf", "docx", "md", "txt"].map((f) => ({ label: f.toUpperCase(), onClick: () => downloadFrom(`/api/guides/${id}/export`, { format: f }).catch((e) => toast(e.message, "bad")) }))} />
        </div>
      </div>

      {d.overview && <Card className="mb-5 p-6"><div className="label mb-2">Unit overview</div><p className="leading-relaxed text-ink-2">{d.overview}</p></Card>}

      {mode === "quick" ? (
        <div className="grid gap-5 md:grid-cols-2">
          {d.topics?.length > 0 && (
            <Card className="p-5 md:col-span-2">
              <div className="label mb-3">Main topics at a glance</div>
              <div className="grid gap-3 sm:grid-cols-2">
                {d.topics.map((t: any, i: number) => (
                  <div key={i} className="rounded-xl border border-line p-3">
                    <div className="font-medium text-ink">{t.name}</div>
                    {t.key_points?.[0] && <div className="mt-1 text-sm text-muted">{t.key_points[0]}</div>}
                  </div>
                ))}
              </div>
            </Card>
          )}
          {d.vocabulary?.length > 0 && (
            <Card className="p-5">
              <div className="label mb-3">Vocabulary</div>
              <dl className="space-y-2 text-sm">
                {d.vocabulary.map((v: any, i: number) => <div key={i}><dt className="inline font-semibold text-ink">{v.term}</dt> <dd className="inline text-ink-2">— {v.definition}</dd></div>)}
              </dl>
            </Card>
          )}
          {d.facts?.length > 0 && (
            <Card className="p-5">
              <div className="label mb-3">Must-know facts</div>
              <ul className="space-y-1.5 text-sm text-ink-2">{d.facts.map((f: string, i: number) => <li key={i} className="flex gap-2"><span className="text-accent">•</span>{f}</li>)}</ul>
            </Card>
          )}
          {d.review_questions?.length > 0 && (
            <Card className="p-5 md:col-span-2">
              <div className="label mb-3">Self-check (tap to reveal)</div>
              <div className="space-y-2">{d.review_questions.map((q: any, i: number) => <Reveal key={i} q={q.question} a={q.answer} />)}</div>
            </Card>
          )}
        </div>
      ) : (
        <div className="space-y-5">
          {d.topics?.length > 0 && (
            <Card className="p-5">
              <div className="label mb-3">Main topics</div>
              <div className="space-y-2">{d.topics.map((t: any, i: number) => <Topic key={i} t={t} defaultOpen={i === 0} />)}</div>
            </Card>
          )}
          <div className="grid gap-5 md:grid-cols-2">
            {d.vocabulary?.length > 0 && <ListCard title="Important vocabulary" items={d.vocabulary.map((v: any) => [v.term, v.definition])} />}
            {d.key_concepts?.length > 0 && <ListCard title="Key concepts" items={d.key_concepts.map((k: any) => [k.concept, k.explanation])} />}
            {d.examples?.length > 0 && <ListCard title="Examples" items={d.examples.map((e: string) => [null, e])} />}
            {d.facts?.length > 0 && <ListCard title="Important facts" items={d.facts.map((e: string) => [null, e])} />}
          </div>
          {d.common_mistakes?.length > 0 && (
            <Card className="border-warn/25 p-5">
              <div className="label mb-3 flex items-center gap-1.5 !text-warn"><TriangleAlert className="size-3.5" /> Common mistakes</div>
              <ul className="space-y-1.5 text-sm text-ink-2">{d.common_mistakes.map((m: string, i: number) => <li key={i} className="flex gap-2"><span className="text-warn">!</span>{m}</li>)}</ul>
            </Card>
          )}
          {d.review_questions?.length > 0 && (
            <Card className="p-5">
              <div className="label mb-3">Review questions</div>
              <div className="space-y-2">{d.review_questions.map((q: any, i: number) => <Reveal key={i} q={`${i + 1}. ${q.question}`} a={q.answer} />)}</div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

function Reveal({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <button onClick={() => setOpen((o) => !o)} className="w-full rounded-xl border border-line p-3 text-left transition hover:bg-surface-2">
      <div className="flex items-start gap-2 text-sm font-medium text-ink"><Eye className="mt-0.5 size-4 shrink-0 text-muted" />{q}</div>
      <div className={cx("ml-6 overflow-hidden text-sm text-ink-2 transition-all", open ? "mt-2 max-h-96" : "max-h-0")}>{a}</div>
    </button>
  );
}

function Topic({ t, defaultOpen }: { t: any; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <div className="rounded-xl border border-line">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 px-4 py-3 text-left">
        <span className="flex-1 font-medium text-ink">{t.name}</span>
        <ChevronDown className={cx("size-4 text-muted transition", open && "rotate-180")} />
      </button>
      {open && (
        <div className="border-t border-line px-4 py-3 text-sm">
          {t.summary && <p className="text-ink-2">{t.summary}</p>}
          {t.key_points?.length > 0 && <ul className="mt-2 list-disc space-y-1 pl-5 text-ink-2">{t.key_points.map((k: string, i: number) => <li key={i}>{k}</li>)}</ul>}
        </div>
      )}
    </div>
  );
}

function ListCard({ title, items }: { title: string; items: [string | null, string][] }) {
  return (
    <Card className="p-5">
      <div className="label mb-3">{title}</div>
      <ul className="space-y-2 text-sm">{items.map(([a, b], i) => <li key={i} className="text-ink-2">{a && <strong className="text-ink">{a} — </strong>}{b}</li>)}</ul>
    </Card>
  );
}
