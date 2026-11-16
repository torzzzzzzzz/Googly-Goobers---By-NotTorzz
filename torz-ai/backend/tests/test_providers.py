"""AI provider protocol handling, retries, fallback, model resolution and JSON parsing."""
import json

import httpx
import pytest

from conftest import down_handler, sse
from torz.ai.base import ChatMessage, GenOptions, ProviderConfig, ProviderError, with_retry
from torz.ai.jsonutil import extract_json
from torz.ai.providers.anthropic import AnthropicProvider
from torz.ai.providers.gemini import GeminiProvider
from torz.ai.providers.ollama import OllamaProvider
from torz.ai.providers.openai_compat import OpenAICompatibleProvider, OpenAIProvider

MSGS = [ChatMessage("system", "Be brief."), ChatMessage("user", "Say hi")]


def mk(cls, handler, key=None, base=""):
    return cls(ProviderConfig(base_url=base), api_key=key, transport=httpx.MockTransport(handler))


async def collect(gen):
    return "".join([x async for x in gen])


async def test_ollama_chat_stream_and_errors():
    def h(req):
        if req.url.path == "/api/tags":
            return httpx.Response(200, json={"models": [{"name": "llama3.2:3b", "size": 1, "details": {"parameter_size": "3B"}}]})
        body = json.loads(req.content)
        assert body["options"]["num_ctx"] == 4096 and body["model"] == "llama3.2:3b"
        if body.get("format") is not None:
            assert body["format"] == {"type": "object"}
        if body["stream"]:
            lines = [{"message": {"content": "Hel"}, "done": False}, {"message": {"content": "lo"}, "done": False}, {"done": True}]
            return httpx.Response(200, content="".join(json.dumps(x) + "\n" for x in lines).encode())
        return httpx.Response(200, json={"message": {"content": "Hello"}, "done": True, "eval_count": 3})

    p = mk(OllamaProvider, h)
    models = await p.list_models()
    assert models[0].id == "llama3.2:3b" and "3B" in models[0].label
    r = await p.chat(MSGS, "llama3.2:3b", GenOptions(num_ctx=4096))
    assert r.text == "Hello" and r.usage["completion_tokens"] == 3
    assert await collect(p.stream(MSGS, "llama3.2:3b", GenOptions(num_ctx=4096))) == "Hello"
    await p.chat(MSGS, "llama3.2:3b", GenOptions(num_ctx=4096, json_schema={"type": "object"}))

    missing = mk(OllamaProvider, lambda req: httpx.Response(404, json={"error": "model 'x' not found"}))
    with pytest.raises(ProviderError) as e:
        await missing.chat(MSGS, "x", GenOptions())
    assert e.value.kind == "model_not_found" and "ollama pull x" in e.value.message

    down = mk(OllamaProvider, down_handler)
    with pytest.raises(ProviderError) as e:
        await down.chat(MSGS, "x", GenOptions())
    assert e.value.kind == "unavailable" and e.value.retryable
    chk = await down.check()
    assert not chk["ok"] and "not running" in chk["message"]


async def test_openai_compatible_sse_and_schema_fallback():
    calls = []

    def h(req):
        if req.url.path.endswith("/models"):
            return httpx.Response(200, json={"data": [{"id": "local-model"}]})
        body = json.loads(req.content)
        calls.append(body)
        if body.get("stream"):
            chunks = [{"choices": [{"delta": {"content": "Hi "}}]}, {"choices": [{"delta": {"content": "there"}}]}]
            text = "".join(f"data: {json.dumps(c)}\n\n" for c in chunks) + "data: [DONE]\n\n"
            return httpx.Response(200, content=text.encode())
        if "response_format" in body:
            return httpx.Response(400, json={"error": {"message": "'response_format.type' must be 'json_schema' or 'text'"}})
        return httpx.Response(200, json={"choices": [{"message": {"content": '{"a": 1}'}}], "model": "local-model"})

    p = mk(OpenAICompatibleProvider, h, base="http://127.0.0.1:1234/v1")
    assert p.local
    assert [m.id for m in await p.list_models()] == ["local-model"]
    assert await collect(p.stream(MSGS, "local-model", GenOptions())) == "Hi there"
    r = await p.chat(MSGS, "local-model", GenOptions(json_schema={"type": "object"}))
    assert json.loads(r.text) == {"a": 1}
    assert "response_format" in calls[-2] and "response_format" not in calls[-1]  # retried without schema


async def test_openai_requires_key_and_maps_auth_errors():
    p = OpenAIProvider(ProviderConfig(), api_key=None)
    with pytest.raises(ProviderError) as e:
        await p.chat(MSGS, "gpt-x", GenOptions())
    assert e.value.kind == "not_configured"
    seen = {}

    def h(req):
        seen["auth"] = req.headers.get("authorization")
        body = json.loads(req.content)
        seen["max"] = body.get("max_completion_tokens")
        return httpx.Response(401, json={"error": {"message": "Incorrect API key"}})

    p = mk(OpenAIProvider, h, key="sk-test")
    with pytest.raises(ProviderError) as e:
        await p.chat(MSGS, "gpt-x", GenOptions(max_tokens=50))
    assert e.value.kind == "auth" and "Incorrect API key" in e.value.message
    assert seen == {"auth": "Bearer sk-test", "max": 50}
    assert not OpenAIProvider.local


async def test_anthropic_and_gemini_protocols():
    def ah(req):
        assert req.headers["x-api-key"] == "k" and req.headers["anthropic-version"]
        body = json.loads(req.content)
        assert body["system"].startswith("Be brief") and body["messages"][0]["role"] == "user"
        if body["stream"]:
            evs = [{"type": "content_block_delta", "delta": {"text": "Hey"}}, {"type": "message_stop"}]
            return httpx.Response(200, content="".join(f"event: x\ndata: {json.dumps(e)}\n\n" for e in evs).encode())
        return httpx.Response(200, json={"content": [{"type": "text", "text": "Hey"}], "model": "claude-x"})

    a = mk(AnthropicProvider, ah, key="k")
    assert (await a.chat(MSGS, "claude-x", GenOptions())).text == "Hey"
    assert await collect(a.stream(MSGS, "claude-x", GenOptions())) == "Hey"

    def gh(req):
        assert req.headers["x-goog-api-key"] == "g"
        body = json.loads(req.content)
        assert body["systemInstruction"]["parts"][0]["text"].startswith("Be brief")
        data = {"candidates": [{"content": {"parts": [{"text": "Yo"}]}}]}
        if req.url.path.endswith(":streamGenerateContent"):
            return httpx.Response(200, content=f"data: {json.dumps(data)}\n\n".encode())
        return httpx.Response(200, json=data)

    g = mk(GeminiProvider, gh, key="g")
    assert (await g.chat(MSGS, "gemini-x", GenOptions())).text == "Yo"
    assert await collect(g.stream(MSGS, "gemini-x", GenOptions())) == "Yo"


async def test_retry_backoff_then_success(monkeypatch):
    import torz.ai.base as base

    async def no_sleep(_):
        return None

    monkeypatch.setattr(base.asyncio, "sleep", no_sleep)
    n = {"c": 0}

    async def flaky():
        n["c"] += 1
        if n["c"] < 3:
            raise ProviderError("unavailable", "busy", retryable=True)
        return "ok"

    assert await with_retry(flaky) == "ok" and n["c"] == 3

    async def bad():
        raise ProviderError("bad_request", "nope")

    with pytest.raises(ProviderError):
        await with_retry(bad)


def test_extract_json_tolerates_model_noise():
    assert extract_json('```json\n{"a": [1, 2,]}\n```') == {"a": [1, 2]}
    assert extract_json('Sure! Here it is: {"x": "y"} hope it helps') == {"x": "y"}
    assert extract_json("<think>hmm</think>[1, 2]") == [1, 2]
    with pytest.raises(ValueError):
        extract_json("no json here")


def test_ai_status_and_model_resolution(client, transports):
    st = client.get("/api/ai/status").json()
    assert st["ok"] and st["model"] == "fake-model:latest" and st["provider"] == "ollama"
    # A configured model that is not installed gives a helpful error.
    client.patch("/api/settings", json={"patch": {"ai": {"providers": {"ollama": {"model": "missing:7b"}}}}})
    st = client.get("/api/ai/status").json()
    assert not st["ok"] and "ollama pull missing:7b" in st["message"]
    client.patch("/api/settings", json={"patch": {"ai": {"providers": {"ollama": {"model": ""}}}}})
    # No models installed
    transports.handlers["ollama"] = lambda req: httpx.Response(200, json={"models": []})
    st = client.get("/api/ai/status").json()
    assert not st["ok"] and st["kind"] == "no_model"


def test_unavailable_provider_surfaces_setup_error(client, transports):
    transports.handlers["ollama"] = down_handler
    ev = sse(client.post("/api/tools/humanize", json={"text": "Some text to rewrite here."}))
    err = [e for e in ev if e["type"] == "error"][0]
    assert err["kind"] == "unavailable"
    assert not [e for e in ev if e["type"] == "done"]
    test = client.post("/api/ai/providers/ollama/test").json()
    assert test["ok"] is False and test["latency_ms"] >= 0


def test_cloud_provider_falls_back_to_local_ollama(client, transports):
    transports.handlers["openai"] = lambda req: httpx.Response(429, json={"error": {"message": "quota"}})
    client.put("/api/ai/providers/openai/key", json={"key": "sk-123456789"})
    client.patch("/api/settings", json={"patch": {"ai": {"default_provider": "openai", "providers": {"openai": {"model": "gpt-x"}}}}})
    ev = sse(client.post("/api/tools/paraphrase", json={"text": "It is very important to note that tests matter."}))
    meta = [e for e in ev if e["type"] == "meta"][0]
    assert meta["provider"] == "ollama" and meta["fallback"] is True
    # Without fallback the cloud error is reported.
    client.patch("/api/settings", json={"patch": {"ai": {"fallback_to_local": False}}})
    ev = sse(client.post("/api/tools/paraphrase", json={"text": "It is very important to note that tests matter."}))
    assert [e for e in ev if e["type"] == "error"][0]["kind"] == "rate_limit"


def test_api_keys_are_stored_securely_and_masked(client, app):
    client.put("/api/ai/providers/anthropic/key", json={"key": "sk-ant-abcdefghijk"})
    s = client.get("/api/settings").json()
    assert s["api_keys"]["anthropic"] == {"set": True, "masked": "sk-…hijk"}
    assert "sk-ant-abcdefghijk" not in json.dumps(s)
    raw = (app.state.ctx.config.data_dir / "secrets.enc").read_bytes()
    assert b"sk-ant" not in raw  # encrypted at rest
    assert app.state.ctx.secrets.get("api_key:anthropic") == "sk-ant-abcdefghijk"
    client.delete("/api/ai/providers/anthropic/key")
    assert client.get("/api/settings").json()["api_keys"]["anthropic"]["set"] is False


def test_ollama_model_download_and_delete(client):
    ev = sse(client.post("/api/ai/ollama/pull", json={"model": "llama3.2:3b"}))
    assert ev[-1] == {"type": "done", "model": "llama3.2:3b"}
    assert any(e.get("status") == "success" for e in ev)
    assert client.delete("/api/ai/ollama/models/llama3.2:3b").json() == {"ok": True}
    assert client.post("/api/ai/ollama/pull", json={"model": "bad model; rm -rf"}).status_code == 422
