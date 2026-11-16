"""Local request protection.

TORZ AI listens on the loopback interface only, but any web page open in the browser can still try to
send requests to http://127.0.0.1. These checks stop that:

* Host allow-list  - defeats DNS-rebinding (evil.com resolving to 127.0.0.1).
* Origin allow-list - cross-site pages are rejected outright.
* Per-install token - every /api call (except health/session) must carry X-TORZ-Token. Custom headers force
  a CORS preflight, which is never granted to foreign origins.
"""
from __future__ import annotations

import hmac
import os
import secrets
from pathlib import Path

from starlette.requests import Request
from starlette.responses import JSONResponse

from .config import AppConfig

TOKEN_HEADER = "X-TORZ-Token"
OPEN_PATHS = {"/api/health", "/api/session", "/api/gdocs/callback"}


def load_or_create_token(data_dir: Path) -> str:
    path = data_dir / "token"
    if path.exists():
        tok = path.read_text(encoding="utf-8").strip()
        if len(tok) >= 32:
            return tok
    tok = secrets.token_urlsafe(32)
    path.write_text(tok, encoding="utf-8")
    try:
        os.chmod(path, 0o600)
    except OSError:
        pass
    return tok


class Guard:
    def __init__(self, config: AppConfig, token: str):
        self.config = config
        self.token = token
        port = config.port
        self.allowed_hosts = {
            f"127.0.0.1:{port}",
            f"localhost:{port}",
            "127.0.0.1",
            "localhost",
            "testserver",  # starlette TestClient
        }
        self.allowed_origins = {f"http://127.0.0.1:{port}", f"http://localhost:{port}"}
        if config.dev_mode:
            self.allowed_origins |= {"http://localhost:5173", "http://127.0.0.1:5173"}
        self.extension_origins = {f"chrome-extension://{eid}" for eid in config.extension_ids}

    def origin_ok(self, origin: str | None) -> bool:
        if not origin or origin == "null":
            return origin is None
        return origin in self.allowed_origins or origin in self.extension_origins

    def token_ok(self, value: str | None) -> bool:
        return bool(value) and hmac.compare_digest(value, self.token)

    async def __call__(self, request: Request, call_next):
        host = (request.headers.get("host") or "").lower()
        if host not in self.allowed_hosts:
            return JSONResponse({"detail": "Host not allowed"}, status_code=403)

        origin = request.headers.get("origin")
        if origin is not None and not self.origin_ok(origin):
            return JSONResponse({"detail": "Origin not allowed"}, status_code=403)

        path = request.url.path
        if path.startswith("/api"):
            if request.method == "OPTIONS":
                return self._preflight(origin)
            if path not in OPEN_PATHS:
                supplied = request.headers.get(TOKEN_HEADER) or request.query_params.get("token")
                if not self.token_ok(supplied):
                    return JSONResponse({"detail": "Missing or invalid TORZ token"}, status_code=401)
            if path == "/api/session":
                site = request.headers.get("sec-fetch-site")
                if site == "cross-site" and origin not in self.extension_origins:
                    return JSONResponse({"detail": "Forbidden"}, status_code=403)

        response = await call_next(request)
        if origin and origin in self.extension_origins | self.allowed_origins:
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Vary"] = "Origin"
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("Referrer-Policy", "no-referrer")
        if not path.startswith("/api"):
            response.headers.setdefault("X-Frame-Options", "DENY")
        return response

    def _preflight(self, origin: str | None) -> JSONResponse:
        if not origin or not self.origin_ok(origin):
            return JSONResponse({"detail": "Origin not allowed"}, status_code=403)
        return JSONResponse(
            {},
            headers={
                "Access-Control-Allow-Origin": origin,
                "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE",
                "Access-Control-Allow-Headers": f"Content-Type, {TOKEN_HEADER}",
                "Access-Control-Max-Age": "600",
                "Vary": "Origin",
            },
        )
