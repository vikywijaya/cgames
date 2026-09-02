'use strict';

const COLOUR_NAMES = ['red', 'blue', 'green', 'yellow', 'purple', 'orange'];

// ── URL params (host handoff from /tv-lobby) ────────────────────────────────
const _tvParams    = new URLSearchParams(location.search);
const _hostHandoff = _tvParams.get('host') === '1';
const _initialRoom = _tvParams.get('room');

let myRoomId = _initialRoom || null;
let gameState = null;
let selectedDifficulty = 'easy';
let roundOverTimer = null;
let sequenceAnimTimers = [];

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
const diffBtns        = document.querySelectorAll('.tv-diff-btn');

const playingMeta     = document.getElementById('playingMeta');
const phaseLabel      = document.getElementById('phaseLabel');
const seqCounter      = document.getElementById('sequenceCounter');
const colourTiles     = document.querySelectorAll('.tv-colour-tile');
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
  socket.emit('join_game', { roomId: myRoomId || null, playerName: 'TV Display', gameType: 'tv-colour-memory', reconnect: !!myRoomId });
});
socket.on('disconnect', () => reconnectOverlay.classList.remove('hidden'));
socket.on('connect_error', () => reconnectOverlay.classList.remove('hidden'));

let _hostStartFired = false;
socket.on('joined', ({ roomId }) => {
  myRoomId = roomId;

  if (_hostHandoff && !_hostStartFired && !playingPhase.classList.contains('active')) {
    _hostStartFired = true;
    setTimeout(() => socket.emit('tv_colour_memory_start', { difficulty: selectedDifficulty }), 400);
    return;
  }

  const joinUrl = `${location.origin}/tv-join?game=tv-colour-memory&room=${roomId}`;
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
  if (state.gameType !== 'tv-colour-memory') return;
  gameState = state;
  sfx.gameStart();
  switchPhase('playing');
  startShowingSequence(state);
});

socket.on('game_state', (state) => {
  if (state.gameType !== 'tv-colour-memory') return;
  gameState = state;
  if (playingPhase.classList.contains('active')) {
    if (state.phase === 'recall') renderRecall(state);
  }
  // If roundover phase active and new round started, switch to playing
  if (roundOverPhase.classList.contains('active') && !state.isRoundOver) {
    if (roundOverTimer) clearInterval(roundOverTimer);
    switchPhase('playing');
    startShowingSequence(state);
  }
});

socket.on('round_over', ({ currentRound, totalRounds, players, nextRoundIn }) => {
  sequenceAnimTimers.forEach(t => clearTimeout(t)); sequenceAnimTimers = [];
  sfx.roundOver();
  switchPhase('roundover');
  renderRoundOver(currentRound, totalRounds, players, nextRoundIn);
});

socket.on('game_over', ({ winner, players, reason }) => {
  sequenceAnimTimers.forEach(t => clearTimeout(t)); sequenceAnimTimers = [];
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

// ── Difficulty + Start ────────────────────────────────────────────────────────
diffBtns.forEach(btn => btn.addEventListener('click', () => {
  diffBtns.forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  selectedDifficulty = btn.dataset.diff;
}));

startBtn.addEventListener('click', () => {
  startBtn.disabled = true;
  startBtn.textContent = 'Starting...';
  socket.emit('tv_colour_memory_start', { difficulty: selectedDifficulty });
  setTimeout(() => {
    if (lobbyPhase.classList.contains('active')) { startBtn.disabled = false; startBtn.textContent = 'Start Game'; }
  }, 3000);
});

playAgainBtn.addEventListener('click', () => {
  socket.emit('play_again');
  setTimeout(function(){ location.replace('/tv-lobby?game=tv-colour-memory' + (myRoomId ? '&room=' + myRoomId : '')); }, 60);
});

socket.on('play_again', () => {
  gameState = null;
  if (typeof roundOverTimer !== 'undefined' && roundOverTimer) clearInterval(roundOverTimer);
  switchPhase('lobby');
});

// ── Phase switching ───────────────────────────────────────────────────────────
function switchPhase(phase) {
  [lobbyPhase, playingPhase, roundOverPhase, gameoverPhase].forEach(p => p.classList.remove('active'));
  if (phase === 'lobby')    lobbyPhase.classList.add('active');
  if (phase === 'playing')  playingPhase.classList.add('active');
  if (phase === 'roundover') roundOverPhase.classList.add('active');
  if (phase === 'gameover') gameoverPhase.classList.add('active');
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

// ── Sequence animation (client-side timing) ───────────────────────────────────
function startShowingSequence(state) {
  phaseLabel.textContent = 'Watch carefully!';
  seqCounter.textContent = '';
  playerBoards.innerHTML = '';

  const { sequence, config, currentRound, totalRounds, difficulty } = state;
  playingMeta.textContent = `${difficulty.toUpperCase()} — Round ${currentRound + 1} of ${totalRounds} — Sequence: ${sequence.length}`;

  const flashMs = config.flashMs;
  const gapMs = config.gapMs;
  const stepMs = flashMs + gapMs;
  const totalMs = sequence.length * stepMs + gapMs;

  // Clear any previous animation timers
  sequenceAnimTimers.forEach(t => clearTimeout(t));
  sequenceAnimTimers = [];

  // Dim all tiles
  colourTiles.forEach(t => { t.classList.remove('flashing', 'lit'); });

  // Animate each step
  sequence.forEach((colourIdx, i) => {
    sequenceAnimTimers.push(setTimeout(() => {
      colourTiles.forEach(t => t.classList.remove('flashing'));
      colourTiles[colourIdx].classList.add('flashing');
      sfx.flash();
      seqCounter.textContent = `${i + 1} / ${sequence.length}`;

      sequenceAnimTimers.push(setTimeout(() => {
        colourTiles[colourIdx].classList.remove('flashing');
      }, flashMs));
    }, i * stepMs + gapMs));
  });

  // After sequence done, signal server
  sequenceAnimTimers.push(setTimeout(() => {
    colourTiles.forEach(t => t.classList.remove('flashing', 'lit'));
    phaseLabel.textContent = 'Now tap the sequence on your phone!';
    seqCounter.textContent = '';
    socket.emit('tv_colour_memory_reveal_done');
  }, totalMs));
}

// ── Recall rendering ──────────────────────────────────────────────────────────
function renderRecall(state) {
  const { players, taps, finished, failed, sessionScores, sequence } = state;
  phaseLabel.textContent = 'Players are answering...';
  seqCounter.textContent = '';
  playerBoards.innerHTML = '';

  players.forEach((player, i) => {
    const isFinished = finished[i];
    const isFailed = failed[i];
    const board = document.createElement('div');
    board.className = 'tv-player-board' + (isFinished ? ' board-finished' : isFailed ? ' board-failed' : '');

    const nameHtml = isFinished
      ? `${escHtml(player.name)} <span class="badge-solved">✓</span>`
      : escHtml(player.name);

    const myTaps = taps[i] || [];
    const dotsHtml = sequence.map((_, pos) => {
      if (pos < myTaps.length) return `<div class="tv-tap-dot tapped-correct"></div>`;
      if (isFailed && pos === myTaps.length) return `<div class="tv-tap-dot tapped-wrong"></div>`;
      return `<div class="tv-tap-dot"></div>`;
    }).join('');

    board.innerHTML = `
      <div class="tv-player-board-name">${nameHtml}</div>
      <div class="tv-player-score">${sessionScores[i] || 0} pts</div>
      <div class="tv-player-taps">${dotsHtml}</div>
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
  const colors = ['#ef4444','#3b82f6','#22c55e','#eab308','#a855f7','#f97316','#ffd700','#4ecca3'];
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
