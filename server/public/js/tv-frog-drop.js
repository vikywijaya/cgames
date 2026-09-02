'use strict';

// ── URL params (host handoff from /tv-lobby) ────────────────────────────────
const _params      = new URLSearchParams(location.search);
const _hostHandoff = _params.get('host') === '1';
const _initialRoom = _params.get('room');

// ── State ───────────────────────────────────────────────────────────────────
let myRoomId = _initialRoom || null;
let gameState = null;
let timeLeft = 90;
let roundDuration = 90;

// Per-player UI state, keyed by color (p1..p8). Survives reordering so we
// can animate row swaps and detect score deltas.
//   { row: HTMLElement, scoreEl: HTMLElement, lastScore, lastRank,
//     name, color, connected, _bumpTimer, _flashTimer }
const playerRows = new Map();

// ── DOM refs ────────────────────────────────────────────────────────────────
const lobbyPhase    = document.getElementById('lobbyPhase');
const playingPhase  = document.getElementById('playingPhase');
const gameoverPhase = document.getElementById('gameoverPhase');
const reconnectOverlay = document.getElementById('reconnectOverlay');

const qrContainer     = document.getElementById('qrcode');
const joinUrlEl       = document.getElementById('joinUrl');
const lobbyPlayerList = document.getElementById('lobbyPlayerList');
const startBtn        = document.getElementById('startBtn');

const timerEl         = document.getElementById('fdTimer');
const leaderboardEl   = document.getElementById('fdLeaderboard');

const gameoverWinnerEl     = document.getElementById('gameoverWinner');
const gameoverWinnerNameEl = document.getElementById('gameoverWinnerName');
const gameoverRankingsEl   = document.getElementById('gameoverRankings');
const goWinnerCard         = document.getElementById('goWinnerCard');
const goWinnerAvatarEl     = document.getElementById('goWinnerAvatar');
const goWinnerScoreEl      = document.getElementById('goWinnerScore');
const goPodiumEl           = document.getElementById('goPodium');
const playAgainBtn         = document.getElementById('playAgainBtn');

// ── Avatar palette (deterministic per color slot) ──────────────────────────
const AVATAR_COLORS = {
  p1: '#3b82f6', p2: '#ef4444', p3: '#10b981', p4: '#f59e0b',
  p5: '#a855f7', p6: '#ec4899', p7: '#06b6d4', p8: '#84cc16',
};

// ── Socket ──────────────────────────────────────────────────────────────────
const socket = io({
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  transports: ['websocket', 'polling']
});

if (_hostHandoff && lobbyPhase) lobbyPhase.classList.remove('active');

socket.on('connect', () => {
  reconnectOverlay.classList.add('hidden');
  socket.emit('join_game', {
    roomId: myRoomId || null,
    playerName: 'TV Display',
    gameType: 'tv-frog-drop',
    reconnect: !!myRoomId
  });
});
socket.on('disconnect',    () => reconnectOverlay.classList.remove('hidden'));
socket.on('connect_error', () => reconnectOverlay.classList.remove('hidden'));

let _hostStartFired = false;
socket.on('joined', ({ roomId }) => {
  myRoomId = roomId;
  if (_hostHandoff && !_hostStartFired && !playingPhase.classList.contains('active')) {
    _hostStartFired = true;
    setTimeout(() => socket.emit('tv_frog_drop_start'), 400);
    return;
  }
  const joinUrl = `${location.origin}/tv-join?game=tv-frog-drop&room=${roomId}`;
  joinUrlEl.textContent = joinUrl;
  qrContainer.innerHTML = '';
  new QRCode(qrContainer, {
    text: joinUrl, width: 200, height: 200, correctLevel: QRCode.CorrectLevel.H
  });
});

socket.on('room_update', ({ players }) => {
  const phonePlayers = players.filter(p => p.color !== 'tv-host');
  renderLobbyPlayers(phonePlayers);
  startBtn.disabled = phonePlayers.filter(p => p.connected).length < 1;
});

socket.on('game_started', (state) => {
  gameState = state;
  roundDuration = state.roundDuration || 90;
  timeLeft = state.timeLeft || roundDuration;
  switchPhase('playing');
  updateTimer();
  initLeaderboard(state);
  startLocalTick();
});

socket.on('game_state', (state) => {
  if (state.gameType !== 'tv-frog-drop') return;
  gameState = state;
  if (typeof state.timeLeft === 'number') {
    timeLeft = state.timeLeft;
    updateTimer();
  }
  if (!playingPhase.classList.contains('active')) {
    switchPhase('playing');
    initLeaderboard(state);
    startLocalTick();
  } else {
    updateLeaderboard(state);
  }
});

socket.on('game_over', ({ winner, reason, rankings }) => {
  stopLocalTick();
  renderGameOver(winner, reason, rankings);
  switchPhase('gameover');
  launchConfetti();
  if (window.fdSfx) {
    fdSfx.timeUp();
    setTimeout(() => fdSfx.victory(), 400);
  } else {
    playVictorySound();
  }
});

function renderGameOver(winner, reason, rankings) {
  const list = Array.isArray(rankings) ? rankings : [];
  const top = list[0];
  const isReal = top && top.score > 0;

  // Hero winner card
  if (isReal) {
    goWinnerCard.classList.remove('empty');
    gameoverWinnerNameEl.textContent = top.name || winner || '';
    goWinnerAvatarEl.textContent = (top.name || '?').trim().charAt(0).toUpperCase() || '?';
    // Reuse the AVATAR_COLORS palette via the row mapping if we still have it.
    const slot = playerRows.get(`p${top.seat + 1}`);
    if (slot) {
      goWinnerAvatarEl.style.background = slot.avatarEl.style.background || AVATAR_COLORS[`p${top.seat + 1}`] || '#ec4899';
    } else if (top.seat != null) {
      goWinnerAvatarEl.style.background = AVATAR_COLORS[`p${top.seat + 1}`] || '#ec4899';
    }
    animateScoreCount(goWinnerScoreEl, 0, top.score, 1200);
    gameoverWinnerEl.textContent = reason || `Champion of the round!`;
  } else {
    // Nobody scored — show a friendly empty state.
    goWinnerCard.classList.add('empty');
    gameoverWinnerNameEl.textContent = 'No winner this time';
    goWinnerAvatarEl.textContent = '🐸';
    goWinnerAvatarEl.style.background = '#475569';
    goWinnerScoreEl.textContent = '0';
    gameoverWinnerEl.textContent = reason || "Time's up — give it another shot!";
  }

  // Podium for places 2 and 3
  goPodiumEl.innerHTML = '';
  const silver = list[1];
  const bronze = list[2];
  if (silver && silver.score > 0) {
    goPodiumEl.appendChild(buildPodiumRow(silver, 2));
  }
  if (bronze && bronze.score > 0) {
    goPodiumEl.appendChild(buildPodiumRow(bronze, 3));
  }

  // Full ranked list for places 4+
  gameoverRankingsEl.innerHTML = '';
  list.slice(3).forEach((r, i) => {
    const rank = i + 4;
    const row = document.createElement('div');
    row.className = 'rank-row';
    row.style.animationDelay = `${0.7 + i * 0.07}s`;
    row.innerHTML =
      `<span class="rk">${rank}</span>` +
      `<span class="nm">${escHtml(r.name)}</span>` +
      `<span class="pts">${r.score}</span>`;
    gameoverRankingsEl.appendChild(row);
  });
}

function buildPodiumRow(r, rank) {
  const row = document.createElement('div');
  row.className = 'go-pod ' + (rank === 2 ? 'silver' : 'bronze');
  const medal = rank === 2 ? '🥈' : '🥉';
  row.innerHTML =
    `<span class="go-pod-rank">${rank}</span>` +
    `<span class="go-pod-medal" aria-hidden="true">${medal}</span>` +
    `<span class="go-pod-name">${escHtml(r.name)}</span>` +
    `<span class="go-pod-score">${r.score}</span>`;
  return row;
}

// Smoothly count up to the final score on the winner card.
function animateScoreCount(el, from, to, durMs) {
  if (!el) return;
  const start = performance.now();
  const dur = Math.max(200, durMs || 1000);
  function step(now) {
    const t = Math.min(1, (now - start) / dur);
    // Ease-out cubic
    const eased = 1 - Math.pow(1 - t, 3);
    const v = Math.round(from + (to - from) * eased);
    el.textContent = v;
    if (t < 1) requestAnimationFrame(step);
    else el.textContent = to;
  }
  requestAnimationFrame(step);
}

socket.on('play_again', () => {
  stopLocalTick();
  gameState = null;
  playerRows.clear();
  leaderboardEl.innerHTML = '';
  const c = document.getElementById('confettiContainer');
  if (c) { c.classList.add('hidden'); c.innerHTML = ''; }
  switchPhase('lobby');
});

socket.on('frog_drop_countdown', ({ secsLeft, go }) => {
  showCountdown(go ? 'GO!' : secsLeft, !!go);
});

socket.on('error', ({ message }) => console.error('Server error:', message));

// ── Pre-round countdown overlay ─────────────────────────────────────────
const countdownEl    = document.getElementById('fdCountdown');
const countdownNumEl = document.getElementById('fdCountdownNum');
let _countdownHideTimer = null;

function showCountdown(text, isGo) {
  if (!countdownEl || !countdownNumEl) return;
  if (!playingPhase.classList.contains('active')) switchPhase('playing');
  countdownEl.classList.remove('hidden');
  countdownNumEl.textContent = text;
  countdownNumEl.classList.toggle('go', !!isGo);
  countdownNumEl.classList.remove('tick');
  // eslint-disable-next-line no-unused-expressions
  void countdownNumEl.offsetWidth;
  countdownNumEl.classList.add('tick');
  if (window.fdSfx) {
    if (isGo) fdSfx.go(); else fdSfx.countdown();
  }
  if (_countdownHideTimer) clearTimeout(_countdownHideTimer);
  _countdownHideTimer = setTimeout(() => {
    countdownEl.classList.add('hidden');
  }, isGo ? 700 : 1100);
}

startBtn.addEventListener('click', () => {
  startBtn.disabled = true;
  // Initialize WebAudio in the user gesture so autoplay policies allow it.
  if (window.fdSfx) { fdSfx.init(); fdSfx.tap(); }
  socket.emit('tv_frog_drop_start');
});

playAgainBtn.addEventListener('click', () => {
  socket.emit('play_again');
  setTimeout(() => location.replace('/tv-lobby?game=tv-frog-drop' + (myRoomId ? '&room=' + myRoomId : '')), 60);
});

function switchPhase(p) {
  lobbyPhase.classList.toggle('active',    p === 'lobby');
  playingPhase.classList.toggle('active',  p === 'playing');
  gameoverPhase.classList.toggle('active', p === 'gameover');
}

// ── Timer ───────────────────────────────────────────────────────────────────
function updateTimer() {
  timerEl.textContent = Math.max(0, timeLeft);
  timerEl.classList.toggle('urgent', timeLeft <= 10 && timeLeft > 0);
}

let _tickHandle = null;
function startLocalTick() {
  stopLocalTick();
  _tickHandle = setInterval(() => {
    if (timeLeft > 0 && playingPhase.classList.contains('active')) {
      timeLeft -= 1;
      updateTimer();
      if (window.fdSfx) {
        if (timeLeft > 0 && timeLeft <= 3) fdSfx.tickUrgent();
        else if (timeLeft > 0 && timeLeft <= 10) fdSfx.tick();
      }
    }
  }, 1000);
}
function stopLocalTick() {
  if (_tickHandle) { clearInterval(_tickHandle); _tickHandle = null; }
}

// ── Lobby player list ──────────────────────────────────────────────────────
function renderLobbyPlayers(players) {
  if (players.length === 0) {
    lobbyPlayerList.innerHTML = '<div class="tv-player-empty">Waiting for players...</div>';
    return;
  }
  lobbyPlayerList.innerHTML = '';
  players.forEach((p, i) => {
    const div = document.createElement('div');
    div.className = 'tv-player-item';
    div.textContent = `${i + 1}. ${escHtml(p.name)}`;
    if (!p.connected) div.style.opacity = '0.5';
    lobbyPlayerList.appendChild(div);
  });
}

// ── Leaderboard ─────────────────────────────────────────────────────────────
function avatarInitial(name) {
  return (name || '?').trim().charAt(0).toUpperCase() || '?';
}
function avatarColor(color) {
  return AVATAR_COLORS[color] || '#475569';
}

function buildRow(p) {
  const row = document.createElement('div');
  row.className = 'fd-row';
  row.dataset.color = p.color;

  const rank = document.createElement('div');
  rank.className = 'fd-rank';
  row.appendChild(rank);

  const avatar = document.createElement('div');
  avatar.className = 'fd-avatar';
  avatar.textContent = avatarInitial(p.name);
  avatar.style.background = avatarColor(p.color);
  row.appendChild(avatar);

  const name = document.createElement('div');
  name.className = 'fd-name';
  name.textContent = p.name;
  row.appendChild(name);

  const score = document.createElement('div');
  score.className = 'fd-score';
  score.textContent = '0';
  row.appendChild(score);

  return { row, rankEl: rank, avatarEl: avatar, nameEl: name, scoreEl: score };
}

function initLeaderboard(state) {
  leaderboardEl.innerHTML = '';
  playerRows.clear();
  if (!state.players || !state.players.length) {
    showEmpty();
    return;
  }
  // Initial sort: as-given (server already orders by seat).
  state.players.forEach((p, i) => {
    const els = buildRow(p);
    leaderboardEl.appendChild(els.row);
    playerRows.set(p.color, {
      ...els,
      lastScore: p.score || 0,
      lastRank: i + 1,
      name: p.name,
      color: p.color,
      connected: p.connected,
    });
    applyRank(els.row, i + 1);
    els.scoreEl.textContent = p.score || 0;
    els.row.classList.toggle('disconnected', !p.connected);
  });
}

function showEmpty() {
  leaderboardEl.innerHTML = '<div class="fd-empty">Waiting for players…</div>';
}

function applyRank(row, rank) {
  row.classList.remove('rank-1', 'rank-2', 'rank-3');
  if (rank === 1) row.classList.add('rank-1');
  else if (rank === 2) row.classList.add('rank-2');
  else if (rank === 3) row.classList.add('rank-3');
}

// FLIP-style reorder: snapshot positions before DOM change, re-append in
// new order, then transform-from-old-position back to 0 for a smooth slide.
function updateLeaderboard(state) {
  const players = (state.players || []).slice().sort((a, b) => (b.score || 0) - (a.score || 0));

  // Add any new players that joined mid-game
  players.forEach((p) => {
    if (!playerRows.has(p.color)) {
      const els = buildRow(p);
      leaderboardEl.appendChild(els.row);
      playerRows.set(p.color, {
        ...els,
        lastScore: p.score || 0,
        lastRank: players.length,
        name: p.name,
        color: p.color,
        connected: p.connected,
      });
    }
  });

  // 1. Snapshot current positions
  const firstRects = new Map();
  playerRows.forEach((s) => {
    firstRects.set(s.color, s.row.getBoundingClientRect());
  });

  // 2. Reorder DOM + apply new ranks
  players.forEach((p, i) => {
    const slot = playerRows.get(p.color);
    if (!slot) return;
    leaderboardEl.appendChild(slot.row); // moves to end → end order = sorted
    applyRank(slot.row, i + 1);
    slot.row.classList.toggle('disconnected', !p.connected);
    if (slot.nameEl.textContent !== p.name) slot.nameEl.textContent = p.name;
  });

  // 3. Animate from old → new (FLIP)
  playerRows.forEach((s) => {
    const before = firstRects.get(s.color);
    if (!before) return;
    const after = s.row.getBoundingClientRect();
    const dy = before.top - after.top;
    if (Math.abs(dy) > 1) {
      s.row.style.transition = 'none';
      s.row.style.transform = `translateY(${dy}px)`;
      // Force layout, then animate to 0
      // eslint-disable-next-line no-unused-expressions
      s.row.offsetHeight;
      s.row.style.transition = '';
      s.row.style.transform = '';
    }
  });

  // 4. Detect score changes & trigger animations / popups
  players.forEach((p, i) => {
    const slot = playerRows.get(p.color);
    if (!slot) return;
    const newScore = p.score || 0;
    const newRank = i + 1;

    if (newScore !== slot.lastScore) {
      const delta = newScore - slot.lastScore;
      slot.scoreEl.textContent = newScore;
      bumpScore(slot.scoreEl);
      if (delta > 0) {
        const isRainbow  = Array.isArray(p.rainbowEvents)  && p.rainbowEvents.length  > 0;
        const isRowMatch = Array.isArray(p.rowMatchEvents) && p.rowMatchEvents.length > 0;
        const isChain    = !isRainbow && !isRowMatch
                           && Array.isArray(p.mergeEvents) && p.mergeEvents.some(e => (e.chain || 0) > 0);
        if (isRainbow) {
          spawnPopup(slot.row, `🌈 +${delta}`, false, true);
          flashRainbow(slot.row);
          if (window.fdSfx) fdSfx.rainbow();
        } else if (isRowMatch) {
          const evt = p.rowMatchEvents[0];
          spawnPopup(slot.row, `${evt.count}-IN-A-ROW! +${delta}`, false, false, true);
          flashRowMatch(slot.row);
          if (window.fdSfx) fdSfx.rowMatch(evt.count);
        } else {
          spawnPopup(slot.row, `+${delta}`, isChain);
          if (window.fdSfx) {
            if (isChain) {
              const depth = Math.max(...p.mergeEvents.map(e => e.chain || 0));
              fdSfx.chain(depth);
            } else {
              fdSfx.score();
            }
          }
        }
      }
      slot.lastScore = newScore;
    }

    if (newRank < slot.lastRank) {
      flashRankUp(slot.row);
    }
    slot.lastRank = newRank;
  });
}

function bumpScore(scoreEl) {
  scoreEl.classList.remove('bumped');
  // Restart the CSS animation
  // eslint-disable-next-line no-unused-expressions
  void scoreEl.offsetWidth;
  scoreEl.classList.add('bumped');
}

function spawnPopup(row, text, isChain, isRainbow, isRowMatch) {
  const popup = document.createElement('div');
  popup.className = 'fd-popup'
    + (isRainbow ? ' rainbow' : '')
    + (isRowMatch ? ' rowmatch' : '')
    + (!isRainbow && !isRowMatch && isChain ? ' chain' : '');
  popup.textContent = text;
  const rect = row.getBoundingClientRect();
  const lbRect = leaderboardEl.getBoundingClientRect();
  popup.style.left = (rect.right - lbRect.left - 80) + 'px';
  popup.style.top  = (rect.top   - lbRect.top  - 4)  + 'px';
  leaderboardEl.appendChild(popup);
  const lifeMs = isRainbow ? 1900 : (isRowMatch ? 1700 : 1500);
  setTimeout(() => popup.remove(), lifeMs);
}

function flashRankUp(row) {
  row.classList.remove('rankup-flash');
  // eslint-disable-next-line no-unused-expressions
  void row.offsetWidth;
  row.classList.add('rankup-flash');
}

function flashRainbow(row) {
  row.classList.remove('rainbow-flash');
  // eslint-disable-next-line no-unused-expressions
  void row.offsetWidth;
  row.classList.add('rainbow-flash');
}

function flashRowMatch(row) {
  row.classList.remove('rowmatch-flash');
  // eslint-disable-next-line no-unused-expressions
  void row.offsetWidth;
  row.classList.add('rowmatch-flash');
}

// ── Confetti + victory sound (matched to tv-sumix) ─────────────────────────
function launchConfetti() {
  const container = document.getElementById('confettiContainer');
  if (!container) return;
  container.classList.remove('hidden');
  container.innerHTML = '';
  const colors = ['#ffd700', '#ff6b6b', '#4ecca3', '#1155cc', '#7d3c98', '#ff9f43'];
  for (let i = 0; i < 150; i++) {
    const piece = document.createElement('div');
    piece.className = 'tv-confetti-piece';
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.background = colors[Math.floor(Math.random() * colors.length)];
    piece.style.animationDelay = `${Math.random() * 3}s`;
    piece.style.animationDuration = `${3 + Math.random() * 3}s`;
    if (Math.random() > 0.5) piece.style.borderRadius = '50%';
    const size = 10 + Math.random() * 15;
    piece.style.width = `${size}px`;
    piece.style.height = `${size}px`;
    container.appendChild(piece);
  }
  setTimeout(() => { container.classList.add('hidden'); container.innerHTML = ''; }, 8000);
}

function playVictorySound() {
  try {
    const c = new (window.AudioContext || window.webkitAudioContext)();
    const notes = [523.25, 659.25, 783.99, 1046.50];
    notes.forEach((freq, i) => {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.4, c.currentTime + i * 0.18);
      gain.gain.exponentialRampToValueAtTime(0.01, c.currentTime + i * 0.18 + 0.5);
      osc.connect(gain); gain.connect(c.destination);
      osc.start(c.currentTime + i * 0.18); osc.stop(c.currentTime + i * 0.18 + 0.6);
    });
  } catch (e) { /* ignore */ }
}

function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
