'use strict';

// ── URL params (host handoff from /tv-lobby) ────────────────────────────────
const _tvParams    = new URLSearchParams(location.search);
const _hostHandoff = _tvParams.get('host') === '1';
const _initialRoom = _tvParams.get('room');

let myRoomId = _initialRoom || null;
let gameState = null;
let studyTimerId = null;
let roundOverTimer = null;
let selectedDifficulty = 'easy';

// ── DOM refs ──────────────────────────────────────────────────────────────────
const lobbyPhase      = document.getElementById('lobbyPhase');
const playingPhase    = document.getElementById('playingPhase');
const roundOverPhase  = document.getElementById('roundOverPhase');
const gameoverPhase   = document.getElementById('gameoverPhase');
const reconnectOverlay = document.getElementById('reconnectOverlay');

const qrContainer     = document.getElementById('qrcode');
const joinUrlEl       = document.getElementById('joinUrl');
const lobbyPlayerList = document.getElementById('lobbyPlayerList');
const startBtn        = document.getElementById('startBtn');

const playingMeta     = document.getElementById('playingMeta');
const phaseLabel      = document.getElementById('phaseLabel');
const countdownEl     = document.getElementById('countdown');
const shoppingGrid    = document.getElementById('shoppingGrid');
const playerBoards    = document.getElementById('playerBoards');

const roundOverTitle     = document.getElementById('roundOverTitle');
const roundOverScores    = document.getElementById('roundOverScores');
const roundOverCountdown = document.getElementById('roundOverCountdown');

const gameoverWinnerName = document.getElementById('gameoverWinnerName');
const gameoverWinner     = document.getElementById('gameoverWinner');
const gameoverScores     = document.getElementById('gameoverScores');
const playAgainBtn       = document.getElementById('playAgainBtn');
const confettiContainer  = document.getElementById('confettiContainer');

// ── Socket ────────────────────────────────────────────────────────────────────
const socket = io({ reconnectionAttempts: Infinity, reconnectionDelay: 1000, transports: ['websocket', 'polling'] });

if (_hostHandoff && lobbyPhase) lobbyPhase.classList.remove('active');

socket.on('connect', () => {
  reconnectOverlay.classList.add('hidden');
  socket.emit('join_game', { roomId: myRoomId || null, playerName: 'TV Display', gameType: 'tv-shopping-list', reconnect: !!myRoomId });
});
socket.on('disconnect', () => reconnectOverlay.classList.remove('hidden'));
socket.on('connect_error', () => reconnectOverlay.classList.remove('hidden'));

let _hostStartFired = false;
socket.on('joined', ({ roomId }) => {
  myRoomId = roomId;

  if (_hostHandoff && !_hostStartFired && !playingPhase.classList.contains('active')) {
    _hostStartFired = true;
    setTimeout(() => socket.emit('tv_shopping_list_start', { difficulty: selectedDifficulty }), 400);
    return;
  }

  const joinUrl = `${location.origin}/tv-join?game=tv-shopping-list&room=${roomId}`;
  joinUrlEl.textContent = joinUrl;
  qrContainer.innerHTML = '';
  try { new QRCode(qrContainer, { text: joinUrl, width: 200, height: 200, correctLevel: QRCode.CorrectLevel.H }); }
  catch (e) { qrContainer.textContent = joinUrl; }
});

socket.on('room_update', ({ players }) => {
  const phone = players.filter(p => p.color !== 'tv-host');
  renderLobbyPlayers(phone);
  startBtn.disabled = phone.filter(p => p.connected).length < 1;
});

socket.on('game_started', (state) => {
  if (state.gameType !== 'tv-shopping-list') return;
  gameState = state;
  sfx.gameStart();
  switchPhase('playing');
  renderStudy(state);
});

socket.on('game_state', (state) => {
  if (state.gameType !== 'tv-shopping-list') return;
  gameState = state;
  switchPhase('playing');
  if (state.phase === 'study') {
    renderStudy(state);
  } else if (state.phase === 'recall' || state.phase === 'results') {
    renderRecall(state);
  }
});

socket.on('round_over', ({ currentRound, totalRounds, players, nextRoundIn }) => {
  if (studyTimerId) { clearInterval(studyTimerId); studyTimerId = null; }
  sfx.roundOver();
  switchPhase('roundover');
  renderRoundOver(currentRound, totalRounds, players, nextRoundIn);
});

socket.on('game_over', ({ winner, players, reason }) => {
  if (studyTimerId) { clearInterval(studyTimerId); studyTimerId = null; }
  if (roundOverTimer) clearInterval(roundOverTimer);
  sfx.victory();
  gameoverWinnerName.textContent = winner || 'Nobody';
  gameoverWinner.textContent = reason || '';
  renderFinalScores(players);
  switchPhase('gameover');
  spawnConfetti();
});

socket.on('error', ({ message }) => {
  const el = document.getElementById('tvStartError');
  if (el) { el.textContent = message; setTimeout(() => { el.textContent = ''; }, 4000); }
  startBtn.disabled = false;
  startBtn.textContent = 'Start Game';
});

// ── Start ─────────────────────────────────────────────────────────────────────
document.querySelectorAll('.tv-diff-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tv-diff-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedDifficulty = btn.dataset.diff;
  });
});

startBtn.addEventListener('click', () => {
  startBtn.disabled = true;
  startBtn.textContent = 'Starting...';
  socket.emit('tv_shopping_list_start', { difficulty: selectedDifficulty });
  setTimeout(() => {
    if (lobbyPhase.classList.contains('active')) { startBtn.disabled = false; startBtn.textContent = 'Start Game'; }
  }, 3000);
});

playAgainBtn.addEventListener('click', () => {
  socket.emit('play_again');
  setTimeout(function(){ location.replace('/tv-lobby?game=tv-shopping-list' + (myRoomId ? '&room=' + myRoomId : '')); }, 60);
});

socket.on('play_again', () => {
  gameState = null;
  if (studyTimerId) { clearInterval(studyTimerId); studyTimerId = null; }
  if (roundOverTimer) { clearInterval(roundOverTimer); roundOverTimer = null; }
  startBtn.disabled = false;
  startBtn.textContent = 'Start Game';
  switchPhase('lobby');
});

// ── Phase switching ───────────────────────────────────────────────────────────
function switchPhase(phase) {
  [lobbyPhase, playingPhase, roundOverPhase, gameoverPhase].forEach(p => p.classList.remove('active'));
  if (phase === 'lobby')     lobbyPhase.classList.add('active');
  if (phase === 'playing')   playingPhase.classList.add('active');
  if (phase === 'roundover') roundOverPhase.classList.add('active');
  if (phase === 'gameover')  gameoverPhase.classList.add('active');
}

// ── Lobby ─────────────────────────────────────────────────────────────────────
function renderLobbyPlayers(players) {
  lobbyPlayerList.innerHTML = '';
  const connected = players.filter(p => p.connected);
  if (!connected.length) { lobbyPlayerList.innerHTML = '<div class="tv-player-empty">Waiting for players...</div>'; return; }
  connected.forEach(p => {
    const div = document.createElement('div');
    div.className = 'tv-player-item';
    div.innerHTML = `<span class="tv-player-dot"></span>${escHtml(p.name)}`;
    lobbyPlayerList.appendChild(div);
  });
}

// ── Study phase rendering ─────────────────────────────────────────────────────
function renderStudy(state) {
  const { shoppingList, currentRound, totalRounds, difficulty, studySec } = state;
  playingMeta.textContent = `${difficulty.toUpperCase()} — Round ${currentRound + 1} of ${totalRounds}`;
  phaseLabel.textContent = 'Memorise the list!';

  // Render shopping list cards
  shoppingGrid.innerHTML = '';
  shoppingGrid.style.display = 'flex';
  playerBoards.innerHTML = '';
  playerBoards.style.display = 'none';

  if (shoppingList) {
    shoppingList.forEach(item => {
      const card = document.createElement('div');
      card.className = 'tv-shopping-card';
      card.innerHTML = `<div class="tv-shopping-emoji">${item.emoji}</div><div class="tv-shopping-name">${escHtml(item.name)}</div>`;
      shoppingGrid.appendChild(card);
    });
  }

  // Study countdown — don't restart if already running
  if (studyTimerId) return; // grid already rendered above, just skip timer restart
  let remaining = studySec;
  countdownEl.textContent = remaining;
  countdownEl.classList.remove('urgent');

  studyTimerId = setInterval(() => {
    remaining--;
    if (remaining <= 3) {
      countdownEl.classList.add('urgent');
      sfx.tickUrgent();
    } else {
      sfx.tick();
    }
    countdownEl.textContent = remaining;
    if (remaining <= 0) {
      clearInterval(studyTimerId);
      studyTimerId = null;
      countdownEl.textContent = '';
      // Server handles study→recall transition
    }
  }, 1000);
}

// ── Recall rendering ──────────────────────────────────────────────────────────
function renderRecall(state) {
  const { players, playerSubmitted, playerResults, sessionScores, currentRound, totalRounds, difficulty } = state;
  playingMeta.textContent = `${difficulty.toUpperCase()} — Round ${currentRound + 1} of ${totalRounds}`;
  phaseLabel.textContent = 'Players are selecting items...';
  countdownEl.textContent = '';
  countdownEl.classList.remove('urgent');

  shoppingGrid.style.display = 'none';
  shoppingGrid.innerHTML = '';
  playerBoards.style.display = 'flex';
  playerBoards.innerHTML = '';

  if (!players) return;

  players.forEach((player, i) => {
    const submitted = playerSubmitted[i];
    const board = document.createElement('div');
    board.className = 'tv-player-board' + (submitted ? ' board-submitted' : ' board-waiting');

    const nameHtml = submitted
      ? `${escHtml(player.name)} <span class="badge-submitted">Done</span>`
      : escHtml(player.name);

    let statusHtml = '';
    if (submitted && playerResults[i]) {
      const r = playerResults[i];
      statusHtml = `<div class="tv-player-result">✅ ${r.correct} correct<br>❌ ${r.wrong} wrong<br>⬜ ${r.missed} missed</div>`;
    } else if (!submitted) {
      statusHtml = `<div class="tv-player-status">Thinking...</div>`;
    }

    board.innerHTML = `
      <div class="tv-player-board-name">${nameHtml}</div>
      <div class="tv-player-score">${sessionScores[i] || 0} pts</div>
      ${statusHtml}
    `;
    playerBoards.appendChild(board);
  });
}

// ── Round Over ────────────────────────────────────────────────────────────────
function renderRoundOver(currentRound, totalRounds, players, nextRoundIn) {
  roundOverTitle.textContent = `Round ${currentRound + 1} Complete!`;
  const sorted = [...players].sort((a, b) => b.score - a.score);
  roundOverScores.innerHTML = sorted.map((p, idx) => {
    const medal = ['🥇','🥈','🥉'][idx] || '';
    return `<div class="tv-round-score-row">
      <span class="tv-round-score-medal">${medal}</span>
      <span class="tv-round-score-name">${escHtml(p.name)}</span>
      <span class="tv-round-score-pts">${p.score} pts</span>
    </div>`;
  }).join('');

  let countdown = nextRoundIn;
  roundOverCountdown.textContent = `Next round in ${countdown}s…`;
  if (roundOverTimer) clearInterval(roundOverTimer);
  roundOverTimer = setInterval(() => {
    countdown--;
    if (countdown <= 0) { clearInterval(roundOverTimer); roundOverCountdown.textContent = 'Get ready!'; sfx.gameStart(); }
    else { countdown <= 3 ? sfx.tickUrgent() : sfx.tick(); roundOverCountdown.textContent = `Next round in ${countdown}s…`; }
  }, 1000);
}

// ── Final Scores ──────────────────────────────────────────────────────────────
function renderFinalScores(players) {
  if (!players) return;
  const sorted = [...players].sort((a, b) => b.score - a.score);
  gameoverScores.innerHTML = sorted.map(p =>
    `<div class="tv-final-score-row"><span>${escHtml(p.name)}</span><span>${p.score} pts</span></div>`
  ).join('');
}

// ── Confetti ──────────────────────────────────────────────────────────────────
function spawnConfetti() {
  confettiContainer.classList.remove('hidden');
  confettiContainer.innerHTML = '';
  const colors = ['#f59e0b','#fbbf24','#ef4444','#22c55e','#3b82f6','#a855f7','#ffd700','#f97316'];
  for (let i = 0; i < 80; i++) {
    const p = document.createElement('div');
    p.className = 'confetti-piece';
    p.style.left = Math.random() * 100 + 'vw';
    p.style.background = colors[Math.floor(Math.random() * colors.length)];
    p.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
    p.style.animationDelay = Math.random() * 2 + 's';
    confettiContainer.appendChild(p);
    setTimeout(() => p.remove(), 5000);
  }
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
