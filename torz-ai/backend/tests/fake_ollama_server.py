"""Tiny HTTP server implementing the subset of the Ollama API TORZ AI uses, backed by fake_llm.

Test-only. Usage:  python tests/fake_ollama_server.py --port 11500
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import fake_llm  # noqa: E402


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    delay = 0.0

    def log_message(self, *_a):  # quiet
        pass

    def _json(self, code: int, data) -> None:
        body = json.dumps(data).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/api/tags":
            return self._json(200, fake_llm.tags())
        if self.path == "/api/version":
            return self._json(200, {"version": "0.0.0-fake"})
        return self._json(404, {"error": "not found"})

    def do_DELETE(self):
        self._read()
        return self._json(200, {})

    def _read(self):
        n = int(self.headers.get("Content-Length") or 0)
        return json.loads(self.rfile.read(n) or b"{}")

    def do_POST(self):
        payload = self._read()
        if self.path == "/api/chat":
            content, stream = fake_llm.ollama_chat_response(payload)
            if not stream:
                return self._json(200, {"model": payload.get("model"), "message": {"role": "assistant", "content": content}, "done": True})
            self.send_response(200)
            self.send_header("Content-Type", "application/x-ndjson")
            self.send_header("Transfer-Encoding", "chunked")
            self.end_headers()
            for chunk in fake_llm.ndjson_chunks(payload.get("model", ""), content):
                self.wfile.write(f"{len(chunk):x}\r\n".encode() + chunk + b"\r\n")
                self.wfile.flush()
                if self.delay:
                    time.sleep(self.delay)
            self.wfile.write(b"0\r\n\r\n")
            return None
        if self.path == "/api/pull":
            self.send_response(200)
            self.send_header("Content-Type", "application/x-ndjson")
            self.send_header("Transfer-Encoding", "chunked")
            self.end_headers()
            for ev in ({"status": "pulling manifest"}, {"status": "downloading", "completed": 50, "total": 100},
                       {"status": "downloading", "completed": 100, "total": 100}, {"status": "success"}):
                line = (json.dumps(ev) + "\n").encode()
                self.wfile.write(f"{len(line):x}\r\n".encode() + line + b"\r\n")
            self.wfile.write(b"0\r\n\r\n")
            return None
        return self._json(404, {"error": "not found"})


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=11500)
    ap.add_argument("--delay", type=float, default=0.01)
    args = ap.parse_args()
    Handler.delay = args.delay
    srv = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    print(f"fake ollama on {args.port}", flush=True)
    srv.serve_forever()


if __name__ == "__main__":
    main()
