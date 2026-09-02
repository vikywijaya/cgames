'use strict';

/**
 * Sokoban mobile play page.
 * Fully server-authoritative — no local grid simulation.
 * Tile rendering is a faithful SVG port of cgames/Sokoban.jsx.
 */

const params = new URLSearchParams(location.search);
const roomId = params.get('room');
const isAutoJoin = (new URLSearchParams(window.location.search)).get('autojoin') === '1';
let _autoJoinHandoff = null;
if (isAutoJoin && roomId) {
  try {
    const _raw = sessionStorage.getItem(`caritahub_pending_join_${roomId}`);
    if (_raw) {
      const _d = JSON.parse(_raw);
      if (_d && _d.name && _d.color && Date.now() - (_d.ts || 0) < 30 * 60 * 1000) {
        _autoJoinHandoff = _d;
      }
    }
  } catch (e) { /* ignore */ }
}


const TV_COLOURS = ['tv-host', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'];
function seatForColor(c) {
  if (c === 'tv-host') return -1;
  const i = TV_COLOURS.indexOf(c);
  return i > 0 ? i - 1 : -1;
}

let myColor = _autoJoinHandoff ? _autoJoinHandoff.color : null;
let mySeat = (_autoJoinHandoff ? (['tv-host','p1','p2','p3','p4','p5','p6','p7','p8'].indexOf(_autoJoinHandoff.color) > 0 ? ['tv-host','p1','p2','p3','p4','p5','p6','p7','p8'].indexOf(_autoJoinHandoff.color) - 1 : -1) : -1);
let myName = _autoJoinHandoff ? _autoJoinHandoff.name : '';
let myCurrentScore = 0;
let isSolved = false;

// ── DOM ───────────────────────────────────────────────────────────────────────
const joinScreen       = document.getElementById('joinScreen');
const waitingScreen    = document.getElementById('waitingScreen');
const playingScreen    = document.getElementById('playingScreen');
const gameoverScreen   = document.getElementById('gameoverScreen');
const reconnectOverlay = document.getElementById('reconnectOverlay');

const nameInput  = document.getElementById('nameInput');
const joinBtn    = document.getElementById('joinBtn');
const joinError  = document.getElementById('joinError');
const waitingName = document.getElementById('waitingName');

const myScoreEl  = document.getElementById('myScore');
const myMovesEl  = document.getElementById('myMoves');
const roundInfoEl = document.getElementById('roundInfo');
const feedbackEl = document.getElementById('feedback');
const skBoard    = document.getElementById('skBoard');
const boardArea  = document.getElementById('boardArea');
const solvedOverlay = document.getElementById('solvedOverlay');
const solvedSub  = document.getElementById('solvedSub');
const watchTv    = document.getElementById('watchTv');
const watchTvText = document.getElementById('watchTvText');
const watchTvSub  = document.getElementById('watchTvSub');

const goTrophy   = document.getElementById('goTrophy');
const goTitle    = document.getElementById('goTitle');
const goScore    = document.getElementById('goScore');
const goPersonal = document.getElementById('goPersonal');

const btnUp      = document.getElementById('btnUp');
const btnDown    = document.getElementById('btnDown');
const btnLeft    = document.getElementById('btnLeft');
const btnRight   = document.getElementById('btnRight');
const btnUndo    = document.getElementById('btnUndo');
const btnRestart = document.getElementById('btnRestart');

// ── SVG renderers — exact port of cgames PlayerSVG / BoxSVG / GoalSVG ────────
function playerSVG(direction) {
  const rotMap = { up: 0, down: 180, left: 270, right: 90 };
  const rot = rotMap[direction] || 0;
  return `<svg viewBox="0 0 32 32" width="84%" height="84%" style="display:block;overflow:visible">
  <g transform="rotate(${rot},16,16)">
    <ellipse cx="16" cy="18" rx="5.5" ry="6" fill="#3B82F6"/>
    <circle cx="16" cy="11" r="5.5" fill="#FBBF24" stroke="#D97706" stroke-width="0.8"/>
    <circle cx="14" cy="10.5" r="1" fill="#1e1e1e"/>
    <circle cx="18" cy="10.5" r="1" fill="#1e1e1e"/>
    <line x1="11" y1="17" x2="7"  y2="10" stroke="#FBBF24" stroke-width="2.8" stroke-linecap="round"/>
    <line x1="21" y1="17" x2="25" y2="10" stroke="#FBBF24" stroke-width="2.8" stroke-linecap="round"/>
    <circle cx="7"  cy="9.5" r="2" fill="#FBBF24" stroke="#D97706" stroke-width="0.8"/>
    <circle cx="25" cy="9.5" r="2" fill="#FBBF24" stroke="#D97706" stroke-width="0.8"/>
  </g></svg>`;
}

function boxSVG(onGoal) {
  const fill   = onGoal ? '#68d391' : '#c8a96e';
  const stroke = onGoal ? '#276749' : '#8B6340';
  const check  = onGoal ? `<text x="16" y="21" text-anchor="middle" font-size="12" fill="#276749">✓</text>` : '';
  return `<svg viewBox="0 0 32 32" width="80%" height="80%" style="display:block">
  <rect x="3" y="3" width="26" height="26" rx="4" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>
  <line x1="3" y1="16" x2="29" y2="16" stroke="${stroke}" stroke-width="1.5"/>
  <line x1="16" y1="3" x2="16" y2="29" stroke="${stroke}" stroke-width="1.5"/>
  <rect x="5" y="5" width="8" height="4" rx="2" fill="white" opacity="0.25"/>
  ${check}</svg>`;
}

function goalSVG() {
  return `<svg viewBox="0 0 32 32" width="62%" height="62%" style="display:block">
  <circle cx="16" cy="16" r="10" fill="none" stroke="#e05252" stroke-width="2.5" stroke-dasharray="4 2"/>
  <circle cx="16" cy="16" r="3.5" fill="#e05252" opacity="0.7"/>
  </svg>`;
}

// Current facing direction (tracked locally for player SVG only)
let facing = 'down';

// ── Draw grid from server state ───────────────────────────────────────────────
function drawGrid(ps) {
  if (!ps || !ps.grid) return;
  const { grid, height, width } = ps;

  // Cell size: fit within board area
  const areaW = boardArea.clientWidth  || window.innerWidth;
  const areaH = boardArea.clientHeight || (window.innerHeight * 0.45);
  const cellSize = Math.max(28, Math.min(52, Math.floor(Math.min(areaW - 8, areaH - 8) / Math.max(width, height))));

  skBoard.style.gridTemplateColumns = `repeat(${width}, ${cellSize}px)`;
  skBoard.style.gridTemplateRows    = `repeat(${height}, ${cellSize}px)`;
  skBoard.innerHTML = '';

  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      const ch = (grid[r] || [])[c] || ' ';
      const cell = document.createElement('div');
      cell.className = 'sk-cell';
      cell.style.width  = cellSize + 'px';
      cell.style.height = cellSize + 'px';

      // Background class
      if      (ch === '#') cell.classList.add('t-wall');
      else if (ch === '$') cell.classList.add('t-box');
      else if (ch === '*') cell.classList.add('t-box-ok');
      else if (ch === '@' || ch === '+') cell.classList.add('t-player');
      else if (ch === '.') cell.classList.add('t-goal');
      else {
        // Is this space truly outside the level border?
        if (isOutside(grid, r, c, height, width)) cell.classList.add('t-outside');
        else cell.classList.add('t-floor');
      }

      // SVG content
      if      (ch === '$') cell.innerHTML = boxSVG(false);
      else if (ch === '*') cell.innerHTML = boxSVG(true);
      else if (ch === '.') cell.innerHTML = goalSVG();
      else if (ch === '@' || ch === '+') cell.innerHTML = playerSVG(facing);

      skBoard.appendChild(cell);
    }
  }
}

function isOutside(grid, r, c, h, w) {
  // Space cell is outside if it can reach a grid edge without crossing a non-space
  // Simple BFS from (r,c) — if we hit an edge before a wall/floor-enclosed cell, it's outside
  const visited = new Set();
  const queue = [[r, c]];
  visited.add(`${r},${c}`);
  while (queue.length) {
    const [cr, cc] = queue.shift();
    for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
      const nr = cr+dr, nc = cc+dc;
      if (nr < 0 || nr >= h || nc < 0 || nc >= w) return true; // reached edge
      const key = `${nr},${nc}`;
      if (visited.has(key)) continue;
      const n = (grid[nr] || [])[nc] || ' ';
      if (n === '#') continue; // wall blocks
      if (n !== ' ') return false; // hit floor/box/goal — inside
      visited.add(key);
      queue.push([nr, nc]);
    }
  }
  return false;
}

// ── Socket ────────────────────────────────────────────────────────────────────
const socket = io({ reconnectionAttempts: Infinity, reconnectionDelay: 1000, transports: ['websocket', 'polling'] });

// ── Autojoin: jump straight to waiting screen ──────────────────────────────
if (_autoJoinHandoff) {
  if (typeof waitingName !== 'undefined' && waitingName) waitingName.textContent = `You joined as ${myName}`;
  showScreen('waiting');
}

socket.on('connect', () => {
  reconnectOverlay.classList.remove('show');
  if (myName && roomId) socket.emit('join_game', { roomId, playerName: myName, gameType: 'tv-sokoban', reconnect: true });
});
socket.on('disconnect',    () => reconnectOverlay.classList.add('show'));
socket.on('connect_error', () => reconnectOverlay.classList.add('show'));

// ── Join ──────────────────────────────────────────────────────────────────────
joinBtn.addEventListener('click', doJoin);
nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') doJoin(); });

function doJoin() {
  const name = nameInput.value.trim();
  if (!name)   { joinError.textContent = 'Please enter your name.'; return; }
  if (!roomId) { joinError.textContent = 'No room ID — scan the QR code.'; return; }
  myName = name;
  joinError.textContent = '';
  joinBtn.disabled = true;
  socket.emit('join_game', { roomId, playerName: name, gameType: 'tv-sokoban' });
}

socket.on('joined', ({ color }) => {
  myColor = color;
  mySeat  = seatForColor(color);
  if (color === 'spectator' || color === 'tv-host') {
    joinError.textContent = 'Room is full — joined as spectator.';
    joinBtn.disabled = false;
    return;
  }
  sfx.join();
  waitingName.textContent = myName;
  showScreen('waiting');
});

socket.on('room_update', () => {});

// ── Game events ───────────────────────────────────────────────────────────────
socket.on('game_started', (state) => {
  if (state.gameType !== 'tv-sokoban') return;
  isSolved = false;
  myCurrentScore = 0;
  facing = 'down';
  sfx.gameStart();
  showScreen('playing');
  applyState(state);
});

socket.on('game_state', (state) => {
  if (state.gameType !== 'tv-sokoban') return;
  if (!playingScreen.classList.contains('active')) showScreen('playing');
  applyState(state);
});

let roundCountdownTimer = null;

socket.on('round_over', ({ currentRound, totalRounds, players, sessionScores, nextRoundIn }) => {
  isSolved = false;
  facing = 'down';
  sfx.roundOver();

  if (players && mySeat >= 0 && players[mySeat]) myCurrentScore = players[mySeat].score || 0;
  else if (sessionScores && mySeat >= 0)         myCurrentScore = sessionScores[mySeat] || 0;

  const rn = (currentRound !== undefined ? currentRound : 0) + 1;
  const rt = totalRounds || 3;
  const isLastRound = rn >= rt;

  myScoreEl.textContent = myCurrentScore + ' pts';
  watchTvText.textContent = `Round ${rn} of ${rt} done!`;
  solvedOverlay.classList.add('hidden');
  watchTv.classList.remove('hidden');
  feedbackEl.textContent = '';
  setDpad(false);

  if (!isLastRound) {
    let countdown = nextRoundIn || 5;
    watchTvSub.textContent = `${myCurrentScore} pts — next round in ${countdown}s`;
    if (roundCountdownTimer) clearInterval(roundCountdownTimer);
    roundCountdownTimer = setInterval(() => {
      countdown--;
      if (countdown <= 0) {
        clearInterval(roundCountdownTimer);
        watchTvSub.textContent = 'Next round starting...';
      } else {
        watchTvSub.textContent = `${myCurrentScore} pts — next round in ${countdown}s`;
      }
    }, 1000);
  } else {
    watchTvSub.textContent = `Your score: ${myCurrentScore} pts — final results soon…`;
  }
});

socket.on('game_over', ({ winner, players }) => {
  const didWin = winner === myName;
  const myData = players ? players.find(p => p.name === myName) : null;
  const finalScore = myData ? myData.score : myCurrentScore;

  goTrophy.textContent   = didWin ? '🏆' : '📦';
  goTitle.textContent    = didWin ? 'You Win!' : 'Game Over!';
  goScore.textContent    = finalScore + ' pts';
  goPersonal.textContent = didWin ? '🎉 You solved it fastest!' : `${winner || 'Someone'} was faster!`;

  didWin ? sfx.victory() : sfx.roundOver();
  showScreen('gameover');
});

socket.on('play_again', () => {
  gameState = null;
  showScreen('waiting');
});

socket.on('error', ({ message }) => { joinError.textContent = message; joinBtn.disabled = false; });

// ── Apply server state ────────────────────────────────────────────────────────
function applyState(state) {
  const { currentRound, totalRounds, playerSolved, sessionScores, moveCounts, playerGrids } = state;

  roundInfoEl.textContent = `${(currentRound || 0) + 1}/${totalRounds || 3}`;

  if (sessionScores && mySeat >= 0) myCurrentScore = sessionScores[mySeat] || 0;
  myScoreEl.textContent = myCurrentScore + ' pts';

  if (moveCounts && mySeat >= 0) myMovesEl.textContent = moveCounts[mySeat] || 0;

  const mySolvedNow = playerSolved && mySeat >= 0 && playerSolved[mySeat];

  if (mySolvedNow && !isSolved) {
    isSolved = true;
    sfx.correct();
    feedbackEl.textContent = '';
    solvedOverlay.classList.remove('hidden');
    setDpad(false);
  }

  if (!mySolvedNow) {
    isSolved = false;
    solvedOverlay.classList.add('hidden');
    watchTv.classList.add('hidden');
    setDpad(true);
    feedbackEl.textContent = '';
  }

  // Draw my grid
  if (playerGrids && mySeat >= 0 && playerGrids[mySeat]) {
    drawGrid(playerGrids[mySeat]);
  }
}

// ── Controls ──────────────────────────────────────────────────────────────────
function sendMove(dir) {
  if (isSolved) return;
  const faceMap = { up: 'up', down: 'down', left: 'left', right: 'right' };
  facing = faceMap[dir] || facing;
  socket.emit('tv_sokoban_move', { direction: dir });
}

btnUp.addEventListener('click',    () => sendMove('up'));
btnDown.addEventListener('click',  () => sendMove('down'));
btnLeft.addEventListener('click',  () => sendMove('left'));
btnRight.addEventListener('click', () => sendMove('right'));

btnUndo.addEventListener('click', () => {
  if (isSolved) return;
  socket.emit('tv_sokoban_undo');
});

btnRestart.addEventListener('click', () => {
  if (isSolved) return;
  facing = 'down';
  socket.emit('tv_sokoban_restart');
});

// Keyboard
document.addEventListener('keydown', e => {
  const map = { ArrowUp:'up', ArrowDown:'down', ArrowLeft:'left', ArrowRight:'right', w:'up', s:'down', a:'left', d:'right' };
  if (map[e.key]) { e.preventDefault(); sendMove(map[e.key]); }
  if ((e.key === 'z' || e.key === 'Z') && !isSolved) { e.preventDefault(); socket.emit('tv_sokoban_undo'); }
});

// Swipe on board area
let touchStart = null;
boardArea.addEventListener('touchstart', e => {
  touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
}, { passive: true });
boardArea.addEventListener('touchend', e => {
  if (!touchStart) return;
  const dx = e.changedTouches[0].clientX - touchStart.x;
  const dy = e.changedTouches[0].clientY - touchStart.y;
  touchStart = null;
  if (Math.abs(dx) < 25 && Math.abs(dy) < 25) return;
  if (Math.abs(dx) > Math.abs(dy)) sendMove(dx > 0 ? 'right' : 'left');
  else sendMove(dy > 0 ? 'down' : 'up');
});

function setDpad(enabled) {
  [btnUp, btnDown, btnLeft, btnRight, btnUndo, btnRestart].forEach(b => b.disabled = !enabled);
}

// ── Screen switch ─────────────────────────────────────────────────────────────
function showScreen(name) {
  [joinScreen, waitingScreen, playingScreen, gameoverScreen].forEach(s => s.classList.remove('active'));
  ({ join: joinScreen, waiting: waitingScreen, playing: playingScreen, gameover: gameoverScreen })[name]?.classList.add('active');
}

// ── Dev auto-join ─────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  const devname = params.get('devname');
  if (devname && nameInput) {
    nameInput.value = devname;
    setTimeout(() => joinBtn?.click(), 500);
  }
});
