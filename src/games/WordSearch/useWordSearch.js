// Pure puzzle helpers for Word Search (no React here so they are easy to test).

export const DIFFICULTY_CONFIG = {
  easy:   { puzzles: 3, size: 7, wordCount: 4, maxLen: 5, directions: ['H', 'V'] },
  medium: { puzzles: 3, size: 8, wordCount: 5, maxLen: 6, directions: ['H', 'V', 'D'] },
  hard:   { puzzles: 3, size: 9, wordCount: 6, maxLen: 8, directions: ['H', 'V', 'D', 'HR', 'VR', 'DR'] },
};

const DELTAS = {
  H: [0, 1], V: [1, 0], D: [1, 1], HR: [0, -1], VR: [-1, 0], DR: [1, -1],
};

// Filler letters for Latin-script languages (rare letters left out to keep grids friendly).
const LATIN = 'ABCDEFGHIJKLMNOPRSTUW';

export function shuffle(arr, rand = Math.random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Split a word into user-perceived letters (handles Tamil and Chinese). */
export function splitLetters(word) {
  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    const seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
    return Array.from(seg.segment(word), (s) => s.segment);
  }
  return Array.from(word);
}

function isLatin(word) {
  return /^[A-Za-z]+$/.test(word);
}

/**
 * Build one puzzle. Every word returned in `placed` is really in the grid,
 * so the puzzle can always be finished.
 */
export function generatePuzzle(config, bank, rand = Math.random) {
  const { size, wordCount, maxLen, directions } = config;
  const candidates = [...new Set(bank.map((w) => (isLatin(w) ? w.toUpperCase() : w)))]
    .map((w) => ({ word: w, letters: splitLetters(w) }))
    .filter((w) => w.letters.length >= 2 && w.letters.length <= Math.min(maxLen, size));
  const latin = candidates.every((w) => isLatin(w.word));
  const fillerPool = latin ? LATIN.split('') : [...new Set(candidates.flatMap((w) => w.letters))];

  let best = null;
  for (let attempt = 0; attempt < 30; attempt++) {
    const grid = Array.from({ length: size }, () => Array(size).fill(''));
    const placed = [];
    for (const cand of shuffle(candidates, rand)) {
      if (placed.length >= wordCount) break;
      // Skip a word hidden inside another (TEA in TEAPOT): finding one would
      // look like finding the other.
      const rev = [...cand.letters].reverse().join('');
      if (placed.some((p) => p.word.includes(cand.word) || p.word.includes(rev) || cand.word.includes(p.word))) continue;
      const spots = [];
      for (const dir of directions) {
        const [dr, dc] = DELTAS[dir];
        for (let r = 0; r < size; r++) {
          for (let c = 0; c < size; c++) {
            const cells = [];
            let ok = true;
            for (let k = 0; k < cand.letters.length; k++) {
              const rr = r + dr * k;
              const cc = c + dc * k;
              if (rr < 0 || rr >= size || cc < 0 || cc >= size) { ok = false; break; }
              if (grid[rr][cc] !== '' && grid[rr][cc] !== cand.letters[k]) { ok = false; break; }
              cells.push({ row: rr, col: cc });
            }
            if (ok) spots.push(cells);
          }
        }
      }
      if (!spots.length) continue;
      const cells = spots[Math.floor(rand() * spots.length)];
      cells.forEach(({ row, col }, k) => { grid[row][col] = cand.letters[k]; });
      placed.push({ word: cand.word, cells });
    }
    if (!best || placed.length > best.placed.length) best = { grid, placed };
    if (placed.length >= wordCount) break;
  }

  const { grid, placed } = best;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (grid[r][c] === '') grid[r][c] = fillerPool[Math.floor(rand() * fillerPool.length)];
    }
  }
  // Alphabetical order makes the word list easy to scan.
  placed.sort((a, b) => a.word.localeCompare(b.word));
  return { grid, placed };
}

/** Cells on a straight line from start to end (inclusive), or null. */
export function cellsOnLine(start, end) {
  const rowDiff = Math.abs(end.row - start.row);
  const colDiff = Math.abs(end.col - start.col);
  if (rowDiff !== 0 && colDiff !== 0 && rowDiff !== colDiff) return null;
  const dr = Math.sign(end.row - start.row);
  const dc = Math.sign(end.col - start.col);
  const steps = Math.max(rowDiff, colDiff);
  const cells = [];
  for (let i = 0; i <= steps; i++) cells.push({ row: start.row + dr * i, col: start.col + dc * i });
  return cells;
}

/** Which not-yet-found word (if any) the selected cells spell, forwards or backwards. */
export function matchSelection(cells, grid, placed, found) {
  const text = cells.map(({ row, col }) => grid[row][col]).join('');
  const rev = [...cells].reverse().map(({ row, col }) => grid[row][col]).join('');
  const hit = placed.find((p) => !found.has(p.word) && (p.word === text || p.word === rev));
  return hit ? hit.word : null;
}
