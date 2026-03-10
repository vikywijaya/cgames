const KEY = 'caritahub_scores';

/**
 * Save a game score (percentage 0-100) to localStorage.
 * Tracks best, last, playCount, durationSeconds, and timestamp.
 */
export function saveScore(gameId, pct, durationSeconds = null) {
  let data;
  try { data = JSON.parse(localStorage.getItem(KEY) || '{}'); }
  catch { data = {}; }
  const prev = data[gameId];
  data[gameId] = {
    best:      prev ? Math.max(prev.best, pct) : pct,
    last:      pct,
    lastTime:  durationSeconds,
    playCount: prev ? prev.playCount + 1 : 1,
    ts:        Date.now(),
  };
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch {}
}

/** Get a single game's stored stats, or null if never played. */
export function getScore(gameId) {
  try {
    const data = JSON.parse(localStorage.getItem(KEY) || '{}');
    return data[gameId] || null;
  } catch { return null; }
}

/** Get all stored game stats as { gameId: stats } object. */
export function getAllScores() {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}'); }
  catch { return {}; }
}

/* ── Favorites ── */
const FAV_KEY = 'caritahub_favorites';

/** Get the Set of favorited game IDs. */
export function getFavorites() {
  try { return new Set(JSON.parse(localStorage.getItem(FAV_KEY) || '[]')); }
  catch { return new Set(); }
}

/** Toggle a game's favorite status. Returns the new Set. */
export function toggleFavorite(gameId) {
  const favs = getFavorites();
  if (favs.has(gameId)) favs.delete(gameId);
  else favs.add(gameId);
  try { localStorage.setItem(FAV_KEY, JSON.stringify([...favs])); } catch {}
  return favs;
}
