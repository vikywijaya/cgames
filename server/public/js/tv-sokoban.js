'use strict';

const params = new URLSearchParams(location.search);
const roomId = params.get('room');

// ── URL params (host handoff from /tv-lobby) ────────────────────────────────
const _hostHandoff = params.get('host') === '1';
const _initialRoom = params.get('room');

const TILE = { '#': 'wall', ' ': 'floor', '$': 'box', '.': 'goal', '*': 'box-on-goal', '@': 'player', '+': 'player-on-goal' };
const CELL_CSS = { '#': 'sk-wall', ' ': 'sk-floor', '$': 'sk-box', '.': 'sk-goal', '*': 'sk-box-on-goal', '@': 'sk-player', '+': 'sk-player-on-goal' };

let myRoomId = _initialRoom || null;
let roomPlayers = [];
let gameState = null;

// ── DOM ───────────────────────────────────────────────────────────────────────
const lobbyPhase    = document.getElementById('lobbyPhase');
const playingPhase  = document.getElementById('playingPhase');
const roundOverPhase = document.getElementById('roundOverPhase');
const gameOverPhase = document.getElementById('gameOverPhase');

const lobbyPlayerList = document.getElementById('lobbyPlayerList');
const startBtn        = document.getElementById('startBtn');
const startError      = document.getElementById('startError');
const joinUrlEl       = document.getElementById('joinUrl');
const playingMeta     = document.getElementById('playingMeta');
const boardsGrid      = document.getElementById('boardsGrid');
const scoreboardPlaying = document.getElementById('scoreboardPlaying');

const roundOverTitle   = document.getElementById('roundOverTitle');
const roundOverResults = document.getElementById('roundOverResults');
const roundOverNext    = document.getElementById('roundOverNext');
const gameOverWinner   = document.getElementById('gameOverWinner');
const gameOverFinal    = document.getElementById('gameOverFinal');

// ── Socket ────────────────────────────────────────────────────────────────────
const socket = io({ reconnectionAttempts: Infinity, reconnectionDelay: 1000, transports: ['websocket', 'polling'] });

if (_hostHandoff && lobbyPhase) lobbyPhase.classList.remove('active');

socket.on('connect', () => {
  socket.emit('join_game', {
    roomId: myRoomId || null,
    playerName: 'TV Display',
    gameType: 'tv-sokoban',
    reconnect: !!myRoomId
  });
});

let _hostStartFired = false;
socket.on('joined', ({ roomId }) => {
  myRoomId = roomId;

  if (_hostHandoff && !_hostStartFired && !playingPhase.classList.contains('active')) {
    _hostStartFired = true;
    setTimeout(() => socket.emit('tv_sokoban_start'), 400);
    return;
  }

  const joinUrl = `${location.origin}/tv-join?game=tv-sokoban&room=${roomId}`;
  joinUrlEl.textContent = joinUrl;
  const qrEl = document.getElementById('qrcode');
  qrEl.innerHTML = '';
  try {
    new QRCode(qrEl, { text: joinUrl, width: 200, height: 200, correctLevel: QRCode.CorrectLevel.H });
  } catch (e) {
    qrEl.textContent = joinUrl;
  }
});

socket.on('room_update', ({ players }) => {
  roomPlayers = players || [];
  const phonePlayers = roomPlayers.filter(p => p.color !== 'tv-host');
  renderLobbyPlayers(phonePlayers);
  startBtn.disabled = phonePlayers.length < 1;
});

function renderLobbyPlayers(phonePlayers) {
  if (phonePlayers.length === 0) {
    lobbyPlayerList.innerHTML = '<div class="tv-player-empty">Waiting for players...</div>';
    return;
  }
  lobbyPlayerList.innerHTML = phonePlayers.map(p =>
    `<div class="tv-player-item"><span class="tv-player-dot"></span>${p.name}</div>`
  ).join('');
}

startBtn.addEventListener('click', () => {
  startBtn.disabled = true;
  startError.textContent = '';
  socket.emit('tv_sokoban_start');
});

socket.on('error', ({ message }) => {
  startError.textContent = message;
  startBtn.disabled = false;
});

// ── Game events ───────────────────────────────────────────────────────────────
socket.on('game_started', (state) => {
  if (state.gameType !== 'tv-sokoban') return;
  gameState = state;
  showPhase('playing');
  renderPlaying(state);
});

socket.on('game_state', (state) => {
  if (state.gameType !== 'tv-sokoban') return;
  gameState = state;
  showPhase('playing');
  renderPlaying(state);
});

socket.on('round_over', ({ currentRound, totalRounds, solvedOrder, pointsAwarded, sessionScores, players, nextRoundIn }) => {
  const roundNum = (currentRound !== undefined ? currentRound : 0) + 1;
  roundOverTitle.textContent = `Round ${roundNum} Done!`;

  roundOverResults.innerHTML = '';
  const medals = ['🥇', '🥈', '🥉'];
  (solvedOrder || []).forEach((seat, i) => {
    const p = players && players[seat] ? players[seat] : { name: `P${seat + 1}` };
    const pts = pointsAwarded && pointsAwarded[seat] !== undefined ? pointsAwarded[seat] : (i < medals.length ? 3 - i : 0);
    roundOverResults.innerHTML += `
      <div class="result-card">
        <div class="result-pos">${medals[i] || '▸'}</div>
        <div class="result-name">${p.name}</div>
        <div class="result-pts">+${pts} pts — ${(sessionScores || [])[seat] || 0} total</div>
      </div>`;
  });

  const nextIn = nextRoundIn || 5;
  let countdown = nextIn;
  roundOverNext.textContent = `Next round in ${countdown}…`;
  const iv = setInterval(() => {
    countdown--;
    if (countdown <= 0) { clearInterval(iv); roundOverNext.textContent = 'Starting…'; }
    else roundOverNext.textContent = `Next round in ${countdown}…`;
  }, 1000);

  showPhase('roundover');
});

socket.on('game_over', ({ winner, players }) => {
  gameOverWinner.textContent = winner ? `🏆 ${winner} wins!` : 'It\'s a tie!';
  gameOverFinal.innerHTML = (players || []).map(p =>
    `<div class="final-card"><div class="final-name">${p.name}</div><div class="final-score">${p.score} pts</div></div>`
  ).join('');
  showPhase('gameover');
});

// ── Play Again ───────────────────────────────────────────────────────────────
const playAgainBtn = document.getElementById('playAgainBtn');
if (playAgainBtn) playAgainBtn.addEventListener('click', () => {
  socket.emit('play_again');
  setTimeout(function(){ location.replace('/tv-lobby?game=tv-sokoban' + (myRoomId ? '&room=' + myRoomId : '')); }, 60);
});

socket.on('play_again', () => {
  gameState = null;
  showPhase('lobby');
});

// ── Render playing ────────────────────────────────────────────────────────────
function renderPlaying(state) {
  const { currentRound, totalRounds, playerSolved, moves, playerGrids } = state;
  playingMeta.textContent = `Round ${(currentRound || 0) + 1} of ${totalRounds || 3}`;

  // Scoreboard
  const players = roomPlayers.filter(p => p.color !== 'tv-host');
  scoreboardPlaying.innerHTML = players.map((p, i) =>
    `<div class="score-chip"><div class="score-name">${p.name}</div><div class="score-pts">${(state.sessionScores || [])[i] || 0} pts</div></div>`
  ).join('');

  // Grid layout based on player count
  const count = players.length;
  const cols = count <= 2 ? count : count <= 4 ? 2 : count <= 6 ? 3 : 4;
  boardsGrid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
  boardsGrid.style.maxWidth = cols === 1 ? '400px' : cols === 2 ? '760px' : '1200px';

  // Cell size: roughly fit in available area
  const cellSize = count <= 2 ? 28 : count <= 4 ? 22 : 18;

  boardsGrid.innerHTML = players.map((p, i) => {
    const ps = playerGrids && playerGrids[i];
    const solved = playerSolved && playerSolved[i];
    const mv = moves && moves[i] || 0;
    const gridHtml = ps ? renderGrid(ps.grid, ps.height, ps.width, cellSize) : '';
    return `
      <div class="player-board${solved ? ' solved' : ''}">
        <div class="player-name">${p.name} ${solved ? '✅' : ''}</div>
        <div class="player-moves">${mv} moves</div>
        ${gridHtml}
      </div>`;
  }).join('');
}

function renderGrid(grid, height, width, cellSize) {
  if (!grid || !height) return '<div style="color:#475569;font-size:14px;">Loading...</div>';
  let html = `<div class="sokoban-grid" style="grid-template-columns:repeat(${width},${cellSize}px);grid-template-rows:repeat(${height},${cellSize}px);">`;
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      const ch = (grid[r] || [])[c] || ' ';
      const outside = ch === ' ' && isOutside(grid, r, c, height, width);
      const cls = outside ? 'sk-outside' : (CELL_CSS[ch] || 'sk-floor');
      html += `<div class="sk-cell ${cls}" style="width:${cellSize}px;height:${cellSize}px;"></div>`;
    }
  }
  html += '</div>';
  return html;
}

function isOutside(grid, r, c, height, width) {
  // A space cell is "outside" the level border if not enclosed by walls
  // Simple flood-fill heuristic: if reachable from edge without crossing wall, it's outside
  // For display simplicity, check immediate neighbors — if all neighbors are also spaces near the border, treat as outside
  // Actually just check: does any adjacent row/col reach the grid edge without hitting a non-space?
  // Simpler: check if the cell is truly empty by checking if surrounded by walls
  const ch = (grid[r] || [])[c] || ' ';
  if (ch !== ' ') return false;
  // Check if any adjacent non-space exists
  const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
  for (const [dr,dc] of dirs) {
    const nr = r+dr, nc = c+dc;
    if (nr < 0 || nr >= height || nc < 0 || nc >= width) return true; // edge means outside
    const n = (grid[nr] || [])[nc] || ' ';
    if (n !== ' ') return false; // adjacent to a tile → inside
  }
  return true;
}

// ── Phase switching ───────────────────────────────────────────────────────────
function showPhase(name) {
  [lobbyPhase, playingPhase, roundOverPhase, gameOverPhase].forEach(el => el.classList.remove('active'));
  if (name === 'lobby')     lobbyPhase.classList.add('active');
  if (name === 'playing')   playingPhase.classList.add('active');
  if (name === 'roundover') roundOverPhase.classList.add('active');
  if (name === 'gameover')  gameOverPhase.classList.add('active');
}
