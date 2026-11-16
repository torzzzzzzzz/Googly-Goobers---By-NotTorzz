"""Provider catalogue and defaults."""
from __future__ import annotations

import os
from typing import Any

from .providers.anthropic import AnthropicProvider
from .providers.gemini import GeminiProvider
from .providers.ollama import OllamaProvider
from .providers.openai_compat import OpenAICompatibleProvider, OpenAIProvider

PROVIDER_CLASSES = {
    cls.id: cls
    for cls in (OllamaProvider, OpenAICompatibleProvider, OpenAIProvider, AnthropicProvider, GeminiProvider)
}
PROVIDER_IDS = list(PROVIDER_CLASSES.keys())

# Models offered on the setup screen. Sizes are approximate download sizes.
RECOMMENDED_OLLAMA_MODELS = [
    {"id": "llama3.2:3b", "label": "Llama 3.2 3B", "size": "2.0 GB", "ram": "8 GB RAM",
     "note": "Fast, good all-rounder. Recommended starting point."},
    {"id": "qwen2.5:7b", "label": "Qwen 2.5 7B", "size": "4.7 GB", "ram": "16 GB RAM",
     "note": "Higher-quality writing and very reliable structured output (quizzes, flashcards)."},
    {"id": "gemma3:4b", "label": "Gemma 3 4B", "size": "3.3 GB", "ram": "8 GB RAM",
     "note": "Natural, fluent prose; good for rewriting."},
    {"id": "llama3.1:8b", "label": "Llama 3.1 8B", "size": "4.9 GB", "ram": "16 GB RAM",
     "note": "Strong general writing model for capable PCs."},
    {"id": "qwen2.5:1.5b", "label": "Qwen 2.5 1.5B", "size": "1.0 GB", "ram": "4 GB RAM",
     "note": "Very small and fast for older hardware; lower quality."},
]
PREFERRED_ORDER = [m["id"] for m in RECOMMENDED_OLLAMA_MODELS]

DEFAULT_AI_SETTINGS: dict[str, Any] = {
    "default_provider": "ollama",
    "fallback_to_local": True,
    "temperature": 0.7,
    "num_ctx": 8192,
    "providers": {
        "ollama": {"base_url": os.environ.get("TORZ_OLLAMA_URL", OllamaProvider.default_base_url), "model": "",
                   "enabled": True, "think": False},
        "openai_compatible": {
            "base_url": OpenAICompatibleProvider.default_base_url,
            "model": "",
            "enabled": True,
            "label": "LM Studio / llama.cpp / other",
        },
        "openai": {"base_url": OpenAIProvider.default_base_url, "model": "", "enabled": True},
        "anthropic": {"base_url": AnthropicProvider.default_base_url, "model": "", "enabled": True},
        "gemini": {"base_url": GeminiProvider.default_base_url, "model": "", "enabled": True},
    },
}

# Heuristics for choosing a sensible default model when the user has not picked one yet.
CLOUD_MODEL_HINTS = {
    "openai": ["mini", "gpt-4o", "gpt"],
    "anthropic": ["haiku", "sonnet"],
    "gemini": ["flash", "pro"],
    "openai_compatible": [""],
}


def provider_catalog() -> list[dict[str, Any]]:
    return [
        {
            "id": cls.id,
            "label": cls.label,
            "local": cls.local,
            "needs_key": cls.needs_key,
            "default_base_url": cls.default_base_url,
            "docs_url": cls.docs_url,
        }
        for cls in PROVIDER_CLASSES.values()
    ]
