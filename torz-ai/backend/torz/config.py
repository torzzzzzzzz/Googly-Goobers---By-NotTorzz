"""Runtime configuration: data directory, network binding and limits."""
from __future__ import annotations

import os
import sys
from dataclasses import dataclass, field
from pathlib import Path


def default_data_dir() -> Path:
    env = os.environ.get("TORZ_DATA_DIR")
    if env:
        return Path(env).expanduser().resolve()
    if sys.platform == "win32":
        base = os.environ.get("LOCALAPPDATA") or str(Path.home() / "AppData" / "Local")
        return Path(base) / "TORZ AI"
    if sys.platform == "darwin":
        return Path.home() / "Library" / "Application Support" / "TORZ AI"
    xdg = os.environ.get("XDG_DATA_HOME")
    return (Path(xdg) if xdg else Path.home() / ".local" / "share") / "torz-ai"


def frontend_dist_dir() -> Path:
    env = os.environ.get("TORZ_FRONTEND_DIST")
    if env:
        return Path(env)
    return Path(__file__).resolve().parents[2] / "frontend" / "dist"


# Fixed ID of the bundled companion extension (derived from the public key in extension/manifest.json).
TORZ_EXTENSION_ID = "ceedgmdocmecinkjffjboapgailamkcb"


@dataclass
class AppConfig:
    data_dir: Path = field(default_factory=default_data_dir)
    host: str = "127.0.0.1"
    port: int = int(os.environ.get("TORZ_PORT", "8765"))
    max_upload_mb: int = int(os.environ.get("TORZ_MAX_UPLOAD_MB", "50"))
    max_pdf_pages: int = 1500
    max_ocr_pages: int = 60
    dev_mode: bool = os.environ.get("TORZ_DEV") == "1"
    frontend_dist: Path = field(default_factory=frontend_dist_dir)
    extra_extension_ids: tuple[str, ...] = tuple(
        x.strip() for x in os.environ.get("TORZ_EXTENSION_IDS", "").split(",") if x.strip()
    )

    @property
    def db_path(self) -> Path:
        return self.data_dir / "torz.db"

    @property
    def files_dir(self) -> Path:
        return self.data_dir / "files"

    @property
    def logs_dir(self) -> Path:
        return self.data_dir / "logs"

    @property
    def extension_ids(self) -> tuple[str, ...]:
        return (TORZ_EXTENSION_ID, *self.extra_extension_ids)

    def ensure_dirs(self) -> None:
        for d in (self.data_dir, self.files_dir, self.logs_dir):
            d.mkdir(parents=True, exist_ok=True)
