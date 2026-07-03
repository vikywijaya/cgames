#!/usr/bin/env python3
"""Center the hero object within each square cover.

Some covers (esp. the copied TV ones) place the hero high/off to one side with
dead background space. This detects the hero (pixels that differ strongly from
the flat background colour), then crops the largest square window centred on the
hero and rescales to 512 — no fill, so flat/vignette backgrounds stay seamless.

Usage: python3 scripts/center-hero.py [game-ids...]   # default: all
"""

import os
import sys
from PIL import Image

DIR = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "src", "assets", "games"))
OUT = 512
THRESH = 48       # channel diff from background to count as "hero"
MIN_SIDE = 320    # never crop tighter than this (caps zoom ~1.6x)
MARGIN = 1.12     # breathing room around the hero bbox


def bg_color(px, w, h):
    pts = [(3, 3), (w - 4, 3), (3, h - 4), (w - 4, h - 4),
           (w // 2, 3), (w // 2, h - 4)]
    r = sum(px[x, y][0] for x, y in pts) // len(pts)
    g = sum(px[x, y][1] for x, y in pts) // len(pts)
    b = sum(px[x, y][2] for x, y in pts) // len(pts)
    return (r, g, b)


def hero_bbox(im, bg):
    w, h = im.size
    px = im.load()
    br, bg_, bb = bg
    x0, y0, x1, y1 = w, h, 0, 0
    found = False
    step = 2
    for y in range(0, h, step):
        for x in range(0, w, step):
            r, g, b = px[x, y][:3]
            if abs(r - br) + abs(g - bg_) + abs(b - bb) > THRESH * 3:
                found = True
                if x < x0: x0 = x
                if y < y0: y0 = y
                if x > x1: x1 = x
                if y > y1: y1 = y
    if not found:
        return None
    return (x0, y0, x1, y1)


def process(path):
    im = Image.open(path).convert("RGB")
    w, h = im.size
    if (w, h) != (OUT, OUT):
        im = im.resize((OUT, OUT), Image.LANCZOS)
        w, h = OUT, OUT
    bg = bg_color(im.load(), w, h)
    bbox = hero_bbox(im, bg)
    if not bbox:
        return "skip (no hero)"
    x0, y0, x1, y1 = bbox
    hcx = (x0 + x1) / 2
    hcy = (y0 + y1) / 2
    hero_side = max(x1 - x0, y1 - y0) * MARGIN

    # Largest square centred on the hero that still fits in the image
    half = min(hcx, hcy, w - hcx, h - hcy)
    S = int(round(min(2 * half, w)))
    S = max(S, int(round(hero_side)), MIN_SIDE)
    S = min(S, w)

    # Centre the window on the hero, then clamp inside the image
    left = int(round(hcx - S / 2))
    top = int(round(hcy - S / 2))
    left = max(0, min(left, w - S))
    top = max(0, min(top, h - S))

    if S >= w and left == 0 and top == 0:
        return "skip (already centred/full)"

    crop = im.crop((left, top, left + S, top + S)).resize((OUT, OUT), Image.LANCZOS)
    crop.save(path, format="JPEG", quality=90)
    return f"centred (bbox={bbox}, crop={S}px @ {left},{top})"


def main():
    only = set(sys.argv[1:])
    changed = 0
    for f in sorted(os.listdir(DIR)):
        if not f.endswith(".jpg"):
            continue
        gid = f[:-4]
        if only and gid not in only:
            continue
        res = process(os.path.join(DIR, f))
        print(f"{gid:22s} {res}")
        if res.startswith("centred"):
            changed += 1
    print(f"\n{changed} cover(s) re-centred.")


if __name__ == "__main__":
    main()
