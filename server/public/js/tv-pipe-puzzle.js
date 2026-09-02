'use strict';

// ── Pipe colors ───────────────────────────────────────────────────────────────
const PIPE_COLOR_MAP = {
  yellow: '#F5A623',
  salmon: '#E8825A',
  blue:   '#4A9DD9',
  green:  '#5BAD6F',
};
const PIPE_HIGHLIGHT_MAP = {
  yellow: '#FFD06B',
  salmon: '#FFB08A',
  blue:   '#7DC4F0',
  green:  '#8BD4A0',
};
const PIPE_SHADOW_MAP = {
  yellow: '#C07A10',
  salmon: '#B85830',
  blue:   '#2E7AB0',
  green:  '#3A8048',
};
const GREY = '#6B7580';
const GREY_HI = '#8A9AA8';
const GREY_SH = '#4A5560';

// ── Directions / openings (mirrors engine) ────────────────────────────────────
const SHAPE_OPENINGS = {
  end:      [0],
  straight: [0, 2],
  corner:   [0, 1],
  tee:      [0, 1, 2],
  cross:    [0, 1, 2, 3],
};

function getOpenings(shape, rotation) {
  return (SHAPE_OPENINGS[shape] || []).map(d => (d + rotation) % 4);
}

// ── SVG pipe rendering — 3D metallic style ──────────────────────────────────
function renderPipeSVG(shape, rotation, colorId, isEndpoint, connected, size) {
  const VB = 60;
  const HALF = 30;
  const PIPE_W = 14;
  const PIPE_W_INNER = 10;
  const BULB_R = 12;
  const BULB_GLOW = 18;

  const opens = getOpenings(shape, rotation);
  const hasN = opens.includes(0);
  const hasE = opens.includes(1);
  const hasS = opens.includes(2);
  const hasW = opens.includes(3);

  const color = connected ? (PIPE_COLOR_MAP[colorId] || GREY) : GREY;
  const hi = connected ? (PIPE_HIGHLIGHT_MAP[colorId] || GREY_HI) : GREY_HI;
  const sh = connected ? (PIPE_SHADOW_MAP[colorId] || GREY_SH) : GREY_SH;

  const uid = 'p' + Math.random().toString(36).slice(2, 8);

  const isCorner = opens.length === 2 && !((hasN && hasS) || (hasE && hasW));

  let pathD = '';
  if (isCorner) {
    if (hasN && hasE)      pathD = `M${HALF},0 A${HALF},${HALF} 0 0,0 ${VB},${HALF}`;
    else if (hasE && hasS) pathD = `M${VB},${HALF} A${HALF},${HALF} 0 0,0 ${HALF},${VB}`;
    else if (hasS && hasW) pathD = `M${HALF},${VB} A${HALF},${HALF} 0 0,0 0,${HALF}`;
    else if (hasW && hasN) pathD = `M0,${HALF} A${HALF},${HALF} 0 0,0 ${HALF},0`;
  } else {
    const segs = [];
    if (hasN) segs.push(`M${HALF},0 L${HALF},${HALF}`);
    if (hasE) segs.push(`M${VB},${HALF} L${HALF},${HALF}`);
    if (hasS) segs.push(`M${HALF},${VB} L${HALF},${HALF}`);
    if (hasW) segs.push(`M0,${HALF} L${HALF},${HALF}`);
    pathD = segs.join(' ');
  }

  // Defs: pipe gradient + glow filter
  let defs = `<defs>`;
  defs += `<linearGradient id="${uid}g" x1="0" y1="0" x2="0" y2="1">`;
  defs += `<stop offset="0%" stop-color="${hi}"/>`;
  defs += `<stop offset="45%" stop-color="${color}"/>`;
  defs += `<stop offset="100%" stop-color="${sh}"/>`;
  defs += `</linearGradient>`;
  if (connected) {
    defs += `<filter id="${uid}f"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;
  }
  defs += `</defs>`;

  // Outer shadow stroke
  let svg = defs;
  svg += `<path d="${pathD}" stroke="${sh}" stroke-width="${PIPE_W + 2}" stroke-linecap="round" fill="none" opacity="0.5"/>`;
  // Main pipe with gradient
  svg += `<path d="${pathD}" stroke="url(#${uid}g)" stroke-width="${PIPE_W}" stroke-linecap="round" fill="none"/>`;
  // Inner highlight
  svg += `<path d="${pathD}" stroke="${hi}" stroke-width="${PIPE_W_INNER - 4}" stroke-linecap="round" fill="none" opacity="0.2"/>`;

  // Endpoint bulb — glassy orb
  if (isEndpoint && colorId) {
    const epColor = connected ? (PIPE_COLOR_MAP[colorId] || GREY) : GREY;
    const epHi = connected ? (PIPE_HIGHLIGHT_MAP[colorId] || GREY_HI) : GREY_HI;
    // Outer glow
    svg += `<circle cx="${HALF}" cy="${HALF}" r="${BULB_GLOW}" fill="${epColor}" opacity="0.25"${connected ? ` filter="url(#${uid}f)"` : ''}/>`;
    // Main orb with radial gradient
    svg += `<defs><radialGradient id="${uid}b" cx="40%" cy="35%" r="55%">`;
    svg += `<stop offset="0%" stop-color="${epHi}"/>`;
    svg += `<stop offset="70%" stop-color="${epColor}"/>`;
    svg += `<stop offset="100%" stop-color="${sh}"/>`;
    svg += `</radialGradient></defs>`;
    svg += `<circle cx="${HALF}" cy="${HALF}" r="${BULB_R}" fill="url(#${uid}b)" stroke="${sh}" stroke-width="1.5"/>`;
    // Glass highlight
    svg += `<ellipse cx="${HALF - 3}" cy="${HALF - 4}" rx="4" ry="3" fill="white" opacity="0.5"/>`;
  }

  return `<svg viewBox="0 0 ${VB} ${VB}" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">${svg}</svg>`;
}

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
const lobbyPhase       = document.getElementById('lobbyPhase');
const playingPhase     = document.getElementById('playingPhase');
const gameoverPhase    = document.getElementById('gameoverPhase');
const roundOverPhase   = document.getElementById('roundOverPhase');
const reconnectOverlay = document.getElementById('reconnectOverlay');

const qrContainer      = document.getElementById('qrcode');
const joinUrlEl        = document.getElementById('joinUrl');
const lobbyPlayerList  = document.getElementById('lobbyPlayerList');
const startBtn         = document.getElementById('startBtn');
const diffBtns         = document.querySelectorAll('.tv-diff-btn');

const playingMeta      = document.getElementById('playingMeta');
const playerBoards     = document.getElementById('playerBoards');
const raceStrip        = document.getElementById('raceStrip');

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
    gameType: 'tv-pipe-puzzle',
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
    setTimeout(() => socket.emit('tv_pipe_puzzle_start', { difficulty: selectedDifficulty }), 400);
    return;
  }

  const joinUrl = `${location.origin}/tv-join?game=tv-pipe-puzzle&room=${roomId}`;
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
  if (state.gameType !== 'tv-pipe-puzzle') return;
  gameState = state;
  switchPhase('playing');
  renderPlaying(state);
});

// ── Game state update ─────────────────────────────────────────────────────────
socket.on('game_state', (state) => {
  if (state.gameType !== 'tv-pipe-puzzle') return;
  gameState = state;
  // Switch back from round-over screen when next round starts
  if (roundOverPhase.classList.contains('active') && !state.isRoundOver) {
    if (roundOverTimer) clearInterval(roundOverTimer);
    switchPhase('playing');
  }
  if (playingPhase.classList.contains('active')) {
    renderPlaying(state);
  }
});

// ── Round over ────────────────────────────────────────────────────────────────
socket.on('round_over', ({ roundResults, currentRound, totalRounds, players, nextRoundIn }) => {
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
  socket.emit('tv_pipe_puzzle_start', { difficulty: selectedDifficulty });
  setTimeout(() => {
    if (lobbyPhase.classList.contains('active')) {
      startBtn.disabled = false;
      startBtn.textContent = 'Start Game';
    }
  }, 3000);
});

// ── Play Again ────────────────────────────────────────────────────────────────
playAgainBtn.addEventListener('click', () => {
  socket.emit('play_again');
  setTimeout(function(){ location.replace('/tv-lobby?game=tv-pipe-puzzle' + (myRoomId ? '&room=' + myRoomId : '')); }, 60);
});

socket.on('play_again', () => {
  gameState = null;
  if (roundOverTimer) clearInterval(roundOverTimer);
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
  const { grids, solved, players, difficulty, currentRound, totalRounds, colorPairs, connectedCounts, rows, cols, numColors } = state;

  playingMeta.textContent = `${difficulty.toUpperCase()} — Round ${currentRound + 1} of ${totalRounds} — ${players.length} player${players.length !== 1 ? 's' : ''}`;

  playerBoards.innerHTML = '';

  // Determine tile size based on player count and screen
  const boardCount = Math.min(players.length, 4);
  const availableW = window.innerWidth - 80 - (boardCount - 1) * 32;
  const maxBoardW = Math.floor(availableW / boardCount);
  const tileSize = Math.max(24, Math.min(40, Math.floor((maxBoardW - 40) / cols)));

  // Build connected color set for each player's grid
  // We compute it client-side from state for display purposes
  const playerConnectedColors = grids.map(grid => computeConnectedColors(grid, rows, cols, colorPairs));

  players.forEach((player, i) => {
    const isSolved = solved[i];
    const connectedCount = connectedCounts ? connectedCounts[i] : 0;

    const board = document.createElement('div');
    board.className = 'tv-player-board' + (isSolved ? ' board-solved' : '');

    const nameHtml = isSolved
      ? `${escHtml(player.name)} <span class="badge-solved">✓ SOLVED</span>`
      : escHtml(player.name);

    const score = state.sessionScores ? state.sessionScores[i] : 0;

    board.innerHTML = `
      <div class="tv-player-board-name">${nameHtml}</div>
      <div class="tv-player-score">${score} pts</div>
      <div class="tv-pipe-progress">${connectedCount}/${numColors} pipes connected</div>
    `;

    // Pipe grid
    const grid = grids[i];
    if (grid) {
      const gridEl = document.createElement('div');
      gridEl.className = 'tv-pipe-grid';
      gridEl.style.gridTemplateColumns = `repeat(${cols}, ${tileSize}px)`;

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const cell = grid[r][c];
          const tileEl = document.createElement('div');
          tileEl.className = 'tv-pipe-tile' + (isSolved ? ' tv-pipe-tile-solved' : '');
          tileEl.style.width = tileSize + 'px';
          tileEl.style.height = tileSize + 'px';

          if (cell) {
            const connectedColors = playerConnectedColors[i];
            const isConnected = cell.colorId && connectedColors.has(cell.colorId);
            tileEl.innerHTML = renderPipeSVG(
              cell.shape,
              cell.currentRotation,
              cell.colorId,
              cell.isEndpoint,
              isConnected || isSolved,
              tileSize
            );
          }

          gridEl.appendChild(tileEl);
        }
      }

      board.appendChild(gridEl);
    }

    playerBoards.appendChild(board);
  });

  // Race strip
  raceStrip.innerHTML = '';
  const sortedPlayers = [...players].sort((a, b) => {
    const aSolved = solved[a.seat];
    const bSolved = solved[b.seat];
    if (bSolved && !aSolved) return 1;
    if (aSolved && !bSolved) return -1;
    const aConn = connectedCounts ? connectedCounts[a.seat] : 0;
    const bConn = connectedCounts ? connectedCounts[b.seat] : 0;
    return bConn - aConn;
  });

  sortedPlayers.forEach(player => {
    const i = player.seat;
    const isSolved = solved[i];
    const conn = connectedCounts ? connectedCounts[i] : 0;
    const div = document.createElement('div');
    div.className = 'tv-race-player' + (isSolved ? ' race-solved' : '');
    div.innerHTML = `
      <div class="tv-race-player-progress">${isSolved ? '✓' : conn + '/' + (numColors || '?')}</div>
      <div class="tv-race-player-name">${escHtml(player.name)}</div>
    `;
    raceStrip.appendChild(div);
  });
}

// ── Client-side connectivity check (mirrors engine logic) ─────────────────────
function computeConnectedColors(grid, rows, cols, colorPairs) {
  const connected = new Set();
  if (!grid || !colorPairs) return connected;

  const DR = [-1, 0, 1, 0];
  const DC = [0, 1, 0, -1];

  function cellConnects(r1, c1, r2, c2, dir) {
    const cell1 = grid[r1] && grid[r1][c1];
    const cell2 = grid[r2] && grid[r2][c2];
    if (!cell1 || !cell2) return false;
    const opens1 = getOpenings(cell1.shape, cell1.currentRotation);
    const opens2 = getOpenings(cell2.shape, cell2.currentRotation);
    return opens1.includes(dir) && opens2.includes((dir + 2) % 4);
  }

  for (const cp of colorPairs) {
    const eps = cp.endpoints;
    if (!eps || eps.length < 2) continue;
    const [sr, sc] = eps[0];
    const [er, ec] = eps[1];
    const visitedSet = new Set([`${sr},${sc}`]);
    const queue = [[sr, sc]];

    while (queue.length > 0) {
      const [r, c] = queue.shift();
      for (let d = 0; d < 4; d++) {
        const nr = r + DR[d];
        const nc = c + DC[d];
        if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
        const neighbor = grid[nr] && grid[nr][nc];
        if (!neighbor) continue;
        if (neighbor.colorId !== cp.colorId && neighbor.colorId !== null) continue;
        if (neighbor.colorId === null) continue;
        const k = `${nr},${nc}`;
        if (visitedSet.has(k)) continue;
        if (!cellConnects(r, c, nr, nc, d)) continue;
        visitedSet.add(k);
        queue.push([nr, nc]);
      }
    }

    if (visitedSet.has(`${er},${ec}`)) connected.add(cp.colorId);
  }

  return connected;
}

// ── Render round over screen ──────────────────────────────────────────────────
function renderRoundOver(roundResults, currentRound, totalRounds, players, nextRoundIn) {
  roundOverTitle.textContent = `Round ${currentRound + 1} Complete!`;

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
      roundOverCountdown.textContent = 'Starting next round…';
    } else {
      roundOverCountdown.textContent = `Next round in ${countdown}s…`;
    }
  }, 1000);
}

// ── Render final scores ───────────────────────────────────────────────────────
function renderFinalScores(players) {
  const sorted = [...players].sort((a, b) => b.score - a.score);
  gameoverScores.innerHTML = sorted.map(p =>
    `<div class="tv-final-score-row">
      <span>${escHtml(p.name)}</span>
      <span>${p.score} pts</span>
    </div>`
  ).join('');
}

// ── Confetti ──────────────────────────────────────────────────────────────────
function spawnConfetti() {
  confettiContainer.classList.remove('hidden');
  confettiContainer.innerHTML = '';
  const colors = ['#ffd700', '#4ecca3', '#ff6b9d', '#60a5fa', '#F5A623', '#E8825A'];
  for (let i = 0; i < 80; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    piece.style.left = Math.random() * 100 + 'vw';
    piece.style.background = colors[Math.floor(Math.random() * colors.length)];
    piece.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
    piece.style.animationDelay = Math.random() * 2 + 's';
    piece.style.animationDuration = (2.5 + Math.random() * 2) + 's';
    confettiContainer.appendChild(piece);
  }
  setTimeout(() => confettiContainer.classList.add('hidden'), 6000);
}

// ── Utility ───────────────────────────────────────────────────────────────────
function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
