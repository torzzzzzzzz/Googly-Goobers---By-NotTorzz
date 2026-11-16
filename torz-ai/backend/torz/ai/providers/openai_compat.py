"""OpenAI Chat Completions protocol: OpenAI itself and any compatible server.

Compatible servers include LM Studio, llama.cpp `llama-server`, Jan, vLLM, LocalAI (all local and free)
and hosted services such as OpenRouter, Groq, Together or DeepSeek (optional, with their own pricing).
"""
from __future__ import annotations

import json
from typing import Any, AsyncIterator

import httpx

from ..base import (
    ChatMessage,
    ChatResult,
    GenOptions,
    ModelInfo,
    Provider,
    ProviderError,
    error_from_status,
    map_http_error,
)


class OpenAICompatibleProvider(Provider):
    id = "openai_compatible"
    label = "OpenAI-compatible server"
    local = True  # typically LM Studio / llama.cpp on this machine
    needs_key = False
    default_base_url = "http://127.0.0.1:1234/v1"
    docs_url = "https://lmstudio.ai"
    max_tokens_field = "max_tokens"

    def __init__(self, *a, **kw):
        super().__init__(*a, **kw)
        # Remote base URLs must honour system proxy settings.
        host = httpx.URL(self.base_url).host if self.base_url else ""
        self.local = host in ("127.0.0.1", "localhost", "::1", "0.0.0.0") or host.endswith(".local")
        self._schema_supported: bool | None = None

    def headers(self) -> dict[str, str]:
        h = {"Content-Type": "application/json"}
        if self.api_key:
            h["Authorization"] = f"Bearer {self.api_key}"
        return h

    def _payload(self, messages: list[ChatMessage], model: str, options: GenOptions, stream: bool,
                 use_schema: bool) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "model": model,
            "messages": [m.as_dict() for m in messages],
            "temperature": options.temperature,
            "stream": stream,
        }
        if options.max_tokens:
            payload[self.max_tokens_field] = options.max_tokens
        if options.stop:
            payload["stop"] = options.stop
        if options.json_schema is not None and use_schema:
            payload["response_format"] = self._response_format(options.json_schema)
        return payload

    def _response_format(self, schema: dict[str, Any]) -> dict[str, Any]:
        if not schema:
            return {"type": "json_object"}
        return {"type": "json_schema", "json_schema": {"name": "result", "schema": schema}}

    async def list_models(self) -> list[ModelInfo]:
        self.require_key()
        async with self.client(httpx.Timeout(10.0)) as c:
            try:
                r = await c.get(f"{self.base_url}/models", headers=self.headers())
            except Exception as exc:
                raise map_http_error(self.label, exc)
            if r.status_code >= 400:
                raise error_from_status(self.label, r.status_code, r.text)
            data = r.json()
            items = data.get("data", data if isinstance(data, list) else [])
            return [ModelInfo(id=m.get("id", "")) for m in items if isinstance(m, dict) and m.get("id")]

    def _is_format_error(self, status: int, body: str) -> bool:
        b = body.lower()
        return status in (400, 422) and ("response_format" in b or "json_schema" in b or "json_object" in b)

    async def chat(self, messages: list[ChatMessage], model: str, options: GenOptions) -> ChatResult:
        self.require_key()
        use_schema = self._schema_supported is not False
        async with self.client() as c:
            for _ in range(2):
                try:
                    r = await c.post(
                        f"{self.base_url}/chat/completions",
                        headers=self.headers(),
                        json=self._payload(messages, model, options, False, use_schema),
                    )
                except Exception as exc:
                    raise map_http_error(self.label, exc)
                if r.status_code >= 400:
                    if options.json_schema is not None and use_schema and self._is_format_error(r.status_code, r.text):
                        self._schema_supported = False
                        use_schema = False
                        continue
                    raise error_from_status(self.label, r.status_code, r.text)
                data = r.json()
                choice = (data.get("choices") or [{}])[0]
                msg = choice.get("message") or {}
                text = msg.get("content") or ""
                if isinstance(text, list):  # some servers return content parts
                    text = "".join(p.get("text", "") for p in text if isinstance(p, dict))
                return ChatResult(text=text, provider=self.id, model=data.get("model") or model,
                                  usage=data.get("usage") or {})
        raise ProviderError("bad_request", f"{self.label} could not produce structured output.")

    async def stream(self, messages: list[ChatMessage], model: str, options: GenOptions) -> AsyncIterator[str]:
        self.require_key()
        async with self.client() as c:
            try:
                async with c.stream(
                    "POST",
                    f"{self.base_url}/chat/completions",
                    headers=self.headers(),
                    json=self._payload(messages, model, options, True, False),
                ) as r:
                    if r.status_code >= 400:
                        body = (await r.aread()).decode("utf-8", "replace")
                        raise error_from_status(self.label, r.status_code, body)
                    async for line in r.aiter_lines():
                        line = line.strip()
                        if not line.startswith("data:"):
                            continue
                        chunk = line[5:].strip()
                        if chunk == "[DONE]":
                            break
                        try:
                            data = json.loads(chunk)
                        except ValueError:
                            continue
                        if data.get("error"):
                            raise ProviderError("unknown", f"{self.label}: {data['error']}")
                        for choice in data.get("choices") or []:
                            piece = (choice.get("delta") or {}).get("content")
                            if piece:
                                yield piece
            except ProviderError:
                raise
            except Exception as exc:
                raise map_http_error(self.label, exc)


class OpenAIProvider(OpenAICompatibleProvider):
    id = "openai"
    label = "OpenAI"
    needs_key = True
    default_base_url = "https://api.openai.com/v1"
    docs_url = "https://platform.openai.com/api-keys"
    max_tokens_field = "max_completion_tokens"

    def _response_format(self, schema: dict[str, Any]) -> dict[str, Any]:
        # json_object is accepted by every current chat model; the schema is described in the prompt.
        return {"type": "json_object"}

    async def list_models(self) -> list[ModelInfo]:
        models = await super().list_models()
        chat_like = [m for m in models if m.id.startswith(("gpt-", "o1", "o3", "o4", "o5", "chatgpt"))
                     and not any(x in m.id for x in ("audio", "realtime", "transcribe", "tts", "image", "search"))]
        return sorted(chat_like or models, key=lambda m: m.id)
