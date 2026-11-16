import type { LucideIcon } from "lucide-react";
import {
  BookOpenCheck,
  BrainCircuit,
  ClipboardCheck,
  FileText,
  FolderOpen,
  GraduationCap,
  Keyboard,
  Layers,
  ListMinus,
  MessageCircleQuestion,
  NotebookPen,
  PenLine,
  RefreshCw,
  Repeat2,
  SpellCheck,
  WandSparkles,
  Feather,
} from "lucide-react";

export type Category = "writing" | "productivity" | "study";

export interface ToolDef {
  id: string;
  name: string;
  short: string;
  description: string;
  path: string;
  icon: LucideIcon;
  category: Category;
  offline?: boolean; // has a non-AI offline engine
  needsAI?: boolean;
}

export const CATEGORIES: { id: Category; label: string; blurb: string }[] = [
  { id: "writing", label: "AI Writing", blurb: "Rewrite, polish and proofread" },
  { id: "productivity", label: "Productivity", blurb: "Summaries, notes, documents and typing" },
  { id: "study", label: "Study Tools", blurb: "Quizzes, flashcards, guides and tests" },
];

export const TOOLS: ToolDef[] = [
  { id: "humanizer", name: "AI Humanizer", short: "Humanizer", path: "/humanizer", icon: WandSparkles, category: "writing", needsAI: true,
    description: "Rewrite stiff or robotic text so it reads naturally while keeping your meaning and voice." },
  { id: "assistant", name: "Writing Assistant", short: "Assistant", path: "/assistant", icon: Feather, category: "writing", needsAI: true,
    description: "A rich editor with AI actions: improve, expand, shorten, fix tone and explain changes." },
  { id: "grammar", name: "Grammar Checker", short: "Grammar", path: "/grammar", icon: SpellCheck, category: "writing", offline: true,
    description: "Find spelling, grammar and punctuation errors and accept fixes one by one." },
  { id: "paraphraser", name: "Paraphraser", short: "Paraphraser", path: "/paraphraser", icon: Repeat2, category: "writing", needsAI: true,
    description: "Say the same thing in new words, in six styles with adjustable strength." },
  { id: "rewriter", name: "Text Rewriter", short: "Rewriter", path: "/rewriter", icon: RefreshCw, category: "writing", needsAI: true,
    description: "Rewrite for a new tone, length or audience with your own instructions." },
  { id: "essay", name: "Essay Improver", short: "Essay", path: "/essay", icon: PenLine, category: "writing", needsAI: true,
    description: "Get scored feedback on your essay and a revised version that fixes the weak spots." },
  { id: "simplifier", name: "Sentence Simplifier", short: "Simplifier", path: "/simplifier", icon: ListMinus, category: "writing", needsAI: true,
    description: "Turn dense writing into clear, short sentences at the reading level you choose." },
  { id: "summarizer", name: "Summarizer", short: "Summarizer", path: "/summarizer", icon: FileText, category: "productivity", offline: true,
    description: "Summarize text, PDFs and Word files as bullets, paragraphs, facts or key terms." },
  { id: "notes", name: "Smart Notes", short: "Notes", path: "/notes", icon: NotebookPen, category: "productivity", offline: true,
    description: "Turn any material into organized notes with concepts, definitions, dates and people." },
  { id: "autotyper", name: "AutoTyper", short: "AutoTyper", path: "/autotyper", icon: Keyboard, category: "productivity",
    description: "Type your text into Google Docs or any web editor at a natural, adjustable speed." },
  { id: "documents", name: "Document Workspace", short: "Documents", path: "/documents", icon: FolderOpen, category: "productivity",
    description: "Your private library of documents with folders, autosave, versions and export." },
  { id: "pdf", name: "PDF Reader", short: "PDF Reader", path: "/pdf", icon: BookOpenCheck, category: "productivity",
    description: "Read PDFs, extract their text (with OCR for scans) and send them to any study tool." },
  { id: "quiz", name: "Quiz Generator", short: "Quizzes", path: "/quiz", icon: ClipboardCheck, category: "study", offline: true,
    description: "Generate quizzes from your material and take them one question at a time." },
  { id: "flashcards", name: "Flashcard Generator", short: "Flashcards", path: "/flashcards", icon: Layers, category: "study", offline: true,
    description: "Create flashcard decks and study them with flips, shuffling and progress tracking." },
  { id: "study_guide", name: "Study Guide Generator", short: "Study Guides", path: "/study-guide", icon: GraduationCap, category: "study", offline: true,
    description: "Organize material into topics, vocabulary, key concepts, mistakes and review questions." },
  { id: "practice_test", name: "Practice Test Generator", short: "Practice Tests", path: "/practice-test", icon: BrainCircuit, category: "study", offline: true,
    description: "Full practice tests with timers, automatic grading and written-answer feedback." },
  { id: "qa", name: "Question Answering", short: "Ask Docs", path: "/qa", icon: MessageCircleQuestion, category: "study", offline: true,
    description: "Ask questions about your documents and get answers with cited passages." },
];

export const TOOL_BY_ID: Record<string, ToolDef> = Object.fromEntries(TOOLS.map((t) => [t.id, t]));

export function toolByPath(pathname: string): ToolDef | undefined {
  return TOOLS.find((t) => pathname === t.path || pathname.startsWith(t.path + "/"));
}

export function toolName(id: string): string {
  return TOOL_BY_ID[id]?.name ?? id;
}
