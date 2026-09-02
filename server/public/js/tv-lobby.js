'use strict';

// ── Universal TV Lobby controller ────────────────────────────────────────────
// Reads ?game=tv-bingo from URL. Connects as tv-host, mints a room, shows QR,
// and lists players. On Start: hands off to /<game>-play?room=XXX&host=1
// where the existing game JS reconnects as tv-host and jumps to playing phase.

// ── Game registry: gameType → { title, subtitle, maxPlayers, playPath } ─────
const GAMES = {
  'tv-bingo':            { title: 'CaritaHub Bingo',  subtitle: 'Mark your card — first to Bingo wins!',          maxPlayers: 8, playPath: '/tv-bingo-tv' },
  'tv-higher-lower':     { title: 'Higher or Lower',  subtitle: 'Guess if the next card is higher or lower!',     maxPlayers: 8, playPath: '/tv-higher-lower-tv' },
  'tv-boggle':           { title: 'TV Boggle',        subtitle: 'Find as many words as you can!',                 maxPlayers: 8, playPath: '/tv-boggle-tv' },
  'tv-sumix':            { title: 'Sumix',            subtitle: 'Tap numbers so each row & column hits the sum!', maxPlayers: 8, playPath: '/tv-sumix-tv' },
  'tv-frog-drop':        { title: 'Frog Drop',        subtitle: 'Drop frogs in columns and merge them to score!', maxPlayers: 8, playPath: '/tv-frog-drop-tv' },
  'tv-taboo':            { title: 'Taboo',            subtitle: 'Describe the word without saying the taboos!',   maxPlayers: 8, playPath: '/tv-taboo-tv' },
  'tv-20-questions':     { title: '20 Questions',     subtitle: 'Ask yes/no questions to guess the secret word!', maxPlayers: 8, playPath: '/tv-20-questions-tv' },
  'tv-racing':           { title: 'RC Racing',        subtitle: 'Tap fast to win the race!',                      maxPlayers: 8, playPath: '/tv-racing-tv' },
  'tv-math-cross':       { title: 'Math Cross',       subtitle: 'Race to solve the puzzle first!',                maxPlayers: 8, playPath: '/tv-math-cross-tv' },
  'tv-colour-memory':    { title: 'Colour Memory',    subtitle: 'Watch the sequence, then repeat it!',            maxPlayers: 8, playPath: '/tv-colour-memory-tv' },
  'tv-face-memory':      { title: 'Face Memory',      subtitle: 'Memorise the faces, then match the names!',     maxPlayers: 8, playPath: '/tv-face-memory-tv' },
  'tv-daily-arithmetic': { title: 'Daily Arithmetic', subtitle: 'Solve the equation faster than everyone!',       maxPlayers: 8, playPath: '/tv-daily-arithmetic-tv' },
  'tv-missing-number':   { title: 'Missing Number',   subtitle: 'Find the number that completes the sequence!',   maxPlayers: 8, playPath: '/tv-missing-number-tv' },
  'tv-number-sort':      { title: 'Number Sort',      subtitle: 'Tap numbers smallest to largest as fast as you can!', maxPlayers: 8, playPath: '/tv-number-sort-tv' },
  'tv-quick-maths':      { title: 'Quick Maths',      subtitle: 'Fastest finger wins — tap the right answer!',    maxPlayers: 8, playPath: '/tv-quick-maths-tv' },
  'tv-maze':             { title: 'Maze',             subtitle: 'Navigate the maze faster than your friends!',    maxPlayers: 8, playPath: '/tv-maze-tv' },
  'tv-wordle':           { title: 'Wordle',           subtitle: 'Guess the secret word in six tries!',            maxPlayers: 8, playPath: '/tv-wordle-tv' },
  'tv-lumeno':           { title: 'Lumeno',           subtitle: 'Light up the board — solve the pattern!',        maxPlayers: 8, playPath: '/tv-lumeno-tv' },
  'tv-memory-match':     { title: 'Memory Match',     subtitle: 'Flip cards and find the matching pairs!',        maxPlayers: 8, playPath: '/tv-memory-match-tv' },
  'tv-pattern-sequence': { title: 'Pattern Sequence', subtitle: 'Watch the pattern, then repeat it!',             maxPlayers: 8, playPath: '/tv-pattern-sequence-tv' },
  'tv-pipe-puzzle':      { title: 'Pipe Puzzle',      subtitle: 'Connect the pipes — let the water flow!',        maxPlayers: 8, playPath: '/tv-pipe-puzzle-tv' },
  'tv-ring-sort':        { title: 'Ring Sort',        subtitle: 'Sort the rings by colour onto the right pegs!',  maxPlayers: 8, playPath: '/tv-ring-sort-tv' },
  'tv-shopping-list':    { title: 'Shopping List',    subtitle: 'Remember the list and grab the right items!',    maxPlayers: 8, playPath: '/tv-shopping-list-tv' },
  'tv-sokoban':          { title: 'Sokoban',          subtitle: 'Push the boxes onto the targets!',               maxPlayers: 8, playPath: '/tv-sokoban-tv' },
  'tv-speed-tap':        { title: 'Speed Tap',        subtitle: 'Tap as fast as you can!',                        maxPlayers: 8, playPath: '/tv-speed-tap-tv' },
  'tv-stroop-colour':    { title: 'Stroop Colour',    subtitle: 'Tap the colour, not the word!',                  maxPlayers: 8, playPath: '/tv-stroop-colour-tv' },
  'tv-word-recall':      { title: 'Word Recall',      subtitle: 'Memorise the words, then recall them!',          maxPlayers: 8, playPath: '/tv-word-recall-tv' },
  'cooking':             { title: 'Cooking Showdown', subtitle: 'Cook the orders before time runs out!',          maxPlayers: 4, playPath: '/cooking-tv' }
};

const params   = new URLSearchParams(location.search);
const gameType = params.get('game');
const game     = GAMES[gameType];

// Optional ?room=XXXX — reuse an existing room (e.g. after Play Again)
// so all current players stay seated and only need to wait for Start again.
let myRoomId  = params.get('room') || null;
let players   = [];   // local copy of the player list (excluding tv-host)
let prevCount = 0;    // for "fresh" highlight

// ── DOM refs ────────────────────────────────────────────────────────────────
const titleEl     = document.getElementById('lobbyTitle');
const subtitleEl  = document.getElementById('lobbySubtitle');
const eyebrowEl   = document.getElementById('lobbyEyebrow');
const qrcodeEl    = document.getElementById('qrcode');
const joinUrlEl   = document.getElementById('lobbyJoinUrl');
const joinCodeEl  = document.getElementById('lobbyJoinCode');
const playersEl   = document.getElementById('lobbyPlayers');
const emptyOverlayEl = document.getElementById('lobbyEmptyOverlay');
const countEl     = document.getElementById('lobbyCount');
const startBtn    = document.getElementById('lobbyStartBtn');
const reconnectOverlay = document.getElementById('reconnectOverlay');

// ── Validate game param ─────────────────────────────────────────────────────
if (!game) {
  titleEl.textContent = 'Unknown Game';
  subtitleEl.textContent = 'This URL is invalid. Return to the games list.';
  document.title = 'CaritaHub Games — Lobby';
} else {
  titleEl.textContent    = game.title;
  subtitleEl.textContent = game.subtitle;
  eyebrowEl.textContent  = `Multiplayer lobby`;
  document.title         = `CaritaHub — ${game.title}`;

  // Per-game collaboration credits (only on whitelisted games).
  // Frog Drop is built in collaboration with Crest Secondary, so we show
  // their logo under the QR. Other games render no credit block.
  const COLLABS = {
    'tv-frog-drop': { logo: '/img/crest-logo.svg', alt: 'Crest Secondary' },
  };
  const collabEl  = document.getElementById('lobbyCollab');
  const collabImg = document.getElementById('lobbyCollabLogo');
  const collab    = COLLABS[gameType];
  if (collabEl && collabImg && collab) {
    collabImg.src = collab.logo;
    collabImg.alt = collab.alt;
    // Graceful fallback to .png if the SVG fails to load.
    collabImg.onerror = () => {
      if (collabImg.dataset.fallback) return;
      collabImg.dataset.fallback = '1';
      collabImg.src = collab.logo.replace(/\.svg$/, '.png');
    };
    collabEl.hidden = false;
  } else if (collabEl) {
    collabEl.hidden = true;
  }
  // Cover image: /img/banner-<slug>.jpg, where cooking → tv-cooking
  const coverEl = document.getElementById('lobbyCover');
  if (coverEl) {
    const slug = gameType === 'cooking' ? 'tv-cooking' : gameType;
    coverEl.style.backgroundImage = `url('/img/banner-${slug}.jpg')`;
  }
}

// ── Clock ───────────────────────────────────────────────────────────────────
function tickClock() {
  const d = new Date();
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const el = document.getElementById('lobbyClock');
  if (el) el.textContent = `${h}:${m}`;
}
tickClock();
setInterval(tickClock, 30000);

// ── Socket ──────────────────────────────────────────────────────────────────
const socket = io({
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  transports: ['websocket', 'polling']
});

socket.on('connect', () => {
  reconnectOverlay.classList.add('hidden');
  if (!game) return;
  socket.emit('join_game', {
    roomId: myRoomId || null,
    playerName: 'TV Display',
    gameType,
    reconnect: !!myRoomId
  });
});
socket.on('disconnect',    () => reconnectOverlay.classList.remove('hidden'));
socket.on('connect_error', () => reconnectOverlay.classList.remove('hidden'));

// ── Joined ──────────────────────────────────────────────────────────────────
socket.on('joined', ({ roomId }) => {
  if (!roomId) return;
  myRoomId = roomId;
  if (joinCodeEl) joinCodeEl.textContent = roomId;

  const joinUrl = `${location.origin}/tv-join?game=${encodeURIComponent(gameType)}&room=${roomId}`;
  if (joinUrlEl) joinUrlEl.textContent = joinUrl.replace(/^https?:\/\//, '');

  qrcodeEl.innerHTML = '';
  /* eslint-disable no-undef */
  new QRCode(qrcodeEl, {
    text: joinUrl, width: 340, height: 340,
    colorDark: '#0F1A33', colorLight: '#ffffff',
    correctLevel: QRCode.CorrectLevel.M
  });
  /* eslint-enable no-undef */
  const skeleton = document.getElementById('qrSkeleton');
  if (skeleton) skeleton.classList.add('hidden');

  // ── Dev convenience: double-click the QR to open 2 test player popups ────
  // Each popup auto-fills a name and clicks Join. The universal /tv-join page
  // honours ?devname=... by pre-filling the input and submitting on load.
  const qrFrame = document.querySelector('.lobby-qr-frame');
  if (qrFrame) {
    qrFrame.style.cursor = 'pointer';
    qrFrame.title = 'Double-click to open 2 test players';
    qrFrame.ondblclick = () => {
      const features = 'popup=yes,width=420,height=820,left=80,top=80,resizable=yes,scrollbars=yes';
      const url1 = joinUrl + '&devname=' + encodeURIComponent('Tester 1');
      const url2 = joinUrl + '&devname=' + encodeURIComponent('Tester 2');
      const w1 = window.open(url1, 'tester1', features);
      // Stagger so popup blocker doesn't bin the 2nd
      setTimeout(() => {
        const w2 = window.open(url2, 'tester2', 'popup=yes,width=420,height=820,left=520,top=80,resizable=yes,scrollbars=yes');
        if (!w1 || !w2) {
          alert('Popups blocked. Allow popups for this site and try again.');
        }
      }, 150);
    };
  }
});

// ── Room update — re-render player list ─────────────────────────────────────
socket.on('room_update', ({ players: roomPlayers }) => {
  if (!roomPlayers) return;
  players = roomPlayers.filter(p => p.color !== 'tv-host');
  renderPlayers();
});

// Some games emit a separate `game_state` with players already inside;
// also accept `players_update` if any engine uses it.
socket.on('players_update', (data) => {
  if (data && Array.isArray(data.players)) {
    players = data.players.filter(p => p.color !== 'tv-host');
    renderPlayers();
  }
});

// If host clicks Start before any room_update, server may still respond
// with an error — surface it minimally.
socket.on('error', ({ message }) => {
  console.warn('[lobby] error from server:', message);
});

// ── Render players ──────────────────────────────────────────────────────────
function renderPlayers() {
  // Remove old slots (keep the empty-overlay child)
  playersEl.querySelectorAll('.lobby-slot').forEach(n => n.remove());

  // Render up to VISIBLE slots. If more players have joined than fit,
  // the final tile becomes a "+N more" summary so the total is always shown.
  const VISIBLE = 10;
  const n   = players.length;
  const isEmpty = n === 0;

  if (emptyOverlayEl) emptyOverlayEl.classList.toggle('active', isEmpty);
  playersEl.classList.toggle('is-empty', isEmpty);

  const overflow = n > VISIBLE;
  const playerRows = overflow ? VISIBLE - 1 : Math.min(n, VISIBLE);
  const rows = overflow ? VISIBLE : Math.max(playerRows, VISIBLE);

  for (let i = 0; i < rows; i++) {
    const slot = document.createElement('div');
    slot.className = 'lobby-slot';

    if (overflow && i === VISIBLE - 1) {
      const extra = n - playerRows;
      slot.classList.add('more');
      slot.innerHTML = `
        <span class="lobby-slot-num">+</span>
        <span class="lobby-avatar"><i class="ph-fill ph-users-three"></i></span>
        <span class="lobby-slot-name">+${extra} more player${extra === 1 ? '' : 's'}</span>
        <span class="lobby-slot-badge">${n} total</span>
      `;
    } else if (i < n) {
      const p = players[i];
      const status = p.connected === false ? 'off' : 'ready';
      slot.classList.add('joined');
      slot.dataset.status = status;
      if (i === n - 1 && n > prevCount) slot.classList.add('fresh');
      const initial = (p.name || '?').trim().charAt(0).toUpperCase();
      const badge = status === 'off' ? 'Offline' : (i === 0 ? 'Host' : 'Ready');
      slot.innerHTML = `
        <span class="lobby-slot-num">${i + 1}</span>
        <span class="lobby-avatar" style="background:${avatarGradient(i)}">${escHtml(initial)}</span>
        <span class="lobby-slot-name">${escHtml(p.name || '')}</span>
        <span class="lobby-slot-badge">${badge}</span>
      `;
    } else {
      slot.classList.add('empty');
      slot.innerHTML = `
        <span class="lobby-slot-num">${i + 1}</span>
        <span class="lobby-avatar"><i class="ph-fill ph-user"></i></span>
        <span class="lobby-slot-name">Open spot</span>
      `;
    }
    playersEl.appendChild(slot);
  }

  countEl.textContent = String(n);
  startBtn.disabled = n < 1 || !myRoomId;
  startBtn.querySelector('span').textContent = n < 1 ? 'Waiting for players' : 'Start game';

  prevCount = n;
}

const AVATAR_GRADIENTS = [
  'linear-gradient(135deg,#3D72E8,#1A9FAF)',
  'linear-gradient(135deg,#E07820,#E84B3D)',
  'linear-gradient(135deg,#7B5EA7,#3D72E8)',
  'linear-gradient(135deg,#2DAF7B,#1A9FAF)',
  'linear-gradient(135deg,#E84B3D,#E07820)',
  'linear-gradient(135deg,#1A9FAF,#7B5EA7)',
  'linear-gradient(135deg,#3D72E8,#7B5EA7)',
  'linear-gradient(135deg,#E07820,#2DAF7B)'
];
function avatarGradient(i) { return AVATAR_GRADIENTS[i % AVATAR_GRADIENTS.length]; }

function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Start button: hand off to play page
startBtn.addEventListener('click', () => {
  if (!myRoomId || !game) return;
  startBtn.disabled = true;
  startBtn.querySelector('span').textContent = 'Starting…';
  // Persist a small handoff so the play page can reconnect as tv-host
  try {
    sessionStorage.setItem('tv_host_handoff_' + myRoomId, JSON.stringify({
      roomId: myRoomId, gameType, ts: Date.now()
    }));
  } catch (e) { /* ignore */ }
  // Disconnect cleanly so the server immediately frees the seat for our
  // next socket — roomManager grace period keeps the room alive.
  socket.disconnect();
  location.replace(`${game.playPath}?room=${encodeURIComponent(myRoomId)}&host=1`);
});

// Initial render (empty)
renderPlayers();
