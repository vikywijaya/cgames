'use strict';

const params = new URLSearchParams(location.search);
const roomId = params.get('room');

// ── URL params (host handoff from /tv-lobby) ────────────────────────────────
const _hostHandoff = params.get('host') === '1';
const _initialRoom = params.get('room');

let myRoomId = _initialRoom || null;
let roomPlayers = [];

// ── DOM ───────────────────────────────────────────────────────────────────────
const lobbyPhase     = document.getElementById('lobbyPhase');
const playingPhase   = document.getElementById('playingPhase');
const roundOverPhase = document.getElementById('roundOverPhase');
const gameOverPhase  = document.getElementById('gameOverPhase');

const lobbyPlayerList   = document.getElementById('lobbyPlayerList');
const startBtn          = document.getElementById('startBtn');
const startError        = document.getElementById('startError');
const joinUrlEl         = document.getElementById('joinUrl');
const playingMeta       = document.getElementById('playingMeta');
const boardsGrid        = document.getElementById('boardsGrid');
const scoreboardPlaying = document.getElementById('scoreboardPlaying');
const roundOverTitle    = document.getElementById('roundOverTitle');
const roundOverResults  = document.getElementById('roundOverResults');
const roundOverNext     = document.getElementById('roundOverNext');
const gameOverWinner    = document.getElementById('gameOverWinner');
const gameOverFinal     = document.getElementById('gameOverFinal');

// ── Socket ────────────────────────────────────────────────────────────────────
const socket = io({ reconnectionAttempts: Infinity, reconnectionDelay: 1000, transports: ['websocket', 'polling'] });

if (_hostHandoff && lobbyPhase) lobbyPhase.classList.remove('active');

socket.on('connect', () => {
  socket.emit('join_game', {
    roomId: myRoomId || null,
    playerName: 'TV Display',
    gameType: 'tv-ring-sort',
    reconnect: !!myRoomId
  });
});

let _hostStartFired = false;
socket.on('joined', ({ roomId }) => {
  myRoomId = roomId;

  if (_hostHandoff && !_hostStartFired && !playingPhase.classList.contains('active')) {
    _hostStartFired = true;
    setTimeout(() => socket.emit('tv_ring_sort_start'), 400);
    return;
  }

  const joinUrl = `${location.origin}/tv-join?game=tv-ring-sort&room=${roomId}`;
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
  socket.emit('tv_ring_sort_start');
});

socket.on('error', ({ message }) => {
  startError.textContent = message;
  startBtn.disabled = false;
});

// ── Game events ───────────────────────────────────────────────────────────────
socket.on('game_started', (state) => {
  if (state.gameType !== 'tv-ring-sort') return;
  showPhase('playing');
  renderPlaying(state);
});

socket.on('game_state', (state) => {
  if (state.gameType !== 'tv-ring-sort') return;
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

  let countdown = nextRoundIn || 5;
  roundOverNext.textContent = `Next round in ${countdown}…`;
  const iv = setInterval(() => {
    countdown--;
    if (countdown <= 0) { clearInterval(iv); roundOverNext.textContent = 'Starting…'; }
    else roundOverNext.textContent = `Next round in ${countdown}…`;
  }, 1000);

  showPhase('roundover');
});

socket.on('game_over', ({ winner, players }) => {
  gameOverWinner.textContent = winner ? `🏆 ${winner} wins!` : "It's a tie!";
  gameOverFinal.innerHTML = (players || []).map(p =>
    `<div class="final-card"><div class="final-name">${p.name}</div><div class="final-score">${p.score} pts</div></div>`
  ).join('');
  showPhase('gameover');
});

// ── Render playing ────────────────────────────────────────────────────────────
function renderPlaying(state) {
  const { currentRound, totalRounds, playerSolved, moveCounts, playerRods, config } = state;
  playingMeta.textContent = `Round ${(currentRound || 0) + 1} of ${totalRounds || 3}`;

  const players = roomPlayers.filter(p => p.color !== 'tv-host');
  scoreboardPlaying.innerHTML = players.map((p, i) =>
    `<div class="score-chip"><div class="score-name">${p.name}</div><div class="score-pts">${(state.sessionScores || [])[i] || 0} pts</div></div>`
  ).join('');

  const count = players.length;
  const cols = count <= 2 ? count : count <= 4 ? 2 : count <= 6 ? 3 : 4;
  boardsGrid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;

  boardsGrid.innerHTML = players.map((p, i) => {
    const rods = playerRods && playerRods[i] ? playerRods[i] : [];
    const solved = playerSolved && playerSolved[i];
    const mv = moveCounts && moveCounts[i] || 0;
    const numColors = config ? config.numColors : 2;
    const ringsPerColor = config ? config.ringsPerColor : 3;
    return `
      <div class="player-board${solved ? ' solved' : ''}">
        <div class="player-name">${p.name} ${solved ? '✅' : ''}</div>
        <div class="player-moves">${mv} moves</div>
        ${renderRods(rods, numColors, ringsPerColor)}
      </div>`;
  }).join('');
}

function renderRods(rods, numColors, ringsPerColor) {
  if (!rods || rods.length === 0) return '<div style="color:#475569;font-size:12px;">Loading...</div>';
  const pegH = ringsPerColor * 14 + 10;
  let html = '<div class="rods-row">';
  rods.forEach((rod, ri) => {
    const isComplete = rod.length === ringsPerColor && rod.every(r => r.name === rod[0].name);
    html += `<div class="rod-wrap${isComplete ? ' complete' : ''}">
      <div class="rod-peg" style="height:${pegH}px;"></div>
      <div class="rod-rings">`;
    rod.forEach(ring => {
      html += `<div class="ring-tile" style="width:${ring.size !== undefined ? Math.max(20, 36 - ring.size * 4) : 28}px;background:${ring.bg};"></div>`;
    });
    html += `</div><div class="rod-base" style="width:50px;"></div></div>`;
  });
  html += '</div>';
  return html;
}

// ── Phase switching ───────────────────────────────────────────────────────────
// ── Play Again ───────────────────────────────────────────────────────────────
const playAgainBtn = document.getElementById('playAgainBtn');
if (playAgainBtn) playAgainBtn.addEventListener('click', () => {
  socket.emit('play_again');
  setTimeout(function(){ location.replace('/tv-lobby?game=tv-ring-sort' + (myRoomId ? '&room=' + myRoomId : '')); }, 60);
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
