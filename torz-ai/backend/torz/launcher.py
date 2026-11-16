"""Start / stop / status for TORZ AI.

    python -m torz.launcher start [--no-browser] [--app-window]   start in the background and open the dashboard
    python -m torz.launcher run   [--no-browser]                  run in the foreground (Ctrl+C to stop)
    python -m torz.launcher stop                                  shut the background server down cleanly
    python -m torz.launcher status
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import signal
import subprocess
import sys
import time
import urllib.error
import urllib.request
import webbrowser
from pathlib import Path

from .config import AppConfig


def _state_file(cfg: AppConfig) -> Path:
    return cfg.data_dir / "server.json"


def _url(cfg: AppConfig, path: str = "") -> str:
    return f"http://127.0.0.1:{cfg.port}{path}"


def _request(url: str, method: str = "GET", token: str | None = None, timeout: float = 2.0) -> dict | None:
    req = urllib.request.Request(url, method=method, data=b"" if method == "POST" else None)
    if token:
        req.add_header("X-TORZ-Token", token)
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))  # never proxy loopback
    try:
        with opener.open(req, timeout=timeout) as r:
            return json.loads(r.read().decode("utf-8") or "{}")
    except (urllib.error.URLError, OSError, ValueError):
        return None


def is_running(cfg: AppConfig) -> bool:
    res = _request(_url(cfg, "/api/health"))
    return bool(res and res.get("app") == "TORZ AI")


def port_in_use(port: int) -> bool:
    import socket

    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.5)
        return s.connect_ex(("127.0.0.1", port)) == 0


def _find_edge() -> str | None:
    if sys.platform != "win32":
        return None
    for base in (os.environ.get("ProgramFiles(x86)"), os.environ.get("ProgramFiles"), os.environ.get("LOCALAPPDATA")):
        if base:
            p = Path(base) / "Microsoft" / "Edge" / "Application" / "msedge.exe"
            if p.exists():
                return str(p)
    return None


def open_dashboard(cfg: AppConfig, app_window: bool = False) -> None:
    url = _url(cfg, "/")
    if app_window:
        edge = _find_edge() or shutil.which("msedge") or shutil.which("chromium") or shutil.which("google-chrome")
        if edge:
            subprocess.Popen([edge, f"--app={url}"], close_fds=True)
            return
    webbrowser.open(url)


def run(cfg: AppConfig, open_browser: bool = False, app_window: bool = False) -> None:
    """Run the server in this process until it is told to stop."""
    import uvicorn

    from .main import create_app

    if is_running(cfg):
        print(f"TORZ AI is already running at {_url(cfg)}")
        if open_browser:
            open_dashboard(cfg, app_window)
        return
    if port_in_use(cfg.port):
        print(f"Port {cfg.port} is used by another program. Set TORZ_PORT to a free port and try again.", file=sys.stderr)
        sys.exit(2)
    app = create_app(cfg)
    server = uvicorn.Server(uvicorn.Config(app, host=cfg.host, port=cfg.port, log_level="warning", access_log=False,
                                           timeout_graceful_shutdown=5))
    app.state.ctx.extras["server"] = server
    state = {"pid": os.getpid(), "port": cfg.port, "started": time.time()}
    _state_file(cfg).write_text(json.dumps(state), encoding="utf-8")
    if open_browser:
        import threading

        def _open():
            for _ in range(100):
                if is_running(cfg):
                    open_dashboard(cfg, app_window)
                    return
                time.sleep(0.1)

        threading.Thread(target=_open, daemon=True).start()
    print(f"TORZ AI running at {_url(cfg)}  (data: {cfg.data_dir})")
    try:
        server.run()
    finally:
        try:
            st = json.loads(_state_file(cfg).read_text(encoding="utf-8"))
            if st.get("pid") == os.getpid():
                _state_file(cfg).unlink()
        except (OSError, ValueError):
            pass


def start(cfg: AppConfig, open_browser: bool = True, app_window: bool = False, wait: float = 45.0) -> int:
    if is_running(cfg):
        print(f"TORZ AI is already running at {_url(cfg)}")
        if open_browser:
            open_dashboard(cfg, app_window)
        return 0
    if port_in_use(cfg.port):
        print(f"Port {cfg.port} is used by another program. Set TORZ_PORT to a free port and try again.", file=sys.stderr)
        return 2
    cfg.ensure_dirs()
    log_path = cfg.logs_dir / "server-output.log"
    exe = sys.executable
    kwargs: dict = {"cwd": str(Path(__file__).resolve().parents[1]), "close_fds": True}
    if sys.platform == "win32":
        pyw = Path(exe).with_name("pythonw.exe")
        if pyw.exists():
            exe = str(pyw)
        kwargs["creationflags"] = 0x00000008 | 0x00000200 | 0x08000000  # DETACHED | NEW_GROUP | NO_WINDOW
    else:
        kwargs["start_new_session"] = True
    env = dict(os.environ)
    env["TORZ_DATA_DIR"] = str(cfg.data_dir)
    env["TORZ_PORT"] = str(cfg.port)
    with open(log_path, "ab") as logf:
        proc = subprocess.Popen([exe, "-m", "torz.launcher", "run", "--no-browser"], stdout=logf, stderr=logf,
                                stdin=subprocess.DEVNULL, env=env, **kwargs)
    deadline = time.time() + wait
    while time.time() < deadline:
        if is_running(cfg):
            print(f"TORZ AI started at {_url(cfg)}")
            if open_browser:
                open_dashboard(cfg, app_window)
            return 0
        if proc.poll() is not None:
            print(f"TORZ AI failed to start. See {log_path}", file=sys.stderr)
            return 1
        time.sleep(0.25)
    print(f"TORZ AI did not respond within {int(wait)}s. See {log_path}", file=sys.stderr)
    return 1


def _pid_alive(pid: int) -> bool:
    if pid <= 0:
        return False
    if sys.platform == "win32":
        out = subprocess.run(["tasklist", "/FI", f"PID eq {pid}", "/NH"], capture_output=True, text=True)
        return str(pid) in out.stdout
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False


def stop(cfg: AppConfig, timeout: float = 15.0) -> int:
    state = {}
    try:
        state = json.loads(_state_file(cfg).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        pass
    pid = int(state.get("pid", 0))
    token_path = cfg.data_dir / "token"
    token = token_path.read_text(encoding="utf-8").strip() if token_path.exists() else None
    if not is_running(cfg) and not (pid and _pid_alive(pid)):
        print("TORZ AI is not running.")
        try:
            _state_file(cfg).unlink()
        except OSError:
            pass
        return 0
    _request(_url(cfg, "/api/system/shutdown"), "POST", token)
    deadline = time.time() + timeout
    while time.time() < deadline:
        if not is_running(cfg) and not (pid and _pid_alive(pid)):
            print("TORZ AI stopped.")
            return 0
        time.sleep(0.25)
    if pid and _pid_alive(pid):
        if sys.platform == "win32":
            subprocess.run(["taskkill", "/PID", str(pid), "/T", "/F"], capture_output=True)
        else:
            os.kill(pid, signal.SIGTERM)
        time.sleep(1)
    try:
        _state_file(cfg).unlink()
    except OSError:
        pass
    print("TORZ AI stopped (forced).")
    return 0


def status(cfg: AppConfig) -> int:
    if is_running(cfg):
        print(f"TORZ AI is running at {_url(cfg)}  (data: {cfg.data_dir})")
        return 0
    print("TORZ AI is not running.")
    return 3


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="torz", description="TORZ AI launcher")
    ap.add_argument("command", choices=["start", "run", "stop", "status", "open"])
    ap.add_argument("--no-browser", action="store_true")
    ap.add_argument("--app-window", action="store_true", help="open in a chromeless Edge/Chrome app window")
    args = ap.parse_args(argv)
    cfg = AppConfig()
    if args.command == "run":
        run(cfg, open_browser=not args.no_browser, app_window=args.app_window)
        return 0
    if args.command == "start":
        return start(cfg, open_browser=not args.no_browser, app_window=args.app_window)
    if args.command == "stop":
        return stop(cfg)
    if args.command == "open":
        open_dashboard(cfg, args.app_window)
        return 0
    return status(cfg)


if __name__ == "__main__":
    sys.exit(main())
