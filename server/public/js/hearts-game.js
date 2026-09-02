'use strict';

// ── URL params ─────────────────────────────────────────────────────────────
const params  = new URLSearchParams(window.location.search);
const roomId  = params.get('room');
const myColor = params.get('color');   // 'south' | 'west' | 'north' | 'east'
const myName  = params.get('name') || 'Player';

if (!roomId) window.location.href = '/';

// ── Card data (Hearts ranking: 2=low, A=high) ─────────────────────────────
const RANKS = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
const SUITS = ['D','C','H','S'];
const SUIT_GLYPHS = { D: '♦', C: '♣', H: '♥', S: '♠' };
const RED_SUITS = new Set(['D','H']);

function cardFromId(id) {
  return { id, rank: RANKS[Math.floor(id / 4)], suit: SUITS[id % 4] };
}

function cardSortKey(id) {
  const card = cardFromId(id);
  // Sort by suit then rank
  const suitOrder = { D: 0, C: 1, H: 2, S: 3 };
  return suitOrder[card.suit] * 100 + RANKS.indexOf(card.rank);
}

// ── DOM refs ───────────────────────────────────────────────────────────────
const statusBar        = document.getElementById('statusBar');
const heartsPlayersEl  = document.getElementById('heartsPlayers');
const trickCardsEl     = document.getElementById('trickCards');
const trickInfo        = document.getElementById('trickInfo');
const scoreBar         = document.getElementById('scoreBar');
const scoreText        = document.getElementById('scoreText');
const myHandEl         = document.getElementById('myHand');
const playBtn          = document.getElementById('playBtn');
const gameOverOverlay  = document.getElementById('gameOverOverlay');
const gameOverTitle    = document.getElementById('gameOverTitle');
const gameOverMsg      = document.getElementById('gameOverMsg');
const playAgainBtn     = document.getElementById('playAgainBtn');
const backLobbyBtn     = document.getElementById('backLobbyBtn');
const reconnectOverlay = document.getElementById('reconnectOverlay');
const reconnectMsg     = document.getElementById('reconnectMsg');
const backLobbyLink    = document.getElementById('backLobbyLink');

// ── State ──────────────────────────────────────────────────────────────────
let gameActive = false;
let myTurn     = false;
let myHand     = [];
let selected   = new Set();
let gameState  = null;

const SEAT_COLORS = ['south', 'west', 'north', 'east'];
const SEAT_NAMES  = { south: 'South', west: 'West', north: 'North', east: 'East' };
const SEAT_DOT    = { south: '#1155cc', west: '#1a6e1a', north: '#7d3c98', east: '#b7600a' };

// ── Socket ─────────────────────────────────────────────────────────────────
const socket = io({ reconnectionAttempts: 5, reconnectionDelay: 1000 });

socket.on('connect', () => {
  reconnectOverlay.style.display = 'none';
  socket.emit('join_game', { roomId, playerName: myName, reconnect: true, gameType: 'hearts' });
});

socket.on('disconnect', () => {
  reconnectOverlay.style.display = 'flex';
  reconnectMsg.textContent = 'Connection lost. Reconnecting…';
});

socket.on('reconnect_attempt', n => {
  reconnectMsg.textContent = `Reconnecting… (attempt ${n})`;
});

socket.on('reconnect_failed', () => {
  reconnectMsg.textContent = 'Could not reconnect.';
  backLobbyLink.classList.remove('hidden');
});

socket.on('joined', () => {});
socket.on('game_started', state => applyState(state));
socket.on('game_state',   state => applyState(state));
socket.on('invalid_move', ({ reason }) => flashStatus(`Invalid: ${reason}`, 3000));
socket.on('game_over', ({ winner, reason }) => showGameOver(winner, reason));

socket.on('play_again', () => {
  gameActive = false; myTurn = false; myHand = []; selected.clear(); gameState = null;
  gameOverOverlay.classList.add('hidden');
  heartsPlayersEl.innerHTML = '';
  trickCardsEl.innerHTML = '';
  myHandEl.innerHTML = '';
  scoreBar.classList.add('hidden');
  updateActions();
  statusBar.textContent = 'Waiting for host to start…';
});

socket.on('player_disconnected', ({ playerName }) =>
  flashStatus(`${playerName} disconnected. Waiting…`, 0));

// ── Apply state ────────────────────────────────────────────────────────────
function applyState(state) {
  if (!state || state.gameType !== 'hearts') return;
  gameState  = state;
  gameActive = !state.isGameOver;
  myHand     = state.myHand || [];

  const mySeat = SEAT_COLORS.indexOf(myColor);
  myTurn = state.currentSeat === mySeat && gameActive;

  renderPlayers(state);
  renderTrick(state.trickCards || []);
  renderScores(state.pointsTaken || []);
  renderHand();
  updateActions();

  if (state.isGameOver) {
    showGameOver(state.winner, null);
    return;
  }

  const currentPlayer = state.players.find((p, i) => SEAT_COLORS.indexOf(p.color) === state.currentSeat);
  statusBar.textContent = myTurn
    ? 'Your turn — select a card to play'
    : `${currentPlayer ? currentPlayer.name : 'Opponent'}'s turn`;

  if (state.trickNumber !== undefined) {
    trickInfo.textContent = `Trick ${state.trickNumber} of 13`;
    trickInfo.classList.remove('hidden');
  }
}

// ── Render ──────────────────────────────────────────────────────────────────
function renderPlayers(state) {
  heartsPlayersEl.innerHTML = '';
  SEAT_COLORS.forEach((color, seat) => {
    const playerData = state.players.find(p => p.color === color);
    const name = playerData ? playerData.name : `Seat ${seat + 1}`;
    const isActive = state.currentSeat === seat;
    const tricks = state.tricksWon ? state.tricksWon[seat] : 0;
    const points = state.pointsTaken ? state.pointsTaken[seat] : 0;

    const div = document.createElement('div');
    div.className = 'cdi-player' + (isActive ? ' active-turn' : '');

    const dot = document.createElement('span');
    dot.className = 'cdi-player-dot';
    dot.style.background = SEAT_DOT[color];

    const nameEl = document.createElement('span');
    nameEl.textContent = `${SEAT_NAMES[color]}: ${name}${color === myColor ? ' (you)' : ''}`;

    const countEl = document.createElement('span');
    countEl.className = 'cdi-player-count';
    countEl.textContent = `${tricks} tricks, ${points} pts`;

    div.appendChild(dot);
    div.appendChild(nameEl);
    div.appendChild(countEl);
    heartsPlayersEl.appendChild(div);
  });
}

function renderTrick(trickCards) {
  trickCardsEl.innerHTML = '';
  if (!trickCards || trickCards.length === 0) return;
  trickCards.forEach(({ seat, cardId }) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'trick-card-wrapper';
    const label = document.createElement('div');
    label.className = 'trick-card-label';
    const playerColor = SEAT_COLORS[seat];
    const playerData = gameState?.players?.find(p => p.color === playerColor);
    label.textContent = playerData ? playerData.name : SEAT_NAMES[playerColor];
    wrapper.appendChild(makeCardTile(cardFromId(cardId)));
    wrapper.appendChild(label);
    trickCardsEl.appendChild(wrapper);
  });
}

function renderScores(pointsTaken) {
  if (!pointsTaken || pointsTaken.every(p => p === 0)) {
    scoreBar.classList.add('hidden');
    return;
  }
  scoreBar.classList.remove('hidden');
  const parts = SEAT_COLORS.map((color, i) => {
    const playerData = gameState?.players?.find(p => p.color === color);
    const name = playerData ? playerData.name : SEAT_NAMES[color];
    return `${name}: ${pointsTaken[i]}`;
  });
  scoreText.textContent = 'Points — ' + parts.join(' | ');
}

function renderHand() {
  myHandEl.innerHTML = '';
  const sorted = [...myHand].sort((a, b) => cardSortKey(a) - cardSortKey(b));
  sorted.forEach(id => {
    const tile = makeCardTile(cardFromId(id));
    if (selected.has(id)) tile.classList.add('selected');
    tile.addEventListener('click', () => toggleSelect(id, tile));
    myHandEl.appendChild(tile);
  });
}

function makeCardTile(card) {
  const div = document.createElement('div');
  div.className = 'card-tile ' + (RED_SUITS.has(card.suit) ? 'red-suit' : 'black-suit');
  div.dataset.id = card.id;
  const rankEl = document.createElement('span'); rankEl.className = 'card-tile-rank'; rankEl.textContent = card.rank;
  const suitEl = document.createElement('span'); suitEl.className = 'card-tile-suit'; suitEl.textContent = SUIT_GLYPHS[card.suit];
  div.appendChild(rankEl);
  div.appendChild(suitEl);
  return div;
}

function toggleSelect(id, tile) {
  if (!myTurn || !gameActive) return;
  // Hearts: only one card at a time
  selected.clear();
  myHandEl.querySelectorAll('.card-tile.selected').forEach(el => el.classList.remove('selected'));
  selected.add(id);
  tile.classList.add('selected');
  updateActions();
}

// ── Actions ────────────────────────────────────────────────────────────────
function updateActions() {
  playBtn.disabled = !myTurn || !gameActive || selected.size !== 1;
}

playBtn.addEventListener('click', () => {
  if (selected.size !== 1) return;
  const cardId = [...selected][0];
  socket.emit('hearts_play', { cardId });
  selected.clear();
});

playAgainBtn.addEventListener('click', () => { socket.emit('play_again'); });
backLobbyBtn.addEventListener('click', () => { window.location.href = '/'; });

// ── Game over ──────────────────────────────────────────────────────────────
function showGameOver(winnerSeat, reason) {
  gameActive = false;
  gameOverOverlay.classList.remove('hidden');

  const mySeat = SEAT_COLORS.indexOf(myColor);
  if (winnerSeat === mySeat) {
    gameOverTitle.textContent = 'You Win! 🎉';
    gameOverMsg.textContent = reason || 'Lowest points!';
  } else if (winnerSeat !== null && winnerSeat !== undefined) {
    const winColor = SEAT_COLORS[winnerSeat];
    const wp = gameState?.players?.find(p => p.color === winColor);
    gameOverTitle.textContent = 'Game Over';
    gameOverMsg.textContent = reason || `${wp?.name || SEAT_NAMES[winColor]} wins!`;
  } else {
    gameOverTitle.textContent = 'Game Over';
    gameOverMsg.textContent = reason || '';
  }

  // Show final scores
  if (gameState?.pointsTaken) {
    const scores = SEAT_COLORS.map((color, i) => {
      const p = gameState.players?.find(pl => pl.color === color);
      return `${p?.name || SEAT_NAMES[color]}: ${gameState.pointsTaken[i]} pts`;
    }).join(' | ');
    gameOverMsg.textContent += '\n' + scores;
  }
  updateActions();
}

// ── Flash status ───────────────────────────────────────────────────────────
let flashTimer = null;
function flashStatus(msg, duration) {
  statusBar.textContent = msg;
  if (flashTimer) clearTimeout(flashTimer);
  if (duration > 0) flashTimer = setTimeout(() => { if (gameState) applyState(gameState); }, duration);
}
