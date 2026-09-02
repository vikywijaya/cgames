'use strict';

// ── URL params (host handoff from /tv-lobby) ────────────────────────────────
const _tvParams    = new URLSearchParams(location.search);
const _hostHandoff = _tvParams.get('host') === '1';
const _initialRoom = _tvParams.get('room');

// ── State ─────────────────────────────────────────────────────────────────────
let myRoomId = _initialRoom || null;
let gameState = null;
let selectedDifficulty = 'easy';
let roundOverTimer = null;

// ── DOM refs ──────────────────────────────────────────────────────────────────
const lobbyPhase      = document.getElementById('lobbyPhase');
const playingPhase    = document.getElementById('playingPhase');
const gameoverPhase   = document.getElementById('gameoverPhase');
const roundOverPhase  = document.getElementById('roundOverPhase');
const reconnectOverlay = document.getElementById('reconnectOverlay');

const qrContainer     = document.getElementById('qrcode');
const joinUrlEl       = document.getElementById('joinUrl');
const lobbyPlayerList = document.getElementById('lobbyPlayerList');
const startBtn        = document.getElementById('startBtn');
const diffBtns        = document.querySelectorAll('.tv-diff-btn');

const playingMeta     = document.getElementById('playingMeta');
const playerBoards    = document.getElementById('playerBoards');
const raceStrip       = document.getElementById('raceStrip');

const gameoverWinnerName = document.getElementById('gameoverWinnerName');
const gameoverWinner     = document.getElementById('gameoverWinner');
const gameoverScores     = document.getElementById('gameoverScores');
const playAgainBtn       = document.getElementById('playAgainBtn');
const confettiContainer  = document.getElementById('confettiContainer');

const roundOverTitle     = document.getElementById('roundOverTitle');
const roundOverScores    = document.getElementById('roundOverScores');
const roundOverCountdown = document.getElementById('roundOverCountdown');

// ── Socket ────────────────────────────────────────────────────────────────────
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
    gameType: 'tv-lumeno',
    reconnect: !!myRoomId
  });
});

socket.on('disconnect', () => reconnectOverlay.classList.remove('hidden'));
socket.on('connect_error', () => reconnectOverlay.classList.remove('hidden'));

// ── Joined ────────────────────────────────────────────────────────────────────
let _hostStartFired = false;
socket.on('joined', ({ roomId }) => {
  myRoomId = roomId;

  if (_hostHandoff && !_hostStartFired && !playingPhase.classList.contains('active')) {
    _hostStartFired = true;
    setTimeout(() => socket.emit('tv_lumeno_start', { difficulty: selectedDifficulty }), 400);
    return;
  }

  const joinUrl = `${location.origin}/tv-join?game=tv-lumeno&room=${roomId}`;
  joinUrlEl.textContent = joinUrl;

  qrContainer.innerHTML = '';
  try {
    new QRCode(qrContainer, {
      text: joinUrl,
      width: 200, height: 200, correctLevel: QRCode.CorrectLevel.H
    });
  } catch (e) {
    qrContainer.textContent = joinUrl;
  }
});

// ── Room update (lobby) ───────────────────────────────────────────────────────
socket.on('room_update', ({ players }) => {
  const phonePlayers = players.filter(p => p.color !== 'tv-host');
  renderLobbyPlayers(phonePlayers);
  const connected = phonePlayers.filter(p => p.connected).length;
  startBtn.disabled = connected < 1;
});

// ── Game started ──────────────────────────────────────────────────────────────
socket.on('game_started', (state) => {
  gameState = state;
  switchPhase('playing');
  renderPlaying(state);
});

// ── Game state update ─────────────────────────────────────────────────────────
socket.on('game_state', (state) => {
  if (state.gameType !== 'tv-lumeno') return;
  gameState = state;
  if (playingPhase.classList.contains('active')) {
    renderPlaying(state);
  }
});

// ── Round over ────────────────────────────────────────────────────────────────
socket.on('round_over', ({ roundResults, currentRound, totalRounds, sessionScores, players, nextRoundIn }) => {
  switchPhase('roundover');
  renderRoundOver(roundResults, currentRound, totalRounds, players, sessionScores, nextRoundIn);
});

// ── Game over ─────────────────────────────────────────────────────────────────
socket.on('game_over', ({ winner, players, reason }) => {
  if (roundOverTimer) clearInterval(roundOverTimer);
  gameoverWinnerName.textContent = winner || 'Nobody';
  gameoverWinner.textContent = reason || '';
  renderFinalScores(players);
  switchPhase('gameover');
  spawnConfetti();
});

socket.on('error', ({ message }) => {
  console.warn('Socket error:', message);
  const errEl = document.getElementById('tvStartError');
  if (errEl) { errEl.textContent = message; setTimeout(() => { errEl.textContent = ''; }, 4000); }
  startBtn.disabled = false;
  startBtn.textContent = 'Start Game';
});

// ── Difficulty buttons ────────────────────────────────────────────────────────
diffBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    diffBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedDifficulty = btn.dataset.diff;
  });
});

// ── Start button ──────────────────────────────────────────────────────────────
startBtn.addEventListener('click', () => {
  startBtn.disabled = true;
  startBtn.textContent = 'Starting...';
  socket.emit('tv_lumeno_start', { difficulty: selectedDifficulty });
  setTimeout(() => {
    if (lobbyPhase.classList.contains('active')) {
      startBtn.disabled = false;
      startBtn.textContent = 'Start Game';
    }
  }, 3000);
});

// ── Play Again ────────────────────────────────────────────────────────────────
playAgainBtn.addEventListener('click', () => {
  myRoomId = null;
  gameState = null;
  socket.emit('play_again');
  setTimeout(function(){ location.replace('/tv-lobby?game=tv-lumeno' + (myRoomId ? '&room=' + myRoomId : '')); }, 60);
});

socket.on('play_again', () => {
  gameState = null;
  if (typeof roundOverTimer !== 'undefined' && roundOverTimer) clearInterval(roundOverTimer);
  switchPhase('lobby');
});

// ── Phase switching ───────────────────────────────────────────────────────────
function switchPhase(phase) {
  lobbyPhase.classList.remove('active');
  playingPhase.classList.remove('active');
  gameoverPhase.classList.remove('active');
  roundOverPhase.classList.remove('active');
  if (phase === 'lobby')    lobbyPhase.classList.add('active');
  if (phase === 'playing')  playingPhase.classList.add('active');
  if (phase === 'gameover') gameoverPhase.classList.add('active');
  if (phase === 'roundover') roundOverPhase.classList.add('active');
}

// ── Render lobby player list ──────────────────────────────────────────────────
function renderLobbyPlayers(players) {
  lobbyPlayerList.innerHTML = '';
  if (!players.length) {
    lobbyPlayerList.innerHTML = '<div class="tv-player-empty">Waiting for players...</div>';
    return;
  }
  players.forEach(p => {
    if (!p.connected) return;
    const div = document.createElement('div');
    div.className = 'tv-player-item';
    div.innerHTML = `<span class="tv-player-dot"></span>${escHtml(p.name)}`;
    lobbyPlayerList.appendChild(div);
  });
}

// ── Render playing phase ──────────────────────────────────────────────────────
function renderPlaying(state) {
  const { players, difficulty, currentRound, totalRounds, grids, movesLeft, scores, sessionScores, finished, rows, cols } = state;

  playingMeta.textContent = `${difficulty.toUpperCase()} — Round ${currentRound + 1} of ${totalRounds} — ${players.length} player${players.length !== 1 ? 's' : ''}`;

  // Player boards
  playerBoards.innerHTML = '';

  players.forEach((player, i) => {
    const isFinished = finished[i];
    const board = document.createElement('div');
    board.className = 'tv-player-board' + (isFinished ? ' finished' : '');

    const nameHtml = isFinished
      ? `${escHtml(player.name)} <span class="badge-finished">DONE</span>`
      : escHtml(player.name);

    const roundScore = scores ? scores[i] : 0;
    const sessScore  = sessionScores ? sessionScores[i] : 0;

    board.innerHTML = `
      <div class="tv-player-board-name">${nameHtml}</div>
      <div class="tv-player-score">Round: ${roundScore} pts</div>
      <div class="tv-player-moves">Moves left: ${movesLeft[i]}</div>
      <div class="tv-session-score">Total: ${sessScore} pts</div>
    `;

    // Orb grid
    if (grids && grids[i]) {
      const gridEl = document.createElement('div');
      gridEl.className = 'tv-orb-grid';
      gridEl.style.gridTemplateColumns = `repeat(${cols}, 32px)`;
      gridEl.style.gridTemplateRows    = `repeat(${rows}, 32px)`;

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const color = grids[i][r][c];
          const orb = document.createElement('div');
          orb.className = `tv-orb tv-orb-${color}`;
          gridEl.appendChild(orb);
        }
      }
      board.appendChild(gridEl);
    }

    playerBoards.appendChild(board);
  });

  // Race strip — sorted by current round score descending
  raceStrip.innerHTML = '';
  const sortedPlayers = [...players].sort((a, b) => {
    const scoreA = scores ? scores[a.seat] : 0;
    const scoreB = scores ? scores[b.seat] : 0;
    return scoreB - scoreA;
  });

  sortedPlayers.forEach(player => {
    const i = player.seat;
    const roundScore = scores ? scores[i] : 0;
    const isFinished = finished[i];
    const div = document.createElement('div');
    div.className = 'tv-race-player' + (isFinished ? ' finished' : '');
    div.innerHTML = `
      <div class="tv-race-player-score">${isFinished ? '✓ ' : ''}${roundScore}</div>
      <div class="tv-race-player-name">${escHtml(player.name)}</div>
    `;
    raceStrip.appendChild(div);
  });
}

// ── Render round over screen ──────────────────────────────────────────────────
function renderRoundOver(roundResults, currentRound, totalRounds, players, sessionScores, nextRoundIn) {
  roundOverTitle.textContent = `Round ${currentRound + 1} Complete!`;

  // Use the latest round results array (last entry in roundResults)
  const lastRound = roundResults && roundResults.length > 0 ? roundResults[roundResults.length - 1] : [];

  roundOverScores.innerHTML = (lastRound || []).map((entry, idx) => {
    const player = players ? players.find(p => p.seat === entry.seat) : null;
    const name = player ? player.name : `Player ${entry.seat + 1}`;
    const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '';
    return `<div class="tv-round-score-row">
      <span class="tv-round-score-medal">${medal}</span>
      <span class="tv-round-score-name">${escHtml(name)}</span>
      <span class="tv-round-score-pts">+${entry.roundPoints}pts (${entry.roundScore})</span>
      <span class="tv-round-score-session">Total: ${entry.sessionScore}pts</span>
    </div>`;
  }).join('');

  let countdown = nextRoundIn;
  roundOverCountdown.textContent = `Next round in ${countdown}s…`;

  if (roundOverTimer) clearInterval(roundOverTimer);
  roundOverTimer = setInterval(() => {
    countdown--;
    if (countdown <= 0) {
      clearInterval(roundOverTimer);
      roundOverCountdown.textContent = 'Get ready!';
      switchPhase('playing');
    } else {
      roundOverCountdown.textContent = `Next round in ${countdown}s…`;
    }
  }, 1000);
}

// ── Render final scores ───────────────────────────────────────────────────────
function renderFinalScores(players) {
  if (!players || !gameoverScores) return;
  const sorted = [...players].sort((a, b) => b.score - a.score);
  gameoverScores.innerHTML = sorted.map((p, idx) => {
    const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '';
    return `<div class="tv-final-score-row">
      <span>${medal} ${escHtml(p.name)}</span>
      <span>${p.score} pts</span>
    </div>`;
  }).join('');
}

// ── Confetti ──────────────────────────────────────────────────────────────────
function spawnConfetti() {
  confettiContainer.classList.remove('hidden');
  const colors = ['#ef4444', '#3b82f6', '#22c55e', '#eab308', '#a855f7', '#ffd700', '#4ecca3'];
  for (let i = 0; i < 80; i++) {
    const p = document.createElement('div');
    p.className = 'confetti-piece';
    p.style.left = Math.random() * 100 + 'vw';
    p.style.animationDelay = Math.random() * 2 + 's';
    p.style.background = colors[Math.floor(Math.random() * colors.length)];
    p.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
    p.style.width = p.style.height = (8 + Math.random() * 8) + 'px';
    confettiContainer.appendChild(p);
    setTimeout(() => p.remove(), 5000);
  }
}

function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
