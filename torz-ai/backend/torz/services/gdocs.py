"""Google Docs integration (official APIs) for the AutoTyper.

One-time setup by the user (free): create an OAuth client of type "Desktop app" in Google Cloud Console,
enable the Google Docs API and Google Drive API, add yourself as a test user, then paste the client JSON
into TORZ AI. Tokens are kept in the secret store. Text is inserted progressively with documents.batchUpdate.
"""
from __future__ import annotations

import asyncio
import base64
import hashlib
import json
import secrets
import time
import urllib.parse
from dataclasses import dataclass, field
from typing import Any, Callable, Optional

import httpx

AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
DRIVE_FILES = "https://www.googleapis.com/drive/v3/files"
DOCS_API = "https://docs.googleapis.com/v1/documents"
SCOPES = "https://www.googleapis.com/auth/documents https://www.googleapis.com/auth/drive.metadata.readonly"
# The Docs API allows about 60 write requests per minute per user.
MIN_REQUEST_INTERVAL = 1.05


class GDocsError(Exception):
    pass


def parse_client_json(raw: str) -> dict[str, str]:
    try:
        data = json.loads(raw)
    except ValueError:
        raise GDocsError("That is not valid JSON. Paste the full contents of the downloaded client_secret_….json file.")
    inner = data.get("installed") or data.get("web") or data
    cid, csec = inner.get("client_id"), inner.get("client_secret")
    if not cid or not str(cid).endswith(".apps.googleusercontent.com"):
        raise GDocsError("The JSON does not contain a Google OAuth client_id.")
    return {"client_id": cid, "client_secret": csec or ""}


def utf16_len(s: str) -> int:
    return len(s.encode("utf-16-le")) // 2


@dataclass
class TypingJob:
    id: str
    doc_id: str
    doc_title: str
    text: str
    wpm: int
    status: str = "pending"  # pending | running | paused | stopped | done | error | undone
    inserted_chars: int = 0
    start_index: Optional[int] = None
    inserted_utf16: int = 0
    error: str = ""
    created: float = field(default_factory=time.time)
    _resume: asyncio.Event = field(default_factory=asyncio.Event, repr=False)
    _stop: bool = False
    task: Optional[asyncio.Task] = field(default=None, repr=False)

    def public(self) -> dict[str, Any]:
        return {"id": self.id, "doc_id": self.doc_id, "doc_title": self.doc_title, "status": self.status,
                "progress": round(self.inserted_chars / max(1, len(self.text)), 4),
                "inserted_chars": self.inserted_chars, "total_chars": len(self.text), "wpm": self.wpm,
                "error": self.error, "can_undo": self.inserted_utf16 > 0 and self.status in ("stopped", "done", "paused", "error")}


class GoogleDocsService:
    def __init__(self, secrets_store, redirect_uri: str, transport: httpx.AsyncBaseTransport | None = None,
                 sleep: Callable[[float], Any] = asyncio.sleep):
        self.secrets = secrets_store
        self.redirect_uri = redirect_uri
        self.transport = transport
        self.sleep = sleep
        self._pending: dict[str, str] = {}  # state -> code_verifier
        self.jobs: dict[str, TypingJob] = {}

    def client(self) -> httpx.AsyncClient:
        kw: dict[str, Any] = {"timeout": httpx.Timeout(30.0)}
        if self.transport:
            kw["transport"] = self.transport
        return httpx.AsyncClient(**kw)

    # ------------------------------------------------------------------ configuration
    def _client_cfg(self) -> dict[str, str] | None:
        raw = self.secrets.get("google_oauth_client")
        return json.loads(raw) if raw else None

    def _token(self) -> dict[str, Any] | None:
        raw = self.secrets.get("google_oauth_token")
        return json.loads(raw) if raw else None

    def status(self) -> dict[str, Any]:
        cfg = self._client_cfg()
        tok = self._token()
        return {"client_configured": bool(cfg), "connected": bool(tok and tok.get("refresh_token") or tok and tok.get("access_token")),
                "client_id": (cfg or {}).get("client_id", "")[:24] + "…" if cfg else "", "redirect_uri": self.redirect_uri,
                "scopes": SCOPES.split()}

    def set_client(self, raw_json: str) -> None:
        cfg = parse_client_json(raw_json)
        self.secrets.set("google_oauth_client", json.dumps(cfg))

    def disconnect(self, forget_client: bool = False) -> None:
        self.secrets.delete("google_oauth_token")
        if forget_client:
            self.secrets.delete("google_oauth_client")

    # ------------------------------------------------------------------ OAuth
    def auth_url(self) -> str:
        cfg = self._client_cfg()
        if not cfg:
            raise GDocsError("Add your Google OAuth client first.")
        verifier = secrets.token_urlsafe(64)
        challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
        state = secrets.token_urlsafe(24)
        self._pending[state] = verifier
        params = {"client_id": cfg["client_id"], "redirect_uri": self.redirect_uri, "response_type": "code",
                  "scope": SCOPES, "code_challenge": challenge, "code_challenge_method": "S256", "state": state,
                  "access_type": "offline", "prompt": "consent"}
        return f"{AUTH_URL}?{urllib.parse.urlencode(params)}"

    async def handle_callback(self, code: str, state: str) -> None:
        verifier = self._pending.pop(state, None)
        if not verifier:
            raise GDocsError("This sign-in link has expired or was not started by TORZ AI. Start again from TORZ AI.")
        cfg = self._client_cfg()
        if not cfg:
            raise GDocsError("Google client is not configured.")
        async with self.client() as c:
            r = await c.post(TOKEN_URL, data={"code": code, "client_id": cfg["client_id"], "client_secret": cfg["client_secret"],
                                              "redirect_uri": self.redirect_uri, "grant_type": "authorization_code",
                                              "code_verifier": verifier})
        if r.status_code >= 400:
            raise GDocsError(f"Google rejected the sign-in: {r.text[:300]}")
        tok = r.json()
        tok["expires_at"] = time.time() + int(tok.get("expires_in", 3600)) - 60
        self.secrets.set("google_oauth_token", json.dumps(tok))

    async def _access_token(self) -> str:
        tok = self._token()
        if not tok:
            raise GDocsError("Google Docs is not connected. Connect your Google account first.")
        if tok.get("expires_at", 0) > time.time() and tok.get("access_token"):
            return tok["access_token"]
        cfg = self._client_cfg()
        if not tok.get("refresh_token") or not cfg:
            raise GDocsError("Your Google session expired. Please connect again.")
        async with self.client() as c:
            r = await c.post(TOKEN_URL, data={"client_id": cfg["client_id"], "client_secret": cfg["client_secret"],
                                              "refresh_token": tok["refresh_token"], "grant_type": "refresh_token"})
        if r.status_code >= 400:
            self.secrets.delete("google_oauth_token")
            raise GDocsError("Google refused to refresh the session (test-mode tokens expire after 7 days). Connect again.")
        new = r.json()
        tok["access_token"] = new["access_token"]
        tok["expires_at"] = time.time() + int(new.get("expires_in", 3600)) - 60
        self.secrets.set("google_oauth_token", json.dumps(tok))
        return tok["access_token"]

    async def _api(self, method: str, url: str, **kw) -> dict[str, Any]:
        token = await self._access_token()
        async with self.client() as c:
            r = await c.request(method, url, headers={"Authorization": f"Bearer {token}"}, **kw)
        if r.status_code == 401:
            raise GDocsError("Google rejected the access token. Connect your account again.")
        if r.status_code == 403:
            raise GDocsError(f"Permission denied by Google. Make sure the Docs and Drive APIs are enabled. {r.text[:200]}")
        if r.status_code == 429:
            raise GDocsError("Google Docs rate limit reached. Lower the typing speed and try again.")
        if r.status_code >= 400:
            raise GDocsError(f"Google API error {r.status_code}: {r.text[:300]}")
        return r.json() if r.content else {}

    # ------------------------------------------------------------------ documents
    async def list_documents(self, query: str = "") -> list[dict[str, Any]]:
        q = "mimeType='application/vnd.google-apps.document' and trashed=false"
        if query:
            q += " and name contains '" + query.replace("\\", "\\\\").replace("'", "\\'") + "'"
        data = await self._api("GET", DRIVE_FILES, params={"q": q, "orderBy": "modifiedTime desc", "pageSize": 50,
                                                           "fields": "files(id,name,modifiedTime,webViewLink)"})
        return data.get("files", [])

    async def _end_index(self, doc_id: str) -> tuple[int, str]:
        data = await self._api("GET", f"{DOCS_API}/{doc_id}", params={"fields": "title,body.content(endIndex)"})
        content = (data.get("body") or {}).get("content") or [{"endIndex": 1}]
        return max(1, int(content[-1].get("endIndex", 1)) - 1), data.get("title", "")

    async def _insert(self, doc_id: str, index: int, text: str) -> None:
        await self._api("POST", f"{DOCS_API}/{doc_id}:batchUpdate",
                        json={"requests": [{"insertText": {"location": {"index": index}, "text": text}}]})

    # ------------------------------------------------------------------ typing jobs
    def start_job(self, doc_id: str, text: str, wpm: int) -> TypingJob:
        if not text.strip():
            raise GDocsError("There is no text to type.")
        job = TypingJob(id=secrets.token_hex(6), doc_id=doc_id, doc_title="", text=text, wpm=max(10, min(400, int(wpm))))
        job._resume.set()
        self.jobs[job.id] = job
        job.task = asyncio.create_task(self._run(job))
        return job

    async def _run(self, job: TypingJob) -> None:
        try:
            job.status = "running"
            job.start_index, job.doc_title = await self._end_index(job.doc_id)
            chars_per_sec = job.wpm * 5 / 60
            burst = max(1, int(chars_per_sec * MIN_REQUEST_INTERVAL))
            pos = 0
            while pos < len(job.text):
                await job._resume.wait()
                if job._stop:
                    job.status = "stopped"
                    return
                end = min(len(job.text), pos + burst)
                # extend to the end of the current word for natural bursts
                while end < len(job.text) and end - pos < burst * 2 and not job.text[end - 1].isspace():
                    end += 1
                piece = job.text[pos:end]
                t0 = time.monotonic()
                await self._insert(job.doc_id, job.start_index + job.inserted_utf16, piece)
                job.inserted_utf16 += utf16_len(piece)
                pos = end
                job.inserted_chars = pos
                wait = max(MIN_REQUEST_INTERVAL, len(piece) / chars_per_sec) - (time.monotonic() - t0)
                if wait > 0:
                    await self.sleep(wait)
            job.status = "done"
        except GDocsError as exc:
            job.status = "error"
            job.error = str(exc)
        except Exception as exc:  # pragma: no cover
            job.status = "error"
            job.error = f"Unexpected error: {exc}"

    def get_job(self, job_id: str) -> TypingJob:
        job = self.jobs.get(job_id)
        if not job:
            raise GDocsError("Unknown typing job.")
        return job

    def pause(self, job_id: str) -> TypingJob:
        job = self.get_job(job_id)
        if job.status == "running":
            job._resume.clear()
            job.status = "paused"
        return job

    def resume(self, job_id: str) -> TypingJob:
        job = self.get_job(job_id)
        if job.status == "paused":
            job.status = "running"
            job._resume.set()
        return job

    def stop(self, job_id: str) -> TypingJob:
        job = self.get_job(job_id)
        if job.status in ("running", "paused", "pending"):
            job._stop = True
            job._resume.set()
            job.status = "stopped"
        return job

    async def undo(self, job_id: str) -> TypingJob:
        job = self.get_job(job_id)
        if job.status in ("running", "pending"):
            raise GDocsError("Stop or pause typing before undoing.")
        if job.start_index is None or job.inserted_utf16 <= 0:
            raise GDocsError("Nothing to undo.")
        job._stop = True
        job._resume.set()
        await self._api("POST", f"{DOCS_API}/{job.doc_id}:batchUpdate", json={"requests": [{"deleteContentRange": {
            "range": {"startIndex": job.start_index, "endIndex": job.start_index + job.inserted_utf16}}}]})
        job.inserted_utf16 = 0
        job.inserted_chars = 0
        job.status = "undone"
        return job
