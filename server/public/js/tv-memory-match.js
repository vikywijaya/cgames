'use strict';

const params = new URLSearchParams(location.search);

// ── URL params (host handoff from /tv-lobby) ────────────────────────────────
const _hostHandoff = params.get('host') === '1';
const _initialRoom = params.get('room');

let myRoomId = _initialRoom || null;
let roomPlayers = [];
let gameState = null;
let selectedDifficulty = 'easy';

// ── DOM ───────────────────────────────────────────────────────────────────────
const lobbyPhase     = document.getElementById('lobbyPhase');
const playingPhase   = document.getElementById('playingPhase');
const roundOverPhase = document.getElementById('roundOverPhase');
const gameOverPhase  = document.getElementById('gameOverPhase');

const lobbyPlayerList  = document.getElementById('lobbyPlayerList');
const startBtn         = document.getElementById('startBtn');
const startError       = document.getElementById('startError');
const joinUrlEl        = document.getElementById('joinUrl');
const playingMeta      = document.getElementById('playingMeta');
const boardsGrid       = document.getElementById('boardsGrid');
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
    gameType: 'tv-memory-match',
    reconnect: !!myRoomId
  });
});

let _hostStartFired = false;
socket.on('joined', ({ roomId }) => {
  myRoomId = roomId;

  if (_hostHandoff && !_hostStartFired && !playingPhase.classList.contains('active')) {
    _hostStartFired = true;
    setTimeout(() => socket.emit('tv_memory_match_start', { difficulty: selectedDifficulty }), 400);
    return;
  }

  const joinUrl = `${location.origin}/tv-join?game=tv-memory-match&room=${roomId}`;
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
    `<div class="tv-player-item"><div class="tv-player-dot"></div>${p.name}</div>`
  ).join('');
}

document.querySelectorAll('.tv-diff-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tv-diff-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedDifficulty = btn.dataset.diff;
  });
});

startBtn.addEventListener('click', () => {
  startBtn.disabled = true;
  startError.textContent = '';
  socket.emit('tv_memory_match_start', { difficulty: selectedDifficulty });
});

socket.on('error', ({ message }) => {
  startError.textContent = message;
  startBtn.disabled = false;
});

// ── Game events ───────────────────────────────────────────────────────────────
socket.on('game_started', (state) => {
  if (state.gameType !== 'tv-memory-match') return;
  gameState = state;
  if (tvGraceTimer) { clearInterval(tvGraceTimer); tvGraceTimer = null; }
  playingMeta.style.color = '';
  showPhase('playing');
  renderPlaying(state);
});

socket.on('game_state', (state) => {
  if (state.gameType !== 'tv-memory-match') return;
  gameState = state;
  showPhase('playing');
  renderPlaying(state);
});

let tvGraceTimer = null;

socket.on('memory_match_grace', ({ secondsLeft, finisher }) => {
  let remaining = secondsLeft;
  playingMeta.textContent = `${finisher} finished! ${remaining}s left`;
  playingMeta.style.color = '#fbbf24';
  if (tvGraceTimer) clearInterval(tvGraceTimer);
  tvGraceTimer = setInterval(() => {
    remaining--;
    if (remaining <= 0) {
      clearInterval(tvGraceTimer);
      tvGraceTimer = null;
      playingMeta.textContent = "Time's up!";
      playingMeta.style.color = '#f87171';
    } else {
      playingMeta.textContent = `${finisher} finished! ${remaining}s left`;
    }
  }, 1000);
});

socket.on('round_over', ({ currentRound, totalRounds, solvedOrder, pointsAwarded, sessionScores, players, nextRoundIn }) => {
  if (tvGraceTimer) { clearInterval(tvGraceTimer); tvGraceTimer = null; }
  playingMeta.style.color = '';
  const roundNum = (currentRound !== undefined ? currentRound : 0) + 1;
  roundOverTitle.textContent = `Round ${roundNum} Done!`;

  roundOverResults.innerHTML = '';
  const medals = ['🥇', '🥈', '🥉'];
  (solvedOrder || []).forEach((seat, i) => {
    const p = players && players[seat] ? players[seat] : { name: `P${seat + 1}` };
    const pts = pointsAwarded && pointsAwarded[seat] !== undefined ? pointsAwarded[seat] : (i < medals.length ? 3 - i : 0);
    roundOverResults.innerHTML += `
      <div class="tv-round-score-row">
        <div class="tv-round-score-medal">${medals[i] || '▸'}</div>
        <div class="tv-round-score-name">${p.name}</div>
        <div class="tv-round-score-pts">+${pts} pts — ${(sessionScores || [])[seat] || 0} total</div>
      </div>`;
  });

  const nextIn = nextRoundIn || 5;
  let countdown = nextIn;
  roundOverNext.textContent = `Next round in ${countdown}...`;
  const iv = setInterval(() => {
    countdown--;
    if (countdown <= 0) { clearInterval(iv); roundOverNext.textContent = 'Starting...'; }
    else roundOverNext.textContent = `Next round in ${countdown}...`;
  }, 1000);

  showPhase('roundover');
});

socket.on('game_over', ({ winner, players }) => {
  gameOverWinner.textContent = winner ? `🏆 ${winner} wins!` : "It's a tie!";
  gameOverFinal.innerHTML = (players || []).map(p =>
    `<div class="tv-final-score-row"><span>${p.name}</span><span>${p.score} pts</span></div>`
  ).join('');
  showPhase('gameover');
});

// ── Render playing ────────────────────────────────────────────────────────────
function renderPlaying(state) {
  const { currentRound, totalRounds, cols, rows, cards, cardStates, matchCounts, totalPairs, finished, sessionScores } = state;
  playingMeta.textContent = `Round ${(currentRound || 0) + 1} of ${totalRounds || 3}`;

  // Scoreboard
  const players = roomPlayers.filter(p => p.color !== 'tv-host');
  scoreboardPlaying.innerHTML = players.map((p, i) =>
    `<div class="tv-score-chip"><div class="tv-score-name">${p.name}</div><div class="tv-score-pts">${(sessionScores || [])[i] || 0} pts</div></div>`
  ).join('');

  // Grid layout
  const count = players.length;
  const gridCols = count <= 2 ? count : count <= 4 ? 2 : count <= 6 ? 3 : 4;
  boardsGrid.style.gridTemplateColumns = `repeat(${gridCols}, 1fr)`;
  boardsGrid.style.maxWidth = gridCols === 1 ? '500px' : gridCols === 2 ? '900px' : '1200px';

  const cardSize = count <= 2 ? 32 : count <= 4 ? 26 : 20;

  boardsGrid.innerHTML = players.map((p, i) => {
    const cs = cardStates && cardStates[i];
    const mc = matchCounts && matchCounts[i] || 0;
    const tp = totalPairs || 0;
    const done = finished && finished[i];
    const gridHtml = cs ? renderCardGrid(cards, cs, cols, rows, cardSize) : '';
    return `
      <div class="tv-player-board${done ? ' board-done' : ''}">
        <div class="tv-board-name">${p.name} ${done ? '✅' : ''}</div>
        <div class="tv-board-progress">${mc}/${tp} pairs</div>
        ${gridHtml}
      </div>`;
  }).join('');
}

function renderCardGrid(cards, cardStates, cols, rows, cellSize) {
  if (!cards || !cardStates) return '';
  let html = `<div class="tv-card-grid" style="grid-template-columns:repeat(${cols},${cellSize}px);grid-template-rows:repeat(${rows},${cellSize}px);">`;
  for (let i = 0; i < cards.length; i++) {
    const cs = cardStates[i];
    let cls = 'tv-card tv-card-hidden';
    let content = '';
    if (cs.isMatched) {
      cls = 'tv-card tv-card-matched';
      content = cards[i];
    } else if (cs.isFlipped) {
      cls = 'tv-card tv-card-flipped';
      content = cards[i];
    }
    html += `<div class="${cls}" style="width:${cellSize}px;height:${cellSize}px;font-size:${Math.floor(cellSize * 0.55)}px;">${content}</div>`;
  }
  html += '</div>';
  return html;
}

// ── Phase switching ───────────────────────────────────────────────────────────
// ── Play Again ───────────────────────────────────────────────────────────────
const playAgainBtn = document.getElementById('playAgainBtn');
if (playAgainBtn) playAgainBtn.addEventListener('click', () => {
  socket.emit('play_again');
  setTimeout(function(){ location.replace('/tv-lobby?game=tv-memory-match' + (myRoomId ? '&room=' + myRoomId : '')); }, 60);
});

socket.on('play_again', () => {
  gameState = null;
  showPhase('lobby');
});

function showPhase(name) {
  [lobbyPhase, playingPhase, roundOverPhase, gameOverPhase].forEach(el => el.classList.remove('active'));
  if (name === 'lobby')     lobbyPhase.classList.add('active');
  if (name === 'playing')   playingPhase.classList.add('active');
  if (name === 'roundover') roundOverPhase.classList.add('active');
  if (name === 'gameover')  gameOverPhase.classList.add('active');
}
