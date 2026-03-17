const SCORES_KEY = 'caritahub_scores';
const FAV_KEY    = 'caritahub_favorites';

function memberScoresKey(memberId) {
  return memberId ? `${SCORES_KEY}:${memberId}` : SCORES_KEY;
}
function memberFavKey(memberId) {
  return memberId ? `${FAV_KEY}:${memberId}` : FAV_KEY;
}

/**
 * Save a game score (percentage 0-100) to localStorage, keyed by memberId.
 */
export function saveScore(gameId, pct, durationSeconds = null, memberId = null, difficulty = null) {
  const key = memberScoresKey(memberId);
  let data;
  try { data = JSON.parse(localStorage.getItem(key) || '{}'); }
  catch { data = {}; }
  const prev = data[gameId];
  const isNewBest = !prev || pct >= prev.best;
  data[gameId] = {
    best:           prev ? Math.max(prev.best, pct) : pct,
    last:           pct,
    lastTime:       durationSeconds,
    bestTime:       isNewBest ? durationSeconds : (prev?.bestTime ?? durationSeconds),
    bestDifficulty: isNewBest ? difficulty : (prev?.bestDifficulty ?? difficulty),
    playCount:      prev ? prev.playCount + 1 : 1,
    ts:             Date.now(),
  };
  try { localStorage.setItem(key, JSON.stringify(data)); } catch {}
}

/** Get all stored game stats as { gameId: stats }, keyed by memberId. */
export function getAllScores(memberId = null) {
  const key = memberScoresKey(memberId);
  try { return JSON.parse(localStorage.getItem(key) || '{}'); }
  catch { return {}; }
}

/* ── External total score (from URL param) ── */
const TOTAL_SCORE_KEY = 'caritahub_total_score';

function memberTotalScoreKey(memberId) {
  return memberId ? `${TOTAL_SCORE_KEY}:${memberId}` : TOTAL_SCORE_KEY;
}

/** Persist total_score passed from URL param, keyed by memberId. */
export function saveTotalScore(memberId, totalScore) {
  const key = memberTotalScoreKey(memberId);
  try { localStorage.setItem(key, String(totalScore)); } catch {}
}

/** Get the stored total_score for a member, or null if never set. */
export function getTotalScore(memberId = null) {
  const key = memberTotalScoreKey(memberId);
  try {
    const val = localStorage.getItem(key);
    return val !== null ? Number(val) : null;
  } catch { return null; }
}

/* ── Favorites ── */

/** Get the Set of favorited game IDs for a member. */
export function getFavorites(memberId = null) {
  const key = memberFavKey(memberId);
  try { return new Set(JSON.parse(localStorage.getItem(key) || '[]')); }
  catch { return new Set(); }
}

/** Toggle a game's favorite status for a member. Returns the new Set. */
export function toggleFavorite(gameId, memberId = null) {
  const key  = memberFavKey(memberId);
  const favs = getFavorites(memberId);
  if (favs.has(gameId)) favs.delete(gameId);
  else favs.add(gameId);
  try { localStorage.setItem(key, JSON.stringify([...favs])); } catch {}
  return favs;
}
