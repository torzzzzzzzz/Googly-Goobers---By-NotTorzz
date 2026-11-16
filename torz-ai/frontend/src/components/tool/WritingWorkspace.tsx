import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { BubbleMenu } from "@tiptap/react/menus";
import type { Editor } from "@tiptap/react";
import {
  ArrowLeft,
  BookOpenCheck,
  Check,
  CircleHelp,
  Download,
  Feather,
  FilePlus,
  History,
  Keyboard,
  Lightbulb,
  LoaderCircle,
  PenLine,
  Sparkles,
  Square,
  Wand,
  X,
} from "lucide-react";
import { ApiError, downloadFrom, get, patch, post } from "../../lib/api";
import { formatDateTime, timeAgo } from "../../lib/format";
import { usePersistentState, useStreamRun } from "../../lib/hooks";
import { htmlToText, renderMarkdown, textToHtml } from "../../lib/markdown";
import { useSettings } from "../../lib/settings";
import { Button, Card, cx, Field, IconButton, Input, Menu, Modal, Select, Switch, Textarea, useUi } from "../ui";
import { HighlightedRevision } from "./DiffView";
import { EditorSurface, EditorToolbar, editorWordCount, useRichEditor } from "./RichEditor";
import { ModelBadge, RunError, WorkingIndicator } from "./ToolKit";

const ACTIONS: { id: string; label: string; group: string }[] = [
  { id: "improve", label: "Improve writing", group: "Edit" },
  { id: "grammar", label: "Fix grammar", group: "Edit" },
  { id: "awkward", label: "Fix awkward sentences", group: "Edit" },
  { id: "rewrite", label: "Rewrite paragraph", group: "Edit" },
  { id: "expand", label: "Expand ideas", group: "Length" },
  { id: "shorten", label: "Shorten", group: "Length" },
  { id: "continue", label: "Continue writing", group: "Length" },
  { id: "vocabulary", label: "Improve vocabulary", group: "Style" },
  { id: "transitions", label: "Improve transitions", group: "Style" },
  { id: "improve_intro", label: "Improve introduction", group: "Structure" },
  { id: "improve_conclusion", label: "Improve conclusion", group: "Structure" },
  { id: "tone_formal", label: "More formal", group: "Tone" },
  { id: "tone_casual", label: "More casual", group: "Tone" },
  { id: "tone_confident", label: "More confident", group: "Tone" },
  { id: "tone_friendly", label: "Friendlier", group: "Tone" },
];

interface Pending {
  action: string;
  label: string;
  original: string;
  range: { from: number; to: number } | null; // null = whole document
  kind: "edit" | "compose" | "explain";
}

type SaveState = "saved" | "saving" | "dirty" | "error";

export function WritingWorkspace({ docId }: { docId?: number }) {
  const nav = useNavigate();
  const qc = useQueryClient();
  const { toast, confirm } = useUi();
  const { settings } = useSettings();
  const [draft, setDraft] = usePersistentState("assistant:draft", { title: "Untitled draft", html: "" });
  const [title, setTitle] = useState(docId ? "" : draft.title);
  const [loaded, setLoaded] = useState(!docId);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [explain, setExplain] = usePersistentState("assistant:explain", settings?.writing.explain_changes ?? false);
  const [instruction, setInstruction] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [hasSelection, setHasSelection] = useState(false);
  const saveTimer = useRef<number | null>(null);
  const latest = useRef({ title, html: "", text: "" });
  const run = useStreamRun<{ output: string; explanation?: string }>();

  const scheduleSave = useCallback(() => {
    if (!docId) return;
    setSaveState("dirty");
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => void saveNow(false), 900);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId]);

  const editor = useRichEditor({
    content: docId ? "" : draft.html,
    placeholder: "Start writing, paste a draft, or ask the assistant to write something for you…",
    onUpdate: (html, text) => {
      latest.current.html = html;
      latest.current.text = text;
      if (docId) scheduleSave();
      else setDraft((d) => ({ ...d, html }));
    },
  });

  // Load document
  useEffect(() => {
    if (!docId || !editor) return;
    let cancelled = false;
    get(`/api/documents/${docId}`)
      .then((d) => {
        if (cancelled) return;
        setTitle(d.title);
        latest.current = { title: d.title, html: d.content_html, text: d.content_text };
        editor.commands.setContent(d.content_html || "", { emitUpdate: false });
        setSavedAt(d.updated_at);
        setLoaded(true);
        if (d.deleted_at) toast("This document is in the trash. Restore it from the Documents page to keep it.", "info");
      })
      .catch((e) => {
        toast(e instanceof ApiError && e.status === 404 ? "Document not found" : (e as Error).message, "bad");
        nav("/documents");
      });
    return () => {
      cancelled = true;
    };
  }, [docId, editor, nav, toast]);

  const saveNow = useCallback(
    async (snapshot: boolean) => {
      if (!docId) return;
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      setSaveState("saving");
      try {
        const d = await patch(`/api/documents/${docId}`, {
          title: latest.current.title || "Untitled document",
          content_html: latest.current.html,
          content_text: latest.current.text,
          snapshot,
        });
        setSavedAt(d.updated_at);
        setSaveState("saved");
        qc.invalidateQueries({ queryKey: ["documents"] });
        if (snapshot) toast("Saved — a version snapshot was kept");
      } catch {
        setSaveState("error");
      }
    },
    [docId, qc, toast],
  );

  useEffect(() => {
    latest.current.title = title;
    if (!docId) setDraft((d) => ({ ...d, title }));
    else if (loaded) scheduleSave();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (docId) void saveNow(true);
        else void saveAsDocument();
      }
    };
    const onUnload = (e: BeforeUnloadEvent) => {
      if (docId && saveState !== "saved") {
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("beforeunload", onUnload);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("beforeunload", onUnload);
    };
  });

  // Flush pending save when leaving the page.
  useEffect(() => () => {
    if (docId && saveTimer.current) {
      window.clearTimeout(saveTimer.current);
      void patch(`/api/documents/${docId}`, { title: latest.current.title, content_html: latest.current.html, content_text: latest.current.text }).catch(() => undefined);
    }
  }, [docId]);

  useEffect(() => {
    if (!editor) return;
    const fn = () => setHasSelection(!editor.state.selection.empty);
    editor.on("selectionUpdate", fn);
    return () => {
      editor.off("selectionUpdate", fn);
    };
  }, [editor]);

  const saveAsDocument = async () => {
    if (!editor) return;
    try {
      const d = await post<{ id: number }>("/api/documents", { title: title || "Untitled document", content_html: editor.getHTML() });
      qc.invalidateQueries({ queryKey: ["documents"] });
      toast("Saved to Documents");
      setDraft({ title: "Untitled draft", html: "" });
      nav(`/documents/${d.id}`);
    } catch (e) {
      toast((e as Error).message, "bad");
    }
  };

  // ------------------------------------------------------------------ AI actions
  const selectionInfo = (ed: Editor) => {
    const { from, to, empty } = ed.state.selection;
    if (!empty) return { text: ed.state.doc.textBetween(from, to, "\n\n"), range: { from, to } };
    return { text: ed.getText({ blockSeparator: "\n\n" }), range: null };
  };

  const runAction = (actionId: string, label: string) => {
    if (!editor) return;
    const { text, range } = selectionInfo(editor);
    if (!text.trim()) {
      toast("Write or select some text first", "info");
      return;
    }
    const context = range ? editor.getText({ blockSeparator: "\n\n" }).slice(0, 3000) : "";
    setPending({ action: actionId, label, original: text, range, kind: "edit" });
    run.start("/api/tools/assistant", { action: actionId, text, instruction: actionId === "custom" ? instruction : "", context, explain: explain && actionId !== "continue" });
  };

  const explainMistakes = () => {
    if (!editor) return;
    const { text, range } = selectionInfo(editor);
    if (!text.trim()) return toast("Write or select some text first", "info");
    setPending({ action: "explain", label: "Writing feedback", original: text, range, kind: "explain" });
    run.start("/api/tools/assistant/explain-mistakes", { text });
  };

  const applyResult = (mode: "replace" | "below") => {
    if (!editor || !pending || !run.text) return;
    const out = run.text.trim();
    const multi = /\n\s*\n/.test(out) || /^(#{1,6}\s|[-*]\s|\d+\.\s)/m.test(out);
    const content = multi ? textToHtml(out) : out;
    const chain = editor.chain().focus();
    if (pending.action === "continue") {
      chain.insertContentAt(editor.state.doc.content.size, textToHtml(out)).run();
    } else if (mode === "replace") {
      if (pending.range) chain.insertContentAt(pending.range, content).run();
      else chain.setContent(textToHtml(out)).run();
    } else {
      const pos = pending.range ? editor.state.doc.resolve(pending.range.to).after(1) : editor.state.doc.content.size;
      chain.insertContentAt(pos, textToHtml(out)).run();
    }
    setPending(null);
    run.reset();
    toast("Applied — press Ctrl+Z to undo");
  };

  const discard = () => {
    run.cancel();
    run.reset();
    setPending(null);
  };

  const wordCount = editorWordCount(editor);

  return (
    <div className="mx-auto grid w-full max-w-[1500px] animate-rise gap-5 px-6 py-6 lg:grid-cols-[1fr_380px]">
      {/* editor column */}
      <div className="min-w-0">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {docId && (
            <IconButton label="Back to documents" onClick={() => nav("/documents")}>
              <ArrowLeft className="size-4" />
            </IconButton>
          )}
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Untitled"
            aria-label="Document title"
            className="min-w-0 flex-1 bg-transparent text-[1.45rem] font-semibold tracking-tight text-ink outline-none placeholder:text-faint"
          />
          <SaveIndicator docId={docId} state={saveState} savedAt={savedAt} />
          {docId ? (
            <>
              <Button size="sm" variant="ghost" icon={<History className="size-4" />} onClick={() => setVersionsOpen(true)}>Versions</Button>
              <Menu
                trigger={(t) => <Button size="sm" icon={<Download className="size-4" />} onClick={t}>Export</Button>}
                items={["docx", "pdf", "md", "txt", "html"].map((f) => ({
                  label: { docx: "Word (.docx)", pdf: "PDF (.pdf)", md: "Markdown (.md)", txt: "Plain text (.txt)", html: "Web page (.html)" }[f]!,
                  onClick: async () => {
                    await saveNow(false);
                    downloadFrom(`/api/documents/${docId}/export`, { format: f }).catch((e) => toast(e.message, "bad"));
                  },
                }))}
              />
              <Button size="sm" variant="ghost" icon={<Keyboard className="size-4" />} onClick={() => nav("/autotyper", { state: { text: editor?.getText({ blockSeparator: "\n\n" }), title } })}>AutoType</Button>
            </>
          ) : (
            <Button size="sm" variant="soft" icon={<FilePlus className="size-4" />} onClick={saveAsDocument}>Save as document</Button>
          )}
        </div>
        <Card className="overflow-hidden">
          <EditorToolbar editor={editor} extra={<span className="pr-2 text-xs text-muted">{wordCount.toLocaleString()} words</span>} />
          <div className="relative max-h-[calc(100vh-210px)] min-h-[60vh] overflow-y-auto bg-surface">
            {!loaded && <div className="absolute inset-0 z-10 grid place-items-center bg-surface"><LoaderCircle className="size-6 animate-spin text-accent" /></div>}
            {editor && (
              <BubbleMenu editor={editor} options={{ placement: "top" }}>
                <div className="card flex items-center gap-0.5 p-1 shadow-pop">
                  {[["improve", "Improve"], ["grammar", "Fix grammar"], ["shorten", "Shorten"], ["expand", "Expand"]].map(([id, label]) => (
                    <button key={id} onMouseDown={(e) => e.preventDefault()} onClick={() => runAction(id, label)} className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-ink-2 hover:bg-surface-2 hover:text-ink">
                      {id === "improve" && <Sparkles className="size-3.5 text-accent" />}
                      {label}
                    </button>
                  ))}
                </div>
              </BubbleMenu>
            )}
            <EditorSurface editor={editor} />
          </div>
        </Card>
      </div>

      {/* AI panel */}
      <div className="lg:sticky lg:top-20 lg:self-start">
        <Card className="flex max-h-[calc(100vh-110px)] flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <div className="flex items-center gap-2">
              <Feather className="size-4 text-accent" />
              <span className="font-semibold">Assistant</span>
            </div>
            <span className={cx("rounded-full px-2 py-0.5 text-[0.7rem] font-medium", hasSelection ? "bg-accent-soft text-accent" : "bg-surface-3 text-muted")}>
              {hasSelection ? "Selection" : "Whole document"}
            </span>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            {!pending ? (
              <div className="space-y-4">
                <p className="text-xs text-muted">Select text to work on just that part, or run an action on the whole document.</p>
                {["Edit", "Length", "Style", "Structure", "Tone"].map((g) => (
                  <div key={g}>
                    <div className="label mb-1.5">{g}</div>
                    <div className="flex flex-wrap gap-1.5">
                      {ACTIONS.filter((a) => a.group === g).map((a) => (
                        <button key={a.id} onClick={() => runAction(a.id, a.label)} className="rounded-lg border border-line bg-surface-2 px-2.5 py-1.5 text-[0.8rem] text-ink-2 transition hover:border-accent/40 hover:text-ink">
                          {a.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                <div>
                  <div className="label mb-1.5">Custom request</div>
                  <Textarea rows={2} value={instruction} onChange={(e) => setInstruction(e.target.value)} placeholder="e.g. Add a counter-argument to this paragraph" />
                  <Button className="mt-2 w-full" size="sm" variant="soft" icon={<Wand className="size-3.5" />} disabled={!instruction.trim()} onClick={() => runAction("custom", instruction.trim())}>Run</Button>
                </div>
                <div className="space-y-2 border-t border-line pt-4">
                  <Switch checked={explain} onChange={setExplain} label="Explain major changes" description="Adds a short explanation after each edit" />
                  <Button className="w-full" size="sm" icon={<PenLine className="size-3.5" />} onClick={() => setComposeOpen(true)}>Write an essay for me…</Button>
                  <Button className="w-full" size="sm" icon={<Lightbulb className="size-3.5" />} onClick={explainMistakes}>Explain my writing mistakes</Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-ink">{pending.label}</div>
                  <ModelBadge meta={run.meta} />
                </div>
                {run.status === "running" && !run.text && <WorkingIndicator progress={run.progress} label="Writing" />}
                {run.status === "error" && run.error && <RunError error={run.error} onRetry={() => (pending.kind === "explain" ? explainMistakes() : runAction(pending.action, pending.label))} />}
                {run.text && (
                  <div className="max-h-[46vh] overflow-y-auto rounded-xl border border-line bg-bg-2 p-3 text-[0.88rem] leading-relaxed">
                    {pending.kind === "explain" ? (
                      <div className="prose-torz text-[0.88rem]" dangerouslySetInnerHTML={{ __html: renderMarkdown(run.text) }} />
                    ) : run.status === "done" && pending.kind === "edit" && pending.action !== "continue" ? (
                      <HighlightedRevision original={pending.original} revised={run.text} />
                    ) : (
                      <div className={cx("whitespace-pre-wrap", run.status === "running" && "stream-caret")}>{run.text}</div>
                    )}
                  </div>
                )}
                {run.status === "done" && run.result?.explanation && (
                  <div className="rounded-xl border border-accent/20 bg-accent-soft p-3">
                    <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-accent"><CircleHelp className="size-3.5" /> Why these changes</div>
                    <div className="prose-torz text-[0.82rem]" dangerouslySetInnerHTML={{ __html: renderMarkdown(run.result.explanation) }} />
                  </div>
                )}
                {run.status === "running" && run.text && <Button size="sm" icon={<Square className="size-3" />} onClick={run.cancel}>Stop</Button>}
                <div className="flex flex-wrap gap-2">
                  {run.status === "done" && pending.kind !== "explain" && (
                    <>
                      <Button size="sm" variant="primary" icon={<Check className="size-3.5" />} onClick={() => applyResult("replace")}>
                        {pending.action === "continue" ? "Append" : pending.kind === "compose" ? (editor?.isEmpty ? "Insert" : "Replace document") : pending.range ? "Replace selection" : "Replace document"}
                      </Button>
                      {pending.action !== "continue" && <Button size="sm" onClick={() => applyResult("below")}>Insert below</Button>}
                    </>
                  )}
                  <Button size="sm" variant="ghost" icon={<X className="size-3.5" />} onClick={discard}>{run.status === "done" && pending.kind !== "explain" ? "Discard" : "Close"}</Button>
                </div>
              </div>
            )}
          </div>
          {!docId && (
            <div className="border-t border-line px-4 py-2.5 text-xs text-muted">
              Draft autosaves in this browser. <Link to="/documents" className="text-accent hover:underline">Open Documents</Link>
            </div>
          )}
        </Card>
      </div>

      <ComposeModal
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        onStart={(body) => {
          setComposeOpen(false);
          setPending({ action: "compose", label: `Essay: ${body.topic}`, original: "", range: null, kind: "compose" });
          run.start("/api/tools/assistant/compose", body);
        }}
      />
      {docId && (
        <VersionsModal
          open={versionsOpen}
          docId={docId}
          onClose={() => setVersionsOpen(false)}
          onRestored={(d) => {
            editor?.commands.setContent(d.content_html, { emitUpdate: false });
            latest.current.html = d.content_html;
            setVersionsOpen(false);
            toast("Version restored");
          }}
          confirm={confirm}
        />
      )}
    </div>
  );
}

function SaveIndicator({ docId, state, savedAt }: { docId?: number; state: SaveState; savedAt: string | null }) {
  if (!docId) return <span className="text-xs text-muted">Draft</span>;
  const map = {
    saved: <span className="flex items-center gap-1.5 text-xs text-muted" title={savedAt ? formatDateTime(savedAt) : ""}><Check className="size-3.5 text-good" /> Saved {savedAt ? timeAgo(savedAt) : ""}</span>,
    saving: <span className="flex items-center gap-1.5 text-xs text-muted"><LoaderCircle className="size-3.5 animate-spin" /> Saving…</span>,
    dirty: <span className="text-xs text-muted">Unsaved changes</span>,
    error: <span className="text-xs text-bad">Save failed — retrying on next edit</span>,
  };
  return map[state];
}

function ComposeModal({ open, onClose, onStart }: { open: boolean; onClose: () => void; onStart: (b: any) => void }) {
  const [topic, setTopic] = useState("");
  const [type, setType] = useState("expository");
  const [words, setWords] = useState(500);
  const [audience, setAudience] = useState("");
  const [points, setPoints] = useState("");
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Write an essay"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={topic.trim().length < 3} onClick={() => onStart({ topic, essay_type: type, words, audience, points })} icon={<PenLine className="size-4" />}>Write draft</Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Topic or prompt">
          <Textarea rows={3} value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. Should schools start later in the morning?" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Essay type">
            <Select value={type} onChange={(e) => setType(e.target.value)}>
              {["expository", "argumentative", "persuasive", "narrative", "descriptive", "compare and contrast", "cause and effect", "reflective"].map((t) => <option key={t} value={t}>{t[0].toUpperCase() + t.slice(1)}</option>)}
            </Select>
          </Field>
          <Field label="Approximate length (words)">
            <Input type="number" min={100} max={5000} step={50} value={words} onChange={(e) => setWords(Number(e.target.value) || 500)} />
          </Field>
        </div>
        <Field label="Audience (optional)"><Input value={audience} onChange={(e) => setAudience(e.target.value)} /></Field>
        <Field label="Points to include (optional)"><Textarea rows={2} value={points} onChange={(e) => setPoints(e.target.value)} /></Field>
        <p className="text-xs text-muted">The draft is a starting point. Review facts and add your own sources — the model is told not to invent citations.</p>
      </div>
    </Modal>
  );
}

function VersionsModal({ open, docId, onClose, onRestored, confirm }: { open: boolean; docId: number; onClose: () => void; onRestored: (d: any) => void; confirm: ReturnType<typeof useUi>["confirm"] }) {
  const [versions, setVersions] = useState<any[] | null>(null);
  useEffect(() => {
    if (open) get(`/api/documents/${docId}/versions`).then((r) => setVersions(r.versions));
  }, [open, docId]);
  return (
    <Modal open={open} onClose={onClose} title="Version history" width="max-w-2xl">
      {!versions && <LoaderCircle className="size-5 animate-spin text-accent" />}
      {versions?.length === 0 && <p className="py-6 text-center text-sm text-muted">No earlier versions yet. Versions are kept automatically every few minutes while you edit, and whenever you press Ctrl+S.</p>}
      <div className="max-h-[60vh] space-y-2 overflow-y-auto">
        {versions?.map((v) => (
          <div key={v.id} className="flex items-start gap-3 rounded-xl border border-line p-3">
            <BookOpenCheck className="mt-0.5 size-4 text-muted" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-ink">{formatDateTime(v.created_at)} · {v.word_count} words</div>
              <div className="mt-1 line-clamp-2 text-xs text-muted">{v.preview}</div>
            </div>
            <Button
              size="sm"
              onClick={async () => {
                const ok = await confirm({ title: "Restore this version?", message: "Your current text is kept as a version too, so you can switch back." });
                if (ok) onRestored(await post(`/api/documents/${docId}/versions/${v.id}/restore`));
              }}
            >
              Restore
            </Button>
          </div>
        ))}
      </div>
    </Modal>
  );
}

export { htmlToText };
