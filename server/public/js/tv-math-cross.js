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
    gameType: 'tv-math-cross',
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
    setTimeout(() => socket.emit('tv_math_cross_start', { difficulty: selectedDifficulty }), 400);
    return;
  }

  const joinUrl = `${location.origin}/tv-join?game=tv-math-cross&room=${roomId}`;
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
  if (state.gameType !== 'tv-math-cross') return;
  gameState = state;
  if (playingPhase.classList.contains('active')) {
    renderPlaying(state);
  }
});

// ── Round over ────────────────────────────────────────────────────────────────
socket.on('round_over', ({ roundResults, currentRound, totalRounds, sessionScores, players, nextRoundIn }) => {
  switchPhase('roundover');
  renderRoundOver(roundResults, currentRound, totalRounds, players, nextRoundIn);
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
  socket.emit('tv_math_cross_start', { difficulty: selectedDifficulty });
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
  setTimeout(function(){ location.replace('/tv-lobby?game=tv-math-cross' + (myRoomId ? '&room=' + myRoomId : '')); }, 60);
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
  if (phase === 'lobby') lobbyPhase.classList.add('active');
  if (phase === 'playing') playingPhase.classList.add('active');
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
  const { puzzle, placed, solved, players, difficulty, currentRound, totalRounds } = state;
  playingMeta.textContent = `${difficulty.toUpperCase()} — Round ${currentRound + 1} of ${totalRounds} — ${players.length} player${players.length !== 1 ? 's' : ''}`;

  // Player boards
  playerBoards.innerHTML = '';

  const maxBoardWidth = Math.min(360, Math.floor((window.innerWidth - 80) / Math.min(players.length, 4)) - 16);

  players.forEach((player, i) => {
    const board = document.createElement('div');
    board.className = 'tv-player-board';
    board.style.maxWidth = maxBoardWidth + 'px';

    const totalSlots = puzzle.slotPositions.length;
    const playerPlaced = placed[i] || {};
    const slotsPlaced = Object.keys(playerPlaced).length;
    const progress = totalSlots > 0 ? (slotsPlaced / totalSlots) * 100 : 0;

    const nameHtml = solved[i]
      ? `${escHtml(player.name)} <span class="badge-solved">✓ SOLVED</span>`
      : escHtml(player.name);

    const score = state.sessionScores ? state.sessionScores[i] : 0;

    board.innerHTML = `
      <div class="tv-player-board-name">${nameHtml}</div>
      <div class="tv-player-score">${score} pts</div>
      <div class="tv-progress-bar">
        <div class="tv-progress-fill" style="width:${progress}%"></div>
      </div>
    `;

    // Mini grid
    const gridEl = document.createElement('div');
    gridEl.className = 'tv-mini-grid';
    gridEl.style.gridTemplateColumns = `repeat(${puzzle.cols}, 44px)`;

    for (let r = 0; r < puzzle.rows; r++) {
      for (let c = 0; c < puzzle.cols; c++) {
        const key = `${r},${c}`;
        const cell = puzzle.cells[key];
        const cellEl = document.createElement('div');
        cellEl.className = 'tv-mini-cell';

        if (!cell) {
          cellEl.classList.add('tv-mini-blank');
        } else if (cell.type === 'op') {
          cellEl.classList.add('tv-mini-op');
          cellEl.textContent = cell.value;
        } else if (cell.type === 'number') {
          cellEl.classList.add(solved[i] ? 'tv-mini-winner' : 'tv-mini-given');
          cellEl.textContent = cell.value;
        } else if (cell.type === 'slot') {
          const placedVal = playerPlaced[key];
          if (solved[i]) {
            cellEl.classList.add('tv-mini-winner');
            cellEl.textContent = cell.answer;
          } else if (placedVal !== undefined) {
            const isCorrect = placedVal === cell.answer;
            cellEl.classList.add(isCorrect ? 'tv-mini-correct' : 'tv-mini-filled');
            cellEl.textContent = placedVal;
          } else {
            cellEl.classList.add('tv-mini-slot');
            cellEl.textContent = '?';
          }
        }
        gridEl.appendChild(cellEl);
      }
    }

    board.appendChild(gridEl);
    playerBoards.appendChild(board);
  });

  // Race strip
  raceStrip.innerHTML = '';
  const sortedPlayers = [...players].sort((a, b) => {
    if (solved[b.seat] && !solved[a.seat]) return 1;
    if (solved[a.seat] && !solved[b.seat]) return -1;
    return (placed[b.seat] ? Object.keys(placed[b.seat]).length : 0)
         - (placed[a.seat] ? Object.keys(placed[a.seat]).length : 0);
  });
  sortedPlayers.forEach(player => {
    const i = player.seat;
    const slotsPlaced = placed[i] ? Object.keys(placed[i]).length : 0;
    const div = document.createElement('div');
    div.className = 'tv-race-player' + (solved[i] ? ' solved' : '');
    div.innerHTML = `
      <div class="tv-race-player-slots">${solved[i] ? '✓' : slotsPlaced + '/' + puzzle.slotPositions.length}</div>
      <div class="tv-race-player-name">${escHtml(player.name)}</div>
    `;
    raceStrip.appendChild(div);
  });
}

// ── Render round over screen ──────────────────────────────────────────────────
function renderRoundOver(roundResults, currentRound, totalRounds, players, nextRoundIn) {
  roundOverTitle.textContent = `Round ${currentRound + 1} Complete!`;

  // Sort by score desc
  const sorted = [...players].sort((a, b) => b.score - a.score);
  roundOverScores.innerHTML = sorted.map((p, idx) => {
    const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '';
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
  const colors = ['#ffd700', '#4ecca3', '#ff6b6b', '#60a5fa', '#f472b6', '#a78bfa'];
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
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
