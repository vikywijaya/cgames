#!/usr/bin/env python3
"""Generate square game cover art for CaritaHub Cognitive Games via Gemini Imagen 4.

Adapted from tv-multiplayer-games/generate-banners.py to match its unified
flat-3D illustration style. Writes 512x512 JPEGs to src/assets/games/<id>.jpg,
which the lobby picks up automatically (getGameImage prefers .jpg).

Usage:
    export GEMINI_API_KEY=...        # your Gemini API key
    python3 scripts/generate-covers.py            # generate every missing cover
    python3 scripts/generate-covers.py zip snake-lite   # only specific game ids
"""

import os
import io
import sys
import time
import base64
import json
import urllib.request
import urllib.error

from PIL import Image

API_KEY = os.environ.get("GEMINI_API_KEY", "")
if not API_KEY:
    raise RuntimeError("Set GEMINI_API_KEY environment variable before running this script.")
API_URL = f"https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key={API_KEY}"
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "..", "src", "assets", "games")
OUTPUT_SIZE = 512

# ── Unified style (same as the TV banners) ─────────────────────────────────────
STYLE = (
    "FULL BLEED flat illustration. The single chosen bright gradient background colour covers 100% of every pixel of the square canvas, "
    "including every edge and every corner. There is NOTHING between the background and the canvas edge — no vignette, no darker rim, no shadow wash at the edges, no frame, no border, no inner stroke, no outer stroke, no rounded corners, no mask, no drop-shadow on the background itself. "
    "Uniform flat background that keeps the same brightness at the centre and at the extreme corners. "
    "The hero object is centred in the frame, occupying roughly 55 to 65 percent of the canvas, with a small margin to every edge. "
    "High contrast between the hero and the background, crisp soft shadow directly beneath the hero only, bold saturated colours, soft cel-shading on the hero only. "
    "The hero must be fully visible inside the frame, not cropped, not cut off, with a small margin to the edges. "
    "This is a flat wallpaper illustration, NOT an app icon, NOT a rounded-corner tile, NOT a sticker, NOT a badge, NOT a logo, NOT a card, NOT a poster frame. "
    "NO vignette, NO darkening at edges or corners, NO rim of another colour, NO halo, NO glow wash on the background, NO gradient ring, NO inner frame, NO border stripe, NO decorative elements near the edges — edges stay perfectly uniform. "
    "NO humans NO people NO faces NO hands NO fingers NO clothing, "
    "NO text NO letters NO numbers NO watermarks NO logos, "
    "NO photo-realism NO stock photo NO tiling NO repetition."
)

# ── Our games that lack a matching TV cover (keyed by our game id) ──────────────
GAMES = [
    ("balloon-pop",
     f"Hero: a cheerful cluster of glossy 3D party balloons — coral pink, teal, yellow and purple — with curly string tails, one balloon mid-pop with a tiny confetti burst. "
     f"Background: a single uniform bright sky-blue solid colour covering the entire canvas edge to edge. {STYLE}"),

    ("whack-a-mole",
     f"Hero: a cute chubby 3D mole popping up out of a round dirt hole, with a soft wooden mallet hovering playfully above it. "
     f"Background: a single uniform fresh grass-green solid colour covering the entire canvas edge to edge. {STYLE}"),

    ("word-search",
     f"Hero: a large shiny 3D magnifying glass with a golden rim hovering over a soft cream rounded grid of blank tiles, one tile glowing yellow. "
     f"Background: a single uniform warm teal solid colour covering the entire canvas edge to edge. {STYLE}"),

    ("right-time",
     f"Hero: a friendly chunky 3D analog clock with a cream face, bold rounded hands and a soft blue rim, tilted slightly. "
     f"Background: a single uniform warm coral-orange solid colour covering the entire canvas edge to edge. {STYLE}"),

    ("catch-falling-fruit",
     f"Hero: a cute rounded stylised 3D basket, smooth and toy-like, catching three glossy cartoon 3D fruits tumbling from above — a shiny red apple, a round orange and a bunch of purple grapes — all with smooth plastic surfaces and soft cel-shading, like polished pieces in a premium mobile game. NOT photorealistic, NOT a real wicker basket, NOT a real photo of fruit — stylised cartoon game-art render. "
     f"Background: a single uniform sunny yellow solid colour covering the entire canvas edge to edge. {STYLE}"),

    ("odd-one-out",
     f"Hero: a neat 2x2 cluster of four glossy 3D shapes — three identical teal circles and one cheeky bright orange star that clearly stands out. "
     f"Background: a single uniform soft purple solid colour covering the entire canvas edge to edge. {STYLE}"),

    ("spot-difference",
     f"Hero: a large shiny 3D magnifying glass with a golden rim hovering over two identical small rounded glossy picture tiles placed side by side, each tile showing the same simple cheerful shape, toy-like with soft cel-shading, like polished pieces in a premium mobile game. NOT photorealistic, NO people, NO scenery, NO text. "
     f"Background: a single uniform warm teal solid colour covering the entire canvas edge to edge. {STYLE}"),

    ("letter-count",
     f"Hero: a colourful 3D abacus with rows of chunky sliding beads in red, yellow and blue, a few beads pushed to one side. "
     f"Background: a single uniform deep indigo solid colour covering the entire canvas edge to edge. {STYLE}"),

    ("flag-quiz",
     f"Hero: a row of three little 3D triangular pennant flags on a string in red, blue and yellow, gently waving. "
     f"Background: a single uniform bright sky-blue solid colour covering the entire canvas edge to edge. {STYLE}"),

    ("capital-quiz",
     f"Hero: a glossy 3D globe of the earth in blue and green with a bright red rounded location pin planted on top of it. "
     f"Background: a single uniform warm teal solid colour covering the entire canvas edge to edge. {STYLE}"),

    ("currency-quiz",
     f"Hero: a small stack of shiny 3D gold coins next to a rolled banknote and a plump coin purse, no symbols or text on them. "
     f"Background: a single uniform forest-green solid colour covering the entire canvas edge to edge. {STYLE}"),

    ("landmark-quiz",
     f"Hero: a stylised 3D ancient stone monument arch and a tall tapered tower side by side, like generic world landmarks, on a small ground disc. "
     f"Background: a single uniform sunset-orange solid colour covering the entire canvas edge to edge. {STYLE}"),

    ("snake-lite",
     f"Hero: a classic arcade video-game snake built from a chain of glossy rounded bright-green cube segments arranged in a friendly S-curve, with a single shiny red apple in front of it. Toy-like, geometric, cheerful — like the snake in a retro mobile game, NOT a realistic animal. "
     f"Background: a single uniform deep teal solid colour covering the entire canvas edge to edge. {STYLE}"),

    ("tile-flip",
     f"Hero: a 3x3 grid of glossy 3D rounded tiles, most face-down in slate blue and two flipped up glowing bright yellow. "
     f"Background: a single uniform indigo solid colour covering the entire canvas edge to edge. {STYLE}"),

    ("block-puzzle",
     f"Hero: a playful cluster of chunky 3D puzzle blocks in orange, blue and green, like loose tetromino pieces, stacked at gentle angles. "
     f"Background: a single uniform warm amber solid colour covering the entire canvas edge to edge. {STYLE}"),

    ("flappy-numbers",
     f"Hero: a round chubby 3D yellow bird character with tiny wings mid-flap, flying between two green rounded pipe gaps. "
     f"Background: a single uniform bright sky-blue solid colour covering the entire canvas edge to edge. {STYLE}"),

    ("zip",
     f"Hero: a single glowing neon path that loops and snakes through a grid of small round dots, connecting them with a smooth gradient line from blue to pink. "
     f"Background: a single uniform deep navy solid colour covering the entire canvas edge to edge. {STYLE}"),

    # ── Coming-soon games (optional) ──
    ("dot-ed",
     f"Hero: glowing 3D red dots and blue target rings connected by smooth bright lines across a soft grid. "
     f"Background: a single uniform deep indigo solid colour covering the entire canvas edge to edge. {STYLE}"),

    ("tangram",
     f"Hero: seven flat 3D geometric tangram pieces — triangles, a square and a parallelogram in red, teal, yellow and blue — arranged into a neat abstract figure. "
     f"Background: a single uniform soft purple solid colour covering the entire canvas edge to edge. {STYLE}"),

    ("slither-escape",
     f"Hero: three cute chubby 3D snakes in red, green and blue gently sliding toward small matching coloured exit gates. "
     f"Background: a single uniform fresh grass-green solid colour covering the entire canvas edge to edge. {STYLE}"),
]


def generate_image(prompt: str):
    payload = json.dumps({
        "instances": [{"prompt": prompt}],
        "parameters": {
            "sampleCount": 1,
            "aspectRatio": "1:1",
            "safetyFilterLevel": "block_only_high",
            "personGeneration": "dont_allow",
        }
    }).encode("utf-8")

    req = urllib.request.Request(
        API_URL, data=payload,
        headers={"Content-Type": "application/json"}, method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=90) as resp:
            data = json.loads(resp.read())
            if "predictions" not in data or not data["predictions"]:
                print(f"  No predictions returned: {json.dumps(data)[:300]}")
                return None
            b64 = data["predictions"][0].get("bytesBase64Encoded")
            if not b64:
                print(f"  Empty image data: {json.dumps(data['predictions'][0])[:300]}")
                return None
            return base64.b64decode(b64)
    except urllib.error.HTTPError as e:
        print(f"  HTTP {e.code}: {e.read().decode()[:200]}")
        return None
    except Exception as e:
        print(f"  Error: {e}")
        return None


def resize_to_output(img_bytes: bytes) -> bytes:
    im = Image.open(io.BytesIO(img_bytes)).convert("RGB")
    if im.size != (OUTPUT_SIZE, OUTPUT_SIZE):
        im = im.resize((OUTPUT_SIZE, OUTPUT_SIZE), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, format="JPEG", quality=90)
    return buf.getvalue()


def main():
    out_dir = os.path.normpath(OUTPUT_DIR)
    os.makedirs(out_dir, exist_ok=True)
    only = set(sys.argv[1:])  # optional list of game ids to limit to

    total = len(GAMES)
    generated = 0
    for i, (game_id, prompt) in enumerate(GAMES, 1):
        if only and game_id not in only:
            continue
        out_path = os.path.join(out_dir, f"{game_id}.jpg")
        print(f"[{i}/{total}] {game_id} ...", flush=True)
        img_bytes = generate_image(prompt)
        if img_bytes:
            with open(out_path, "wb") as f:
                f.write(resize_to_output(img_bytes))
            print(f"  ✓ saved {out_path} ({os.path.getsize(out_path)//1024}KB)")
            generated += 1
        else:
            print("  ✗ failed — skipping")
        if i < total:
            time.sleep(2)

    print(f"\nAll done! {generated} cover(s) saved to {out_dir}")
    print("Note: a generated <id>.jpg supersedes any old <id>.png/.svg (getGameImage prefers .jpg).")
    print("If an old placeholder remains, delete src/assets/games/<id>.png|.svg for that id.")


if __name__ == "__main__":
    main()
