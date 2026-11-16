import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ClipboardPaste,
  Copy,
  Cpu,
  Download,
  FilePlus,
  FileUp,
  History,
  LoaderCircle,
  Plug,
  RotateCcw,
  Star,
  Trash2,
  Upload,
  X,
  Zap,
} from "lucide-react";
import { ApiError, del, downloadFrom, get, post, SETUP_ERROR_KINDS, upload } from "../../lib/api";
import { countChars, countWords, timeAgo } from "../../lib/format";
import { useFavorites, type RunMeta } from "../../lib/hooks";
import { TOOL_BY_ID } from "../../lib/tools";
import { Alert, Button, cx, IconButton, Menu, ProgressBar, Segmented, Spinner, Textarea, useUi } from "../ui";

// ------------------------------------------------------------------------------------------------ header

export function ToolHeader({ toolId, title, description, actions }: { toolId?: string; title?: string; description?: string; actions?: ReactNode }) {
  const tool = toolId ? TOOL_BY_ID[toolId] : undefined;
  const Icon = tool?.icon;
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="flex items-start gap-4">
        {Icon && (
          <div className="relative grid size-12 shrink-0 place-items-center rounded-2xl border border-line bg-surface-2">
            <div className="accent-gradient absolute inset-0 rounded-2xl opacity-[0.12]" />
            <Icon className="relative size-5 text-accent" />
          </div>
        )}
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-[1.45rem] font-semibold tracking-tight text-ink">{title ?? tool?.name}</h1>
            {toolId && <FavoriteStar toolId={toolId} />}
          </div>
          <p className="mt-1 max-w-2xl text-[0.9rem] text-muted">{description ?? tool?.description}</p>
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function FavoriteStar({ toolId, className }: { toolId: string; className?: string }) {
  const fav = useFavorites();
  const qc = useQueryClient();
  const { toast } = useUi();
  const isFav = fav.data?.favorites.includes(toolId) ?? false;
  const m = useMutation({
    mutationFn: () => (isFav ? del(`/api/favorites/${toolId}`) : post(`/api/favorites/${toolId}`)),
    onSuccess: (d) => {
      qc.setQueryData(["favorites"], d);
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast(isFav ? "Removed from favorites" : "Added to favorites", "info");
    },
  });
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        m.mutate();
      }}
      aria-pressed={isFav}
      aria-label={isFav ? "Remove from favorites" : "Add to favorites"}
      title={isFav ? "Remove from favorites" : "Add to favorites"}
      className={cx("rounded-lg p-1.5 transition hover:bg-surface-2", isFav ? "text-warn" : "text-faint hover:text-ink-2", className)}
    >
      <Star className={cx("size-4", isFav && "fill-current")} />
    </button>
  );
}

// ------------------------------------------------------------------------------------------------ text input

export function TextPanel({
  value,
  onChange,
  placeholder = "Paste or type your text here…",
  label = "Your text",
  minHeight = "min-h-[340px]",
  disabled,
  footer,
  headerExtra,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  label?: string;
  minHeight?: string;
  disabled?: boolean;
  footer?: ReactNode;
  headerExtra?: ReactNode;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const { toast } = useUi();

  const paste = async () => {
    try {
      const t = await navigator.clipboard.readText();
      if (t) onChange(value ? value + (value.endsWith("\n") ? "" : "\n\n") + t : t);
      else toast("Clipboard is empty", "info");
    } catch {
      toast("Clipboard access was blocked. Press Ctrl+V in the text box instead.", "bad");
    }
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true);
    try {
      const res = await upload<{ text: string; ocr_used: boolean; warnings: string[]; word_count: number }>("/api/extract", f);
      onChange(res.text);
      toast(`Loaded ${f.name} (${res.word_count.toLocaleString()} words${res.ocr_used ? ", OCR used" : ""})`);
      for (const w of res.warnings ?? []) toast(w, "info");
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Could not read that file", "bad");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div
      className="card flex h-full flex-col overflow-hidden"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        onFile(e.dataTransfer.files?.[0]);
      }}
    >
      <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="label">{label}</span>
          {headerExtra}
        </div>
        <div className="flex items-center gap-0.5">
          <IconButton label="Paste from clipboard" onClick={paste} disabled={disabled}>
            <ClipboardPaste className="size-4" />
          </IconButton>
          <IconButton label="Upload a document (PDF, DOCX, TXT, MD)" onClick={() => fileRef.current?.click()} disabled={disabled || busy}>
            {busy ? <LoaderCircle className="size-4 animate-spin" /> : <Upload className="size-4" />}
          </IconButton>
          <IconButton label="Clear" onClick={() => onChange("")} disabled={disabled || !value}>
            <Trash2 className="size-4" />
          </IconButton>
          <input ref={fileRef} type="file" hidden accept=".pdf,.docx,.txt,.md,.markdown,.png,.jpg,.jpeg" onChange={(e) => onFile(e.target.files?.[0])} />
        </div>
      </div>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        aria-label={label}
        className={cx("flex-1 rounded-none border-0 bg-transparent px-4 py-3.5 text-[0.95rem] focus:ring-0", minHeight)}
      />
      <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-2 text-xs text-muted">
        <span>
          {countWords(value).toLocaleString()} words · {countChars(value).toLocaleString()} characters
        </span>
        {footer}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ output actions

export function useCopy() {
  const { toast } = useUi();
  return async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast("Copied to clipboard");
    } catch {
      toast("Copy failed — select the text and press Ctrl+C", "bad");
    }
  };
}

export function OutputActions({ text, title, html }: { text: string; title: string; html?: string }) {
  const copy = useCopy();
  const nav = useNavigate();
  const { toast } = useUi();
  const qc = useQueryClient();
  const saveDoc = async () => {
    try {
      const doc = await post<{ id: number }>("/api/documents", html ? { title, content_html: html } : { title, content_html: textHtml(text) });
      qc.invalidateQueries({ queryKey: ["documents"] });
      toast(
        <span>
          Saved to Documents. <Link className="text-accent underline" to={`/documents/${doc.id}`}>Open</Link>
        </span>,
      );
    } catch (e) {
      toast((e as Error).message, "bad");
    }
  };
  const exportAs = (format: string) =>
    downloadFrom("/api/export", undefined, { method: "POST", body: { title, content: html ?? text, format, is_html: !!html } }).catch((e) => toast(e.message, "bad"));
  return (
    <div className="flex items-center gap-0.5">
      <IconButton label="Copy" onClick={() => copy(text)} disabled={!text}>
        <Copy className="size-4" />
      </IconButton>
      <Menu
        trigger={(toggle) => (
          <IconButton label="Download" onClick={toggle} disabled={!text}>
            <Download className="size-4" />
          </IconButton>
        )}
        items={[
          { label: "Word document (.docx)", onClick: () => exportAs("docx") },
          { label: "PDF (.pdf)", onClick: () => exportAs("pdf") },
          { label: "Plain text (.txt)", onClick: () => exportAs("txt") },
          { label: "Markdown (.md)", onClick: () => exportAs("md") },
        ]}
      />
      <IconButton label="Save to Documents" onClick={saveDoc} disabled={!text}>
        <FilePlus className="size-4" />
      </IconButton>
      <IconButton label="Send to AutoTyper" onClick={() => nav("/autotyper", { state: { text, title } })} disabled={!text}>
        <Zap className="size-4" />
      </IconButton>
    </div>
  );
}

function textHtml(text: string): string {
  const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const h = /^(#{1,3})\s+(.*)$/.exec(p);
      if (h) return `<h${h[1].length}>${esc(h[2])}</h${h[1].length}>`;
      if (/^[-*]\s/m.test(p)) return "<ul>" + p.split(/\n/).filter(Boolean).map((l) => `<li><p>${esc(l.replace(/^[-*]\s+/, ""))}</p></li>`).join("") + "</ul>";
      return `<p>${esc(p).replace(/\n/g, "<br>")}</p>`;
    })
    .join("");
}

// ------------------------------------------------------------------------------------------------ model badge, progress

export function ModelBadge({ meta, className }: { meta: RunMeta | null | undefined; className?: string }) {
  if (!meta) return null;
  if (meta.engine === "offline" || (!meta.model && meta.engine !== "ai")) {
    return (
      <span className={cx("inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-3 px-2.5 py-0.5 text-[0.72rem] font-medium text-ink-2", className)} title="Generated by TORZ AI's offline engine (extractive, no AI model)">
        <Plug className="size-3" /> Offline engine
      </span>
    );
  }
  if (!meta.model) return null;
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-full border border-accent/20 bg-accent-soft px-2.5 py-0.5 text-[0.72rem] font-medium text-accent", className)} title={`Generated by ${meta.model} via ${meta.provider_label ?? meta.provider}${meta.fallback ? " (local fallback)" : ""}`}>
      <Cpu className="size-3" /> {meta.model}
      {meta.fallback && <span className="text-warn">· fallback</span>}
    </span>
  );
}

export function WorkingIndicator({ progress, label = "Working" }: { progress?: { stage?: string; current: number; total: number } | null; label?: string }) {
  const pct = progress && progress.total ? (100 * progress.current) / progress.total : 0;
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-10 text-center" role="status" aria-live="polite">
      <div className="relative size-14">
        <div className="absolute inset-0 rounded-full border-2 border-line" />
        <div className="orbit absolute inset-0 rounded-full border-2 border-transparent border-t-accent border-r-accent-2" />
        <div className="accent-gradient absolute inset-[18px] rounded-full opacity-80 blur-[1px]" />
      </div>
      <div>
        <div className="text-[0.92rem] font-medium text-ink">
          {progress?.stage ?? label}
          <span className="dot-pulse ml-0.5 inline-flex gap-0.5">
            <span>.</span>
            <span>.</span>
            <span>.</span>
          </span>
        </div>
        {progress && progress.total > 1 && (
          <div className="mt-1 text-xs text-muted">
            {progress.current} of {progress.total}
          </div>
        )}
      </div>
      {progress && progress.total > 1 && <ProgressBar value={pct} className="max-w-xs" />}
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ errors & AI setup

export function RunError({ error, onRetry, onOffline }: { error: { kind: string; message: string }; onRetry?: () => void; onOffline?: () => void }) {
  const setup = SETUP_ERROR_KINDS.has(error.kind);
  if (setup) return <AISetupNotice message={error.message} onRetry={onRetry} onOffline={onOffline} />;
  return (
    <Alert tone="bad" title="That didn't work" action={onRetry && <Button size="sm" icon={<RotateCcw className="size-3.5" />} onClick={onRetry}>Retry</Button>}>
      {error.message}
    </Alert>
  );
}

export function AISetupNotice({ message, onRetry, onOffline, compact }: { message?: string; onRetry?: () => void; onOffline?: () => void; compact?: boolean }) {
  return (
    <div className={cx("rounded-2xl border border-warn/30 bg-warn/[0.06]", compact ? "p-4" : "p-6")}>
      <div className="flex items-start gap-4">
        <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-warn/15 text-warn">
          <Plug className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[0.98rem] font-semibold text-ink">No AI model is connected</div>
          <p className="mt-1 text-sm text-ink-2">{message ?? "This tool needs a language model."}</p>
          {!compact && (
            <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-muted">
              <li>Install <span className="text-ink-2">Ollama</span> (free, runs on your PC) from ollama.com and start it.</li>
              <li>Open <span className="text-ink-2">Settings → AI</span> and download a recommended model with one click.</li>
              <li>Or connect LM Studio, or an optional cloud provider with your own API key.</li>
            </ol>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <Link to="/settings/ai">
              <Button variant="primary" size="sm" icon={<Cpu className="size-3.5" />}>Set up AI</Button>
            </Link>
            {onRetry && <Button size="sm" icon={<RotateCcw className="size-3.5" />} onClick={onRetry}>Try again</Button>}
            {onOffline && <Button size="sm" variant="soft" icon={<Plug className="size-3.5" />} onClick={onOffline}>Use offline engine instead</Button>}
          </div>
        </div>
      </div>
    </div>
  );
}

export type EngineChoice = "ai" | "offline";

export function EngineToggle({ value, onChange }: { value: EngineChoice; onChange: (v: EngineChoice) => void }) {
  return (
    <div>
      <Segmented
        size="sm"
        value={value}
        onChange={onChange}
        options={[
          { value: "ai", label: "AI model", title: "Use the connected AI model" },
          { value: "offline", label: "Offline engine", title: "Extractive, rule-based engine — works without any AI model" },
        ]}
      />
      {value === "offline" && (
        <p className="mt-1.5 text-xs text-muted">The offline engine builds results only from sentences and terms in your text. It's fast and private, but less flexible than an AI model.</p>
      )}
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ source picker

export interface SourceValue {
  mode: "text" | "file" | "document";
  text: string;
  fileId?: number;
  fileName?: string;
  documentId?: number;
  documentTitle?: string;
}

export function sourceBody(s: SourceValue) {
  if (s.mode === "file" && s.fileId) return { file_id: s.fileId };
  if (s.mode === "document" && s.documentId) return { document_id: s.documentId };
  return { text: s.text };
}

export function sourceReady(s: SourceValue) {
  return (s.mode === "text" && s.text.trim().length > 0) || (s.mode === "file" && !!s.fileId) || (s.mode === "document" && !!s.documentId);
}

export function sourceTitle(s: SourceValue) {
  if (s.mode === "file") return s.fileName?.replace(/\.[^.]+$/, "") ?? "";
  if (s.mode === "document") return s.documentTitle ?? "";
  return "";
}

export function SourcePicker({ value, onChange, minHeight = "min-h-[260px]" }: { value: SourceValue; onChange: (v: SourceValue) => void; minHeight?: string }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const { toast } = useUi();
  const qc = useQueryClient();
  const files = useQuery<{ files: any[] }>({ queryKey: ["files"], queryFn: () => get("/api/files"), enabled: value.mode === "file" });
  const docs = useQuery<{ documents: any[] }>({ queryKey: ["documents", "picker"], queryFn: () => get("/api/documents"), enabled: value.mode === "document" });

  const onFile = async (f?: File) => {
    if (!f) return;
    setBusy(true);
    try {
      const res = await upload<any>("/api/files", f);
      qc.invalidateQueries({ queryKey: ["files"] });
      onChange({ ...value, mode: "file", fileId: res.id, fileName: res.filename });
      toast(`${res.filename}: ${res.word_count.toLocaleString()} words extracted${res.ocr_used ? " (OCR)" : ""}`);
      for (const w of res.warnings ?? []) toast(w, "info");
    } catch (e) {
      toast((e as Error).message, "bad");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="space-y-3">
      <Segmented
        size="sm"
        value={value.mode}
        onChange={(mode) => onChange({ ...value, mode })}
        options={[
          { value: "text", label: "Paste text" },
          { value: "file", label: "Upload file" },
          { value: "document", label: "My documents" },
        ]}
      />
      {value.mode === "text" && <TextPanel value={value.text} onChange={(text) => onChange({ ...value, text })} label="Source material" minHeight={minHeight} placeholder="Paste your notes, a chapter, an article…" />}
      {value.mode === "file" && (
        <div className="card p-4">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              onFile(e.dataTransfer.files?.[0]);
            }}
            className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong bg-bg-2 px-4 py-8 text-center transition hover:border-accent/50"
          >
            {busy ? <Spinner className="size-6" /> : <FileUp className="size-6 text-accent" />}
            <div className="text-sm font-medium text-ink">{busy ? "Extracting text…" : "Drop a file or click to upload"}</div>
            <div className="text-xs text-muted">PDF (OCR for scans), DOCX, TXT, Markdown, PNG/JPG</div>
          </button>
          <input ref={fileRef} type="file" hidden accept=".pdf,.docx,.txt,.md,.markdown,.png,.jpg,.jpeg" onChange={(e) => onFile(e.target.files?.[0])} />
          {(files.data?.files.length ?? 0) > 0 && (
            <div className="mt-4">
              <div className="label mb-2">Previously uploaded</div>
              <div className="max-h-56 space-y-1 overflow-y-auto">
                {files.data!.files.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => onChange({ ...value, mode: "file", fileId: f.id, fileName: f.filename })}
                    className={cx("flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm transition", value.fileId === f.id ? "border-accent/40 bg-accent-soft" : "border-transparent hover:bg-surface-2")}
                  >
                    <FileUp className="size-4 shrink-0 text-muted" />
                    <span className="min-w-0 flex-1 truncate text-ink">{f.filename}</span>
                    <span className="text-xs text-muted">{f.word_count.toLocaleString()} words</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      {value.mode === "document" && (
        <div className="card max-h-80 space-y-1 overflow-y-auto p-3">
          {docs.isLoading && <Spinner />}
          {docs.data?.documents.length === 0 && <div className="p-4 text-center text-sm text-muted">No documents yet. Create one in the Document Workspace.</div>}
          {docs.data?.documents.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => onChange({ ...value, mode: "document", documentId: d.id, documentTitle: d.title })}
              className={cx("flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm transition", value.documentId === d.id ? "border-accent/40 bg-accent-soft" : "border-transparent hover:bg-surface-2")}
            >
              <span className="min-w-0 flex-1 truncate text-ink">{d.title}</span>
              <span className="text-xs text-muted">{d.word_count.toLocaleString()} words</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ per-tool history drawer

export function HistoryButton({ toolId, onSelect }: { toolId: string; onSelect: (entry: any) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="ghost" icon={<History className="size-4" />} onClick={() => setOpen(true)}>
        History
      </Button>
      {open && <HistoryDrawer toolId={toolId} onClose={() => setOpen(false)} onSelect={(e) => { setOpen(false); onSelect(e); }} />}
    </>
  );
}

function HistoryDrawer({ toolId, onClose, onSelect }: { toolId: string; onClose: () => void; onSelect: (entry: any) => void }) {
  const q = useQuery<{ entries: any[] }>({ queryKey: ["history", toolId], queryFn: () => get("/api/history", { tool: toolId, limit: 50 }) });
  const qc = useQueryClient();
  const open = async (id: number) => onSelect(await get(`/api/history/${id}`));
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 animate-fade-in bg-black/40" onClick={onClose} />
      <aside className="card absolute bottom-3 right-3 top-3 flex w-[420px] max-w-[92vw] animate-rise flex-col shadow-pop">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div>
            <div className="font-semibold">Recent runs</div>
            <div className="text-xs text-muted">{TOOL_BY_ID[toolId]?.name}</div>
          </div>
          <IconButton label="Close" onClick={onClose}>
            <X className="size-4" />
          </IconButton>
        </div>
        <div className="flex-1 space-y-1 overflow-y-auto p-3">
          {q.isLoading && <Spinner />}
          {q.data?.entries.length === 0 && <div className="p-6 text-center text-sm text-muted">Nothing here yet. Your runs will appear here.</div>}
          {q.data?.entries.map((e) => (
            <div key={e.id} className="group flex items-start gap-2 rounded-xl p-3 transition hover:bg-surface-2">
              <button className="min-w-0 flex-1 text-left" onClick={() => open(e.id)}>
                <div className="truncate text-sm font-medium text-ink">{e.title}</div>
                <div className="mt-0.5 line-clamp-2 text-xs text-muted">{e.preview}</div>
                <div className="mt-1 text-[0.7rem] text-faint">
                  {timeAgo(e.created_at)} · {e.engine === "offline" ? "Offline engine" : e.model || e.engine}
                </div>
              </button>
              <IconButton
                label="Delete"
                className="opacity-0 group-hover:opacity-100"
                onClick={async () => {
                  await del(`/api/history/${e.id}`);
                  qc.invalidateQueries({ queryKey: ["history"] });
                }}
              >
                <Trash2 className="size-3.5" />
              </IconButton>
            </div>
          ))}
        </div>
        <div className="border-t border-line p-3">
          <Link to={`/history?tool=${toolId}`} className="block rounded-lg px-3 py-2 text-center text-sm text-accent hover:bg-surface-2">
            Open full history
          </Link>
        </div>
      </aside>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ page wrapper

export function Page({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return <div className={cx("mx-auto w-full animate-rise px-6 py-7", wide ? "max-w-[1500px]" : "max-w-[1240px]")}>{children}</div>;
}

/** Pre-select a source handed over via navigation state ({fileId, fileName} or {text}). */
export function useInitialSource(setSource: (s: SourceValue) => void) {
  const loc = useLocation() as { state?: { fileId?: number; fileName?: string; text?: string } | null };
  useEffect(() => {
    const st = loc.state;
    if (st?.fileId) setSource({ mode: "file", text: "", fileId: st.fileId, fileName: st.fileName });
    else if (st?.text) setSource({ mode: "text", text: st.text });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
