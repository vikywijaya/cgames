'use strict';

// ── Universal TV Join page ───────────────────────────────────────────────────
// Handles join + waiting for any TV game. On game_started or game_state,
// redirects to the game-specific play page with ?autojoin=1, passing the
// player's identity via sessionStorage (key: caritahub_pending_join_<roomId>).
// The play page reads that key, restores myName/myColor, and re-emits
// join_game with reconnect:true to continue seamlessly.

// ── URL params ───────────────────────────────────────────────────────────────
const params   = new URLSearchParams(location.search);
const roomId   = params.get('room');
const gameType = params.get('game'); // e.g. 'tv-bingo', 'tv-quick-maths'

// ── Game registry: gameType → { title, subtitle, emoji, playPath } ──────────
const GAMES = {
  'tv-bingo':            { title: 'CaritaHub Bingo',  subtitle: 'Mark your card — first to Bingo wins!',          emoji: '🎱', playPath: '/tv-bingo-play' },
  'tv-higher-lower':     { title: 'Higher or Lower',  subtitle: 'Guess if the next card is higher or lower!',     emoji: '🃏', playPath: '/tv-higher-lower-play' },
  'tv-boggle':           { title: 'TV Boggle',        subtitle: 'Find as many words as you can!',                 emoji: '🔤', playPath: '/tv-boggle-play' },
  'tv-sumix':            { title: 'Sumix',            subtitle: 'Tap numbers so each row & column hits the sum!', emoji: '➕', playPath: '/tv-sumix-play' },
  'tv-frog-drop':        { title: 'Frog Drop',        subtitle: 'Drop frogs in columns and merge them to score!', emoji: '🐸', playPath: '/tv-frog-drop-play' },
  'tv-taboo':            { title: 'Taboo',            subtitle: 'Describe the word without saying the taboos!',   emoji: '🚫', playPath: '/tv-taboo-play' },
  'tv-20-questions':     { title: '20 Questions',     subtitle: 'Ask yes/no questions to guess the secret word!', emoji: '❓', playPath: '/tv-20-questions-play' },
  'tv-racing':           { title: 'RC Racing',        subtitle: 'Tap fast to win the race!',                      emoji: '🏎️', playPath: '/tv-racing-play' },
  'tv-math-cross':       { title: 'Math Cross',       subtitle: 'Race to solve the puzzle first!',                emoji: '🧮', playPath: '/math-cross-play' },
  'tv-colour-memory':    { title: 'Colour Memory',    subtitle: 'Watch the sequence, then repeat it!',            emoji: '🎨', playPath: '/colour-memory-play' },
  'tv-face-memory':      { title: 'Face Memory',      subtitle: 'Memorise the faces, then match the names!',     emoji: '👤', playPath: '/face-memory-play' },
  'tv-daily-arithmetic': { title: 'Daily Arithmetic', subtitle: 'Solve the equation faster than everyone!',       emoji: '🔢', playPath: '/daily-arithmetic-play' },
  'tv-missing-number':   { title: 'Missing Number',   subtitle: 'Find the number that completes the sequence!',   emoji: '🔍', playPath: '/missing-number-play' },
  'tv-number-sort':      { title: 'Number Sort',      subtitle: 'Tap numbers smallest to largest as fast as you can!', emoji: '🔢', playPath: '/number-sort-play' },
  'tv-quick-maths':      { title: 'Quick Maths',      subtitle: 'Fastest finger wins — tap the right answer!',    emoji: '⚡', playPath: '/quick-maths-play' },
  'tv-maze':             { title: 'Maze',             subtitle: 'Navigate the maze faster than your friends!',    emoji: '🌀', playPath: '/maze-play' },
  'tv-wordle':           { title: 'Wordle',           subtitle: 'Guess the secret word in six tries!',            emoji: '🟩', playPath: '/wordle-play' },
  'tv-lumeno':           { title: 'Lumeno',           subtitle: 'Light up the board — solve the pattern!',        emoji: '💡', playPath: '/lumeno-play' },
  'tv-memory-match':     { title: 'Memory Match',     subtitle: 'Flip cards and find the matching pairs!',        emoji: '🃏', playPath: '/memory-match-play' },
  'tv-pattern-sequence': { title: 'Pattern Sequence', subtitle: 'Watch the pattern, then repeat it!',             emoji: '🔁', playPath: '/pattern-sequence-play' },
  'tv-pipe-puzzle':      { title: 'Pipe Puzzle',      subtitle: 'Connect the pipes — let the water flow!',        emoji: '🚰', playPath: '/pipe-puzzle-play' },
  'tv-ring-sort':        { title: 'Ring Sort',        subtitle: 'Sort the rings by colour onto the right pegs!',  emoji: '💍', playPath: '/ring-sort-play' },
  'tv-shopping-list':    { title: 'Shopping List',    subtitle: 'Remember the list and grab the right items!',    emoji: '🛒', playPath: '/shopping-list-play' },
  'tv-sokoban':          { title: 'Sokoban',          subtitle: 'Push the boxes onto the targets!',               emoji: '📦', playPath: '/sokoban-play' },
  'tv-speed-tap':        { title: 'Speed Tap',        subtitle: 'Tap as fast as you can!',                        emoji: '👆', playPath: '/speed-tap-play' },
  'tv-stroop-colour':    { title: 'Stroop Colour',    subtitle: 'Tap the colour, not the word!',                  emoji: '🎨', playPath: '/stroop-colour-play' },
  'tv-word-recall':      { title: 'Word Recall',      subtitle: 'Memorise the words, then recall them!',          emoji: '📝', playPath: '/word-recall-play' },
  'cooking':             { title: 'Cooking Showdown', subtitle: 'Cook the orders before time runs out!',          emoji: '🍳', playPath: '/tv-cooking-play' }
};

// ── DOM refs ─────────────────────────────────────────────────────────────────
const joinScreen        = document.getElementById('joinScreen');
const waitingScreen     = document.getElementById('waitingScreen');
const reconnectOverlay  = document.getElementById('reconnectOverlay');
const joinLogo          = document.getElementById('joinLogo');
const joinTitle         = document.getElementById('joinTitle');
const joinSubtitle      = document.getElementById('joinSubtitle');
const nameInput         = document.getElementById('nameInput');
const joinBtn           = document.getElementById('joinBtn');
const joinError         = document.getElementById('joinError');
const waitingName       = document.getElementById('waitingName');
const waitingPlayerList = document.getElementById('waitingPlayerList');

// ── State ────────────────────────────────────────────────────────────────────
let myName  = '';
let myColor = null;

const game = GAMES[gameType];

// ── Validate URL params ──────────────────────────────────────────────────────
if (!gameType || !game) {
  joinTitle.textContent = 'Unknown Game';
  joinSubtitle.textContent = 'This QR code is invalid. Please scan again from the TV.';
  joinBtn.disabled = true;
  nameInput.disabled = true;
} else if (!roomId) {
  joinTitle.textContent = game.title;
  joinSubtitle.textContent = 'No room found. Please scan the QR code again.';
  joinBtn.disabled = true;
  nameInput.disabled = true;
} else {
  joinLogo.textContent     = game.emoji;
  joinTitle.textContent    = game.title;
  joinSubtitle.textContent = game.subtitle;
  document.title           = `CaritaHub — ${game.title}`;
}

// ── Pending-join handoff (read by play page on autojoin) ────────────────────
const HANDOFF_KEY = roomId ? `caritahub_pending_join_${roomId}` : null;

function savePendingJoin() {
  if (!HANDOFF_KEY) return;
  try {
    sessionStorage.setItem(HANDOFF_KEY, JSON.stringify({
      name:  myName,
      color: myColor,
      gameType,
      ts:    Date.now()
    }));
  } catch (e) { /* ignore */ }
}

// ── Socket ───────────────────────────────────────────────────────────────────
const socket = io({
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  transports: ['websocket', 'polling']
});

socket.on('connect', () => {
  reconnectOverlay.classList.add('hidden');
  // If we already joined (e.g. user came back to this tab), re-join silently.
  if (myColor && myName && game) {
    socket.emit('join_game', {
      roomId,
      playerName: myName,
      gameType,
      reconnect: true
    });
  }
});

socket.on('disconnect', () => {
  reconnectOverlay.classList.remove('hidden');
});

socket.on('connect_error', () => {
  reconnectOverlay.classList.remove('hidden');
});

// ── Join flow ────────────────────────────────────────────────────────────────
joinBtn.addEventListener('click', doJoin);
nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') doJoin(); });

// ── Dev convenience: ?devname=Tester%201 — pre-fill + auto-submit ────────
const _devName = params.get('devname');
if (_devName && nameInput && game && roomId) {
  nameInput.value = _devName;
  // Wait for socket to connect before firing
  if (socket.connected) {
    setTimeout(doJoin, 50);
  } else {
    socket.once('connect', () => setTimeout(doJoin, 50));
  }
}

function doJoin() {
  const name = nameInput.value.trim();
  if (!name) {
    joinError.textContent = 'Please enter your name.';
    return;
  }
  if (!game || !roomId) return;

  myName = name;
  joinError.textContent = '';
  joinBtn.disabled = true;

  socket.emit('join_game', {
    roomId,
    playerName: name,
    gameType
  });
}

// ── Joined ───────────────────────────────────────────────────────────────────
socket.on('joined', ({ color, reconnected }) => {
  myColor = color;

  if (color === 'spectator' || color === 'tv-host') {
    joinError.textContent = 'Game is full. You are a spectator.';
    joinBtn.disabled = false;
    return;
  }

  savePendingJoin();
  waitingName.textContent = `You joined as ${myName}`;
  switchScreen('waiting');
});

// ── Room update (waiting list) ───────────────────────────────────────────────
socket.on('room_update', ({ players }) => {
  if (!players) return;
  const phonePlayers = players.filter(p => p.color !== 'tv-host' && p.name !== 'TV Host' && p.name !== 'TV Display');
  waitingPlayerList.innerHTML = '';
  phonePlayers.forEach(p => {
    const div = document.createElement('div');
    div.className = 'waiting-player-item';
    div.textContent = escHtml(p.name) + (p.connected ? '' : ' (disconnected)');
    if (!p.connected) div.style.opacity = '0.5';
    waitingPlayerList.appendChild(div);
  });
});

// ── Game started — hand off to game-specific play page ──────────────────────
socket.on('game_started',    () => redirectToPlay());
socket.on('game_state',      () => redirectToPlay()); // covers late joiner / refresh mid-game
socket.on('cooking_started', () => redirectToPlay()); // cooking uses its own event

let redirected = false;
function redirectToPlay() {
  if (redirected || !game || !myColor) return;
  redirected = true;
  savePendingJoin();
  // Hand off — the play page will read HANDOFF_KEY, set up its own session,
  // and emit join_game with reconnect:true to receive the latest state.
  location.replace(`${game.playPath}?room=${encodeURIComponent(roomId)}&autojoin=1`);
}

// ── Error ────────────────────────────────────────────────────────────────────
socket.on('error', ({ message }) => {
  joinError.textContent = message || 'Something went wrong.';
  joinBtn.disabled = false;
});

// ── Screen switching ─────────────────────────────────────────────────────────
function switchScreen(name) {
  joinScreen.classList.toggle('active', name === 'join');
  waitingScreen.classList.toggle('active', name === 'waiting');
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
