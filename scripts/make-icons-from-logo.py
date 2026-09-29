#!/usr/bin/env python3
"""
Build every app icon from the clinic's own logo.

Supersedes make-icons.mjs, which DREW a lotus because the only artwork that existed was a 176x68
wordmark and upscaling it 6x would have shipped something visibly soft. The real mark arrived on
28 Sep 2026 at 1920x1920, so the icons are cut from it instead — and the lotus is gone from the
phone as well as the website, which now carry the same brand.

Which crop goes where is the whole design, and it is the same reasoning as the favicon: a wordmark
does not survive being shrunk.

  icon / play icon      the enso ring on navy. A home-screen icon renders near 120px, where the
                        words are a smear and the ring is still unmistakably the logo.
  adaptive icon         the same ring, but at 45% so it clears Android's mask — an adaptive icon
                        can be cropped to a circle, and anything outside the middle 66% is at risk.
  splash                the full circular mark on Mist. A splash screen is large and still, so the
                        words are readable and worth showing.
  feature graphic       the wide lockup on navy: 1024x500 is wide enough to read comfortably.

Needs Pillow (`pip install pillow`). Run after changing assets/brand/logo-mark.png:

    python scripts/make-icons-from-logo.py
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
MASTER = ROOT / 'assets' / 'brand' / 'logo-mark.png'
OUT = ROOT / 'assets'

NAVY = (1, 3, 129, 255)      # the logo's own circle colour
MIST = (242, 247, 246, 255)  # BRAND.md app background

# The enso's bounding box inside the 1920px master, measured from the artwork itself.
ENSO = (932, 933, 88)        # centre x, centre y, half-width


def enso(master: Image.Image) -> Image.Image:
    cx, cy, half = ENSO
    return master.crop((cx - half, cy - half, cx + half, cy + half))


def centred(size: int, art: Image.Image, fraction: float, background) -> Image.Image:
    """`art` scaled to `fraction` of the canvas, centred, over a flat background."""
    canvas = Image.new('RGBA', (size, size), background)
    inner = round(size * fraction)
    scaled = art.resize((inner, inner), Image.LANCZOS)
    off = (size - inner) // 2
    canvas.alpha_composite(scaled, (off, off))
    return canvas


def feature(master: Image.Image, w: int, h: int) -> Image.Image:
    """Play's 1024x500 feature graphic: the wordmark band, lifted out of the circle."""
    band = master.crop((342 - 110, 848 - 95, 1576 + 110, 1072 + 95))
    canvas = Image.new('RGBA', (w, h), NAVY)
    target_w = round(w * 0.72)
    scaled = band.resize((target_w, round(target_w * band.size[1] / band.size[0])), Image.LANCZOS)
    canvas.alpha_composite(scaled, ((w - scaled.size[0]) // 2, (h - scaled.size[1]) // 2))
    return canvas


def in_app_lockup(master: Image.Image, width: int) -> Image.Image:
    """The wide wordmark on navy, for the sign-in and registration screens.

    Drawn at 3x the size it is displayed at, because React Native picks the nearest density and
    a phone is 2x or 3x — a 1x asset is visibly soft, which is the whole reason the lotus was
    drawn in code before this file existed.
    """
    band = master.crop((342 - 110, 848 - 95, 1576 + 110, 1072 + 95))
    h = round(width * band.size[1] / band.size[0])
    canvas = Image.new('RGBA', (width, h), NAVY)
    canvas.alpha_composite(band.resize((width, h), Image.LANCZOS))
    return canvas


def main() -> None:
    master = Image.open(MASTER).convert('RGBA')
    ring = enso(master)

    files = [
        ('icon.png', centred(1024, ring, 0.58, NAVY)),
        ('play-icon-512.png', centred(512, ring, 0.58, NAVY)),
        # Transparent: the background comes from android.adaptiveIcon.backgroundColor in app.config.ts.
        ('adaptive-icon.png', centred(1024, ring, 0.45, (0, 0, 0, 0))),
        ('splash.png', centred(1024, master, 0.55, MIST)),
        ('favicon.png', centred(48, ring, 0.62, NAVY)),
        ('play-feature-1024x500.png', feature(master, 1024, 500)),
        # Displayed at ~240pt wide inside the app; 3x for a phone screen.
        ('brand/logo-lockup.png', in_app_lockup(master, 720)),
    ]
    for name, img in files:
        path = OUT / name
        img.save(path)
        print(f'  {name:26} {img.size[0]}x{img.size[1]}  {path.stat().st_size / 1024:.1f} KB')


if __name__ == '__main__':
    main()
