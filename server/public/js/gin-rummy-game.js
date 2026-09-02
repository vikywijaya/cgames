'use strict';

// ── URL params ─────────────────────────────────────────────────────────────
const params  = new URLSearchParams(window.location.search);
const roomId  = params.get('room');
const myColor = params.get('color');   // 'p1' | 'p2'
const myName  = params.get('name') || 'Player';

if (!roomId) window.location.href = '/';

// ── Card data ──────────────────────────────────────────────────────────────
const RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
const SUITS = ['D','C','H','S'];
const SUIT_GLYPHS = { D: '♦', C: '♣', H: '♥', S: '♠' };
const RED_SUITS = new Set(['D','H']);

function cardFromId(id) {
  return { id, rank: RANKS[Math.floor(id / 4)], suit: SUITS[id % 4] };
}

// ── DOM refs ───────────────────────────────────────────────────────────────
const statusBar        = document.getElementById('statusBar');
const ginPlayersEl     = document.getElementById('ginPlayers');
const myHandEl         = document.getElementById('myHand');
const drawDeckBtn      = document.getElementById('drawDeckBtn');
const drawDiscardBtn   = document.getElementById('drawDiscardBtn');
const discardBtn       = document.getElementById('discardBtn');
const knockBtn         = document.getElementById('knockBtn');
const discardTopCard   = document.getElementById('discardTopCard');
const drawCount        = document.getElementById('drawCount');
const knockPanel       = document.getElementById('knockPanel');
const knockInfo        = document.getElementById('knockInfo');
const knockerMelds     = document.getElementById('knockerMelds');
const layoffBtn        = document.getElementById('layoffBtn');
const doneBtn          = document.getElementById('doneBtn');
const actionBar        = document.getElementById('actionBar');
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
let hasDrawn   = false;
let startedAt  = null;

const SEAT_COLORS = ['p1', 'p2'];
const SEAT_NAMES  = { p1: 'Player 1', p2: 'Player 2' };

// ── Socket ─────────────────────────────────────────────────────────────────
const socket = io({ reconnectionAttempts: 5, reconnectionDelay: 1000 });

socket.on('connect', () => {
  reconnectOverlay.style.display = 'none';
  socket.emit('join_game', { roomId, playerName: myName, reconnect: true, gameType: 'gin-rummy' });
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

socket.on('joined', () => { /* seat confirmed */ });
socket.on('game_started', state => applyState(state));
socket.on('game_state',   state => applyState(state));
socket.on('invalid_move', ({ reason }) => flashStatus(`Invalid: ${reason}`, 3000));
socket.on('game_over', ({ winner, reason }) => showGameOver(winner, reason));

socket.on('play_again', () => {
  gameActive = false; myTurn = false; myHand = []; selected.clear(); gameState = null; hasDrawn = false;
  gameOverOverlay.classList.add('hidden');
  knockPanel.classList.add('hidden');
  actionBar.classList.remove('hidden');
  ginPlayersEl.innerHTML = '';
  myHandEl.innerHTML = '';
  updateActions();
  statusBar.textContent = 'Waiting for host to start…';
});

socket.on('player_disconnected', ({ playerName }) =>
  flashStatus(`${playerName} disconnected. Waiting…`, 0));

// ── Apply state ────────────────────────────────────────────────────────────
function applyState(state) {
  if (!state || state.gameType !== 'gin-rummy') return;
  if (startedAt === null) startedAt = Date.now();
  gameState  = state;
  gameActive = !state.isGameOver;
  myHand     = state.myHand || [];

  const mySeat = SEAT_COLORS.indexOf(myColor);
  myTurn = state.currentSeat === mySeat && gameActive;
  hasDrawn = state.phase === 'discard';

  renderPlayers(state);
  renderDiscard(state.discardTop);
  drawCount.textContent = `Draw (${state.drawPileCount})`;
  renderHand();

  if (state.phase === 'knock_response' && state.currentSeat === mySeat) {
    showKnockResponse(state);
  } else {
    knockPanel.classList.add('hidden');
    actionBar.classList.remove('hidden');
  }

  updateActions();

  if (state.isGameOver) {
    showGameOver(state.winner, null);
    return;
  }

  const currentPlayer = state.players.find((p, i) => i === state.currentSeat);
  if (state.phase === 'draw') {
    statusBar.textContent = myTurn ? 'Your turn — draw a card' : `${currentPlayer?.name || 'Opponent'} is drawing…`;
  } else if (state.phase === 'discard') {
    statusBar.textContent = myTurn ? 'Discard a card or knock' : `${currentPlayer?.name || 'Opponent'} is choosing…`;
  } else if (state.phase === 'knock_response') {
    statusBar.textContent = myTurn ? 'Lay off cards on melds or click Done' : 'Opponent is laying off cards…';
  }
}

// ── Render ──────────────────────────────────────────────────────────────────
function renderPlayers(state) {
  ginPlayersEl.innerHTML = '';
  state.players.forEach((p, i) => {
    const color = SEAT_COLORS[i];
    const isActive = state.currentSeat === i;
    const div = document.createElement('div');
    div.className = 'cdi-player' + (isActive ? ' active-turn' : '');

    const dot = document.createElement('span');
    dot.className = 'cdi-player-dot';
    dot.style.background = i === 0 ? '#1155cc' : '#b7600a';

    const nameEl = document.createElement('span');
    nameEl.textContent = `${p.name}${color === myColor ? ' (you)' : ''}`;

    const countEl = document.createElement('span');
    countEl.className = 'cdi-player-count';
    countEl.textContent = `${state.handCounts ? state.handCounts[i] : '?'} cards`;

    div.appendChild(dot);
    div.appendChild(nameEl);
    div.appendChild(countEl);
    ginPlayersEl.appendChild(div);
  });
}

function renderDiscard(discardTop) {
  discardTopCard.innerHTML = '';
  discardTopCard.className = 'card-tile';
  if (discardTop === null || discardTop === undefined) {
    discardTopCard.classList.add('card-back');
    const r = document.createElement('span'); r.className = 'card-tile-rank'; r.textContent = '—';
    discardTopCard.appendChild(r);
    return;
  }
  const card = cardFromId(discardTop);
  discardTopCard.classList.add(RED_SUITS.has(card.suit) ? 'red-suit' : 'black-suit');
  const rankEl = document.createElement('span'); rankEl.className = 'card-tile-rank'; rankEl.textContent = card.rank;
  const suitEl = document.createElement('span'); suitEl.className = 'card-tile-suit'; suitEl.textContent = SUIT_GLYPHS[card.suit];
  discardTopCard.appendChild(rankEl);
  discardTopCard.appendChild(suitEl);
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
  if (selected.has(id)) { selected.delete(id); tile.classList.remove('selected'); }
  else { selected.add(id); tile.classList.add('selected'); }
  updateActions();
}

// ── Actions ────────────────────────────────────────────────────────────────
function updateActions() {
  const phase = gameState?.phase;
  drawDeckBtn.disabled    = !myTurn || !gameActive || phase !== 'draw';
  drawDiscardBtn.disabled = !myTurn || !gameActive || phase !== 'draw' || gameState?.discardTop === null;
  discardBtn.disabled     = !myTurn || !gameActive || phase !== 'discard' || selected.size !== 1;
  knockBtn.disabled       = !myTurn || !gameActive || phase !== 'discard';
  layoffBtn.disabled      = !myTurn || !gameActive || phase !== 'knock_response' || selected.size !== 1;
}

drawDeckBtn.addEventListener('click', () => {
  socket.emit('gin_draw', { source: 'draw' });
  selected.clear();
});

drawDiscardBtn.addEventListener('click', () => {
  socket.emit('gin_draw', { source: 'discard' });
  selected.clear();
});

discardBtn.addEventListener('click', () => {
  if (selected.size !== 1) return;
  const cardId = [...selected][0];
  socket.emit('gin_discard', { cardId });
  selected.clear();
});

knockBtn.addEventListener('click', () => {
  // Auto-detect melds from hand (simple: send all cards, let server figure melds)
  // For now, player knocks with selected cards as one meld group
  // Better UX: knock sends the full hand; server finds best melds automatically
  socket.emit('gin_knock', { meldGroups: [] });
  selected.clear();
});

// ── Knock response (lay off) ───────────────────────────────────────────────
function showKnockResponse(state) {
  actionBar.classList.add('hidden');
  knockPanel.classList.remove('hidden');
  knockInfo.textContent = `Opponent knocked! Deadwood: ${state.knockerDeadwood}. Lay off cards on their melds.`;
  knockerMelds.innerHTML = '';
  if (state.knockerMelds) {
    state.knockerMelds.forEach((meld, i) => {
      const meldDiv = document.createElement('div');
      meldDiv.className = 'gin-meld';
      meldDiv.dataset.index = i;
      const label = document.createElement('span');
      label.textContent = `Meld ${i + 1}: `;
      meldDiv.appendChild(label);
      meld.forEach(id => {
        meldDiv.appendChild(makeCardTile(cardFromId(id)));
      });
      knockerMelds.appendChild(meldDiv);
    });
  }
}

layoffBtn.addEventListener('click', () => {
  if (selected.size !== 1) return;
  const cardId = [...selected][0];
  // Try lay off on first meld (simplified; could add meld selection)
  socket.emit('gin_layoff', { cardId, meldIndex: 0 });
  selected.clear();
});

doneBtn.addEventListener('click', () => {
  socket.emit('gin_finish_layoff');
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
    gameOverMsg.textContent = reason || 'Great game!';
  } else if (winnerSeat !== null && winnerSeat !== undefined) {
    const wp = gameState?.players?.[winnerSeat];
    gameOverTitle.textContent = 'Game Over';
    gameOverMsg.textContent = reason || `${wp?.name || 'Opponent'} wins!`;
  } else {
    gameOverTitle.textContent = 'Game Over';
    gameOverMsg.textContent = reason || 'Draw!';
  }
  updateActions();

  const result = winnerSeat === mySeat ? 'win' : (winnerSeat !== null && winnerSeat !== undefined) ? 'loss' : 'draw';
  const durationSeconds = startedAt !== null ? Math.round((Date.now() - startedAt) / 1000) : 0;
  reportMultiplayerResult({ gameId: 'mp-gin-rummy', result, durationSeconds });
}

// ── Flash status ───────────────────────────────────────────────────────────
let flashTimer = null;
function flashStatus(msg, duration) {
  statusBar.textContent = msg;
  if (flashTimer) clearTimeout(flashTimer);
  if (duration > 0) flashTimer = setTimeout(() => { if (gameState) applyState(gameState); }, duration);
}
