"""High-level AI access used by every tool: provider resolution, retries, fallback, streaming, JSON."""
from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from typing import Any, AsyncIterator, Callable, Optional

import httpx

from ..secrets_store import SecretStore
from .base import ChatMessage, ChatResult, GenOptions, Provider, ProviderConfig, ProviderError, with_retry
from .jsonutil import extract_json
from .registry import CLOUD_MODEL_HINTS, PREFERRED_ORDER, PROVIDER_CLASSES

log = logging.getLogger("torz.ai.service")

FALLBACK_KINDS = {"unavailable", "timeout", "not_configured", "rate_limit", "auth", "no_model"}


class NoModelError(ProviderError):
    def __init__(self, message: str):
        super().__init__("no_model", message)


@dataclass
class Target:
    provider: Provider
    model: str
    fallback: bool = False

    def meta(self) -> dict[str, Any]:
        return {
            "provider": self.provider.id,
            "provider_label": self.provider.label,
            "model": self.model,
            "local": self.provider.local,
            "fallback": self.fallback,
        }


class AIService:
    def __init__(self, settings_repo, secrets: SecretStore,
                 transport_factory: Optional[Callable[[str], Optional[httpx.AsyncBaseTransport]]] = None):
        self.settings = settings_repo
        self.secrets = secrets
        self.transport_factory = transport_factory
        self._model_cache: dict[str, tuple[float, list[str]]] = {}

    # ------------------------------------------------------------------ config
    def ai_settings(self) -> dict[str, Any]:
        return self.settings.get("ai")

    def build(self, provider_id: str) -> Provider:
        cls = PROVIDER_CLASSES.get(provider_id)
        if cls is None:
            raise ProviderError("bad_request", f"Unknown AI provider '{provider_id}'")
        cfg = dict(self.ai_settings()["providers"].get(provider_id) or {})
        extra = {k: v for k, v in cfg.items() if k not in ("base_url", "model", "enabled", "label")}
        pc = ProviderConfig(
            base_url=cfg.get("base_url") or cls.default_base_url,
            model=cfg.get("model") or "",
            enabled=cfg.get("enabled", True),
            label=cfg.get("label", ""),
            extra=extra,
        )
        transport = self.transport_factory(provider_id) if self.transport_factory else None
        return cls(pc, api_key=self.secrets.get(f"api_key:{provider_id}"), transport=transport)

    def gen_options(self, **overrides: Any) -> GenOptions:
        s = self.ai_settings()
        opts = GenOptions(temperature=float(s.get("temperature", 0.7)), num_ctx=int(s.get("num_ctx", 8192)))
        for k, v in overrides.items():
            if v is not None:
                setattr(opts, k, v)
        return opts

    def context_chars(self) -> int:
        """Rough number of input characters that safely fit one request."""
        num_ctx = int(self.ai_settings().get("num_ctx", 8192))
        default = self.ai_settings().get("default_provider", "ollama")
        if default != "ollama":
            num_ctx = max(num_ctx, 32000)
        return int(num_ctx * 0.42 * 4)

    # ------------------------------------------------------------------ models
    async def available_models(self, provider: Provider, ttl: float = 20.0) -> list[str]:
        key = f"{provider.id}:{provider.base_url}"
        now = time.monotonic()
        cached = self._model_cache.get(key)
        if cached and now - cached[0] < ttl:
            return cached[1]
        models = [m.id for m in await provider.list_models()]
        self._model_cache[key] = (now, models)
        return models

    def invalidate_models(self) -> None:
        self._model_cache.clear()

    async def resolve_model(self, provider: Provider, requested: str | None = None) -> str:
        model = requested or provider.config.model
        if provider.id == "ollama":
            installed = await self.available_models(provider)
            if not installed:
                raise NoModelError(
                    "Ollama is running but has no models installed. Open Settings → AI and download a model "
                    "(for example llama3.2:3b)."
                )
            if model:
                if model in installed or f"{model}:latest" in installed:
                    return model
                raise ProviderError(
                    "model_not_found",
                    f"The selected model '{model}' is not installed in Ollama. Choose another model in Settings → AI "
                    f"or download it with: ollama pull {model}",
                )
            for pref in PREFERRED_ORDER:
                if pref in installed:
                    return pref
            chat_models = [m for m in installed if "embed" not in m]
            return (chat_models or installed)[0]
        if model:
            return model
        models = await self.available_models(provider)
        if not models:
            raise NoModelError(f"{provider.label} reported no available models.")
        for hint in CLOUD_MODEL_HINTS.get(provider.id, [""]):
            for m in models:
                if hint in m:
                    return m
        return models[0]

    async def targets(self, provider_id: str | None = None, model: str | None = None) -> AsyncIterator[Target]:
        s = self.ai_settings()
        primary_id = provider_id or s.get("default_provider", "ollama")
        primary = self.build(primary_id)
        try:
            yield Target(primary, await self.resolve_model(primary, model))
        except ProviderError as exc:
            if not (s.get("fallback_to_local", True) and primary_id != "ollama" and exc.kind in FALLBACK_KINDS):
                raise
            log.warning("Primary provider %s unavailable (%s); trying local Ollama", primary_id, exc.message)
            try:
                local = self.build("ollama")
                yield Target(local, await self.resolve_model(local), fallback=True)
            except ProviderError:
                raise exc
            return
        if s.get("fallback_to_local", True) and primary_id != "ollama":
            try:
                local = self.build("ollama")
                yield Target(local, await self.resolve_model(local), fallback=True)
            except ProviderError:
                return

    def _no_model_message(self) -> str:
        return (
            "No AI model is connected. Start Ollama and download a model, or configure another provider in "
            "Settings → AI."
        )

    # ------------------------------------------------------------------ generation
    async def chat(self, messages: list[ChatMessage], options: GenOptions | None = None,
                   provider_id: str | None = None, model: str | None = None) -> ChatResult:
        options = options or self.gen_options()
        first_error: ProviderError | None = None
        async for target in self.targets(provider_id, model):
            try:
                result = await with_retry(lambda t=target: t.provider.chat(messages, t.model, options))
                result.provider = target.provider.id
                result.usage = {**(result.usage or {}), "fallback": target.fallback}
                return result
            except ProviderError as exc:
                if first_error is None:
                    first_error = exc
                if exc.kind not in FALLBACK_KINDS:
                    raise
        raise first_error or NoModelError(self._no_model_message())

    async def stream(self, messages: list[ChatMessage], options: GenOptions | None = None,
                     provider_id: str | None = None, model: str | None = None) -> AsyncIterator[dict[str, Any]]:
        """Yields {'type': 'meta', ...} once, then {'type': 'delta', 'text': ...} events."""
        options = options or self.gen_options()
        first_error: ProviderError | None = None
        async for target in self.targets(provider_id, model):
            started = False
            for attempt in range(3):
                try:
                    async for piece in target.provider.stream(messages, target.model, options):
                        if not started:
                            started = True
                            yield {"type": "meta", **target.meta()}
                        yield {"type": "delta", "text": piece}
                    if not started:
                        yield {"type": "meta", **target.meta()}
                    return
                except ProviderError as exc:
                    if started:
                        raise  # cannot transparently retry mid-stream
                    if exc.retryable and attempt < 2:
                        import asyncio

                        await asyncio.sleep(0.8 * (2 ** attempt))
                        continue
                    if first_error is None:
                        first_error = exc
                    if exc.kind not in FALLBACK_KINDS:
                        raise
                    break
        raise first_error or NoModelError(self._no_model_message())

    async def chat_json(self, messages: list[ChatMessage], schema: dict[str, Any] | None = None,
                        validate: Callable[[Any], Any] | None = None, temperature: float = 0.3,
                        provider_id: str | None = None, model: str | None = None,
                        max_tokens: int | None = None) -> tuple[Any, ChatResult]:
        """Ask for JSON, parse tolerantly, validate, and retry once with a repair instruction."""
        opts = self.gen_options(temperature=temperature, json_schema=schema or {}, max_tokens=max_tokens)
        result = await self.chat(messages, opts, provider_id, model)
        last_err = ""
        for attempt in range(2):
            try:
                data = extract_json(result.text)
                return (validate(data) if validate else data), result
            except (ValueError, KeyError, TypeError) as exc:
                last_err = str(exc)
                if attempt == 1:
                    break
                repair = messages + [
                    ChatMessage("assistant", result.text[:6000]),
                    ChatMessage(
                        "user",
                        f"That response could not be used ({last_err}). Reply again with ONLY the corrected JSON "
                        "object that follows the required structure exactly.",
                    ),
                ]
                result = await self.chat(repair, opts, result.provider, result.model)
        raise ProviderError("bad_output", f"The model returned output TORZ AI could not understand: {last_err}. "
                                          "Try again, or choose a larger model in Settings → AI.")

    # ------------------------------------------------------------------ status
    async def status(self) -> dict[str, Any]:
        s = self.ai_settings()
        pid = s.get("default_provider", "ollama")
        provider = self.build(pid)
        info: dict[str, Any] = {"provider": pid, "provider_label": provider.label, "local": provider.local,
                                "model": "", "ok": False, "message": "", "fallback": None}
        try:
            info["model"] = await self.resolve_model(provider)
            info["ok"] = True
            info["message"] = f"Ready: {info['model']} via {provider.label}"
        except ProviderError as exc:
            info["message"] = exc.message
            info["kind"] = exc.kind
            if s.get("fallback_to_local", True) and pid != "ollama":
                try:
                    local = self.build("ollama")
                    m = await self.resolve_model(local)
                    info["fallback"] = {"provider": "ollama", "model": m}
                    info["ok"] = True
                    info["message"] = f"{provider.label} unavailable ({exc.message}). Using local fallback {m}."
                except ProviderError:
                    pass
        return info
