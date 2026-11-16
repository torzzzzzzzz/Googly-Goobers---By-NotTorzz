"""FastAPI application factory."""
from __future__ import annotations

import html
import logging
import logging.handlers
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Callable, Optional

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from . import APP_NAME, __version__
from .ai.service import AIService
from .api import autotyper, history, library, study, system, tools
from .config import AppConfig
from .db import Database
from .secrets_store import SecretStore
from .security import Guard, load_or_create_token
from .services.common import AppContext
from .services.settings_repo import SettingsRepo

log = logging.getLogger("torz")


def _setup_logging(config: AppConfig) -> None:
    root = logging.getLogger("torz")
    if any(isinstance(h, logging.handlers.RotatingFileHandler) for h in root.handlers):
        return
    root.setLevel(logging.INFO)
    fh = logging.handlers.RotatingFileHandler(config.logs_dir / "torz.log", maxBytes=2_000_000, backupCount=3,
                                              encoding="utf-8")
    fh.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s"))
    root.addHandler(fh)


def create_app(config: Optional[AppConfig] = None,
               transport_factory: Optional[Callable[[str], Optional[httpx.AsyncBaseTransport]]] = None) -> FastAPI:
    config = config or AppConfig()
    config.ensure_dirs()
    _setup_logging(config)
    db = Database(config.db_path)
    secrets = SecretStore(config.data_dir)
    settings = SettingsRepo(db)
    ai = AIService(settings, secrets, transport_factory)
    token = load_or_create_token(config.data_dir)

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        yield
        db.dispose()

    app = FastAPI(title=APP_NAME, version=__version__, docs_url=None, redoc_url=None, openapi_url=None,
                  lifespan=lifespan)
    app.state.ctx = AppContext(config=config, db=db, secrets=secrets, settings=settings, ai=ai, token=token)
    app.middleware("http")(Guard(config, token))

    @app.exception_handler(RequestValidationError)
    async def validation_handler(_request: Request, exc: RequestValidationError):
        errs = exc.errors()
        first = errs[0] if errs else {}
        loc = ".".join(str(x) for x in first.get("loc", []) if x != "body")
        msg = f"{loc}: {first.get('msg')}" if loc else str(first.get("msg", "Invalid request"))
        return JSONResponse({"detail": msg, "errors": [{"loc": e.get("loc"), "msg": e.get("msg")} for e in errs]},
                            status_code=422)

    for r in (system.router, tools.router, library.router, study.router, history.router, autotyper.router):
        app.include_router(r)

    dist: Path = config.frontend_dist
    index_cache: dict[str, str] = {}

    def index_html() -> str:
        if "html" not in index_cache or config.dev_mode:
            raw = (dist / "index.html").read_text(encoding="utf-8")
            meta = f'<meta name="torz-token" content="{html.escape(token)}">'
            index_cache["html"] = raw.replace("<head>", "<head>\n    " + meta, 1)
        return index_cache["html"]

    @app.exception_handler(StarletteHTTPException)
    async def http_handler(request: Request, exc: StarletteHTTPException):
        if exc.status_code == 404 and not request.url.path.startswith("/api") and (dist / "index.html").exists():
            return HTMLResponse(index_html())
        return JSONResponse({"detail": exc.detail}, status_code=exc.status_code)

    @app.get("/{path:path}", include_in_schema=False)
    async def spa(path: str):
        if path.startswith("api/"):
            raise HTTPException(404, "Not found")
        if not (dist / "index.html").exists():
            return HTMLResponse(
                "<h2>TORZ AI frontend is not built.</h2><p>Run INSTALL.bat (Windows) or install.sh, "
                "or build it with <code>npm run build</code> in <code>torz-ai/frontend</code>.</p>", status_code=503)
        if path:
            candidate = (dist / path).resolve()
            if candidate.is_file() and dist.resolve() in candidate.parents:
                headers = {"Cache-Control": "public, max-age=31536000, immutable"} if path.startswith("assets/") else {}
                return FileResponse(candidate, headers=headers)
        return HTMLResponse(index_html(), headers={"Cache-Control": "no-store"})

    log.info("%s %s started, data dir %s", APP_NAME, __version__, config.data_dir)
    return app
