# TORZ AI — Test Results

All the runs below were actually executed, on 2026-11-16, in a Linux container with a 4-core CPU, no
GPU, Python 3.13 and Chromium (Playwright 1.63). Nothing is reported that was not run.

| Suite | Command | Result |
| --- | --- | --- |
| Backend unit + API (pytest) | `cd backend && .venv/bin/python -m pytest` | **58 passed**, 8 skipped (the live tests, which run separately) — 24 s |
| Backend **live model** (real `llama3.2:3b` via Ollama) | `TORZ_LIVE_OLLAMA=1 pytest -m live` | **8 passed** — 8 min 10 s |
| Frontend typecheck | `npm run typecheck` (TypeScript 7) | **0 errors** |
| Frontend unit (vitest) | `npm test` | **13 passed** (4 files) |
| Frontend production build | `npm run build` (Vite 8) | OK |
| Browser E2E (Playwright) | `cd e2e && npm test` | **31 passed** (27 app + 4 extension) — 1.3 min |
| Browser E2E, **live model** | `npm run test:live` (real `llama3.2:3b`) | **2 passed** — 2.9 min |
| Install / start / stop scripts | `./install.sh`, `./start.sh --no-browser`, `./stop.sh` | OK: install, start, “already running”, clean stop |

## How AI was tested

- **Real local model.** Ollama v0.40.16 was built from source in this environment, and
  `llama3.2:3b` and `qwen2.5:1.5b` were pulled from the Ollama registry. The live suites drive every
  AI tool through it: humanizer, paraphraser, simplifier, grammar, summary, notes, quiz, flashcards,
  study guide, Q&A, essay feedback, plus a browser run of the humanizer, quiz player and flashcards.
- **Deterministic test model.** The regular pytest and E2E suites use `backend/tests/fake_llm.py`,
  which speaks the real Ollama HTTP API. In E2E it runs as a separate HTTP server on port 11500. It
  makes runs fast and repeatable. It is a test double only: the app never ships it or calls it.
- **Cloud providers** (OpenAI, Anthropic, Gemini, OpenAI-compatible) were tested at the protocol
  level with mocked HTTP: request format, streaming parsers, auth and quota errors, JSON-schema
  fallback, retries, and fallback to local Ollama. No real cloud keys were available.

## Backend tests (pytest)

- **test_core.py** (7): startup, SPA serving, token requirement, Host and Origin protection,
  extension-origin pairing, token persistence, schema and migrations (including upgrading a v1
  database), **data persisting across a restart**, readable validation errors.
- **test_providers.py** (11): the Ollama, OpenAI-compatible, OpenAI, Anthropic and Gemini protocols,
  model-not-found and unavailable mapping, retry with backoff, tolerant JSON extraction, model
  auto-selection, “no models installed”, the setup error when the provider is down, **cloud → local
  fallback**, encrypted API-key storage and masking, Ollama model download and delete.
- **test_tools.py** (14): every tool endpoint end to end, including the humanizer preservation report
  and history, paragraph chunking of long text, rewriter, simplifier, essay, assistant, compose,
  explain, grammar (AI with exact offsets, and offline), summarizer (all 7 formats, offline,
  map-reduce for long documents), notes, **quiz grounding filter** (an invented question is dropped),
  checking and scoring attempts, retakes with new questions, practice tests with AI-graded written
  answers, offline quiz and flashcards, flashcard progress, study guides with export, Q&A citations
  (AI and offline), missing-source errors, and the privacy switch.
- **test_library.py** (16): document lifecycle (autosave, versions, restore, rename, pin, search,
  export as DOCX/PDF/MD/TXT/HTML, duplicate, trash, restore, permanent delete), folders, PDF
  upload/extract/reopen/use, DOCX/TXT/MD/cp1252 import, **OCR of a scanned PDF and an image**, upload
  validation (fake PDF, .exe, empty file, **zip bomb**, size limit, path traversal), password-protected
  PDFs, notes, decks (manual, JSON/CSV/TSV import and export, reset), history
  (search/rename/delete/clear), favorites, settings merge, dashboard stats, global search, system
  info, diagnostics, export ZIP, reset, AutoTyper jobs.
- **test_offline_and_gdocs.py** (10): sentence splitting, chunking, extractive summary, notes, cards,
  quiz and guide, grammar rules, diff-to-issues round-trip, BM25 retrieval, readability and HTML/MD
  conversion, **Google Docs integration** (OAuth PKCE, state check, document list, progressive typing
  with pause and resume, UTF-16 indexing with emoji, undo, token refresh, stop), Google Docs routes,
  and the **launcher** (start → status → write data → stop → start again → data still there → stop).

## Browser E2E (Playwright, real Chromium)

Every test fails automatically if the page logs a console error or throws an exception.

```
✓  1 [app] every page opens without errors  (all 17 tools, history, 6 settings sections, 404)
✓  2 [app] dashboard shows real status and every tool card links to its page
✓  3 [app] sidebar navigation works for all tools
✓  4 [app] global search finds tools and content
✓  5 [app] favorites appear on the dashboard and sidebar and can be reordered
✓  6 [app] appearance and profile settings persist after reload
✓  7 [app] system diagnostics and AI provider test run
✓  8 [app] when no AI model is reachable › AI tools show a setup screen instead of pretending to work
✓  9 [app] when no AI model is reachable › tools with an offline engine offer it and work without AI
✓ 10 [app] invalid uploads show clear error messages
✓ 11 [app] server data survives a full page reload and history is browsable
✓ 12 [app] summarizer: pasted text, uploaded PDF, offline engine and export
✓ 13 [app] smart notes: generate, edit, persist after reload, export and library
✓ 14 [app] document workspace: create, autosave, reload, rename, folders, trash, restore, export
✓ 15 [app] import a Word document into the workspace
✓ 16 [app] PDF reader: upload, render pages, extracted text, send to study tools
✓ 17 [app] autotyper: preview typing, choose text, send job, Google Docs setup screen
✓ 18 [app] quiz: generate, answer one at a time, score, review, retake, new questions
✓ 19 [app] flashcards: generate, flip, mark known/difficult, difficult-only, quiz mode, edit
✓ 20 [app] study guide: generate, quick review and detailed study
✓ 21 [app] practice test: timed test, written answers graded, review and history
✓ 22 [app] question answering cites passages from the chosen sources
✓ 23 [app] humanizer rewrites, highlights changes, compares, copies and saves
✓ 24 [app] paraphraser, rewriter and simplifier produce results
✓ 25 [app] grammar checker: accept, reject, accept all, offline engine
✓ 26 [app] essay improver gives scored feedback and an improved version
✓ 27 [app] writing assistant edits a selection, explains, composes and saves
✓ 28 [extension] extension loads with its fixed ID and connects to the TORZ AI app
✓ 29 [extension] keyboard engine types into textareas and rich editors; progress reaches the app
✓ 30 [extension] compatibility engine, pause/stop, and assist replace with undo
✓ 31 [extension] side panel assist runs an AI action through TORZ AI
31 passed (1.3m)
```

Live browser run against the real model:

```
✓ live: humanizer rewrites with the real model
✓ live: quiz and flashcards from material with the real model
2 passed (2.9m)
```

Live backend run against the real model (slowest steps on a 4-core CPU):

```
test_live_humanizer ............ PASSED   16.3 s
test_live_paraphrase_and_simplify PASSED   25.0 s
test_live_grammar .............. PASSED    4.5 s
test_live_summary_and_notes .... PASSED   54.9 s
test_live_quiz_grounded ........ PASSED  131.3 s
test_live_flashcards_and_study_guide PASSED 222.6 s
test_live_question_answering ... PASSED    8.5 s
test_live_essay_feedback ....... PASSED   27.5 s
8 passed in 490.67 s
```

## Bugs found by these tests and fixed

Ten real defects were found by the suites and fixed. `BUILD_STATUS.md` lists them. The most serious
were: an infinite loop on multi-paragraph text; a note title and tags being overwritten when leaving
the editor; Q&A passages lost through a streaming race; and a crash when leaving the Q&A page in
current Chromium. After the fixes, every suite above was re-run in full.

## Not executed here (and why)

- **`INSTALL.bat`, `START.bat` and `STOP.bat` were not run.** This environment has no Windows. Their
  logic lives in `torz.launcher`, which was tested (see the launcher test and the `.sh` scripts).
- **Typing into a live Google Docs document was not run** — there is no Google account here. The same
  keyboard mechanism was tested in real Chromium on textareas and rich editors, and the Docs API
  path was tested against a mock of Google's endpoints.
- **Real OpenAI, Anthropic and Gemini calls were not made**, because no API keys were available.
  Protocol-level tests cover them.
