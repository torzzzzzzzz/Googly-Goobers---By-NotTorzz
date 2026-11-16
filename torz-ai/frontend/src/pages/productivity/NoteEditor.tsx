import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, ClipboardCheck, Download, FilePlus, Layers, LoaderCircle, Pin, Trash2 } from "lucide-react";
import { del, downloadFrom, get, patch, post } from "../../lib/api";
import { timeAgo } from "../../lib/format";
import { useToolVisit } from "../../lib/hooks";
import { Button, Card, IconButton, Input, Menu, useUi } from "../../components/ui";
import { EditorSurface, EditorToolbar, useRichEditor } from "../../components/tool/RichEditor";
import { ModelBadge } from "../../components/tool/ToolKit";

export default function NoteEditor() {
  useToolVisit("notes");
  const { id } = useParams();
  const noteId = Number(id);
  const nav = useNavigate();
  const qc = useQueryClient();
  const { toast, confirm } = useUi();
  const [note, setNote] = useState<any>(null);
  const [title, setTitle] = useState("");
  const [tags, setTags] = useState("");
  const [state, setState] = useState<"saved" | "saving" | "dirty">("saved");
  const timer = useRef<number | null>(null);
  const htmlRef = useRef("");
  const fieldsRef = useRef({ title: "", tags: "" });
  fieldsRef.current = { title, tags };

  const save = async (fields: Record<string, unknown>) => {
    setState("saving");
    try {
      const n = await patch(`/api/notes/${noteId}`, fields);
      setNote(n);
      setState("saved");
      qc.invalidateQueries({ queryKey: ["notes"] });
    } catch {
      setState("dirty");
    }
  };
  const schedule = () => {
    setState("dirty");
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      save({ ...fieldsRef.current, content_html: htmlRef.current });
    }, 800);
  };

  const editor = useRichEditor({ content: "", placeholder: "Write your notes…", onUpdate: (html) => { htmlRef.current = html; schedule(); } });

  useEffect(() => {
    if (!editor) return;
    get(`/api/notes/${noteId}`)
      .then((n) => {
        setNote(n);
        setTitle(n.title);
        setTags(n.tags.join(", "));
        htmlRef.current = n.content_html;
        editor.commands.setContent(n.content_html || "", { emitUpdate: false });
      })
      .catch(() => {
        toast("Note not found", "bad");
        nav("/notes", { state: { tab: "library" } });
      });
  }, [noteId, editor, nav, toast]);

  useEffect(() => {
    if (note && (title !== note.title || tags !== note.tags.join(", "))) schedule();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, tags]);

  // Flush a pending save when leaving the page (refs hold the latest values).
  useEffect(() => () => {
    if (timer.current) {
      window.clearTimeout(timer.current);
      void patch(`/api/notes/${noteId}`, { ...fieldsRef.current, content_html: htmlRef.current }).catch(() => undefined);
    }
  }, [noteId]);

  const studyWith = (path: string) => nav(path, { state: { text: editor?.getText({ blockSeparator: "\n\n" }), title } });

  return (
    <div className="mx-auto max-w-[1100px] animate-rise px-6 py-6">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <IconButton label="Back to notes" onClick={() => nav("/notes", { state: { tab: "library" } })}><ArrowLeft className="size-4" /></IconButton>
        <input value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Note title" placeholder="Untitled note" className="min-w-0 flex-1 bg-transparent text-[1.45rem] font-semibold tracking-tight outline-none placeholder:text-faint" />
        <span className="flex items-center gap-1.5 text-xs text-muted">
          {state === "saving" ? <LoaderCircle className="size-3.5 animate-spin" /> : state === "saved" ? <Check className="size-3.5 text-good" /> : null}
          {state === "saving" ? "Saving…" : state === "saved" ? `Saved ${note ? timeAgo(note.updated_at) : ""}` : "Unsaved changes"}
        </span>
        <ModelBadge meta={note ? { model: note.model, provider: note.provider, engine: note.engine === "manual" ? undefined : note.engine } : null} />
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="Tags, comma-separated (e.g. biology, unit 3)" className="max-w-md" aria-label="Tags" />
        <Button size="sm" variant={note?.pinned ? "soft" : "ghost"} icon={<Pin className="size-3.5" />} onClick={() => save({ pinned: !note?.pinned })}>{note?.pinned ? "Pinned" : "Pin"}</Button>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button size="sm" icon={<Layers className="size-3.5" />} onClick={() => studyWith("/flashcards")}>Flashcards</Button>
          <Button size="sm" icon={<ClipboardCheck className="size-3.5" />} onClick={() => studyWith("/quiz")}>Quiz</Button>
          <Menu
            trigger={(t) => <Button size="sm" icon={<Download className="size-3.5" />} onClick={t}>Export</Button>}
            items={[
              ...["md", "docx", "pdf", "txt"].map((f) => ({ label: { md: "Markdown (.md)", docx: "Word (.docx)", pdf: "PDF (.pdf)", txt: "Plain text (.txt)" }[f]!, onClick: () => downloadFrom(`/api/notes/${noteId}/export`, { format: f }).catch((e) => toast(e.message, "bad")) })),
              "divider",
              { label: "Copy into Documents", icon: <FilePlus />, onClick: async () => { const d = await post(`/api/notes/${noteId}/to-document`); toast("Copied to Documents"); nav(`/documents/${d.id}`); } },
            ]}
          />
          <IconButton
            label="Delete note"
            onClick={async () => {
              if (await confirm({ title: "Delete this note?", danger: true, confirmLabel: "Delete" })) {
                await del(`/api/notes/${noteId}`);
                qc.invalidateQueries({ queryKey: ["notes"] });
                nav("/notes", { state: { tab: "library" } });
              }
            }}
          >
            <Trash2 className="size-4" />
          </IconButton>
        </div>
      </div>
      <Card className="overflow-hidden">
        <EditorToolbar editor={editor} />
        <div className="max-h-[calc(100vh-240px)] min-h-[60vh] overflow-y-auto">
          <EditorSurface editor={editor} />
        </div>
      </Card>
    </div>
  );
}
