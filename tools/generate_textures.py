#!/usr/bin/env python3
"""Generates EyeBall Mod's original textures (no assets are copied from anywhere).

    python3 tools/generate_textures.py

Writes into src/main/resources/assets/eyeball/:
  textures/entity/white.png            flat white, tinted per-vertex by the face renderer
  textures/entity/elmo/elmo_base.png   red fur for the Elmo-style model
  textures/entity/elmo/elmo_fur_1..3   sparser and sparser fur strands for the 3 fur shells
  icon.png                             mod icon (googly eyes + spiral eye)

The Elmo model uses a 128 x 64 UV layout; the PNGs are drawn at 4x for fine strands.
Deterministic: the same seed always produces the same textures.
"""
from __future__ import annotations

import math
import os
import random

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.join(os.path.dirname(__file__), "..", "src", "main", "resources", "assets", "eyeball")
SCALE = 4
LAYOUT_W, LAYOUT_H = 128, 64
W, H = LAYOUT_W * SCALE, LAYOUT_H * SCALE

RED = np.array([226, 30, 38], dtype=np.float32)
RED_DARK = np.array([150, 14, 22], dtype=np.float32)
RED_LIGHT = np.array([255, 92, 74], dtype=np.float32)
FOOT = np.array([232, 82, 34], dtype=np.float32)


def save(img: Image.Image, *parts: str) -> None:
    path = os.path.join(ROOT, *parts)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path, optimize=True)
    print("wrote", os.path.relpath(path, os.path.join(ROOT, "..", "..", "..", "..")))


def smooth_noise(rng: np.random.Generator, shape: tuple[int, int], cell: int) -> np.ndarray:
    """Value noise: random grid upscaled with bicubic filtering, 0..1."""
    gh, gw = shape[0] // cell + 2, shape[1] // cell + 2
    grid = Image.fromarray((rng.random((gh, gw)) * 255).astype(np.uint8))
    big = grid.resize((gw * cell, gh * cell), Image.BICUBIC)
    return np.asarray(big, dtype=np.float32)[: shape[0], : shape[1]] / 255.0


def foot_mask() -> np.ndarray:
    """Pixels belonging to the lower legs / soles (slightly more orange, like puppet feet)."""
    mask = np.zeros((H, W), dtype=bool)
    u, v, w, h, d = 74, 18, 4, 12, 4  # leg cube texOffs and size
    # Bottom face (sole).
    mask[v * SCALE:(v + d) * SCALE, (u + d + w) * SCALE:(u + d + 2 * w) * SCALE] = True
    # Lower 3 pixels of the four side faces.
    y0 = (v + d + h - 3) * SCALE
    y1 = (v + d + h) * SCALE
    mask[y0:y1, u * SCALE:(u + 2 * d + 2 * w) * SCALE] = True
    return mask


def fur_base(rng: np.random.Generator) -> np.ndarray:
    clumps = smooth_noise(rng, (H, W), 10 * SCALE // 4)
    fine = smooth_noise(rng, (H, W), 2)
    tone = 0.55 * clumps + 0.45 * fine
    color = RED_DARK[None, None, :] * (1 - tone[..., None]) + RED[None, None, :] * tone[..., None]
    img = np.clip(color, 0, 255)
    # Short strands, mostly vertical (fur hangs down), lighter and darker.
    strands = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(strands)
    for _ in range(W * H // 22):
        x = rng.uniform(0, W)
        y = rng.uniform(0, H)
        length = rng.uniform(2.5, 7.0)
        angle = math.pi / 2 + rng.normal(0, 0.45)
        light = rng.random() < 0.5
        col = tuple(int(c) for c in (RED_LIGHT if light else RED_DARK)) + (int(rng.uniform(70, 150)),)
        draw.line([(x, y), (x + math.cos(angle) * length, y + math.sin(angle) * length)], fill=col, width=1)
    over = np.asarray(strands, dtype=np.float32)
    alpha = over[..., 3:4] / 255.0
    img = img * (1 - alpha) + over[..., :3] * alpha
    feet = foot_mask()
    img[feet] = img[feet] * 0.55 + FOOT * 0.45
    return img


def fur_shell(rng: np.random.Generator, centers: np.ndarray, keep: float, radius: float, tint: np.ndarray, base: np.ndarray) -> Image.Image:
    """Strand cross-sections for one shell: fewer and thinner strands further out."""
    alpha = Image.new("L", (W, H), 0)
    draw = ImageDraw.Draw(alpha)
    for (x, y, r_scale, k) in centers:
        if k > keep:
            continue
        r = radius * r_scale
        draw.ellipse([x - r, y - r, x + r, y + r], fill=255)
    a = np.asarray(alpha, dtype=np.float32) / 255.0
    color = base * 0.35 + tint[None, None, :] * 0.65
    rgba = np.zeros((H, W, 4), dtype=np.uint8)
    rgba[..., :3] = np.clip(color, 0, 255).astype(np.uint8)
    rgba[..., 3] = (a > 0.5).astype(np.uint8) * 255
    return Image.fromarray(rgba, "RGBA")


def make_elmo() -> None:
    rng = np.random.default_rng(1977)
    base = fur_base(rng)
    save(Image.fromarray(base.astype(np.uint8), "RGB").convert("RGBA"), "textures", "entity", "elmo", "elmo_base.png")

    count = W * H // 14
    centers = np.stack([
        rng.uniform(0, W, count),
        rng.uniform(0, H, count),
        rng.uniform(0.75, 1.25, count),
        rng.random(count),
    ], axis=1)
    shells = [
        (0.80, 1.9, np.array([200, 20, 28], dtype=np.float32)),
        (0.58, 1.55, np.array([236, 38, 40], dtype=np.float32)),
        (0.36, 1.2, np.array([255, 96, 78], dtype=np.float32)),
    ]
    feet = foot_mask()
    for i, (keep, radius, tint) in enumerate(shells, start=1):
        shell = fur_shell(rng, centers, keep, radius, tint, base)
        arr = np.asarray(shell).copy()
        arr[feet, :3] = (arr[feet, :3].astype(np.float32) * 0.6 + FOOT * 0.4).astype(np.uint8)
        save(Image.fromarray(arr, "RGBA"), "textures", "entity", "elmo", f"elmo_fur_{i}.png")


def make_white() -> None:
    save(Image.new("RGBA", (16, 16), (255, 255, 255, 255)), "textures", "entity", "white.png")


def googly_eye(draw: ImageDraw.ImageDraw, cx: float, cy: float, r: float, pupil_dx: float, pupil_dy: float, spiral: bool) -> None:
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(18, 18, 22, 255))
    ri = r * 0.8
    draw.ellipse([cx - ri, cy - ri, cx + ri, cy + ri], fill=(250, 250, 252, 255))
    if spiral:
        pts = []
        turns = 2.6
        for i in range(400):
            t = i / 399
            theta = t * turns * 2 * math.pi
            rr = ri * 0.9 * t
            pts.append((cx + rr * math.cos(theta), cy + rr * math.sin(theta)))
        draw.line(pts, fill=(14, 14, 18, 255), width=max(2, int(r * 0.16)))
    else:
        rp = ri * 0.48
        px, py = cx + pupil_dx * (ri - rp), cy + pupil_dy * (ri - rp)
        draw.ellipse([px - rp, py - rp, px + rp, py + rp], fill=(12, 12, 15, 255))
        rh = rp * 0.3
        hx, hy = px + rp * 0.3, py - rp * 0.35
        draw.ellipse([hx - rh, hy - rh, hx + rh, hy + rh], fill=(255, 255, 255, 255))


def make_icon() -> None:
    size = 512
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw.rounded_rectangle([16, 16, size - 16, size - 16], radius=96, fill=(255, 196, 64, 255))
    draw.rounded_rectangle([16, 16, size - 16, size - 16], radius=96, outline=(30, 24, 20, 255), width=16)
    # Brows.
    draw.line([(88, 150), (230, 120)], fill=(44, 29, 18, 255), width=30)
    draw.line([(300, 112), (430, 152)], fill=(44, 29, 18, 255), width=30)
    googly_eye(draw, 175, 260, 112, 0.45, 0.35, spiral=False)
    googly_eye(draw, 350, 250, 98, -0.1, 0.0, spiral=True)
    # Mouth.
    draw.chord([170, 330, 350, 450], 0, 180, fill=(90, 18, 32, 255), outline=(40, 12, 14, 255), width=10)
    draw.ellipse([220, 395, 300, 445], fill=(227, 106, 128, 255))
    img = img.resize((128, 128), Image.LANCZOS)
    save(img, "icon.png")


if __name__ == "__main__":
    make_white()
    make_elmo()
    make_icon()
