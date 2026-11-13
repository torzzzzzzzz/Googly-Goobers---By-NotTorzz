#!/usr/bin/env python3
"""Builds Googly Goobers' icons and logo.

    python3 tools/make_branding.py

Inputs:
  branding/source/googly-goobers-artwork.webp   the project's profile picture (icon artwork)

Outputs:
  src/main/resources/assets/eyeball/icon.png    in-game mod icon (Mod Menu, the settings menu), 256 x 256
  branding/modrinth-icon.png                    Modrinth project icon (the largest size under Modrinth's 256 KiB limit)
  branding/logo.png                             the "Googly Goobers" wordmark on a transparent background
  branding/banner.png                           the wordmark on a sky background (README / Modrinth header)

The wordmark is drawn from scratch: chunky letters are snapped to a voxel grid, given a dark
outline and a 3D extrusion, and the "oo" of "Googly" are replaced by real googly eyes.
Deterministic: running it again produces the same files.
"""
from __future__ import annotations

import io
import math
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, ".."))
ARTWORK = os.path.join(ROOT, "branding", "source", "googly-goobers-artwork.webp")
MOD_ICON = os.path.join(ROOT, "src", "main", "resources", "assets", "eyeball", "icon.png")
BRANDING = os.path.join(ROOT, "branding")
FONT_CANDIDATES = [
    "/usr/share/fonts/opentype/inter/Inter-Black.otf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
]
MODRINTH_ICON_LIMIT = 256 * 1024

OUTLINE = (29, 24, 22)
GOOGLY_TOP = (255, 255, 255)
GOOGLY_BOTTOM = (214, 219, 230)
GOOGLY_SIDE = (124, 132, 150)
GOOBERS_TOP = (255, 226, 92)
GOOBERS_BOTTOM = (255, 150, 28)
GOOBERS_SIDE = (176, 92, 12)


def rel(path: str) -> str:
    return os.path.relpath(path, ROOT)


def save_png(img: Image.Image, path: str) -> int:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path, optimize=True)
    size = os.path.getsize(path)
    print(f"wrote {rel(path)} ({img.width}x{img.height}, {size // 1024} KiB)")
    return size


# ------------------------------------------------------------------------------------------ icons

def make_icons() -> None:
    art = Image.open(ARTWORK).convert("RGB")
    save_png(art.resize((256, 256), Image.LANCZOS), MOD_ICON)
    # Modrinth shows the icon at up to ~96 px; 512 px keeps it sharp on high-DPI screens. Fall back
    # to smaller sizes if the PNG would be over Modrinth's size limit.
    for size in (512, 448, 400, 384, 320):
        buffer = io.BytesIO()
        icon = art.resize((size, size), Image.LANCZOS)
        icon.save(buffer, format="PNG", optimize=True)
        if buffer.tell() <= MODRINTH_ICON_LIMIT:
            break
    else:
        icon = icon.quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.FLOYDSTEINBERG).convert("RGB")
    path = os.path.join(BRANDING, "modrinth-icon.png")
    if os.path.exists(path):
        os.remove(path)
    written = save_png(icon, path)
    assert written <= MODRINTH_ICON_LIMIT, "Modrinth icon is too large"


# ------------------------------------------------------------------------------------------ logo

def load_font(size: int) -> ImageFont.FreeTypeFont:
    for candidate in FONT_CANDIDATES:
        if os.path.exists(candidate):
            return ImageFont.truetype(candidate, size)
    raise SystemExit("No suitable bold font found")


def text_mask(text: str, font: ImageFont.FreeTypeFont, block: int) -> np.ndarray:
    """Renders text and snaps it to a coarse voxel grid (each cell is `block` pixels)."""
    left, top, right, bottom = font.getbbox(text)
    pad = block * 2
    w, h = right - left + pad * 2, bottom - top + pad * 2
    img = Image.new("L", (w, h), 0)
    ImageDraw.Draw(img).text((pad - left, pad - top), text, font=font, fill=255)
    cells = img.resize((max(1, w // block), max(1, h // block)), Image.BOX)
    blocky = cells.point(lambda v: 255 if v >= 118 else 0).resize((cells.width * block, cells.height * block), Image.NEAREST)
    return np.asarray(blocky) > 0


def trim(mask: np.ndarray) -> np.ndarray:
    ys, xs = np.nonzero(mask)
    return mask[ys.min():ys.max() + 1, xs.min():xs.max() + 1]


def vertical_gradient(h: int, w: int, top: tuple[int, int, int], bottom: tuple[int, int, int]) -> np.ndarray:
    t = np.linspace(0.0, 1.0, h)[:, None, None]
    return (np.array(top)[None, None, :] * (1 - t) + np.array(bottom)[None, None, :] * t).repeat(w, axis=1)


def dilate(mask: np.ndarray, radius: int) -> np.ndarray:
    img = Image.fromarray((mask * 255).astype(np.uint8))
    return np.asarray(img.filter(ImageFilter.MaxFilter(radius * 2 + 1))) > 0


def shift_down(mask: np.ndarray, dy: int) -> np.ndarray:
    out = np.zeros_like(mask)
    out[dy:] = mask[:-dy] if dy > 0 else mask
    return out


class Canvas:
    def __init__(self, w: int, h: int):
        self.rgba = np.zeros((h, w, 4), dtype=np.float32)

    def paint(self, mask: np.ndarray, x: int, y: int, color) -> None:
        """Paints `color` (an RGB tuple or an h x w x 3 array) through `mask` at (x, y)."""
        h, w = mask.shape
        region = self.rgba[y:y + h, x:x + w]
        rgb = np.broadcast_to(np.asarray(color, dtype=np.float32), (h, w, 3))
        region[mask, :3] = rgb[mask]
        region[mask, 3] = 255

    def image(self) -> Image.Image:
        return Image.fromarray(np.clip(self.rgba, 0, 255).astype(np.uint8), "RGBA")


def fill_holes(mask: np.ndarray) -> np.ndarray:
    """The mask with every enclosed hole (letter counters) filled in."""
    outside = np.zeros_like(mask)
    h, w = mask.shape
    stack = [(0, 0)]
    outside[0, 0] = True
    while stack:
        y, x = stack.pop()
        for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
            if 0 <= ny < h and 0 <= nx < w and not outside[ny, nx] and not mask[ny, nx]:
                outside[ny, nx] = True
                stack.append((ny, nx))
    return ~outside


def styled_word(canvas: Canvas, mask: np.ndarray, x: int, y: int, block: int, top, bottom, side) -> None:
    h, w = mask.shape
    depth = block * 2
    outline = block // 2 + 2
    pad = outline + depth + 2
    big = np.zeros((h + pad * 2, w + pad * 2), dtype=bool)
    big[pad:pad + h, pad:pad + w] = mask
    # The 3D side only shows below the outer silhouette; the letter counters stay dark cut-outs.
    solid = fill_holes(big)
    extrude = np.zeros_like(big)
    for dy in range(1, depth + 1):
        extrude |= shift_down(solid, dy)
    canvas.paint(dilate(solid | extrude, outline), x - pad, y - pad, OUTLINE)
    canvas.paint(extrude & ~solid, x - pad, y - pad, side)
    fill = vertical_gradient(big.shape[0], big.shape[1], top, bottom)
    canvas.paint(big, x - pad, y - pad, fill)
    # A light bevel along the top edges of every voxel letter.
    bevel = big & ~shift_down(big, block // 3)
    canvas.paint(bevel, x - pad, y - pad, tuple(min(255, c + 30) for c in top))


def googly_eye(img: Image.Image, cx: float, cy: float, r: float, look: tuple[float, float]) -> None:
    """A 3D-looking googly eye: black rim, shaded white dome, a loose pupil and highlights."""
    scale = 4
    size = int(r * 2.6)
    layer = Image.new("RGBA", (size * scale, size * scale), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    c = size * scale / 2
    R = r * scale
    # Extrusion / drop shadow below the eye.
    d.ellipse([c - R, c - R + R * 0.16, c + R, c + R + R * 0.16], fill=OUTLINE + (255,))
    d.ellipse([c - R, c - R, c + R, c + R], fill=OUTLINE + (255,))
    inner = R * 0.84
    # Dome: radial shading from white in the middle to blue-grey at the edge.
    steps = 40
    for i in range(steps):
        t = i / (steps - 1)
        rr = inner * (1 - t * 0.98)
        shade = tuple(int(a + (b - a) * (1 - t) ** 2.2) for a, b in zip((255, 255, 255), (196, 204, 222)))
        off = R * 0.05 * t
        d.ellipse([c - rr - off, c - rr - off, c + rr - off, c + rr - off], fill=shade + (255,))
    pr = inner * 0.5
    px = c + look[0] * (inner - pr) * 0.9
    py = c + look[1] * (inner - pr) * 0.9
    d.ellipse([px - pr, py - pr, px + pr, py + pr], fill=(12, 12, 16, 255))
    hr = pr * 0.32
    d.ellipse([px + pr * 0.15 - hr, py - pr * 0.55 - hr, px + pr * 0.15 + hr, py - pr * 0.55 + hr], fill=(255, 255, 255, 255))
    hr2 = pr * 0.13
    d.ellipse([px - pr * 0.4 - hr2, py + pr * 0.25 - hr2, px - pr * 0.4 + hr2, py + pr * 0.25 + hr2], fill=(255, 255, 255, 230))
    layer = layer.resize((size, size), Image.LANCZOS)
    img.alpha_composite(layer, (int(cx - size / 2), int(cy - size / 2)))


def make_logo() -> Image.Image:
    block = 12
    font = load_font(320)
    g_mask = trim(text_mask("G", font, block))
    gly_mask = trim(text_mask("gly", font, block))
    goobers_mask = trim(text_mask("Goobers", font, block))
    letter_h = g_mask.shape[0]
    eye_r = letter_h * 0.36
    gap = block * 2

    # Line 1: G (eye)(eye) gly. Line 2: Goobers, overlapping a little like a sticker logo.
    line1_w = g_mask.shape[1] + gap + int(eye_r * 2) * 2 + gap * 2 + gly_mask.shape[1]
    line2_w = goobers_mask.shape[1]
    margin = 70
    width = max(line1_w, line2_w) + margin * 2
    line1_y = margin
    line2_y = line1_y + int(letter_h * 1.1)
    height = line2_y + goobers_mask.shape[0] + int(letter_h * 0.62) + margin
    canvas = Canvas(width, height)

    x1 = (width - line1_w) // 2
    # "gly" sits on the baseline of "G" (its descender hangs below).
    gly_y = line1_y + (font.getbbox("gly")[1] - font.getbbox("G")[1])
    x2 = (width - line2_w) // 2
    styled_word(canvas, goobers_mask, x2, line2_y, block, GOOBERS_TOP, GOOBERS_BOTTOM, GOOBERS_SIDE)
    styled_word(canvas, g_mask, x1, line1_y, block, GOOGLY_TOP, GOOGLY_BOTTOM, GOOGLY_SIDE)
    gly_x = x1 + g_mask.shape[1] + gap + int(eye_r * 2) * 2 + gap * 2
    styled_word(canvas, gly_mask, gly_x, gly_y, block, GOOGLY_TOP, GOOGLY_BOTTOM, GOOGLY_SIDE)
    img = canvas.image()

    # The two googly eyes replace "oo", looking in different directions.
    eye_y = line1_y + letter_h * 0.56
    e1 = x1 + g_mask.shape[1] + gap + eye_r
    e2 = e1 + eye_r * 2 + gap
    googly_eye(img, e1, eye_y, eye_r, (0.55, 0.35))
    googly_eye(img, e2, eye_y - eye_r * 0.05, eye_r * 1.04, (-0.25, -0.5))

    # A big cartoon smile under "Goobers".
    smile = Image.new("RGBA", img.size, (0, 0, 0, 0))
    sd = ImageDraw.Draw(smile)
    sy = line2_y + goobers_mask.shape[0] + int(letter_h * 0.02)
    box = [x2 + line2_w * 0.12, sy - letter_h * 0.62, x2 + line2_w * 0.88, sy + letter_h * 0.42]
    sd.arc(box, 22, 158, fill=OUTLINE + (255,), width=46)
    sd.arc([box[0], box[1] - 6, box[2], box[3] - 6], 25, 155, fill=GOOBERS_TOP + (255,), width=22)
    img = Image.alpha_composite(smile, img)

    # Comic "action lines" at both ends of "Goobers".
    lines = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ld = ImageDraw.Draw(lines)
    cy = line2_y + goobers_mask.shape[0] * 0.45
    for side, x in ((-1, x2 - 28), (1, x2 + line2_w + 28)):
        for k, angle in enumerate((-32, 0, 32)):
            a = math.radians(angle)
            length = 70 if angle == 0 else 56
            sx, sy0 = x, cy + k * 0 + math.sin(a) * 60
            ex, ey = sx + side * math.cos(a) * length, sy0 + math.sin(a) * length
            ld.line([(sx, sy0), (ex, ey)], fill=OUTLINE + (255,), width=26)
            ld.line([(sx, sy0), (ex, ey)], fill=GOOBERS_TOP + (255,), width=12)
    img = Image.alpha_composite(lines, img)
    return img.crop(img.getbbox())


def make_banner(logo: Image.Image) -> Image.Image:
    w, h = 1920, 720
    sky = vertical_gradient(h, w, (78, 160, 255), (178, 224, 255)).astype(np.uint8)
    banner = Image.fromarray(sky, "RGB").convert("RGBA")
    d = ImageDraw.Draw(banner)
    # Blocky clouds and a grassy ground strip, drawn on a voxel grid to match the letters.
    cell = 24
    for cx, cy, cw in ((90, 80, 9), (1500, 60, 12), (1040, 40, 7), (180, 470, 6), (1690, 430, 8)):
        # A wide lower slab with a narrower slab on top.
        d.rectangle([cx, cy + cell, cx + cw * cell - 1, cy + cell * 3 - 1], fill=(255, 255, 255, 235))
        d.rectangle([cx + cell * 2, cy, cx + (cw - 2) * cell - 1, cy + cell - 1], fill=(255, 255, 255, 235))
    ground = h - 90
    for i in range(0, w, cell):
        top = ground + (cell if (i // cell) % 5 == 2 else 0)
        d.rectangle([i, top, i + cell - 1, h], fill=(121, 85, 58, 255))
        d.rectangle([i, top, i + cell - 1, top + cell - 1], fill=(108, 190, 76, 255) if (i // cell) % 3 else (94, 172, 64, 255))
    target_h = int(h * 0.82)
    scaled = logo.resize((int(logo.width * target_h / logo.height), target_h), Image.LANCZOS)
    if scaled.width > w - 80:
        scaled = logo.resize((w - 80, int(logo.height * (w - 80) / logo.width)), Image.LANCZOS)
    banner.alpha_composite(scaled, ((w - scaled.width) // 2, (h - 60 - scaled.height) // 2 + 10))
    return banner.convert("RGB")


if __name__ == "__main__":
    make_icons()
    logo = make_logo()
    save_png(logo, os.path.join(BRANDING, "logo.png"))
    save_png(make_banner(logo), os.path.join(BRANDING, "banner.png"))
