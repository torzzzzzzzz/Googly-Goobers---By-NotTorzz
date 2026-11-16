import { useEffect, type ReactNode } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { CharacterCount, Placeholder } from "@tiptap/extensions";
import TextAlign from "@tiptap/extension-text-align";
import Highlight from "@tiptap/extension-highlight";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Highlighter,
  Italic,
  List,
  ListOrdered,
  Quote,
  Redo2,
  Strikethrough,
  Underline,
  Undo2,
} from "lucide-react";
import { cx } from "../ui";

export function useRichEditor({ content, onUpdate, placeholder = "Start writing…", editable = true }: {
  content: string;
  onUpdate?: (html: string, text: string, editor: Editor) => void;
  placeholder?: string;
  editable?: boolean;
}) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: { openOnClick: false, autolink: true } }),
      Placeholder.configure({ placeholder }),
      CharacterCount,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Highlight,
    ],
    content,
    editable,
    immediatelyRender: true,
    editorProps: { attributes: { class: "prose-torz min-h-[60vh] px-10 py-8 focus:outline-none", spellcheck: "true" } },
    onUpdate: ({ editor }) => onUpdate?.(editor.getHTML(), editor.getText({ blockSeparator: "\n\n" }), editor),
  });
  useEffect(() => {
    editor?.setEditable(editable);
  }, [editor, editable]);
  return editor;
}

function TB({ on, active, label, children, disabled }: { on: () => void; active?: boolean; label: string; children: ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={on}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={cx("grid size-8 place-items-center rounded-lg transition disabled:opacity-30 [&>svg]:size-4", active ? "bg-accent-soft text-accent" : "text-muted hover:bg-surface-2 hover:text-ink")}
    >
      {children}
    </button>
  );
}

const Sep = () => <span className="mx-1 h-5 w-px bg-line" />;

export function EditorToolbar({ editor, extra }: { editor: Editor | null; extra?: ReactNode }) {
  if (!editor) return null;
  const c = () => editor.chain().focus();
  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-line px-3 py-1.5">
      <TB label="Undo (Ctrl+Z)" on={() => c().undo().run()} disabled={!editor.can().undo()}><Undo2 /></TB>
      <TB label="Redo (Ctrl+Y)" on={() => c().redo().run()} disabled={!editor.can().redo()}><Redo2 /></TB>
      <Sep />
      <TB label="Heading 1" active={editor.isActive("heading", { level: 1 })} on={() => c().toggleHeading({ level: 1 }).run()}><Heading1 /></TB>
      <TB label="Heading 2" active={editor.isActive("heading", { level: 2 })} on={() => c().toggleHeading({ level: 2 }).run()}><Heading2 /></TB>
      <TB label="Heading 3" active={editor.isActive("heading", { level: 3 })} on={() => c().toggleHeading({ level: 3 }).run()}><Heading3 /></TB>
      <Sep />
      <TB label="Bold (Ctrl+B)" active={editor.isActive("bold")} on={() => c().toggleBold().run()}><Bold /></TB>
      <TB label="Italic (Ctrl+I)" active={editor.isActive("italic")} on={() => c().toggleItalic().run()}><Italic /></TB>
      <TB label="Underline (Ctrl+U)" active={editor.isActive("underline")} on={() => c().toggleUnderline().run()}><Underline /></TB>
      <TB label="Strikethrough" active={editor.isActive("strike")} on={() => c().toggleStrike().run()}><Strikethrough /></TB>
      <TB label="Highlight" active={editor.isActive("highlight")} on={() => c().toggleHighlight().run()}><Highlighter /></TB>
      <TB label="Inline code" active={editor.isActive("code")} on={() => c().toggleCode().run()}><Code /></TB>
      <Sep />
      <TB label="Bulleted list" active={editor.isActive("bulletList")} on={() => c().toggleBulletList().run()}><List /></TB>
      <TB label="Numbered list" active={editor.isActive("orderedList")} on={() => c().toggleOrderedList().run()}><ListOrdered /></TB>
      <TB label="Quote" active={editor.isActive("blockquote")} on={() => c().toggleBlockquote().run()}><Quote /></TB>
      <Sep />
      <TB label="Align left" active={editor.isActive({ textAlign: "left" })} on={() => c().setTextAlign("left").run()}><AlignLeft /></TB>
      <TB label="Align center" active={editor.isActive({ textAlign: "center" })} on={() => c().setTextAlign("center").run()}><AlignCenter /></TB>
      <TB label="Align right" active={editor.isActive({ textAlign: "right" })} on={() => c().setTextAlign("right").run()}><AlignRight /></TB>
      {extra && (
        <>
          <span className="flex-1" />
          {extra}
        </>
      )}
    </div>
  );
}

export function EditorSurface({ editor }: { editor: Editor | null }) {
  return <EditorContent editor={editor} className="h-full" />;
}

export function editorWordCount(editor: Editor | null): number {
  return editor?.storage.characterCount?.words?.() ?? 0;
}
