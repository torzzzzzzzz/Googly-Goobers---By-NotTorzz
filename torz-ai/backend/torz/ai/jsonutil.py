"""Tolerant JSON extraction for model output."""
from __future__ import annotations

import json
import re
from typing import Any

_FENCE = re.compile(r"```(?:json|JSON)?\s*(.*?)```", re.S)
_TRAILING_COMMA = re.compile(r",\s*([}\]])")


def _balanced_slice(text: str, start: int) -> str | None:
    opener = text[start]
    closer = "}" if opener == "{" else "]"
    depth = 0
    in_str = False
    esc = False
    for i in range(start, len(text)):
        ch = text[i]
        if in_str:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == '"':
                in_str = False
            continue
        if ch == '"':
            in_str = True
        elif ch in "{[":
            depth += 1
        elif ch in "}]":
            depth -= 1
            if depth == 0:
                return text[start : i + 1]
    return None


def _try_load(candidate: str) -> Any:
    try:
        return json.loads(candidate)
    except ValueError:
        pass
    fixed = _TRAILING_COMMA.sub(r"\1", candidate)
    fixed = fixed.replace("“", '"').replace("”", '"')
    try:
        return json.loads(fixed)
    except ValueError:
        return None


def extract_json(text: str) -> Any:
    """Return the first JSON object/array found in `text`, or raise ValueError."""
    if not text or not text.strip():
        raise ValueError("Empty response from model")
    text = text.strip()
    # Strip <think>...</think> blocks emitted by reasoning models.
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.S).strip()
    direct = _try_load(text)
    if direct is not None:
        return direct
    for m in _FENCE.finditer(text):
        val = _try_load(m.group(1).strip())
        if val is not None:
            return val
    for i, ch in enumerate(text):
        if ch in "{[":
            chunk = _balanced_slice(text, i)
            if chunk:
                val = _try_load(chunk)
                if val is not None:
                    return val
    raise ValueError("The model did not return valid JSON")


def as_list(value: Any) -> list:
    if value is None:
        return []
    if isinstance(value, list):
        return value
    return [value]


def clean_str(value: Any, limit: int = 4000) -> str:
    if value is None:
        return ""
    if isinstance(value, (list, tuple)):
        value = ", ".join(str(v) for v in value)
    return str(value).strip()[:limit]
