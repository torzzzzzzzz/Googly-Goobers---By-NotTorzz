"""Google Gemini API (optional, requires an API key)."""
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


class GeminiProvider(Provider):
    id = "gemini"
    label = "Google Gemini"
    needs_key = True
    default_base_url = "https://generativelanguage.googleapis.com/v1beta"
    docs_url = "https://aistudio.google.com/apikey"

    def headers(self) -> dict[str, str]:
        return {"x-goog-api-key": self.api_key or "", "content-type": "application/json"}

    def _payload(self, messages: list[ChatMessage], options: GenOptions) -> dict[str, Any]:
        system = "\n\n".join(m.content for m in messages if m.role == "system")
        contents = [
            {"role": "model" if m.role == "assistant" else "user", "parts": [{"text": m.content}]}
            for m in messages
            if m.role != "system"
        ]
        cfg: dict[str, Any] = {"temperature": options.temperature}
        if options.max_tokens:
            cfg["maxOutputTokens"] = options.max_tokens
        if options.stop:
            cfg["stopSequences"] = options.stop[:5]
        if options.json_schema is not None:
            cfg["responseMimeType"] = "application/json"
        payload: dict[str, Any] = {"contents": contents, "generationConfig": cfg}
        if system:
            payload["systemInstruction"] = {"parts": [{"text": system}]}
        return payload

    @staticmethod
    def _model_path(model: str) -> str:
        return model if model.startswith("models/") else f"models/{model}"

    @staticmethod
    def _text(data: dict[str, Any]) -> str:
        out = []
        for cand in data.get("candidates") or []:
            for part in (cand.get("content") or {}).get("parts") or []:
                if "text" in part and not part.get("thought"):
                    out.append(part["text"])
        return "".join(out)

    async def list_models(self) -> list[ModelInfo]:
        self.require_key()
        async with self.client(httpx.Timeout(10.0)) as c:
            try:
                r = await c.get(f"{self.base_url}/models", headers=self.headers(), params={"pageSize": 200})
            except Exception as exc:
                raise map_http_error(self.label, exc)
            if r.status_code >= 400:
                raise error_from_status(self.label, r.status_code, r.text)
            out = []
            for m in r.json().get("models", []):
                if "generateContent" in (m.get("supportedGenerationMethods") or []):
                    mid = m["name"].removeprefix("models/")
                    out.append(ModelInfo(id=mid, label=m.get("displayName") or mid))
            return out

    async def chat(self, messages: list[ChatMessage], model: str, options: GenOptions) -> ChatResult:
        self.require_key()
        async with self.client() as c:
            try:
                r = await c.post(f"{self.base_url}/{self._model_path(model)}:generateContent",
                                 headers=self.headers(), json=self._payload(messages, options))
            except Exception as exc:
                raise map_http_error(self.label, exc)
            if r.status_code >= 400:
                raise error_from_status(self.label, r.status_code, r.text)
            data = r.json()
            return ChatResult(text=self._text(data), provider=self.id, model=model, usage=data.get("usageMetadata") or {})

    async def stream(self, messages: list[ChatMessage], model: str, options: GenOptions) -> AsyncIterator[str]:
        self.require_key()
        async with self.client() as c:
            try:
                async with c.stream("POST", f"{self.base_url}/{self._model_path(model)}:streamGenerateContent",
                                    params={"alt": "sse"}, headers=self.headers(),
                                    json=self._payload(messages, options)) as r:
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
                        piece = self._text(data)
                        if piece:
                            yield piece
            except ProviderError:
                raise
            except Exception as exc:
                raise map_http_error(self.label, exc)
