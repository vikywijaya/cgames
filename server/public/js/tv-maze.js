'use strict';

// ── Constants ────────────────────────────────────────────────────────────────
const GRID_SIZE = 20;
const PLAYER_COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22', '#c0392b'];
const BG_COLOR = '#141414';
const WALL_COLOR = '#ffffff';
const FOG_COLOR = 'rgba(20, 20, 20, 0.85)';
const GOAL_COLOR = '#ffd700';

// ── URL params (host handoff from /tv-lobby) ────────────────────────────────
const _tvParams    = new URLSearchParams(location.search);
const _hostHandoff = _tvParams.get('host') === '1';
const _initialRoom = _tvParams.get('room');

// ── State ────────────────────────────────────────────────────────────────────
let myRoomId = _initialRoom || null;
let gameState = null;
let phase = 'lobby'; // 'lobby' | 'playing' | 'gameover'
let animFrameId = null;
let goalPulse = 0;

// ── DOM refs ─────────────────────────────────────────────────────────────────
const lobbyPhase       = document.getElementById('lobbyPhase');
const playingPhase     = document.getElementById('playingPhase');
const gameoverPhase    = document.getElementById('gameoverPhase');
const reconnectOverlay = document.getElementById('reconnectOverlay');

// Lobby
const qrContainer     = document.getElementById('qrcode');
const joinUrlEl       = document.getElementById('joinUrl');
const lobbyPlayerList = document.getElementById('lobbyPlayerList');
const startBtn        = document.getElementById('startBtn');

// Playing
const canvas          = document.getElementById('mazeCanvas');
const ctx             = canvas.getContext('2d');
const playerStripEl   = document.getElementById('playerStrip');

// Game Over
const gameoverWinnerNameEl = document.getElementById('gameoverWinnerName');
const gameoverWinnerEl     = document.getElementById('gameoverWinner');
const playAgainBtn         = document.getElementById('playAgainBtn');

// ── Socket ───────────────────────────────────────────────────────────────────
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
    gameType: 'tv-maze',
    reconnect: !!myRoomId
  });
});

socket.on('disconnect', () => {
  reconnectOverlay.classList.remove('hidden');
});

socket.on('connect_error', () => {
  reconnectOverlay.classList.remove('hidden');
});

// ── Joined ───────────────────────────────────────────────────────────────────
let _hostStartFired = false;
socket.on('joined', ({ roomId }) => {
  myRoomId = roomId;

  if (_hostHandoff && !_hostStartFired && !playingPhase.classList.contains('active')) {
    _hostStartFired = true;
    setTimeout(() => socket.emit('tv_maze_start'), 400);
    return;
  }

  const joinUrl = `${location.origin}/tv-join?game=tv-maze&room=${roomId}`;
  joinUrlEl.textContent = joinUrl;

  qrContainer.innerHTML = '';
  new QRCode(qrContainer, {
    text: joinUrl,
    width: 200, height: 200, correctLevel: QRCode.CorrectLevel.H
  });
});

// ── Room update (lobby) ──────────────────────────────────────────────────────
socket.on('room_update', ({ players }) => {
  const phonePlayers = players.filter(p => p.color !== 'tv-host');
  renderLobbyPlayers(phonePlayers);
  startBtn.disabled = phonePlayers.filter(p => p.connected).length < 1;
});

// ── Game started ─────────────────────────────────────────────────────────────
socket.on('game_started', (state) => {
  gameState = state;
  switchPhase('playing');
  resizeCanvas();
  startRenderLoop();
  speak('The maze has begun! Find your way to the gold square!');
});

// ── Game state update ────────────────────────────────────────────────────────
socket.on('game_state', (state) => {
  if (state.gameType !== 'tv-maze') return;
  gameState = state;
  renderPlayerStrip(state.players);
});

// ── Game over ────────────────────────────────────────────────────────────────
socket.on('game_over', ({ winner, reason }) => {
  gameoverWinnerNameEl.textContent = winner || '';
  gameoverWinnerEl.textContent = reason || 'First to reach the goal!';

  setTimeout(() => {
    switchPhase('gameover');
    stopRenderLoop();
    launchTvConfetti();
    playTvVictorySound();
    speakWinner(winner);
  }, 1500);
});

// ── Play again ───────────────────────────────────────────────────────────────
socket.on('play_again', () => {
  gameState = null;
  const confettiEl = document.getElementById('confettiContainer');
  if (confettiEl) { confettiEl.classList.add('hidden'); confettiEl.innerHTML = ''; }
  switchPhase('lobby');
  stopRenderLoop();
});

socket.on('error', ({ message }) => {
  console.error('Server error:', message);
});

// ── Button handlers ──────────────────────────────────────────────────────────
startBtn.addEventListener('click', () => {
  startBtn.disabled = true;
  socket.emit('tv_maze_start');
});

playAgainBtn.addEventListener('click', () => {
  socket.emit('play_again');
  setTimeout(function(){ location.replace('/tv-lobby?game=tv-maze' + (myRoomId ? '&room=' + myRoomId : '')); }, 60);
});

// ── Phase switching ──────────────────────────────────────────────────────────
function switchPhase(newPhase) {
  phase = newPhase;
  lobbyPhase.classList.toggle('active', newPhase === 'lobby');
  playingPhase.classList.toggle('active', newPhase === 'playing');
  gameoverPhase.classList.toggle('active', newPhase === 'gameover');
}

// ── Lobby player list ────────────────────────────────────────────────────────
function renderLobbyPlayers(players) {
  if (players.length === 0) {
    lobbyPlayerList.innerHTML = '<div class="tv-player-empty">Waiting for players...</div>';
    return;
  }
  lobbyPlayerList.innerHTML = '';
  players.forEach((p, i) => {
    const div = document.createElement('div');
    div.className = 'tv-player-item';
    div.style.borderLeft = `5px solid ${PLAYER_COLORS[i % PLAYER_COLORS.length]}`;
    div.textContent = `${i + 1}. ${escHtml(p.name)}`;
    if (!p.connected) div.style.opacity = '0.5';
    lobbyPlayerList.appendChild(div);
  });
}

// ── Player strip (during play) ───────────────────────────────────────────────
function renderPlayerStrip(players) {
  if (!playerStripEl) return;
  playerStripEl.innerHTML = '';
  (players || []).forEach((p, i) => {
    if (p.color === 'tv-host') return;
    const chip = document.createElement('div');
    chip.className = 'tv-player-chip';
    const color = PLAYER_COLORS[i % PLAYER_COLORS.length];
    chip.innerHTML = `<span class="color-dot" style="background:${color}"></span><span>${escHtml(p.name)}</span>`;
    playerStripEl.appendChild(chip);
  });
}

// ── Canvas sizing ────────────────────────────────────────────────────────────
function resizeCanvas() {
  const headerHeight = 50;
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight - headerHeight;
  canvas.style.marginTop = headerHeight + 'px';
}

window.addEventListener('resize', () => {
  if (phase === 'playing') resizeCanvas();
});

// ── Render loop ──────────────────────────────────────────────────────────────
function startRenderLoop() {
  stopRenderLoop();
  function loop() {
    renderMaze();
    animFrameId = requestAnimationFrame(loop);
  }
  animFrameId = requestAnimationFrame(loop);
}

function stopRenderLoop() {
  if (animFrameId) {
    cancelAnimationFrame(animFrameId);
    animFrameId = null;
  }
}

// ── Main maze renderer ───────────────────────────────────────────────────────
function renderMaze() {
  if (!gameState || !gameState.grid) return;

  const maze = gameState.grid;
  const players = gameState.players || [];
  const goal = { row: gameState.goalRow, col: gameState.goalCol };
  const rows = maze.length;
  const cols = (maze[0] || []).length;

  // Build the set of visited cells
  const visitedSet = buildVisitedSet();

  // Calculate cell size to fill canvas
  const cellW = canvas.width / cols;
  const cellH = canvas.height / rows;
  const cellSize = Math.min(cellW, cellH);
  const offsetX = (canvas.width - cellSize * cols) / 2;
  const offsetY = (canvas.height - cellSize * rows) / 2;

  // Clear
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Draw cells
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = offsetX + c * cellSize;
      const y = offsetY + r * cellSize;
      const cell = maze[r][c];
      const key = r + ',' + c;
      const isVisible = visitedSet.has(key);

      if (!isVisible) {
        // Fog of war - dimmed cell
        ctx.fillStyle = FOG_COLOR;
        ctx.fillRect(x, y, cellSize, cellSize);
        continue;
      }

      // Visible cell background (slightly lighter than BG)
      ctx.fillStyle = '#1F1F1F';
      ctx.fillRect(x, y, cellSize, cellSize);

      // Draw walls
      ctx.strokeStyle = WALL_COLOR;
      ctx.lineWidth = 2;

      if (cell.north) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + cellSize, y);
        ctx.stroke();
      }
      if (cell.south) {
        ctx.beginPath();
        ctx.moveTo(x, y + cellSize);
        ctx.lineTo(x + cellSize, y + cellSize);
        ctx.stroke();
      }
      if (cell.west) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + cellSize);
        ctx.stroke();
      }
      if (cell.east) {
        ctx.beginPath();
        ctx.moveTo(x + cellSize, y);
        ctx.lineTo(x + cellSize, y + cellSize);
        ctx.stroke();
      }
    }
  }

  // Draw goal cell with pulsing gold highlight
  if (goal) {
    const gx = offsetX + goal.col * cellSize;
    const gy = offsetY + goal.row * cellSize;
    const goalKey = goal.row + ',' + goal.col;
    const goalVisible = visitedSet.has(goalKey);

    // Always show goal, but dim if not yet visible
    goalPulse += 0.04;
    const pulseAlpha = 0.3 + 0.3 * Math.sin(goalPulse);
    ctx.fillStyle = goalVisible
      ? `rgba(255, 215, 0, ${pulseAlpha})`
      : `rgba(255, 215, 0, ${pulseAlpha * 0.3})`;
    ctx.fillRect(gx + 2, gy + 2, cellSize - 4, cellSize - 4);

    // Goal star icon
    if (goalVisible) {
      ctx.fillStyle = GOAL_COLOR;
      ctx.font = `${Math.floor(cellSize * 0.5)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('\u2605', gx + cellSize / 2, gy + cellSize / 2);
    }
  }

  // Draw players using engine positions
  const enginePlayers = gameState.enginePlayers || [];
  const roomPlayers = players.filter(p => p.color !== 'tv-host');
  enginePlayers.forEach((ep, i) => {
    if (ep == null || ep.row == null) return;
    const pr = ep.row;
    const pc = ep.col;
    const color = PLAYER_COLORS[i % PLAYER_COLORS.length];
    const playerName = roomPlayers[i] ? roomPlayers[i].name : `P${i + 1}`;

    const cx = offsetX + pc * cellSize + cellSize / 2;
    const cy = offsetY + pr * cellSize + cellSize / 2;
    const radius = cellSize * 0.3;

    // Player circle
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Direction arrow
    const heading = ep.heading || 'south';
    drawDirectionArrow(cx, cy, radius, heading, color);

    // Player name label
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${Math.max(10, Math.floor(cellSize * 0.25))}px Lexend, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(escHtml(playerName), cx, offsetY + pr * cellSize - 2);
  });
}

// ── Build set of visited cell keys ───────────────────────────────────────────
function buildVisitedSet() {
  const set = new Set();
  // gameState.visited is an array per seat, each containing [r,c] pairs
  const visited = gameState.visited || [];
  visited.forEach(playerVisited => {
    (playerVisited || []).forEach(v => {
      if (Array.isArray(v)) {
        set.add(v[0] + ',' + v[1]);
      } else if (typeof v === 'string') {
        set.add(v);
      }
    });
  });
  // Also include current player positions from engine state
  const enginePlayers = gameState.enginePlayers || [];
  enginePlayers.forEach(p => {
    if (p && p.row != null) set.add(p.row + ',' + p.col);
  });
  return set;
}

// ── Draw direction arrow ─────────────────────────────────────────────────────
function drawDirectionArrow(cx, cy, radius, heading, color) {
  const arrowLen = radius * 0.8;
  let angle = 0;
  switch (heading) {
    case 'north': angle = -Math.PI / 2; break;
    case 'south': angle = Math.PI / 2; break;
    case 'east':  angle = 0; break;
    case 'west':  angle = Math.PI; break;
    default:      angle = Math.PI / 2; break;
  }

  const tipX = cx + Math.cos(angle) * (radius + arrowLen * 0.3);
  const tipY = cy + Math.sin(angle) * (radius + arrowLen * 0.3);
  const baseAngle = Math.PI / 6;
  const baseLen = arrowLen * 0.5;

  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(
    cx + Math.cos(angle + Math.PI - baseAngle) * baseLen,
    cy + Math.sin(angle + Math.PI - baseAngle) * baseLen
  );
  ctx.lineTo(
    cx + Math.cos(angle + Math.PI + baseAngle) * baseLen,
    cy + Math.sin(angle + Math.PI + baseAngle) * baseLen
  );
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

// ── Text-to-speech ───────────────────────────────────────────────────────────
function speak(text) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 0.9;
  utterance.pitch = 1.0;
  utterance.volume = 1.0;
  window.speechSynthesis.speak(utterance);
}

function speakWinner(winnerName) {
  if (!('speechSynthesis' in window) || !winnerName) return;
  setTimeout(() => {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(`Congratulations ${winnerName}! You solved the maze first!`);
    utterance.rate = 0.85;
    utterance.pitch = 1.1;
    utterance.volume = 1.0;
    window.speechSynthesis.speak(utterance);
  }, 1500);
}

// ── TV Confetti ──────────────────────────────────────────────────────────────
function launchTvConfetti() {
  const container = document.getElementById('confettiContainer');
  if (!container) return;
  container.classList.remove('hidden');
  container.innerHTML = '';

  const colors = ['#ffd700', '#ff6b6b', '#4ecca3', '#1155cc', '#7d3c98', '#ff9f43', '#ee5a24', '#00d2d3'];
  const shapes = ['circle', 'square'];

  for (let i = 0; i < 150; i++) {
    const piece = document.createElement('div');
    piece.className = 'tv-confetti-piece';
    const color = colors[Math.floor(Math.random() * colors.length)];
    const shape = shapes[Math.floor(Math.random() * shapes.length)];
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.background = color;
    piece.style.animationDelay = `${Math.random() * 3}s`;
    piece.style.animationDuration = `${3 + Math.random() * 3}s`;
    if (shape === 'circle') piece.style.borderRadius = '50%';
    const size = 10 + Math.random() * 15;
    piece.style.width = `${size}px`;
    piece.style.height = `${size}px`;
    container.appendChild(piece);
  }

  setTimeout(() => {
    container.classList.add('hidden');
    container.innerHTML = '';
  }, 8000);
}

// ── TV Victory Sound (Web Audio API) ─────────────────────────────────────────
function playTvVictorySound() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

    const notes = [523.25, 659.25, 783.99, 1046.50];
    notes.forEach((freq, i) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.4, audioCtx.currentTime + i * 0.18);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + i * 0.18 + 0.5);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(audioCtx.currentTime + i * 0.18);
      osc.stop(audioCtx.currentTime + i * 0.18 + 0.6);
    });

    setTimeout(() => {
      const chord = [261.63, 329.63, 392.00, 523.25, 659.25];
      chord.forEach(freq => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.25, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 1.2);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(audioCtx.currentTime);
        osc.stop(audioCtx.currentTime + 1.5);
      });
    }, 800);
  } catch (e) {
    // Audio not available
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
