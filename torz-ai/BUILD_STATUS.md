# TORZ AI — Build Status

**Version 1.0.0. Every feature in the specification is implemented and tested.** Exact test runs are in
`TEST_RESULTS.md`. Remaining limitations are listed honestly at the end.

## Feature completion

| Area | Status | Notes |
| --- | --- | --- |
| Dashboard | Done | Greeting, quick actions, local stats, a 14-day activity chart, AI status, favorites (drag to reorder), recently used tools, recent documents and files, recent results, all 17 tools by category, tool finder |
| Sidebar, search, themes | Done | Collapsible sidebar with a Favorites section, Ctrl+K global search (tools, documents, notes, decks, quizzes, guides, files, history), dark/light/system themes, 6 accent colors, 4 text sizes, compact layout, reduced motion |
| AI Humanizer | Done | Simple/Standard/Enhanced modes, 6 preserve options, tone, key terms, highlighted changes, side-by-side diff, preservation check, readability, copy/download/save/AutoType, history. Makes no detector claims |
| Writing Assistant | Done | TipTap rich editor (headings, bold/italic/underline/strike, highlight, code, lists, quote, alignment, undo/redo). 15 selection-aware actions plus custom requests, explanations, essay drafting, mistake explanations, preview then replace or insert, save as document |
| Grammar Checker | Done | AI mode (minimal edits turned into exact positional issues, with explanations) and an offline rule + dictionary engine. Accept, reject, accept all, category filters, personal dictionary, copy |
| Paraphraser, Rewriter, Simplifier, Essay Improver | Done | Six paraphrase styles with 1–5 strength. Tone, length, audience and instructions. Reading levels with local readability scores. Essay rubric scores plus a revised essay |
| Summarizer | Done | Text, PDF, DOCX, TXT, MD and stored files or documents. Seven formats, adjustable length, map-reduce for long documents, offline engine |
| Smart Notes | Done | Structured notes, editable rich editor, tags, pin, search, export (MD/DOCX/PDF/TXT), library |
| AutoTyper | Done | In-app preview. Extension engines: keyboard via CDP (works in Google Docs) and compatibility. Official Google Docs API engine (OAuth PKCE, document picker, progressive insertion, pause/resume/stop/undo) |
| Document Workspace | Done | Folders, search, sort, pin, rename, duplicate, autosave, version history and restore, trash and restore, permanent delete, import, export (DOCX/PDF/MD/TXT/HTML) |
| PDF Reader | Done | pdf.js rendering, zoom, paging, per-page extracted text, OCR re-run, one-click hand-off to every study tool |
| Quiz Generator | Done | 5 question types, difficulty levels, one question at a time, instant grading and explanations with supporting quotes, auto-advance, results, review of incorrect answers, retake (reshuffled), new questions, library, grounding filter |
| Flashcards | Done | 3D flip, previous/next, keyboard shortcuts, shuffle, known/difficult, difficult-only mode, quiz mode with shuffled answers, card editor, Leitner-style progress, JSON/CSV/Anki TSV import and export |
| Study Guides | Done | Overview, topics, vocabulary, concepts, examples, facts, common mistakes, review questions. Quick-review and detailed-study views. Export |
| Practice Tests | Done | Configurable count, types and difficulty. Optional timer with auto-submit. Automatic grading plus AI feedback on written answers. Review, history, retake with new questions |
| Question Answering | Done | Multiple sources (files, documents, notes, text), BM25 retrieval, cited answers, follow-ups, offline passage search |
| History | Done | Every tool: search, filter, open, copy, rename, delete, reuse input, clear per tool or all, privacy switch |
| Settings | Done | Profile, appearance, AI providers (test, models, keys, Ollama download/delete, fallback, temperature, context), writing and study defaults, dictionary, privacy and data (export ZIP, clear, delete, reset), system info and diagnostics |
| AI provider system | Done | Ollama, OpenAI-compatible (LM Studio etc.), OpenAI, Anthropic, Gemini. Streaming, retries with backoff, local fallback, model auto-selection and availability checks, JSON-schema output with repair retry, setup screen when no model is available |
| Offline engine | Done | Extractive summaries, notes, flashcards, quizzes, study guides, rule-based grammar, BM25 search, approximate grading. Always labelled |
| Documents / OCR | Done | pypdfium2 PDF text, RapidOCR (offline ONNX) for scans and images, python-docx, charset detection, zip-bomb and type checks, size limits |
| Security | Done | Loopback only, Host and Origin allow-lists, per-install token, fixed extension ID, keyring or encrypted key storage, input validation, safe filenames |
| Chrome extension | Done | MV3: context menu assist, side panel, replace after confirmation plus undo, AutoTyper, bridge to the app |
| Windows delivery | Done | INSTALL.bat (Python, venv, deps, OCR, desktop shortcut, optional Ollama and model), START.bat (`--app-window` option), STOP.bat (clean shutdown), install.sh/start.sh/stop.sh |

## Database tables

`folders`, `documents`, `document_versions`, `files`, `history_entries` (writing and humanization history), `summaries`,
`notes`, `flashcard_decks`, `flashcards`, `quizzes`, `quiz_questions`, `quiz_attempts`, `study_guides`, `favorites`,
`settings` (application preferences), `tool_usage`, `activity`, `autotyper_jobs`, `schema_migrations`.
They use foreign keys with cascade or set-null rules, and versioned migrations (currently schema v2).

## Bugs found by testing and fixed

1. The sentence splitter looped forever on paragraph breaks. Any multi-paragraph input hung. *(pytest)*
2. A React effect returned a Promise, because newer Chromium's `scrollIntoView` returns one. This crashed when leaving the Q&A page. *(E2E)*
3. Duplicate React keys in sliders. *(E2E, dev build)*
4. A stale `index.html` was cached after a rebuild, and missing `/assets/*` fell back to HTML. *(E2E)*
5. Leaving the note editor with a pending save overwrote the title and tags with empty values (stale closure). *(E2E)*
6. A stream-completion race lost Q&A passages on fast responses. *(E2E)*
7. Flashcard keyboard shortcuts raced the card-advance animation. *(E2E)*
8. The offline grader required words already given in the question, and the stemmer mismatched "takes"/"take". *(pytest)*
9. "could of went" became "could have went" instead of "could have gone". *(E2E)*
10. The OpenAI provider was shown as "Local · free". *(visual check)*

## Known limitations (honest)

- **Windows scripts were written for Windows but executed only on Linux here.** The `.bat` files are thin
  wrappers around `torz.launcher`, which *was* tested: start, status, stop, restart and data persistence
  across restarts. The `.sh` equivalents were run end to end. The `.bat` files use CRLF line endings
  and avoid fragile cmd constructs, but run INSTALL.bat once and check its output.
- **Google Docs typing through the real Google Docs editor was not tested** — this environment has no
  Google account. The keyboard engine's typing (Chrome debugger `Input.insertText`) was tested in
  textareas and rich contenteditable editors in real Chromium. It is the same mechanism Chrome uses for
  real keyboard input, which is why it is the Google Docs engine. The Google Docs **API** engine was
  tested against a faithful mock of Google's OAuth, Drive and Docs endpoints, including UTF-16
  indexing.
- **Cloud providers (OpenAI, Anthropic, Gemini) were tested at the protocol level** with mocked HTTP
  responses (no API keys here). Ollama was tested for real: built from source and running
  `llama3.2:3b`.
- **Quality depends on the model.** Small models (1–3B) sometimes write imprecise grammar explanations
  or fewer valid quiz items. Ungrounded or malformed items are filtered out, never shown as correct.
  Larger models (`qwen2.5:7b`, `llama3.1:8b`) do noticeably better.
- **Offline grading of written answers is approximate** (keyword coverage) and labelled as such.
- **No packaged `.exe`.** TORZ AI runs from Python with a desktop shortcut, and can open in an Edge app
  window (`START.bat --app-window`).

## Next steps

None required. Optional ideas: an embeddings-based hybrid search for Q&A, a PyInstaller
single-file build, and more offline grammar rules.
