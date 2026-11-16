"""Anthropic Messages API (optional, requires an API key with its own billing)."""
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

API_VERSION = "2023-06-01"


class AnthropicProvider(Provider):
    id = "anthropic"
    label = "Anthropic"
    needs_key = True
    default_base_url = "https://api.anthropic.com"
    docs_url = "https://console.anthropic.com/settings/keys"

    def headers(self) -> dict[str, str]:
        return {
            "x-api-key": self.api_key or "",
            "anthropic-version": API_VERSION,
            "content-type": "application/json",
        }

    def _payload(self, messages: list[ChatMessage], model: str, options: GenOptions, stream: bool) -> dict[str, Any]:
        system = "\n\n".join(m.content for m in messages if m.role == "system")
        convo = [m.as_dict() for m in messages if m.role != "system"]
        if options.json_schema is not None:
            system += "\n\nRespond with a single valid JSON object only. No prose, no code fences."
        payload: dict[str, Any] = {
            "model": model,
            "max_tokens": options.max_tokens or 8000,
            "messages": convo,
            "temperature": min(max(options.temperature, 0.0), 1.0),
            "stream": stream,
        }
        if system:
            payload["system"] = system
        if options.stop:
            payload["stop_sequences"] = options.stop
        return payload

    async def list_models(self) -> list[ModelInfo]:
        self.require_key()
        async with self.client(httpx.Timeout(10.0)) as c:
            try:
                r = await c.get(f"{self.base_url}/v1/models", headers=self.headers())
            except Exception as exc:
                raise map_http_error(self.label, exc)
            if r.status_code >= 400:
                raise error_from_status(self.label, r.status_code, r.text)
            return [ModelInfo(id=m["id"], label=m.get("display_name") or m["id"]) for m in r.json().get("data", [])]

    async def chat(self, messages: list[ChatMessage], model: str, options: GenOptions) -> ChatResult:
        self.require_key()
        async with self.client() as c:
            try:
                r = await c.post(f"{self.base_url}/v1/messages", headers=self.headers(),
                                 json=self._payload(messages, model, options, False))
            except Exception as exc:
                raise map_http_error(self.label, exc)
            if r.status_code >= 400:
                raise error_from_status(self.label, r.status_code, r.text)
            data = r.json()
            text = "".join(b.get("text", "") for b in data.get("content", []) if b.get("type") == "text")
            return ChatResult(text=text, provider=self.id, model=data.get("model", model), usage=data.get("usage") or {})

    async def stream(self, messages: list[ChatMessage], model: str, options: GenOptions) -> AsyncIterator[str]:
        self.require_key()
        async with self.client() as c:
            try:
                async with c.stream("POST", f"{self.base_url}/v1/messages", headers=self.headers(),
                                    json=self._payload(messages, model, options, True)) as r:
                    if r.status_code >= 400:
                        body = (await r.aread()).decode("utf-8", "replace")
                        raise error_from_status(self.label, r.status_code, body)
                    async for line in r.aiter_lines():
                        if not line.startswith("data:"):
                            continue
                        try:
                            data = json.loads(line[5:].strip())
                        except ValueError:
                            continue
                        t = data.get("type")
                        if t == "content_block_delta":
                            piece = (data.get("delta") or {}).get("text")
                            if piece:
                                yield piece
                        elif t == "error":
                            raise ProviderError("unknown", f"Anthropic: {(data.get('error') or {}).get('message')}")
                        elif t == "message_stop":
                            break
            except ProviderError:
                raise
            except Exception as exc:
                raise map_http_error(self.label, exc)
