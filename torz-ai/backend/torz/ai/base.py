"""Provider abstraction shared by every AI backend."""
from __future__ import annotations

import asyncio
import logging
import random
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, AsyncIterator, Awaitable, Callable, Optional, TypeVar

import httpx

log = logging.getLogger("torz.ai")
T = TypeVar("T")


@dataclass
class ChatMessage:
    role: str  # system | user | assistant
    content: str

    def as_dict(self) -> dict[str, str]:
        return {"role": self.role, "content": self.content}


@dataclass
class GenOptions:
    temperature: float = 0.7
    max_tokens: Optional[int] = None
    json_schema: Optional[dict[str, Any]] = None  # request structured JSON output
    num_ctx: Optional[int] = None  # Ollama context window
    stop: Optional[list[str]] = None


@dataclass
class ModelInfo:
    id: str
    label: str = ""
    size: Optional[int] = None
    details: dict[str, Any] = field(default_factory=dict)

    def as_dict(self) -> dict[str, Any]:
        return {"id": self.id, "label": self.label or self.id, "size": self.size, "details": self.details}


@dataclass
class ChatResult:
    text: str
    provider: str
    model: str
    usage: dict[str, Any] = field(default_factory=dict)


class ProviderError(Exception):
    """kind: unavailable | auth | rate_limit | bad_request | model_not_found | timeout | not_configured | unknown"""

    def __init__(self, kind: str, message: str, retryable: bool = False, status: int | None = None):
        super().__init__(message)
        self.kind = kind
        self.message = message
        self.retryable = retryable
        self.status = status

    def as_dict(self) -> dict[str, Any]:
        return {"kind": self.kind, "message": self.message}


@dataclass
class ProviderConfig:
    base_url: str = ""
    model: str = ""
    enabled: bool = True
    label: str = ""
    extra: dict[str, Any] = field(default_factory=dict)


DEFAULT_TIMEOUT = httpx.Timeout(connect=6.0, read=600.0, write=60.0, pool=10.0)


class Provider(ABC):
    id: str = ""
    label: str = ""
    local: bool = False
    needs_key: bool = False
    default_base_url: str = ""
    docs_url: str = ""

    def __init__(self, config: ProviderConfig, api_key: Optional[str] = None,
                 transport: Optional[httpx.AsyncBaseTransport] = None):
        self.config = config
        self.api_key = api_key
        self._transport = transport

    @property
    def base_url(self) -> str:
        return (self.config.base_url or self.default_base_url).rstrip("/")

    def client(self, timeout: httpx.Timeout | float = DEFAULT_TIMEOUT) -> httpx.AsyncClient:
        kwargs: dict[str, Any] = {"timeout": timeout}
        if self._transport is not None:
            kwargs["transport"] = self._transport
        # Local servers must not be routed through any system proxy.
        if self.local:
            kwargs["trust_env"] = False
        return httpx.AsyncClient(**kwargs)

    def require_key(self) -> None:
        if self.needs_key and not self.api_key:
            raise ProviderError("not_configured", f"{self.label} needs an API key. Add it in Settings → AI providers.")

    @abstractmethod
    async def list_models(self) -> list[ModelInfo]: ...

    @abstractmethod
    async def chat(self, messages: list[ChatMessage], model: str, options: GenOptions) -> ChatResult: ...

    @abstractmethod
    def stream(self, messages: list[ChatMessage], model: str, options: GenOptions) -> AsyncIterator[str]: ...

    async def check(self) -> dict[str, Any]:
        """Connection test. Never raises."""
        try:
            self.require_key()
            models = await self.list_models()
            return {
                "ok": True,
                "message": f"Connected to {self.label}. {len(models)} model(s) available.",
                "models": [m.as_dict() for m in models],
            }
        except ProviderError as exc:
            return {"ok": False, "message": exc.message, "kind": exc.kind, "models": []}
        except Exception as exc:  # pragma: no cover - defensive
            return {"ok": False, "message": f"Unexpected error: {exc}", "kind": "unknown", "models": []}


# ---------------------------------------------------------------------------- error mapping

def map_http_error(provider_label: str, exc: Exception) -> ProviderError:
    if isinstance(exc, ProviderError):
        return exc
    if isinstance(exc, httpx.ConnectError):
        return ProviderError("unavailable", f"Could not connect to {provider_label}. Is it running?", retryable=True)
    if isinstance(exc, httpx.TimeoutException):
        return ProviderError("timeout", f"{provider_label} took too long to respond.", retryable=True)
    if isinstance(exc, httpx.HTTPStatusError):
        return error_from_status(provider_label, exc.response.status_code, _safe_body(exc.response))
    if isinstance(exc, httpx.HTTPError):
        return ProviderError("unavailable", f"Network error talking to {provider_label}: {exc}", retryable=True)
    return ProviderError("unknown", f"{provider_label}: {exc}")


def _safe_body(resp: httpx.Response) -> str:
    try:
        return resp.text[:600]
    except Exception:
        return ""


def error_from_status(label: str, status: int, body: str) -> ProviderError:
    detail = _extract_message(body)
    if status in (401, 403):
        return ProviderError("auth", f"{label} rejected the API key ({status}). {detail}".strip(), status=status)
    if status == 404:
        return ProviderError("model_not_found", f"{label}: model or endpoint not found. {detail}".strip(), status=status)
    if status == 429:
        return ProviderError("rate_limit", f"{label} rate limit or quota reached. {detail}".strip(), retryable=True, status=status)
    if status >= 500:
        return ProviderError("unavailable", f"{label} server error ({status}). {detail}".strip(), retryable=True, status=status)
    return ProviderError("bad_request", f"{label} rejected the request ({status}). {detail}".strip(), status=status)


def _extract_message(body: str) -> str:
    import json

    try:
        data = json.loads(body)
    except (ValueError, TypeError):
        return body[:300]
    if isinstance(data, dict):
        err = data.get("error")
        if isinstance(err, dict):
            return str(err.get("message") or err)[:300]
        if isinstance(err, str):
            return err[:300]
        if "message" in data:
            return str(data["message"])[:300]
    return body[:300]


async def with_retry(fn: Callable[[], Awaitable[T]], attempts: int = 3, base_delay: float = 0.8) -> T:
    """Retry transient provider failures with exponential backoff + jitter."""
    last: Optional[ProviderError] = None
    for i in range(attempts):
        try:
            return await fn()
        except ProviderError as exc:
            last = exc
            if not exc.retryable or i == attempts - 1:
                raise
            delay = base_delay * (2 ** i) + random.uniform(0, 0.3)
            log.warning("Transient AI error (%s), retrying in %.1fs", exc.message, delay)
            await asyncio.sleep(delay)
    assert last is not None
    raise last
