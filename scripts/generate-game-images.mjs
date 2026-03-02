#!/usr/bin/env node
/**
 * scripts/generate-game-images.mjs
 *
 * Generates game card images using Google Imagen 3 (via the Gemini API)
 * and saves them as PNG files to src/assets/games/<game-id>.png
 *
 * Usage:
 *   GEMINI_API_KEY=... node scripts/generate-game-images.mjs
 *   node scripts/generate-game-images.mjs <api-key>
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const API_KEY = process.env.GEMINI_API_KEY || process.argv[2];
if (!API_KEY) {
  console.error('ERROR: set GEMINI_API_KEY env var or pass the key as the first argument.');
  process.exit(1);
}

const OUT_DIR = path.resolve(__dirname, '../src/assets/games');
fs.mkdirSync(OUT_DIR, { recursive: true });

const STYLE =
  'flat digital illustration, vibrant colors, clean white background, ' +
  'no text or letters, square composition, cute and friendly art style, game card thumbnail';

const GAMES = [
  { id: 'memory-match',        prompt: `Two matching playing cards face up on a green felt surface, ${STYLE}` },
  { id: 'word-recall',         prompt: `A glowing lightbulb with colorful alphabet letters floating around it, ${STYLE}` },
  { id: 'colour-memory',       prompt: `Four large round glowing buttons — red, blue, green, yellow — on a dark panel in sequence, ${STYLE}` },
  { id: 'face-memory',         prompt: `Two friendly cartoon portrait photos pinned on a corkboard connected by a string, ${STYLE}` },
  { id: 'shopping-list',       prompt: `A shopping cart overflowing with colorful groceries and produce, ${STYLE}` },
  { id: 'pattern-sequence',    prompt: `A 4x4 grid of square buttons with an electric blue diagonal pattern highlighted on a dark background, ${STYLE}` },
  { id: 'balloon-pop',         prompt: `Colorful red green yellow blue balloons floating up against a bright sunny sky, ${STYLE}` },
  { id: 'whack-a-mole',        prompt: `A cute brown mole popping out of a round hole in bright green grass with a surprised expression, ${STYLE}` },
  { id: 'speed-tap',           prompt: `A bright yellow star target surrounded by various colorful decoy shapes — circles triangles diamonds, ${STYLE}` },
  { id: 'stroop-colour',       prompt: `Bold color swatches of red blue green and yellow arranged in a playful overlapping grid, ${STYLE}` },
  { id: 'daily-arithmetic',    prompt: `Large colorful 3D numerals and plus equals symbols arranged on a bright cheerful background, ${STYLE}` },
  { id: 'number-sort',         prompt: `Numbers 1 through 5 displayed on colorful ascending bar chart tiles, ${STYLE}` },
  { id: 'missing-number',      prompt: `A row of colorful numbered tiles with a bold question mark tile in the middle gap, ${STYLE}` },
  { id: 'quick-maths',         prompt: `A lightning bolt surrounded by colorful math symbols plus minus multiply and bold numbers, ${STYLE}` },
  { id: 'word-search',         prompt: `A grid of letters with a single word highlighted diagonally in bright blue, ${STYLE}` },
  { id: 'right-time',          prompt: `A bright cheerful analog clock with bold colorful hands pointing to 3:20, ${STYLE}` },
  { id: 'catch-falling-fruit', prompt: `Colorful fruits — apple orange banana strawberry — falling from above toward a woven basket, ${STYLE}` },
  { id: 'odd-one-out',         prompt: `A neat row of four identical red circles with one blue square standing out among them, ${STYLE}` },
  { id: 'spot-difference',     prompt: `Two nearly identical colorful emoji grids side by side with small differences marked by red circles, ${STYLE}` },
  { id: 'letter-count',        prompt: `The letter A scattered many times in varying sizes and pastel colors across a white background, ${STYLE}` },
  { id: 'flag-quiz',           prompt: `Three colorful national flags from different continents fluttering side by side, ${STYLE}` },
  { id: 'capital-quiz',        prompt: `A simplified colorful world map with bright red location pin markers on several key cities, ${STYLE}` },
  { id: 'currency-quiz',       prompt: `Assorted shiny gold coins and colorful banknotes from different countries fanned out, ${STYLE}` },
  { id: 'landmark-quiz',       prompt: `Eiffel Tower Big Ben and Colosseum colourful silhouettes lined up against a gradient sky, ${STYLE}` },
  { id: 'snake-lite',          prompt: `A cute green pixel-art snake on a dark grid board chasing a bright red apple, retro game art style, ${STYLE}` },
  { id: 'tile-flip',           prompt: `A 4x4 grid of square tiles — some glowing bright yellow and others dark navy blue, ${STYLE}` },
];

const API_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-001:predict?key=${API_KEY}`;

async function generateImage(game) {
  const outPath = path.join(OUT_DIR, `${game.id}.png`);
  if (fs.existsSync(outPath)) {
    console.log(`  [skip] ${game.id}.png already exists`);
    return;
  }

  console.log(`  [gen]  ${game.id} …`);

  const resp = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      instances: [{ prompt: game.prompt }],
      parameters: { sampleCount: 1, aspectRatio: '1:1' },
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`HTTP ${resp.status}: ${err}`);
  }

  const data = await resp.json();
  const b64 = data.predictions?.[0]?.bytesBase64Encoded;
  if (!b64) throw new Error('No image data in API response');

  fs.writeFileSync(outPath, Buffer.from(b64, 'base64'));
  console.log(`  [done] ${game.id}.png`);
}

async function main() {
  console.log(`Generating ${GAMES.length} game card images → ${OUT_DIR}\n`);
  let ok = 0;
  let fail = 0;
  for (const game of GAMES) {
    try {
      await generateImage(game);
      ok++;
    } catch (err) {
      console.error(`  [fail] ${game.id}: ${err.message}`);
      fail++;
    }
    // Brief pause between requests to respect rate limits
    await new Promise(r => setTimeout(r, 600));
  }
  console.log(`\nDone — ${ok} generated, ${fail} failed.`);
}

main();
