#!/usr/bin/env python3
"""Generates Googly Goobers' in-game textures (no assets are copied from anywhere).

    python3 tools/generate_textures.py

Writes into src/main/resources/assets/eyeball/:
  textures/entity/white.png   flat white, tinted per-vertex by the face renderer

Every part of the face (eyes, pupils, highlights, spirals, brows, mouth, stars) is 3D geometry
coloured per vertex, so this single white texture is all the renderer needs.
The mod icon and the logo are made by tools/make_branding.py.
"""
from __future__ import annotations

import os

from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), "..", "src", "main", "resources", "assets", "eyeball")


def save(img: Image.Image, *parts: str) -> None:
    path = os.path.join(ROOT, *parts)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path, optimize=True)
    print("wrote", os.path.relpath(path, os.path.join(ROOT, "..", "..", "..", "..")))


def make_white() -> None:
    save(Image.new("RGBA", (16, 16), (255, 255, 255, 255)), "textures", "entity", "white.png")


if __name__ == "__main__":
    make_white()
