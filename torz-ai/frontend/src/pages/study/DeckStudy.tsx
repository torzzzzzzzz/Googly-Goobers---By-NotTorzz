import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  CircleX,
  Flame,
  Pencil,
  Plus,
  RotateCcw,
  Shuffle,
  Trash2,
} from "lucide-react";
import { del, get, patch, post } from "../../lib/api";
import { useToolVisit } from "../../lib/hooks";
import { Badge, Button, Card, cx, EmptyState, Field, IconButton, Input, Kbd, ProgressBar, Segmented, Spinner, Switch, Textarea, useUi } from "../../components/ui";
import { ModelBadge } from "../../components/tool/ToolKit";

interface CardT {
  id: number;
  front: string;
  back: string;
  explanation: string;
  topic: string;
  status: "new" | "known" | "difficult";
  reviews: number;
  correct: number;
}

function shuffled<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function DeckStudy() {
  useToolVisit("flashcards");
  const { id } = useParams();
  const deckId = Number(id);
  const nav = useNavigate();
  const loc = useLocation() as { state?: { mode?: string } };
  const qc = useQueryClient();
  const deck = useQuery<any>({ queryKey: ["deck", deckId], queryFn: () => get(`/api/decks/${deckId}`) });
  const [mode, setMode] = useState<"flip" | "quiz" | "edit">(loc.state?.mode === "edit" ? "edit" : "flip");
  const [cards, setCards] = useState<CardT[]>([]);

  useEffect(() => {
    if (deck.data) setCards(deck.data.cards);
  }, [deck.data]);

  const updateCard = useCallback(
    async (cid: number, body: Record<string, unknown>) => {
      const c = await patch<CardT>(`/api/cards/${cid}`, body);
      setCards((cs) => cs.map((x) => (x.id === cid ? c : x)));
      qc.invalidateQueries({ queryKey: ["decks"] });
      return c;
    },
    [qc],
  );

  if (deck.isLoading) return <div className="grid h-[60vh] place-items-center"><Spinner className="size-6" /></div>;
  if (!deck.data) return <div className="p-10"><EmptyState title="Deck not found" action={<Button onClick={() => nav("/flashcards")}>Back</Button>} /></div>;
  const known = cards.filter((c) => c.status === "known").length;
  const difficult = cards.filter((c) => c.status === "difficult").length;

  return (
    <div className="mx-auto max-w-[1000px] animate-rise px-6 py-7">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <IconButton label="Back to decks" onClick={() => nav("/flashcards")}><ArrowLeft className="size-4" /></IconButton>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[1.35rem] font-semibold">{deck.data.title}</h1>
          <div className="text-xs text-muted">{cards.length} cards · {known} known · {difficult} difficult</div>
        </div>
        <ModelBadge meta={{ model: deck.data.model, provider: deck.data.provider, engine: deck.data.engine === "manual" ? undefined : deck.data.engine }} />
        <Segmented value={mode} onChange={setMode} options={[{ value: "flip", label: "Flashcards" }, { value: "quiz", label: "Quiz mode" }, { value: "edit", label: "Edit cards" }]} />
      </div>
      <div className="mb-6 flex h-2 overflow-hidden rounded-full bg-surface-3">
        <div className="bg-good transition-all" style={{ width: `${(100 * known) / Math.max(1, cards.length)}%` }} />
        <div className="bg-warn transition-all" style={{ width: `${(100 * difficult) / Math.max(1, cards.length)}%` }} />
      </div>
      {cards.length === 0 && mode !== "edit" ? (
        <Card><EmptyState title="This deck has no cards" action={<Button onClick={() => setMode("edit")} icon={<Plus className="size-4" />}>Add cards</Button>} /></Card>
      ) : mode === "flip" ? (
        <FlipMode cards={cards} onUpdate={updateCard} />
      ) : mode === "quiz" ? (
        <QuizMode cards={cards} onUpdate={updateCard} />
      ) : (
        <EditMode deckId={deckId} cards={cards} setCards={setCards} onUpdate={updateCard} onReset={async () => { const d = await post(`/api/decks/${deckId}/reset`); setCards(d.cards); }} />
      )}
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ flip mode

function FlipMode({ cards, onUpdate }: { cards: CardT[]; onUpdate: (id: number, body: Record<string, unknown>) => Promise<CardT> }) {
  const [order, setOrder] = useState<number[]>(() => cards.map((c) => c.id));
  const [shuffle, setShuffle] = useState(false);
  const [onlyDifficult, setOnlyDifficult] = useState(false);
  const [i, setI] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const byId = useMemo(() => Object.fromEntries(cards.map((c) => [c.id, c])), [cards]);

  useEffect(() => {
    let ids = cards.filter((c) => !onlyDifficult || c.status === "difficult").map((c) => c.id);
    if (shuffle) ids = shuffled(ids);
    setOrder(ids);
    setI(0);
    setFlipped(false);
    // Only rebuild the order when the filter/shuffle changes, not on every status update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shuffle, onlyDifficult, cards.length]);

  const card = byId[order[i]];
  const go = (d: number) => {
    setFlipped(false);
    setI((x) => Math.max(0, Math.min(order.length - 1, x + d)));
  };
  const mark = async (status: "known" | "difficult") => {
    if (!card) return;
    await onUpdate(card.id, { status });
    if (i < order.length - 1) go(1);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT" || (e.target as HTMLElement)?.tagName === "TEXTAREA") return;
      if (e.key === " " || e.key === "Enter") { e.preventDefault(); setFlipped((f) => !f); }
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key.toLowerCase() === "k") mark("known");
      else if (e.key.toLowerCase() === "d") mark("difficult");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <Button size="sm" variant={shuffle ? "soft" : "ghost"} icon={<Shuffle className="size-3.5" />} onClick={() => setShuffle((s) => !s)}>{shuffle ? "Shuffled" : "Shuffle"}</Button>
        <div className="w-52"><Switch checked={onlyDifficult} onChange={setOnlyDifficult} label="Only difficult cards" /></div>
        <span className="ml-auto text-sm tabular-nums text-muted">{order.length ? i + 1 : 0} / {order.length}</span>
      </div>
      {!card ? (
        <Card><EmptyState icon={<Flame />} title="No difficult cards" description="Cards you mark as difficult will appear here for extra practice." /></Card>
      ) : (
        <>
          <ProgressBar value={(100 * (i + 1)) / order.length} className="mb-5" />
          <div className="flip-scene">
            <button key={card.id} type="button" onClick={() => setFlipped((f) => !f)} aria-label={flipped ? "Show front" : "Show answer"} className={cx("flip-card relative block h-[340px] w-full text-left animate-fade-in", flipped && "is-flipped")}>
              <div className="flip-face card absolute inset-0 flex flex-col p-8">
                <div className="flex items-center gap-2">
                  {card.topic && <Badge tone="accent">{card.topic}</Badge>}
                  <StatusBadge status={card.status} />
                  <span className="ml-auto text-xs text-faint">Click or press Space to flip</span>
                </div>
                <div className="grid flex-1 place-items-center px-4 text-center text-[1.45rem] font-medium leading-snug text-ink">{card.front}</div>
              </div>
              <div className="flip-face flip-back card absolute inset-0 flex flex-col overflow-y-auto border-accent/30 p-8">
                <div className="label">Answer</div>
                <div className="grid flex-1 place-items-center px-4 text-center">
                  <div>
                    <div className="text-[1.25rem] leading-snug text-ink">{card.back}</div>
                    {card.explanation && <div className="mx-auto mt-4 max-w-xl text-sm text-muted">{card.explanation}</div>}
                  </div>
                </div>
              </div>
            </button>
          </div>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <IconButton label="Previous card" onClick={() => go(-1)} disabled={i === 0}><ChevronLeft className="size-5" /></IconButton>
            <Button variant="danger" icon={<Flame className="size-4" />} onClick={() => mark("difficult")}>Difficult <Kbd>D</Kbd></Button>
            <Button className="border-good/30 bg-good/10 text-good hover:bg-good/15" icon={<CircleCheck className="size-4" />} onClick={() => mark("known")}>Know it <Kbd>K</Kbd></Button>
            <IconButton label="Next card" onClick={() => go(1)} disabled={i >= order.length - 1}><ChevronRight className="size-5" /></IconButton>
          </div>
          {i === order.length - 1 && (
            <div className="mt-5 text-center">
              <Button variant="ghost" icon={<RotateCcw className="size-4" />} onClick={() => { setI(0); setFlipped(false); if (shuffle) setOrder((o) => shuffled(o)); }}>Start again</Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "known") return <Badge tone="good">Known</Badge>;
  if (status === "difficult") return <Badge tone="warn">Difficult</Badge>;
  return <Badge>New</Badge>;
}

// ------------------------------------------------------------------------------------------------ quiz mode (shuffled answers)

function QuizMode({ cards, onUpdate }: { cards: CardT[]; onUpdate: (id: number, body: Record<string, unknown>) => Promise<CardT> }) {
  const [order, setOrder] = useState(() => shuffled(cards.map((c) => c.id)));
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const byId = useMemo(() => Object.fromEntries(cards.map((c) => [c.id, c])), [cards]);
  const card = byId[order[i]];
  const options = useMemo(() => {
    if (!card) return [];
    const others = shuffled(cards.filter((c) => c.id !== card.id && c.back !== card.back).map((c) => c.back)).slice(0, 3);
    return shuffled([card.back, ...others]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card?.id]);

  if (cards.length < 2) return <Card><EmptyState title="Quiz mode needs at least 2 cards" /></Card>;
  if (!card)
    return (
      <Card className="p-8 text-center">
        <div className="text-[2rem] font-semibold">{score} / {order.length}</div>
        <div className="text-muted">correct</div>
        <Button className="mt-5" icon={<RotateCcw className="size-4" />} onClick={() => { setOrder(shuffled(cards.map((c) => c.id))); setI(0); setScore(0); setPicked(null); }}>Play again</Button>
      </Card>
    );
  const choose = async (o: string) => {
    if (picked) return;
    setPicked(o);
    const ok = o === card.back;
    if (ok) setScore((s) => s + 1);
    await onUpdate(card.id, { review: ok, ...(ok ? {} : { status: "difficult" }) });
  };
  return (
    <div>
      <div className="mb-3 flex justify-between text-sm text-muted"><span>Card {i + 1} of {order.length}</span><span>Score {score}</span></div>
      <ProgressBar value={(100 * i) / order.length} className="mb-5" />
      <Card className="p-7">
        {card.topic && <Badge tone="accent">{card.topic}</Badge>}
        <div className="mt-3 text-[1.3rem] font-medium text-ink">{card.front}</div>
        <div className="mt-6 grid gap-2.5">
          {options.map((o) => (
            <button key={o} disabled={!!picked} onClick={() => choose(o)} className={cx("flex items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm transition", !picked && "border-line hover:border-accent/50 hover:bg-surface-2", picked && o === card.back && "border-good/50 bg-good/10", picked === o && o !== card.back && "border-bad/50 bg-bad/10", picked && o !== card.back && picked !== o && "border-line opacity-55")}>
              <span className="flex-1">{o}</span>
              {picked && o === card.back && <CircleCheck className="size-5 text-good" />}
              {picked === o && o !== card.back && <CircleX className="size-5 text-bad" />}
            </button>
          ))}
        </div>
        {picked && card.explanation && <div className="mt-4 text-sm text-muted">{card.explanation}</div>}
      </Card>
      {picked && <div className="mt-4 flex justify-end"><Button variant="primary" icon={<ChevronRight className="size-4" />} onClick={() => { setI((x) => x + 1); setPicked(null); }}>Next</Button></div>}
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ edit mode

function EditMode({ deckId, cards, setCards, onUpdate, onReset }: { deckId: number; cards: CardT[]; setCards: (c: CardT[]) => void; onUpdate: (id: number, body: Record<string, unknown>) => Promise<CardT>; onReset: () => void }) {
  const { toast, confirm } = useUi();
  const qc = useQueryClient();
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [topic, setTopic] = useState("");
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState<Partial<CardT>>({});

  const add = async () => {
    const c = await post<CardT>(`/api/decks/${deckId}/cards`, { front, back, topic, explanation: "" });
    setCards([...cards, c]);
    setFront("");
    setBack("");
    qc.invalidateQueries({ queryKey: ["decks"] });
    toast("Card added");
  };

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="label mb-3">Add a card</div>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Front"><Textarea rows={2} value={front} onChange={(e) => setFront(e.target.value)} /></Field>
          <Field label="Back"><Textarea rows={2} value={back} onChange={(e) => setBack(e.target.value)} /></Field>
        </div>
        <div className="mt-3 flex items-end gap-3">
          <Field label="Topic (optional)" className="max-w-xs flex-1"><Input value={topic} onChange={(e) => setTopic(e.target.value)} /></Field>
          <Button variant="primary" icon={<Plus className="size-4" />} disabled={!front.trim() || !back.trim()} onClick={add}>Add card</Button>
          <Button variant="ghost" className="ml-auto" icon={<RotateCcw className="size-4" />} onClick={async () => { if (await confirm({ title: "Reset study progress?", message: "All cards go back to New." })) onReset(); }}>Reset progress</Button>
        </div>
      </Card>
      {cards.map((c, n) => (
        <Card key={c.id} className="p-4">
          {editing === c.id ? (
            <div className="space-y-2">
              <div className="grid gap-2 md:grid-cols-2">
                <Textarea rows={2} value={draft.front ?? ""} onChange={(e) => setDraft({ ...draft, front: e.target.value })} aria-label="Front" />
                <Textarea rows={2} value={draft.back ?? ""} onChange={(e) => setDraft({ ...draft, back: e.target.value })} aria-label="Back" />
              </div>
              <Textarea rows={2} value={draft.explanation ?? ""} onChange={(e) => setDraft({ ...draft, explanation: e.target.value })} placeholder="Explanation (optional)" aria-label="Explanation" />
              <div className="flex gap-2">
                <Input value={draft.topic ?? ""} onChange={(e) => setDraft({ ...draft, topic: e.target.value })} placeholder="Topic" className="max-w-xs" aria-label="Topic" />
                <Button size="sm" variant="primary" onClick={async () => { await onUpdate(c.id, { front: draft.front, back: draft.back, explanation: draft.explanation, topic: draft.topic }); setEditing(null); }}>Save</Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-4">
              <span className="w-6 text-right text-xs text-faint">{n + 1}</span>
              <div className="grid flex-1 gap-1 md:grid-cols-2 md:gap-4">
                <div className="text-sm font-medium text-ink">{c.front}</div>
                <div className="text-sm text-ink-2">{c.back}</div>
              </div>
              <StatusBadge status={c.status} />
              <IconButton label="Edit card" onClick={() => { setEditing(c.id); setDraft(c); }}><Pencil className="size-3.5" /></IconButton>
              <IconButton label="Delete card" onClick={async () => { await del(`/api/cards/${c.id}`); setCards(cards.filter((x) => x.id !== c.id)); qc.invalidateQueries({ queryKey: ["decks"] }); }}><Trash2 className="size-3.5" /></IconButton>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}
