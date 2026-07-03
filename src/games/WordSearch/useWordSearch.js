import { useState, useCallback } from 'react';

const DIFFICULTY_CONFIG = {
  easy:   { size: 8,  wordCount: 5,  directions: ['H', 'V'] },
  medium: { size: 10, wordCount: 7,  directions: ['H', 'V', 'D'] },
  hard:   { size: 12, wordCount: 9,  directions: ['H', 'V', 'D', 'HR', 'VR', 'DR'] },
};

// Words to embed in the grid (curated for seniors — common, recognisable)
const WORD_BANK = [
  'CAT', 'DOG', 'SUN', 'HAT', 'BAG', 'CUP', 'MAP', 'JAR',
  'BOOK', 'BIRD', 'CAKE', 'FISH', 'LAMP', 'MOON', 'TREE', 'DOOR',
  'CLOCK', 'CLOUD', 'DANCE', 'FLAME', 'GLOVE', 'HEART', 'LIGHT', 'MUSIC',
  'BREAD', 'CHAIR', 'DREAM', 'EAGLE', 'FENCE', 'GRAPE',
];

function getDirectionDelta(dir) {
  switch (dir) {
    case 'H':  return [0,  1];
    case 'V':  return [1,  0];
    case 'D':  return [1,  1];
    case 'HR': return [0, -1];
    case 'VR': return [-1, 0];
    case 'DR': return [1, -1];
    default:   return [0,  1];
  }
}

function buildGrid(size, words, directions) {
  // Initialize empty grid
  const grid = Array.from({ length: size }, () => Array(size).fill(''));
  const placed = []; // { word, cells: [{row, col}] }

  const shuffled = [...words].sort(() => Math.random() - 0.5);

  for (const word of shuffled) {
    let placedWord = false;
    const dirList = [...directions].sort(() => Math.random() - 0.5);

    for (const dir of dirList) {
      const [dr, dc] = getDirectionDelta(dir);

      // Try up to 30 random positions
      for (let attempt = 0; attempt < 30; attempt++) {
        const row = Math.floor(Math.random() * size);
        const col = Math.floor(Math.random() * size);

        // Check if word fits
        const cells = [];
        let fits = true;
        for (let k = 0; k < word.length; k++) {
          const r = row + dr * k;
          const c = col + dc * k;
          if (r < 0 || r >= size || c < 0 || c >= size) { fits = false; break; }
          if (grid[r][c] !== '' && grid[r][c] !== word[k]) { fits = false; break; }
          cells.push({ row: r, col: c });
        }

        if (fits) {
          // Place the word
          cells.forEach(({ row: r, col: c }, k) => {
            grid[r][c] = word[k];
          });
          placed.push({ word, cells });
          placedWord = true;
          break;
        }
      }
      if (placedWord) break;
    }
  }

  // Fill empty cells with random uppercase letters
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (grid[r][c] === '') {
        grid[r][c] = letters[Math.floor(Math.random() * letters.length)];
      }
    }
  }

  return { grid, placed };
}

function cellsOnLine(start, end, size) {
  // Compute all cells between start and end (inclusive) if they form a valid straight line
  const dr = Math.sign(end.row - start.row);
  const dc = Math.sign(end.col - start.col);

  // Must be straight horizontal, vertical, or 45° diagonal
  const rowDiff = Math.abs(end.row - start.row);
  const colDiff = Math.abs(end.col - start.col);
  if (rowDiff !== 0 && colDiff !== 0 && rowDiff !== colDiff) return null;

  const cells = [];
  let r = start.row;
  let c = start.col;
  const steps = Math.max(rowDiff, colDiff);
  for (let i = 0; i <= steps; i++) {
    if (r < 0 || r >= size || c < 0 || c >= size) return null;
    cells.push({ row: r, col: c });
    r += dr;
    c += dc;
  }
  return cells;
}

function cellsMatch(selectionCells, wordCells) {
  if (selectionCells.length !== wordCells.length) return false;
  return selectionCells.every(
    (sc, i) => sc.row === wordCells[i].row && sc.col === wordCells[i].col
  );
}

export function useWordSearch(difficulty = 'easy') {
  const config = DIFFICULTY_CONFIG[difficulty] ?? DIFFICULTY_CONFIG.easy;

  // Sample words from the bank
  const [words] = useState(() => {
    const shuffled = [...WORD_BANK].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, config.wordCount);
  });

  const [{ grid, placed }] = useState(() =>
    buildGrid(config.size, words, config.directions)
  );

  const [foundWords, setFoundWords] = useState(new Set());
  const [selectionStart, setSelectionStart] = useState(null);
  const [selectionEnd, setSelectionEnd] = useState(null);
  const [selectionCells, setSelectionCells] = useState([]);
  const [lastResult, setLastResult] = useState(null); // 'found' | 'miss' | null

  const size = config.size;

  const clickCell = useCallback(
    (row, col) => {
      if (!selectionStart) {
        // First click — set start
        setSelectionStart({ row, col });
        setSelectionEnd(null);
        setSelectionCells([{ row, col }]);
        return;
      }

      // Second click — evaluate selection
      const cells = cellsOnLine(selectionStart, { row, col }, size);

      if (!cells) {
        // Invalid line — reset selection
        setSelectionStart({ row, col });
        setSelectionEnd(null);
        setSelectionCells([{ row, col }]);
        return;
      }

      setSelectionEnd({ row, col });
      setSelectionCells(cells);

      // Check if selection matches any unFound word
      let matched = null;
      for (const { word, cells: wordCells } of placed) {
        if (foundWords.has(word)) continue;
        if (cellsMatch(cells, wordCells) || cellsMatch([...cells].reverse(), wordCells)) {
          matched = word;
          break;
        }
      }

      if (matched) {
        setFoundWords((prev) => new Set([...prev, matched]));
        setLastResult('found');
      } else {
        setLastResult('miss');
      }

      // Clear selection after short delay
      setTimeout(() => {
        setSelectionStart(null);
        setSelectionEnd(null);
        setSelectionCells([]);
        setLastResult(null);
      }, 900);
    },
    [selectionStart, placed, foundWords, size]
  );

  const clearSelection = useCallback(() => {
    setSelectionStart(null);
    setSelectionEnd(null);
    setSelectionCells([]);
  }, []);

  // Determine which cells are highlighted (part of a found word)
  const foundCellSet = new Set(
    placed
      .filter((p) => foundWords.has(p.word))
      .flatMap((p) => p.cells.map((c) => `${c.row},${c.col}`))
  );

  const selectionCellSet = new Set(selectionCells.map((c) => `${c.row},${c.col}`));

  // When a start cell is chosen, compute every cell that forms a valid straight
  // line (H / V / 45° diagonal) from it, so the UI can highlight which cells are
  // valid end points. This makes the interaction obvious for first-time users.
  const validTargetSet = new Set();
  if (selectionStart) {
    const dirs = [
      [0, 1], [0, -1], [1, 0], [-1, 0],
      [1, 1], [1, -1], [-1, 1], [-1, -1],
    ];
    for (const [dr, dc] of dirs) {
      let r = selectionStart.row + dr;
      let c = selectionStart.col + dc;
      while (r >= 0 && r < size && c >= 0 && c < size) {
        validTargetSet.add(`${r},${c}`);
        r += dr;
        c += dc;
      }
    }
  }

  return {
    grid,
    words,
    foundWords,
    foundCellSet,
    selectionCellSet,
    validTargetSet,
    selectionStart,
    lastResult,
    clickCell,
    clearSelection,
    score: foundWords.size,
    maxScore: words.length,
    done: foundWords.size === words.length,
  };
}
