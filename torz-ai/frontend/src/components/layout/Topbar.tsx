import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CornerDownLeft, Cpu, FileText, History, Search, Sun, Moon, WifiOff } from "lucide-react";
import { get } from "../../lib/api";
import { useAIStatus, useDebounced } from "../../lib/hooks";
import { useSettings } from "../../lib/settings";
import { TOOLS, toolName } from "../../lib/tools";
import { cx, Kbd } from "../ui";

interface SearchResult {
  kind: string;
  id: number;
  title: string;
  url: string;
  tool?: string;
}

const KIND_LABEL: Record<string, string> = {
  document: "Document", note: "Note", deck: "Flashcards", quiz: "Quiz", practice_test: "Practice test",
  guide: "Study guide", file: "File", history: "History",
};

export function GlobalSearch() {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const nav = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const dq = useDebounced(q.trim(), 200);
  const content = useQuery<{ results: SearchResult[] }>({
    queryKey: ["search", dq],
    queryFn: () => get("/api/search", { q: dq }),
    enabled: dq.length >= 2,
  });

  const toolHits = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return TOOLS.slice(0, 6);
    return TOOLS.filter((t) => (t.name + " " + t.description).toLowerCase().includes(s)).slice(0, 6);
  }, [q]);

  const items = [
    ...toolHits.map((t) => ({ key: `t-${t.id}`, label: t.name, sub: "Tool", url: t.path, icon: <t.icon className="size-4" /> })),
    ...(content.data?.results ?? []).map((r) => ({
      key: `${r.kind}-${r.id}`,
      label: r.title,
      sub: r.kind === "history" && r.tool ? `History · ${toolName(r.tool)}` : KIND_LABEL[r.kind] ?? r.kind,
      url: r.url,
      icon: r.kind === "history" ? <History className="size-4" /> : <FileText className="size-4" />,
    })),
  ];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    };
    const onDoc = (e: MouseEvent) => !boxRef.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDoc);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDoc);
    };
  }, []);

  const go = (url: string) => {
    setOpen(false);
    setQ("");
    inputRef.current?.blur();
    nav(url);
  };

  return (
    <div ref={boxRef} className="relative w-full max-w-xl">
      <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-faint" />
      <input
        ref={inputRef}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(items.length - 1, a + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(0, a - 1));
          } else if (e.key === "Enter" && items[active]) {
            go(items[active].url);
          } else if (e.key === "Escape") {
            setOpen(false);
            inputRef.current?.blur();
          }
        }}
        placeholder="Search tools, documents, notes, decks…"
        aria-label="Search"
        className="h-10 w-full rounded-xl border border-line bg-surface/70 pl-10 pr-16 text-[0.88rem] text-ink placeholder:text-faint outline-none transition focus:border-accent/50 focus:bg-surface focus:ring-4 focus:ring-accent/10"
      />
      <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
        <Kbd>Ctrl K</Kbd>
      </div>
      {open && items.length > 0 && (
        <div className="card absolute left-0 right-0 top-12 z-50 max-h-[60vh] animate-fade-in overflow-y-auto p-1.5 shadow-pop">
          {items.map((it, i) => (
            <button
              key={it.key}
              onMouseEnter={() => setActive(i)}
              onClick={() => go(it.url)}
              className={cx("flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left", i === active ? "bg-surface-2" : "")}
            >
              <span className="text-muted">{it.icon}</span>
              <span className="min-w-0 flex-1 truncate text-[0.88rem] text-ink">{it.label}</span>
              <span className="text-[0.72rem] text-faint">{it.sub}</span>
              {i === active && <CornerDownLeft className="size-3.5 text-faint" />}
            </button>
          ))}
          {content.isFetching && <div className="px-3 py-2 text-xs text-muted">Searching your library…</div>}
        </div>
      )}
    </div>
  );
}

export function ModelStatus() {
  const st = useAIStatus();
  const nav = useNavigate();
  const d = st.data;
  const offline = st.isError;
  const ok = d?.ok;
  const label = offline ? "Server offline" : !d ? "Checking AI…" : ok ? (d.fallback ? `${d.fallback.model} (fallback)` : d.model) : "No AI model";
  return (
    <button
      onClick={() => nav("/settings/ai")}
      title={offline ? "The TORZ AI server is not reachable" : d?.message}
      className="flex h-10 max-w-[260px] items-center gap-2.5 rounded-xl border border-line bg-surface/70 px-3 text-[0.82rem] transition hover:border-line-strong"
    >
      {offline ? <WifiOff className="size-4 text-bad" /> : <Cpu className={cx("size-4", ok ? "text-accent" : "text-warn")} />}
      <span className="truncate font-medium text-ink">{label}</span>
      <span className={cx("size-2 shrink-0 rounded-full", offline ? "bg-bad" : !d ? "bg-faint" : ok ? "bg-good shadow-[0_0_10px_var(--good)]" : "bg-warn")} />
    </button>
  );
}

export function ThemeToggle() {
  const { settings, update } = useSettings();
  const t = settings?.appearance.theme ?? "dark";
  const dark = t === "system" ? !window.matchMedia("(prefers-color-scheme: light)").matches : t === "dark";
  return (
    <button
      onClick={() => update({ appearance: { theme: dark ? "light" : "dark" } })}
      disabled={!settings}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      title={dark ? "Light mode" : "Dark mode"}
      className="grid size-10 place-items-center rounded-xl border border-line bg-surface/70 text-muted transition hover:border-line-strong hover:text-ink"
    >
      {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  );
}

export function Topbar() {
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-line bg-bg/75 px-6 backdrop-blur-xl">
      <GlobalSearch />
      <div className="ml-auto flex items-center gap-2">
        <ModelStatus />
        <ThemeToggle />
      </div>
    </header>
  );
}
