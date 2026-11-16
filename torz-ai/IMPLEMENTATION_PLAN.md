# TORZ AI — Implementation Plan

## Phase 1 findings

- **Repository:** the repo root holds an unrelated, finished Minecraft mod (Googly Goobers, Gradle/Java).
  It is left untouched. TORZ AI lives entirely in `torz-ai/`.
- **Reference product:** grubby.ai's dashboard is login-gated. Its public pages describe mainly an
  "AI humanizer" marketed on AI-detector evasion. TORZ AI deliberately does **not** copy that framing:
  the humanizer is a writing-quality rewriter and never claims or fakes detector scores. The feature list
  comes from the TORZ AI specification.
- **Target machine:** Windows 11 desktop, private single user.

## Architecture

```
torz-ai/
  backend/            Python 3.10+ FastAPI app (package `torz`)
    torz/
      main.py         app factory, static frontend serving, lifespan
      config.py       data dir, ports, limits
      security.py     host/origin checks + per-install API token
      secrets_store.py  API keys: OS keyring (Windows Credential Manager) or encrypted file
      db/             SQLAlchemy models, session, versioned migrations
      ai/             provider abstraction + Ollama / OpenAI-compatible / OpenAI / Anthropic / Gemini,
                      retry, streaming, fallback, JSON-mode helpers, chunking (map-reduce for long docs)
      offline/        "Offline engine": extractive summary, notes, cards/quiz (cloze/definition),
                      rule + dictionary grammar checker, BM25 passage retrieval. Clearly labelled as
                      non-AI; used when no model is connected.
      documents/      PDF (pypdfium2) / DOCX (python-docx) / TXT / MD extraction, OCR (RapidOCR, offline
                      ONNX models), export to TXT / MD / HTML / DOCX / PDF
      services/       tool logic (writing, study, notes, quiz, flashcards, QA, autotyper, google docs)
      api/            REST + SSE routes
      launcher.py     start / stop / status (used by START.bat, STOP.bat, start.sh, stop.sh)
    tests/            pytest suite
  frontend/           React 18 + TypeScript + Vite + Tailwind v4 + lucide-react
    dist/             prebuilt production bundle (committed, so Windows needs only Python)
  extension/          Chrome Manifest V3 companion extension (context menu, side panel, AutoTyper)
  e2e/                Playwright end-to-end tests (app + extension)
  INSTALL.bat START.bat STOP.bat   Windows entry points (thin wrappers around launcher.py)
  install.sh start.sh stop.sh      macOS/Linux equivalents
```

### Runtime

- One process: uvicorn serves the API under `/api` and the built SPA at `/`, bound to `127.0.0.1:8765`.
- Data lives in `%LOCALAPPDATA%\TORZ AI` on Windows (`~/.local/share/torz-ai` elsewhere, override with
  `TORZ_DATA_DIR`): `torz.db` (SQLite), `files/` (uploaded originals), `secrets`, `token`, logs.

### AI engine

- Provider interface: `list_models`, `check` (connection test), `chat` (non-streaming), `stream`.
- Providers: **Ollama** (default, local), **OpenAI-compatible** (LM Studio, llama.cpp server, Jan, vLLM,
  LocalAI, OpenRouter, Groq, …), **OpenAI**, **Anthropic**, **Google Gemini**. External ones are optional.
- Retries with exponential backoff on connection errors / 429 / 5xx. Optional fallback to local Ollama.
- Every result records the provider + model that produced it; the UI shows it.
- Structured output (quizzes, cards, notes, guides, grammar issues) uses JSON mode / JSON schema where the
  provider supports it, then tolerant parsing + Pydantic validation + one repair retry.
- Grounding guard for study tools: each generated item carries a supporting quote; items whose quote cannot
  be found (fuzzy) in the source are dropped.
- Long inputs: token-aware chunking, map-reduce summarisation, BM25 retrieval for Q&A.
- No model connected → AI-only tools show a setup screen; tools with an offline engine offer it, labelled.

### Security

- Loopback bind only; `Host` header allow-list (DNS-rebinding defence); `Origin` allow-list (same origin,
  Vite dev origin, `chrome-extension://`); every `/api` call except health needs the per-install token
  header `X-TORZ-Token` (served to the SPA via `index.html` meta tag, to the extension via pairing).
- API keys never reach the frontend (masked status only); stored in OS keyring or Fernet-encrypted file.
- Uploads: size limit, extension + magic-byte checks, DOCX zip-bomb guard, PDF page limit, processed off the
  event loop.

### Database tables

`folders`, `documents` (soft delete → trash), `document_versions`, `files` (uploads + extracted text),
`history_entries` (every tool run: input, output, settings, tool, provider/model — covers writing and
humanization history), `summaries`, `notes`, `flashcard_decks`, `flashcards`, `quizzes` (kind = quiz |
practice_test), `quiz_questions`, `quiz_attempts`, `study_guides`, `favorites`, `settings`
(application preferences), `tool_usage`, `activity`, `autotyper_jobs`, `schema_migrations`.

### AutoTyper

1. **Browser extension engine** (works without any account): standard inputs/textarea/contenteditable via
   `execCommand('insertText')` (native undo); Google Docs and canvas editors via the Chrome debugger
   protocol `Input.insertText` (trusted input, Chrome shows a visible "debugging" banner while typing).
   Per-site permission is requested at run time with Chrome's own prompt.
2. **Google Docs API engine** (official integration, optional): OAuth (Desktop client created once by the
   user in Google Cloud), list docs via Drive API, insert text progressively with `documents.batchUpdate`,
   pause / resume / stop / undo (deletes the inserted range).
