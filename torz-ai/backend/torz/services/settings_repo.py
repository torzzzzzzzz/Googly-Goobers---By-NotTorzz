"""Application preferences stored in the `settings` table."""
from __future__ import annotations

import copy
import getpass
import json
from typing import Any

from ..ai.registry import DEFAULT_AI_SETTINGS
from ..db import Database
from ..db.models import Setting, utcnow


def _default_name() -> str:
    try:
        name = getpass.getuser()
    except Exception:
        return ""
    return name[:1].upper() + name[1:] if name and name.lower() not in ("root", "user", "admin") else ""


def default_settings() -> dict[str, Any]:
    return {
        "profile": {"name": _default_name()},
        "appearance": {
            "theme": "dark",
            "accent": "cyan",
            "font_size": "medium",
            "compact": False,
            "reduce_motion": False,
        },
        "ai": copy.deepcopy(DEFAULT_AI_SETTINGS),
        "writing": {
            "default_mode": "standard",
            "rewrite_strength": 3,
            "language": "auto",
            "explain_changes": False,
        },
        "study": {"question_count": 10, "difficulty": "mixed", "auto_advance": True},
        "dashboard": {"shortcuts": ["humanizer", "summarizer", "quiz", "flashcards", "documents", "grammar"]},
        "autotyper": {"wpm": 70, "natural_rhythm": True},
        "privacy": {"save_history": True},
    }


SECTIONS = set(default_settings().keys())


def deep_merge(base: dict[str, Any], override: dict[str, Any]) -> dict[str, Any]:
    out = copy.deepcopy(base)
    for k, v in (override or {}).items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = deep_merge(out[k], v)
        else:
            out[k] = copy.deepcopy(v)
    return out


class SettingsRepo:
    def __init__(self, db: Database):
        self.db = db
        self._cache: dict[str, Any] | None = None

    def all(self) -> dict[str, Any]:
        if self._cache is None:
            stored: dict[str, Any] = {}
            with self.db.session() as s:
                for row in s.query(Setting).all():
                    try:
                        stored[row.key] = json.loads(row.value_json)
                    except ValueError:
                        continue
            self._cache = deep_merge(default_settings(), stored)
        return copy.deepcopy(self._cache)

    def get(self, section: str) -> Any:
        return self.all().get(section)

    def update(self, patch: dict[str, Any]) -> dict[str, Any]:
        current = self.all()
        with self.db.session() as s:
            for section, value in patch.items():
                if section not in SECTIONS:
                    raise ValueError(f"Unknown settings section: {section}")
                merged = deep_merge(current.get(section) or {}, value) if isinstance(value, dict) else value
                row = s.get(Setting, section)
                if row is None:
                    s.add(Setting(key=section, value_json=json.dumps(merged)))
                else:
                    row.value_json = json.dumps(merged)
                    row.updated_at = utcnow()
        self._cache = None
        return self.all()

    def replace_section(self, section: str, value: Any) -> None:
        with self.db.session() as s:
            row = s.get(Setting, section)
            if row is None:
                s.add(Setting(key=section, value_json=json.dumps(value)))
            else:
                row.value_json = json.dumps(value)
        self._cache = None

    def reset(self) -> None:
        with self.db.session() as s:
            s.query(Setting).delete()
        self._cache = None

    def language_instruction(self) -> str:
        lang = (self.get("writing") or {}).get("language", "auto")
        if not lang or lang == "auto":
            return "Write in the same language as the user's text."
        return f"Write the output in {lang}."
