#!/usr/bin/env python3
"""Remove baked-in white borders/rounded-sticker frames from generated covers.

Some Imagen results come back as a rounded tile on a white background instead of
full-bleed. This scans src/assets/games/*.jpg, and ONLY for images whose four
corners are near-white, crops away the white frame, then zooms slightly to push
the rounded corners off-canvas so the art fills the whole square. Full-bleed
colour covers (corners not white) are left untouched.

Usage: python3 scripts/trim-borders.py [game-ids...]   # default: scan all
"""

import os
import sys
from PIL import Image, ImageChops

DIR = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "src", "assets", "games"))
OUT = 512
WHITE_MIN = 232      # a corner pixel is "white" if every channel >= this
DIFF_THRESH = 22     # content = pixels differing from white by more than this
ZOOM = 1.12          # extra zoom after cropping to hide rounded corners


def corner_is_white(px, w, h):
    pts = [(3, 3), (w - 4, 3), (3, h - 4), (w - 4, h - 4)]
    for (x, y) in pts:
        r, g, b = px[x, y][:3]
        if min(r, g, b) < WHITE_MIN:
            return False
    return True


def process(path):
    im = Image.open(path).convert("RGB")
    w, h = im.size
    px = im.load()
    if not corner_is_white(px, w, h):
        return "skip (full-bleed)"

    # Bounding box of everything that differs from white
    bg = Image.new("RGB", im.size, (255, 255, 255))
    diff = ImageChops.difference(im, bg).convert("L").point(lambda p: 255 if p > DIFF_THRESH else 0)
    bbox = diff.getbbox()
    if not bbox:
        return "skip (no content)"

    crop = im.crop(bbox)
    # Make it square (center-crop the longer side), then zoom to drop rounded corners
    side = min(crop.size)
    cx = (crop.width - side) // 2
    cy = (crop.height - side) // 2
    sq = crop.crop((cx, cy, cx + side, cy + side))
    zoomed = int(round(OUT * ZOOM))
    sq = sq.resize((zoomed, zoomed), Image.LANCZOS)
    off = (zoomed - OUT) // 2
    final = sq.crop((off, off, off + OUT, off + OUT))
    final.save(path, format="JPEG", quality=90)
    return f"trimmed (bbox={bbox})"


def main():
    only = set(sys.argv[1:])
    files = sorted(f for f in os.listdir(DIR) if f.endswith(".jpg"))
    changed = 0
    for f in files:
        gid = f[:-4]
        if only and gid not in only:
            continue
        result = process(os.path.join(DIR, f))
        print(f"{gid:22s} {result}")
        if result.startswith("trimmed"):
            changed += 1
    print(f"\n{changed} cover(s) trimmed.")


if __name__ == "__main__":
    main()
