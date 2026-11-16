"""Ollama - local models (https://ollama.com). Default provider."""
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


class OllamaProvider(Provider):
    id = "ollama"
    label = "Ollama (local)"
    local = True
    needs_key = False
    default_base_url = "http://127.0.0.1:11434"
    docs_url = "https://ollama.com/download"

    def _payload(self, messages: list[ChatMessage], model: str, options: GenOptions, stream: bool) -> dict[str, Any]:
        opts: dict[str, Any] = {"temperature": options.temperature}
        if options.num_ctx:
            opts["num_ctx"] = options.num_ctx
        if options.max_tokens:
            opts["num_predict"] = options.max_tokens
        if options.stop:
            opts["stop"] = options.stop
        payload: dict[str, Any] = {
            "model": model,
            "messages": [m.as_dict() for m in messages],
            "stream": stream,
            "options": opts,
            "keep_alive": self.config.extra.get("keep_alive", "15m"),
        }
        if options.json_schema is not None:
            payload["format"] = options.json_schema or "json"
        # Reasoning models: keep answers clean.
        if self.config.extra.get("think") is False:
            payload["think"] = False
        return payload

    async def version(self) -> str:
        async with self.client(httpx.Timeout(5.0)) as c:
            try:
                r = await c.get(f"{self.base_url}/api/version")
                r.raise_for_status()
                return r.json().get("version", "")
            except Exception as exc:
                raise map_http_error(self.label, exc)

    async def list_models(self) -> list[ModelInfo]:
        async with self.client(httpx.Timeout(8.0)) as c:
            try:
                r = await c.get(f"{self.base_url}/api/tags")
                r.raise_for_status()
            except Exception as exc:
                raise map_http_error(self.label, exc)
            out = []
            for m in r.json().get("models", []):
                d = m.get("details") or {}
                label = m.get("name", "")
                if d.get("parameter_size"):
                    label += f" · {d['parameter_size']}"
                out.append(ModelInfo(id=m.get("name", ""), label=label, size=m.get("size"), details=d))
            return out

    async def check(self) -> dict[str, Any]:
        res = await super().check()
        if res.get("ok"):
            try:
                res["version"] = await self.version()
            except ProviderError:
                pass
            if not res["models"]:
                res["message"] = "Ollama is running but no models are installed yet. Download one below."
        else:
            if res.get("kind") == "unavailable":
                res["message"] = (
                    "Ollama is not running at " + self.base_url + ". Install it from ollama.com and start it, "
                    "then press Test again."
                )
        return res

    def _raise_for_body(self, status: int, body: str, model: str) -> None:
        if status == 404 or "not found" in body.lower():
            raise ProviderError(
                "model_not_found",
                f"The model '{model}' is not installed in Ollama. Download it in Settings → AI or run: ollama pull {model}",
                status=status,
            )
        raise error_from_status(self.label, status, body)

    async def chat(self, messages: list[ChatMessage], model: str, options: GenOptions) -> ChatResult:
        async with self.client() as c:
            try:
                r = await c.post(f"{self.base_url}/api/chat", json=self._payload(messages, model, options, False))
            except Exception as exc:
                raise map_http_error(self.label, exc)
            if r.status_code >= 400:
                self._raise_for_body(r.status_code, r.text, model)
            data = r.json()
            text = (data.get("message") or {}).get("content", "")
            usage = {"prompt_tokens": data.get("prompt_eval_count"), "completion_tokens": data.get("eval_count")}
            return ChatResult(text=text, provider=self.id, model=model, usage=usage)

    async def stream(self, messages: list[ChatMessage], model: str, options: GenOptions) -> AsyncIterator[str]:
        async with self.client() as c:
            try:
                async with c.stream(
                    "POST", f"{self.base_url}/api/chat", json=self._payload(messages, model, options, True)
                ) as r:
                    if r.status_code >= 400:
                        body = (await r.aread()).decode("utf-8", "replace")
                        self._raise_for_body(r.status_code, body, model)
                    async for line in r.aiter_lines():
                        if not line.strip():
                            continue
                        try:
                            data = json.loads(line)
                        except ValueError:
                            continue
                        if data.get("error"):
                            raise ProviderError("unknown", f"Ollama: {data['error']}")
                        piece = (data.get("message") or {}).get("content", "")
                        if piece:
                            yield piece
                        if data.get("done"):
                            break
            except ProviderError:
                raise
            except Exception as exc:
                raise map_http_error(self.label, exc)

    async def pull(self, model: str) -> AsyncIterator[dict[str, Any]]:
        """Download a model; yields Ollama progress events."""
        async with self.client(httpx.Timeout(connect=6.0, read=None, write=60.0, pool=10.0)) as c:
            try:
                async with c.stream("POST", f"{self.base_url}/api/pull", json={"model": model, "stream": True}) as r:
                    if r.status_code >= 400:
                        body = (await r.aread()).decode("utf-8", "replace")
                        raise error_from_status(self.label, r.status_code, body)
                    async for line in r.aiter_lines():
                        if line.strip():
                            try:
                                yield json.loads(line)
                            except ValueError:
                                continue
            except ProviderError:
                raise
            except Exception as exc:
                raise map_http_error(self.label, exc)

    async def delete_model(self, model: str) -> None:
        async with self.client(httpx.Timeout(30.0)) as c:
            try:
                r = await c.request("DELETE", f"{self.base_url}/api/delete", json={"model": model})
                r.raise_for_status()
            except Exception as exc:
                raise map_http_error(self.label, exc)
