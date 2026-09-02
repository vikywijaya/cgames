'use strict';

// Bridges a Play with a Friend match result into the same scoring primitives
// solo cgames games use (src/utils/scoreStore.js, src/utils/buildPayload.js —
// served verbatim from /shared, see server.js). Dynamic import() is used
// because these game clients are classic scripts, not ES modules.
async function reportMultiplayerResult({ gameId, result, score, maxScore, durationSeconds }) {
  const { saveScore }   = await import('/shared/scoreStore.js');
  const { buildPayload } = await import('/shared/buildPayload.js');

  const params      = new URLSearchParams(location.search);
  const memberId    = params.get('memberId') || 'guest';
  const callbackUrl = params.get('callbackUrl');
  const accessToken = params.get('accessToken');

  const pct = typeof score === 'number' && typeof maxScore === 'number' && maxScore > 0
    ? Math.round((score / maxScore) * 100)
    : result === 'win' ? 100 : result === 'draw' ? 50 : 0;

  saveScore(gameId, pct, durationSeconds ?? null, memberId, null);

  if (!callbackUrl) return;
  const payload = buildPayload({
    memberId, gameId,
    score: score ?? (result === 'win' ? 1 : 0),
    maxScore: maxScore ?? 1,
    completed: true,
    durationSeconds: durationSeconds ?? 0,
  });
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
  if (accessToken) headers['Access-Token'] = accessToken;
  try {
    await fetch(callbackUrl, { method: 'POST', headers, body: JSON.stringify(payload) });
  } catch (e) {
    console.warn('[mp-report-result] callback failed:', e);
  }
}
