"""Storage for API keys and OAuth tokens.

Preferred backend: the operating system keyring (Windows Credential Manager on Windows).
Fallback: a Fernet-encrypted file in the data directory, keyed by a separate local key file.
Secrets are never returned to the frontend; only a masked preview is exposed.
"""
from __future__ import annotations

import json
import logging
import os
import threading
from pathlib import Path

from cryptography.fernet import Fernet, InvalidToken

log = logging.getLogger("torz.secrets")
SERVICE = "TORZ AI"


def mask(value: str | None) -> str:
    if not value:
        return ""
    if len(value) <= 8:
        return "•" * len(value)
    return f"{value[:3]}…{value[-4:]}"


class SecretStore:
    def __init__(self, data_dir: Path, use_keyring: bool | None = None):
        self.data_dir = data_dir
        self._lock = threading.Lock()
        self._keyring = None
        if use_keyring is None:
            use_keyring = os.environ.get("TORZ_DISABLE_KEYRING") != "1"
        if use_keyring:
            self._keyring = self._probe_keyring()
        self._key_path = data_dir / "secret.key"
        self._file_path = data_dir / "secrets.enc"

    @staticmethod
    def _probe_keyring():
        try:
            import keyring
            from keyring.backends import fail

            kr = keyring.get_keyring()
            if isinstance(kr, fail.Keyring) or "fail" in type(kr).__module__ or "null" in type(kr).__module__:
                return None
            # chainer with no usable backends also reports priority <= 0
            if getattr(kr, "priority", 1) <= 0:
                return None
            return kr
        except Exception:  # pragma: no cover - platform specific
            return None

    @property
    def backend_name(self) -> str:
        return f"OS keyring ({type(self._keyring).__name__})" if self._keyring else "Encrypted local file"

    # ------------------------------------------------------------ file fallback
    def _fernet(self) -> Fernet:
        if not self._key_path.exists():
            self._key_path.write_bytes(Fernet.generate_key())
            try:
                os.chmod(self._key_path, 0o600)
            except OSError:
                pass
        return Fernet(self._key_path.read_bytes())

    def _read_file(self) -> dict[str, str]:
        if not self._file_path.exists():
            return {}
        try:
            raw = self._fernet().decrypt(self._file_path.read_bytes())
            return json.loads(raw)
        except (InvalidToken, ValueError):
            log.error("Secret file could not be decrypted; ignoring it")
            return {}

    def _write_file(self, data: dict[str, str]) -> None:
        token = self._fernet().encrypt(json.dumps(data).encode())
        tmp = self._file_path.with_suffix(".tmp")
        tmp.write_bytes(token)
        os.replace(tmp, self._file_path)
        try:
            os.chmod(self._file_path, 0o600)
        except OSError:
            pass

    # ------------------------------------------------------------ public API
    def get(self, name: str) -> str | None:
        with self._lock:
            if self._keyring:
                try:
                    val = self._keyring.get_password(SERVICE, name)
                    if val is not None:
                        return val
                except Exception as exc:  # pragma: no cover
                    log.warning("keyring read failed: %s", exc)
            return self._read_file().get(name)

    def set(self, name: str, value: str) -> None:
        with self._lock:
            if self._keyring:
                try:
                    self._keyring.set_password(SERVICE, name, value)
                    return
                except Exception as exc:  # pragma: no cover
                    log.warning("keyring write failed, using encrypted file: %s", exc)
            data = self._read_file()
            data[name] = value
            self._write_file(data)

    def delete(self, name: str) -> None:
        with self._lock:
            if self._keyring:
                try:
                    self._keyring.delete_password(SERVICE, name)
                except Exception:
                    pass
            data = self._read_file()
            if name in data:
                data.pop(name)
                self._write_file(data)

    def clear(self) -> None:
        for name in list(self._read_file().keys()):
            self.delete(name)
        from .ai.registry import PROVIDER_IDS  # local import to avoid cycle

        for pid in PROVIDER_IDS:
            self.delete(f"api_key:{pid}")
        self.delete("google_oauth_client")
        self.delete("google_oauth_token")
