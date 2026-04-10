// Shared game data — used by both the React client and Vercel serverless functions.
// Keep this module free of React / browser dependencies.

export const GAME_GROUPS = [
  {
    category: 'Memory',
    icon: '🧠',
    games: [
      { id: 'memory-match',  title: 'Memory Match',   icon: '🃏', domain: 'Visual Memory',    description: 'Flip cards to find matching pairs.' },
      { id: 'word-recall',   title: 'Word Recall',    icon: '📝', domain: 'Verbal Memory',    description: 'Study a list, then recall as many words as you can.' },
      { id: 'colour-memory', title: 'Color Memory',   icon: '🎨', domain: 'Sequence Memory',  description: 'Watch a colour sequence light up, then repeat it back.' },
      { id: 'face-memory',   title: 'Face Memory',    icon: '🧑', domain: 'Visual Memory',    description: 'Study faces and names, then match them from memory.' },
      { id: 'shopping-list', title: 'Shopping List',  icon: '🛒', domain: 'Working Memory',   description: 'Memorise a shopping list, then pick the items from a larger grid.' },
    ],
  },
  {
    category: 'Attention & Reflexes',
    icon: '⚡',
    games: [
      { id: 'pattern-sequence', title: 'Pattern Sequence', icon: '🎵', domain: 'Attention',          description: 'Watch and repeat a light-pad sequence.' },
      { id: 'balloon-pop',      title: 'Balloon Pop',      icon: '🎈', domain: 'Reaction Speed',      description: 'Tap balloons before they float away!' },
      { id: 'whack-a-mole',     title: 'Whack-a-Mole',    icon: '🐹', domain: 'Reaction Speed',      description: 'Tap the moles before they disappear!' },
      { id: 'speed-tap',        title: 'Speed Tap',        icon: '⭐', domain: 'Selective Attention', description: 'A target emoji appears among distractors — tap it fast!' },
      { id: 'stroop-colour',    title: 'Stroop Colour',    icon: '🎨', domain: 'Inhibitory Control',  description: 'Tap the ink colour of the word, not what it says.' },
    ],
  },
  {
    category: 'Numbers & Logic',
    icon: '🔢',
    games: [
      { id: 'daily-arithmetic', title: 'Daily Arithmetic', icon: '🔢', domain: 'Numeric Reasoning',  description: 'Solve simple maths questions at your own pace.' },
      { id: 'number-sort',      title: 'Number Sort',      icon: '🔢', domain: 'Numeric Ordering',    description: 'Tap numbers from smallest to largest.' },
      { id: 'missing-number',   title: 'Missing Number',   icon: '❓', domain: 'Pattern Recognition', description: 'Find the missing number in an arithmetic sequence.' },
      { id: 'quick-maths',      title: 'Quick Maths',      icon: '➕', domain: 'Mental Arithmetic',   description: 'Solve addition, subtraction and multiplication problems fast.' },
      { id: 'sumix',             title: 'Sumix',            icon: '🧮', domain: 'Numeric Logic',      description: 'Activate numbers so each row and column sums to its target.' },
      { id: 'math-cross',       title: 'Math Cross',      icon: '✖️', domain: 'Mental Arithmetic',  description: 'Place numbers into a crossword of equations to make them all correct.' },
      { id: 'dot-ed',             title: 'Dot.ed',          icon: '🔴', domain: 'Logic Puzzles',      description: 'Connect red dots to blue targets — match every capacity and need.', comingSoon: true },
    ],
  },
  {
    category: 'Visual & Spatial',
    icon: '👁',
    games: [
      { id: 'word-search',         title: 'Word Search',         icon: '🔍', domain: 'Visual Scanning',  description: 'Find hidden words in a letter grid.' },
      { id: 'right-time',          title: 'Right Time',          icon: '🕐', domain: 'Visual Cognition', description: 'Read the analog clock and choose the correct time.' },
      { id: 'catch-falling-fruit', title: 'Catch the Fruit',     icon: '🧺', domain: 'Coordination',     description: 'Slide to catch falling fruit in your basket.' },
      { id: 'odd-one-out',         title: 'Odd One Out',         icon: '🔎', domain: 'Visual Reasoning', description: 'Spot the one emoji that doesn\'t belong.' },
      { id: 'spot-difference',     title: 'Spot the Difference', icon: '🔍', domain: 'Visual Scanning',  description: 'Find the tiles that differ between two emoji grids.' },
      { id: 'letter-count',        title: 'Letter Count',        icon: '🔠', domain: 'Visual Attention', description: 'Count how many times a letter appears in a word.' },
      { id: 'tangram',              title: 'Tangram',             icon: '🔺', domain: 'Spatial Reasoning', description: 'Drag seven geometric pieces to fill the silhouette.', comingSoon: true },
    ],
  },
  {
    category: 'General Knowledge',
    icon: '🌍',
    games: [
      { id: 'flag-quiz',     title: 'Flag Quiz',         icon: '🏳️', domain: 'Geography', description: 'Identify countries by their flags.' },
      { id: 'capital-quiz',  title: 'Capital City Quiz', icon: '🗺️', domain: 'Geography', description: 'Name the capital city of each country.' },
      { id: 'currency-quiz', title: 'Currency Quiz',     icon: '💰', domain: 'Geography', description: 'Name the currency used in each country.' },
      { id: 'landmark-quiz', title: 'Landmark Quiz',     icon: '🗼', domain: 'Geography', description: 'Identify which country each famous landmark is in.' },
    ],
  },
  {
    category: 'Arcade',
    icon: '🕹️',
    games: [
      { id: 'snake-lite',  title: 'Snake',        icon: '🐍', domain: 'Coordination',    description: 'Guide the snake to eat fruit. Don\'t hit the walls or yourself!' },
      { id: 'tile-flip',   title: 'Tile Flip',    icon: '🟨', domain: 'Spatial Memory',  description: 'Memorise which tiles light up, then tap them all from memory.' },
      { id: 'lumeno',      title: 'Lumeno',       icon: '🔮', domain: 'Visual Pattern',  description: 'Drag through 3 or more same-colour orbs to clear them. Longer chains score more!' },
      { id: 'pipe-puzzle',   title: 'Pipe Puzzle',  icon: '🔧', domain: 'Spatial Reasoning', description: 'Rotate tiles to connect the same-coloured dots with an unbroken pipe.' },
      { id: 'block-puzzle',  title: 'Blocks',       icon: '🟧', domain: 'Spatial Reasoning', description: 'Place block pieces on the board to fill every empty cell.' },
      { id: 'ring-sort',     title: 'Rings',        icon: '🔴', domain: 'Logic & Sorting',  description: 'Sort the coloured rings so each rod has only one colour.' },
      { id: 'slither-escape', title: 'Slither Escape', icon: '🐍', domain: 'Spatial Reasoning', description: 'Slide coloured snakes to their matching exits without getting tangled!', comingSoon: true },
      { id: 'flappy-numbers', title: 'Flappy Numbers', icon: '🔢', domain: 'Number Recognition', description: 'Flap through the tile that matches your number — avoid the rest!' },
      { id: 'sokoban', title: 'Sokoban', icon: '📦', domain: 'Spatial Reasoning', description: 'Push all the boxes onto the targets in this classic warehouse puzzle!' },
      { id: 'zip', title: 'Zip', icon: '🔗', domain: 'Logic Puzzles', description: 'Draw a single path through every cell, hitting numbered waypoints in order.' },
    ],
  },
];

// Map game IDs to their image file extensions (for stable icon URLs via public/)
const GAME_IMAGE_EXT = {
  'memory-match': 'png', 'word-recall': 'png', 'colour-memory': 'png',
  'face-memory': 'png', 'shopping-list': 'png', 'pattern-sequence': 'png',
  'daily-arithmetic': 'png', 'catch-falling-fruit': 'png', 'right-time': 'png',
  'word-search': 'png', 'ring-sort': 'png',
};

/** Return the stable icon filename for a game (e.g. "math-cross.svg") */
export function gameIconFilename(gameId) {
  const ext = GAME_IMAGE_EXT[gameId] || 'svg';
  return `${gameId}.${ext}`;
}

export function dailySeed() {
  const d = new Date();
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

export function seededRandom(seed) {
  // Simple mulberry32 PRNG
  let s = seed >>> 0;
  return function () {
    s += 0x6d2b79f5;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
  };
}

export function buildDailyGames() {
  // Pick 2 games seeded by today's date — same selection all day
  const pool = GAME_GROUPS.flatMap(group =>
    group.games
      .filter(g => !g.comingSoon)
      .map(g => ({ ...g, categoryIcon: group.icon, categoryName: group.category }))
  );
  const rand = seededRandom(dailySeed());
  const shuffled = pool.slice().sort(() => rand() - 0.5);
  return shuffled.slice(0, 2);
}
