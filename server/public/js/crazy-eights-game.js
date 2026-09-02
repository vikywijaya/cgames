'use strict';

// ── URL params ─────────────────────────────────────────────────────────────
const params  = new URLSearchParams(window.location.search);
const roomId  = params.get('room');
const myColor = params.get('color');   // 'p1' | 'p2' | 'p3' | 'p4'
const myName  = params.get('name') || 'Player';

if (!roomId) window.location.href = '/';

// ── Card data ──────────────────────────────────────────────────────────────
const RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
const SUITS = ['D','C','H','S'];
const SUIT_GLYPHS = { D: '♦', C: '♣', H: '♥', S: '♠' };
const SUIT_NAMES  = { D: 'Diamonds', C: 'Clubs', H: 'Hearts', S: 'Spades' };
const RED_SUITS = new Set(['D','H']);

function cardFromId(id) {
  return { id, rank: RANKS[Math.floor(id / 4)], suit: SUITS[id % 4] };
}

// ── DOM refs ───────────────────────────────────────────────────────────────
const statusBar        = document.getElementById('statusBar');
const c8PlayersEl      = document.getElementById('c8Players');
const myHandEl         = document.getElementById('myHand');
const playBtn          = document.getElementById('playBtn');
const drawBtn          = document.getElementById('drawBtn');
const passBtn          = document.getElementById('passBtn');
const discardTopCard   = document.getElementById('discardTopCard');
const drawCount        = document.getElementById('drawCount');
const currentSuitBadge = document.getElementById('currentSuitBadge');
const suitChooser      = document.getElementById('suitChooser');
const gameOverOverlay  = document.getElementById('gameOverOverlay');
const gameOverTitle    = document.getElementById('gameOverTitle');
const gameOverMsg      = document.getElementById('gameOverMsg');
const playAgainBtn     = document.getElementById('playAgainBtn');
const backLobbyBtn     = document.getElementById('backLobbyBtn');
const reconnectOverlay = document.getElementById('reconnectOverlay');
const reconnectMsg     = document.getElementById('reconnectMsg');
const backLobbyLink    = document.getElementById('backLobbyLink');

// ── State ──────────────────────────────────────────────────────────────────
let gameActive  = false;
let myTurn      = false;
let myHand      = [];
let selected    = new Set();
let gameState   = null;
let hasDrawn    = false;   // track if player drew this turn (to enable pass)
let startedAt   = null;

const SEAT_COLORS = ['p1', 'p2', 'p3', 'p4'];
const SEAT_NAMES  = { p1: 'Player 1', p2: 'Player 2', p3: 'Player 3', p4: 'Player 4' };
const SEAT_DOT    = { p1: '#1155cc', p2: '#b7600a', p3: '#1a6e1a', p4: '#7d3c98' };

// ── Socket ─────────────────────────────────────────────────────────────────
const socket = io({ reconnectionAttempts: 5, reconnectionDelay: 1000 });

socket.on('connect', () => {
  reconnectOverlay.style.display = 'none';
  socket.emit('join_game', { roomId, playerName: myName, reconnect: true, gameType: 'crazy-eights' });
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
  gameActive = false; myTurn = false; myHand = []; selected.clear(); gameState = null; hasDrawn = false;
  gameOverOverlay.classList.add('hidden');
  suitChooser.classList.add('hidden');
  c8PlayersEl.innerHTML = '';
  myHandEl.innerHTML = '';
  updateActions();
  statusBar.textContent = 'Waiting for host to start…';
});

socket.on('player_disconnected', ({ playerName }) =>
  flashStatus(`${playerName} disconnected. Waiting…`, 0));

// ── Apply state ────────────────────────────────────────────────────────────
function applyState(state) {
  if (!state || state.gameType !== 'crazy-eights') return;
  if (startedAt === null) startedAt = Date.now();
  gameState  = state;
  gameActive = !state.isGameOver;
  myHand     = state.myHand || [];

  const mySeat = SEAT_COLORS.indexOf(myColor);
  myTurn = state.currentSeat === mySeat && gameActive;

  // Reset hasDrawn when it becomes our turn from a new state
  if (myTurn && state.phase === 'play') hasDrawn = false;

  renderPlayers(state);
  renderDiscard(state.discardTop, state.currentSuit);
  drawCount.textContent = `Draw (${state.drawPileCount})`;
  renderHand();
  updateActions();

  if (state.isGameOver) {
    showGameOver(state.winner, null);
    return;
  }

  const currentPlayerIdx = state.currentSeat;
  const currentPlayer = state.players[currentPlayerIdx];
  statusBar.textContent = myTurn
    ? 'Your turn — play a card, draw, or pass'
    : `${currentPlayer ? currentPlayer.name : 'Opponent'}'s turn`;
}

// ── Render ──────────────────────────────────────────────────────────────────
function renderPlayers(state) {
  c8PlayersEl.innerHTML = '';
  state.players.forEach((p, i) => {
    const color = SEAT_COLORS[i];
    const isActive = state.currentSeat === i;
    const count = state.handCounts ? state.handCounts[i] : '?';

    const div = document.createElement('div');
    div.className = 'cdi-player' + (isActive ? ' active-turn' : '');

    const dot = document.createElement('span');
    dot.className = 'cdi-player-dot';
    dot.style.background = SEAT_DOT[color] || '#666';

    const nameEl = document.createElement('span');
    nameEl.textContent = `${p.name}${color === myColor ? ' (you)' : ''}`;

    const countEl = document.createElement('span');
    countEl.className = 'cdi-player-count';
    countEl.textContent = `${count} cards`;

    div.appendChild(dot);
    div.appendChild(nameEl);
    div.appendChild(countEl);
    c8PlayersEl.appendChild(div);
  });
}

function renderDiscard(discardTop, currentSuit) {
  discardTopCard.innerHTML = '';
  discardTopCard.className = 'card-tile';
  if (discardTop === null || discardTop === undefined) {
    discardTopCard.classList.add('card-back');
    return;
  }
  const card = cardFromId(discardTop);
  discardTopCard.classList.add(RED_SUITS.has(card.suit) ? 'red-suit' : 'black-suit');
  const rankEl = document.createElement('span'); rankEl.className = 'card-tile-rank'; rankEl.textContent = card.rank;
  const suitEl = document.createElement('span'); suitEl.className = 'card-tile-suit'; suitEl.textContent = SUIT_GLYPHS[card.suit];
  discardTopCard.appendChild(rankEl);
  discardTopCard.appendChild(suitEl);

  // Show current suit (may differ if 8 was played)
  if (currentSuit) {
    currentSuitBadge.textContent = `Current suit: ${SUIT_GLYPHS[currentSuit]} ${SUIT_NAMES[currentSuit]}`;
    currentSuitBadge.classList.remove('hidden');
  } else {
    currentSuitBadge.classList.add('hidden');
  }
}

function renderHand() {
  myHandEl.innerHTML = '';
  const sorted = [...myHand].sort((a, b) => a - b);
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
  // Only one card at a time
  selected.clear();
  myHandEl.querySelectorAll('.card-tile.selected').forEach(el => el.classList.remove('selected'));
  selected.add(id);
  tile.classList.add('selected');
  updateActions();
}

// ── Actions ────────────────────────────────────────────────────────────────
function updateActions() {
  playBtn.disabled = !myTurn || !gameActive || selected.size !== 1;
  drawBtn.disabled = !myTurn || !gameActive || hasDrawn;
  passBtn.disabled = !myTurn || !gameActive || !hasDrawn;
}

playBtn.addEventListener('click', () => {
  if (selected.size !== 1) return;
  const cardId = [...selected][0];
  const card = cardFromId(cardId);

  // If it's an 8, show suit chooser
  if (card.rank === '8') {
    showSuitChooser(cardId);
    return;
  }

  socket.emit('c8_play', { cardId, chosenSuit: null });
  selected.clear();
});

drawBtn.addEventListener('click', () => {
  socket.emit('c8_draw');
  hasDrawn = true;
  updateActions();
});

passBtn.addEventListener('click', () => {
  socket.emit('c8_pass');
  hasDrawn = false;
  selected.clear();
});

// ── Suit chooser ───────────────────────────────────────────────────────────
let pendingEightCardId = null;

function showSuitChooser(cardId) {
  pendingEightCardId = cardId;
  suitChooser.classList.remove('hidden');
}

document.querySelectorAll('.suit-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const suit = btn.dataset.suit;
    suitChooser.classList.add('hidden');
    if (pendingEightCardId !== null) {
      socket.emit('c8_play', { cardId: pendingEightCardId, chosenSuit: suit });
      pendingEightCardId = null;
      selected.clear();
    }
  });
});

playAgainBtn.addEventListener('click', () => { socket.emit('play_again'); });
backLobbyBtn.addEventListener('click', () => { window.location.href = '/'; });

// ── Game over ──────────────────────────────────────────────────────────────
function showGameOver(winnerSeat, reason) {
  gameActive = false;
  gameOverOverlay.classList.remove('hidden');
  suitChooser.classList.add('hidden');

  const mySeat = SEAT_COLORS.indexOf(myColor);
  if (winnerSeat === mySeat) {
    gameOverTitle.textContent = 'You Win! 🎉';
    gameOverMsg.textContent = reason || 'You played all your cards!';
  } else if (winnerSeat !== null && winnerSeat !== undefined) {
    const wp = gameState?.players?.[winnerSeat];
    gameOverTitle.textContent = 'Game Over';
    gameOverMsg.textContent = reason || `${wp?.name || 'Someone'} wins!`;
  } else {
    gameOverTitle.textContent = 'Game Over';
    gameOverMsg.textContent = reason || '';
  }
  updateActions();

  const result = winnerSeat === mySeat ? 'win' : (winnerSeat !== null && winnerSeat !== undefined) ? 'loss' : 'draw';
  const durationSeconds = startedAt !== null ? Math.round((Date.now() - startedAt) / 1000) : 0;
  reportMultiplayerResult({ gameId: 'mp-crazy-eights', result, durationSeconds });
}

// ── Flash status ───────────────────────────────────────────────────────────
let flashTimer = null;
function flashStatus(msg, duration) {
  statusBar.textContent = msg;
  if (flashTimer) clearTimeout(flashTimer);
  if (duration > 0) flashTimer = setTimeout(() => { if (gameState) applyState(gameState); }, duration);
}
