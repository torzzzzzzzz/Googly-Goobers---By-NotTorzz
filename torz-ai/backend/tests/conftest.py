import json
import os
import sys
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

os.environ["TORZ_DISABLE_KEYRING"] = "1"
sys.path.insert(0, str(Path(__file__).resolve().parent))

import fake_llm  # noqa: E402
from torz.config import AppConfig  # noqa: E402
from torz.main import create_app  # noqa: E402

DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"


def ollama_handler(request: httpx.Request) -> httpx.Response:
    path = request.url.path
    if path == "/api/tags":
        return httpx.Response(200, json=fake_llm.tags())
    if path == "/api/version":
        return httpx.Response(200, json={"version": "0.0.0-fake"})
    if path == "/api/chat":
        payload = json.loads(request.content)
        content, stream = fake_llm.ollama_chat_response(payload)
        if not stream:
            return httpx.Response(200, json={"model": payload["model"], "message": {"role": "assistant", "content": content}, "done": True})
        return httpx.Response(200, content=b"".join(fake_llm.ndjson_chunks(payload["model"], content)))
    if path == "/api/pull":
        lines = [{"status": "pulling manifest"}, {"status": "downloading", "completed": 1, "total": 2}, {"status": "success"}]
        return httpx.Response(200, content="".join(json.dumps(x) + "\n" for x in lines).encode())
    if path == "/api/delete":
        return httpx.Response(200, json={})
    return httpx.Response(404, json={"error": "not found"})


class Transports:
    """Maps provider id -> mock HTTP handler. Tests can swap handlers (e.g. to simulate outages)."""

    def __init__(self):
        self.handlers = {"ollama": ollama_handler}

    def __call__(self, provider_id: str):
        h = self.handlers.get(provider_id)
        return httpx.MockTransport(h) if h else None


def down_handler(request: httpx.Request) -> httpx.Response:
    raise httpx.ConnectError("connection refused", request=request)


@pytest.fixture
def transports():
    return Transports()


@pytest.fixture
def config(tmp_path):
    return AppConfig(data_dir=tmp_path / "data", port=8765, frontend_dist=DIST)


@pytest.fixture
def app(config, transports):
    return create_app(config, transport_factory=transports)


@pytest.fixture
def client(app):
    with TestClient(app, base_url="http://127.0.0.1:8765") as c:
        c.headers["X-TORZ-Token"] = app.state.ctx.token
        yield c


def sse(resp) -> list[dict]:
    assert resp.status_code == 200, resp.text
    events = []
    for line in resp.text.splitlines():
        if line.startswith("data:"):
            events.append(json.loads(line[5:].strip()))
    return events


def done(events: list[dict]) -> dict:
    errors = [e for e in events if e["type"] == "error"]
    assert not errors, errors
    d = [e for e in events if e["type"] == "done"]
    assert d, events
    return d[-1]


MATERIAL = (
    "Photosynthesis is the process by which green plants use sunlight to make food from carbon dioxide and water. "
    "It takes place mainly in the chloroplasts of leaf cells, which contain a green pigment called chlorophyll. "
    "Chlorophyll absorbs light energy, mostly in the blue and red wavelengths. "
    "The light-dependent reactions occur in the thylakoid membranes and produce ATP and NADPH. "
    "The Calvin cycle takes place in the stroma and converts carbon dioxide into glucose. "
    "The Calvin cycle was discovered by Melvin Calvin in 1950. "
    "Factors that affect the rate of photosynthesis include light intensity, carbon dioxide concentration, and temperature."
)
