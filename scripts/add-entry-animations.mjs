/**
 * scripts/add-entry-animations.mjs
 * One-time script: injects popIn @keyframes + animation props into each
 * game's CSS, and adds style={{ '--idx': i }} to mapped interactive elements
 * in each game's JSX.
 *
 * Usage: node scripts/add-entry-animations.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/games');

const KEYFRAMES = `
@keyframes popIn {
  0%   { opacity: 0; transform: scale(0.5) translateY(12px); }
  60%  { opacity: 1; transform: scale(1.08) translateY(-2px); }
  80%  { transform: scale(0.96) translateY(1px); }
  100% { opacity: 1; transform: scale(1) translateY(0); }
}
`;

const ANIM_LINES = [
  '  animation: popIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) both;',
  '  animation-delay: calc(var(--idx, 0) * 0.07s);',
].join('\n');

// ── CSS patches ─────────────────────────────────────────────────────────────
// [game, cssFile, targetClass]
const CSS_PATCHES = [
  ['CapitalQuiz',   'CapitalQuiz.module.css',   '.optBtn'],
  ['CurrencyQuiz',  'CurrencyQuiz.module.css',  '.optBtn'],
  ['FaceMemory',    'FaceMemory.module.css',    '.optBtn'],
  ['FlagQuiz',      'FlagQuiz.module.css',      '.optBtn'],
  ['LandmarkQuiz',  'LandmarkQuiz.module.css',  '.optBtn'],
  ['LetterCount',   'LetterCount.module.css',   '.optBtn'],
  ['MissingNumber', 'MissingNumber.module.css', '.optBtn'],
  ['QuickMaths',    'QuickMaths.module.css',    '.optBtn'],
  ['RightTime',     'RightTime.module.css',     '.optBtn'],
  ['StroopColour',  'StroopColour.module.css',  '.optBtn'],
  ['NumberSort',    'NumberSort.module.css',    '.numBtn'],
  ['ShoppingList',  'ShoppingList.module.css',  '.choiceBtn'],
  ['OddOneOut',     'OddOneOut.module.css',     '.cell'],
  ['SpeedTap',      'SpeedTap.module.css',      '.cell'],
  ['WordSearch',    'WordSearch.module.css',    '.cell'],
  ['SpotDifference','SpotDifference.module.css','.cell'],
  ['TileFlip',      'TileFlip.module.css',      '.tile'],
  ['ColourMemory',  'ColourMemory.module.css',  '.tile'],
  ['WhackAMole',    'WhackAMole.module.css',    '.hole'],
  ['WordRecall',    'WordRecall.module.css',    '.wordChip'],
  ['PatternSequence','PatternSequence.module.css','.pad'],
  ['BalloonPop',    'BalloonPop.module.css',    '.balloon'],
];

function patchCss(game, file, cls) {
  const filePath = path.join(ROOT, game, file);
  let src = fs.readFileSync(filePath, 'utf8');

  if (src.includes('@keyframes popIn')) {
    console.log(`  [skip-css] ${game} — already has popIn`);
    return;
  }

  // Prepend keyframes
  src = KEYFRAMES + src;

  // Find the first occurrence of the class rule (e.g. ".optBtn {" or ".optBtn{")
  // and insert animation lines before the closing brace.
  const clsEscaped = cls.replace('.', '\\.');
  // Match the rule block — handles both inline and multi-line rules
  const pattern = new RegExp(`(${clsEscaped}\\s*\\{)([^}]*)(\\})`, 's');
  if (!pattern.test(src)) {
    console.warn(`  [warn] ${game}: class ${cls} not found — skipping CSS`);
    return;
  }
  src = src.replace(pattern, (_, open, body, close) => {
    // Avoid adding duplicates if script is re-run
    if (body.includes('popIn')) return _ ;
    return `${open}${body}${ANIM_LINES}\n${close}`;
  });

  fs.writeFileSync(filePath, src);
  console.log(`  [css]  ${game} — patched ${cls}`);
}

// ── JSX patches ──────────────────────────────────────────────────────────────
// Each entry: [game, jsxFile, searchStr, replaceStr]
// We add style={{ '--idx': i }} to the interactive element's JSX.
// For maps that lacked an index param we also add it.
const JSX_PATCHES = [
  // Quiz games — add style to <button inside options.map
  ['CapitalQuiz', 'CapitalQuiz.jsx',
    'question.options.map(opt => {',
    'question.options.map((opt, i) => {'],
  ['CapitalQuiz', 'CapitalQuiz.jsx',
    'className={cls}\n              onClick={() => handleChoice(opt)}',
    'className={cls}\n              style={{ \'--idx\': i }}\n              onClick={() => handleChoice(opt)}'],

  ['FlagQuiz', 'FlagQuiz.jsx',
    'question.options.map((opt) => {',
    'question.options.map((opt, i) => {'],
  ['FlagQuiz', 'FlagQuiz.jsx',
    'className={cls}\n              onClick={() => handleChoice(opt)}',
    'className={cls}\n              style={{ \'--idx\': i }}\n              onClick={() => handleChoice(opt)}'],

  ['StroopColour', 'StroopColour.jsx',
    'stimulus.options.map(opt => {',
    'stimulus.options.map((opt, i) => {'],

  // Games that already expose i — just add style to the button
  // These will be handled via targeted string replacements below
];

// For games that already have (opt, i) or (item, i), find the <button className={cls}
// and add style={{ '--idx': i }} to it. We'll do targeted per-file replacements.
const STYLE_INJECT = [
  // [game, file, anchor (unique string just before disabled/onClick), inject after anchor]
  ['CurrencyQuiz',  'CurrencyQuiz.jsx',
    "className={cls}\n              onClick={() => handleChoice(opt)}",
    "className={cls}\n              style={{ '--idx': i }}\n              onClick={() => handleChoice(opt)}"],
  ['FaceMemory',    'FaceMemory.jsx',
    "className={cls}\n              onClick={() => pick(opt)}",
    "className={cls}\n              style={{ '--idx': i }}\n              onClick={() => pick(opt)}"],
  ['LandmarkQuiz',  'LandmarkQuiz.jsx',
    "className={cls}\n              onClick={() => handleChoice(opt)}",
    "className={cls}\n              style={{ '--idx': i }}\n              onClick={() => handleChoice(opt)}"],
  ['LetterCount',   'LetterCount.jsx',
    "className={cls}\n              onClick={() => handleGuess(opt)}",
    "className={cls}\n              style={{ '--idx': i }}\n              onClick={() => handleGuess(opt)}"],
  ['MissingNumber', 'MissingNumber.jsx',
    "className={cls}\n              onClick={() => handleGuess(opt)}",
    "className={cls}\n              style={{ '--idx': i }}\n              onClick={() => handleGuess(opt)}"],
  ['QuickMaths',    'QuickMaths.jsx',
    "className={cls}\n              onClick={() => handleAnswer(opt)}",
    "className={cls}\n              style={{ '--idx': i }}\n              onClick={() => handleAnswer(opt)}"],
  ['RightTime',     'RightTime.jsx',
    "className={cls}\n              onClick={() => handleChoice(opt)}",
    "className={cls}\n              style={{ '--idx': i }}\n              onClick={() => handleChoice(opt)}"],
];

function patchJsx(game, file, search, replace) {
  const filePath = path.join(ROOT, game, file);
  let src = fs.readFileSync(filePath, 'utf8');
  if (src.includes(replace.slice(0, 40))) {
    console.log(`  [skip-jsx] ${game}/${file} — already patched`);
    return;
  }
  if (!src.includes(search)) {
    console.warn(`  [warn] ${game}/${file}: search string not found — skipping`);
    return;
  }
  src = src.replace(search, replace);
  fs.writeFileSync(filePath, src);
  console.log(`  [jsx]  ${game}/${file}`);
}

// ── Run ───────────────────────────────────────────────────────────────────────
console.log('=== Patching CSS ===');
for (const [game, file, cls] of CSS_PATCHES) patchCss(game, file, cls);

console.log('\n=== Patching JSX (map index) ===');
for (const [game, file, s, r] of JSX_PATCHES) patchJsx(game, file, s, r);

console.log('\n=== Patching JSX (style prop) ===');
for (const [game, file, s, r] of STYLE_INJECT) patchJsx(game, file, s, r);

console.log('\nDone.');
