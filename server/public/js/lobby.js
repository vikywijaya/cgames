'use strict';

const socket = io();
let myRoomId = null;
let myColor = null;
let myName = '';   // captured at join-click time

const nameInput = document.getElementById('playerName');
const createBtn = document.getElementById('createBtn');
const statusMsg = document.getElementById('statusMsg');
const qrPanel = document.getElementById('qrPanel');
const qrContainer = document.getElementById('qrcode');
const joinLinkEl = document.getElementById('joinLink');
const playerListEl = document.getElementById('playerList');
const startBtn = document.getElementById('startBtn');

// ── Game metadata ────────────────────────────────────────────────────
const GAMES = {
  xiangqi: {
    title: 'CaritaHub 象棋',
    subtitle: 'Chinese Chess — Multiplayer',
    gamePage: '/game.html',
    maxPlayers: 2,
    hostColors: ['red']
  },
  chess: {
    title: 'CaritaHub Chess',
    subtitle: 'Western Chess — Multiplayer',
    gamePage: '/chess-game.html',
    maxPlayers: 2,
    hostColors: ['white']
  },
  chordaidi: {
    title: '大老二 Chor Dai Di',
    subtitle: 'Big Two — 4 Players',
    gamePage: '/chordaidi-game.html',
    maxPlayers: 4,
    hostColors: ['south']
  },
  bingo: {
    title: 'CaritaHub Bingo',
    subtitle: 'Bingo — 2 to 8 Players',
    gamePage: '/bingo-game.html',
    maxPlayers: 2,      // minimum to start; caller can begin with 2+
    hostColors: ['caller']
  },
  'tv-bingo': {
    title: 'TV Bingo',
    subtitle: 'Smart TV Hosted — 1 to 8 Players',
    gamePage: '/tv-bingo.html',
    maxPlayers: 1,      // TV host + at least 1 phone player
    hostColors: ['tv-host']
  },
  boggle: {
    title: 'CaritaHub Boggle',
    subtitle: 'Word Hunt — 2 to 4 Players, 1-min round',
    gamePage: '/boggle-game.html',
    maxPlayers: 2,
    hostColors: ['red']
  },
  'singapore-trivia': {
    title: 'Singapore Trivia',
    subtitle: 'SG Quiz — 2 to 6 Players, 10 Questions',
    gamePage: '/singapore-trivia-game.html',
    maxPlayers: 2,
    hostColors: ['p1']
  },
  'spot-the-difference': {
    title: 'Spot the Difference',
    subtitle: 'Singapore Scenes — Co-op, 5 Rounds',
    gamePage: '/spot-the-difference.html',
    maxPlayers: 2,
    hostColors: ['p1']
  },
  'rhythm-tap': {
    title: 'Rhythm Tap',
    subtitle: 'Beat Tap Game — 1 to 6 Players',
    gamePage: '/rhythm-tap.html',
    maxPlayers: 1,
    hostColors: ['p1']
  },
  'tv-higher-lower': {
    title: 'TV Higher or Lower',
    subtitle: 'Smart TV Card Game — 1 to 8 Players',
    gamePage: '/tv-higher-lower.html',
    maxPlayers: 1,
    hostColors: ['tv-host']
  },
  'tv-boggle': {
    title: 'TV Boggle',
    subtitle: 'Smart TV Word Hunt — 2-min round',
    gamePage: '/tv-boggle.html',
    maxPlayers: 1,
    hostColors: ['tv-host']
  },
  'gin-rummy': {
    title: 'Gin Rummy',
    subtitle: 'Classic Card Game — 2 Players',
    gamePage: '/gin-rummy-game.html',
    maxPlayers: 2,
    hostColors: ['p1']
  },
  hearts: {
    title: 'Hearts',
    subtitle: 'Trick-Taking — 4 Players',
    gamePage: '/hearts-game.html',
    maxPlayers: 4,
    hostColors: ['south']
  },
  'crazy-eights': {
    title: 'Crazy Eights',
    subtitle: 'Wild Card Game — 2 to 4 Players',
    gamePage: '/crazy-eights-game.html',
    maxPlayers: 2,
    hostColors: ['p1']
  },
  'tv-racing': {
    title: 'TV RC Racing',
    subtitle: 'Smart TV Racing — 1 to 8 Players',
    gamePage: '/tv-racing.html',
    maxPlayers: 1,
    hostColors: ['tv-host']
  },
  'tv-sumix': {
    title: 'TV Sumix',
    subtitle: 'Smart TV Number Puzzle — 1 to 8 Players',
    gamePage: '/tv-sumix.html',
    maxPlayers: 1,
    hostColors: ['tv-host']
  },
  'tv-taboo': {
    title: 'TV Taboo',
    subtitle: 'AI Describes, You Guess! — 1 to 8 Players',
    gamePage: '/tv-taboo.html',
    maxPlayers: 1,
    hostColors: ['tv-host']
  },
  ludo: {
    title: '飞行棋 Ludo',
    subtitle: 'Classic Board Game — 2 to 4 Players',
    gamePage: '/ludo-game.html',
    maxPlayers: 2,
    hostColors: ['red']
  },
  'tv-math-cross': {
    title: 'TV Math Cross',
    subtitle: 'Race to Solve Math Puzzles — 1 to 8 Players',
    gamePage: '/tv-math-cross.html',
    maxPlayers: 1,
    hostColors: ['tv-host']
  }
};

const params = new URLSearchParams(window.location.search);
const gameId = params.get('game') || 'xiangqi';
const inviteRoom = params.get('room');

// Identity params threaded from cgames (memberId/callbackUrl/accessToken), carried
// through to the game page so a match result can be attributed and reported back
// (see docs/superpowers/specs/2026-07-20-play-with-a-friend-scoring-design.md).
const identityQS = new URLSearchParams();
const mpMemberId    = params.get('memberId');
const mpCallbackUrl = params.get('callbackUrl');
const mpAccessToken = params.get('accessToken');
if (mpMemberId)    identityQS.set('memberId', mpMemberId);
if (mpCallbackUrl) identityQS.set('callbackUrl', mpCallbackUrl);
if (mpAccessToken) identityQS.set('accessToken', mpAccessToken);

const gameMeta = GAMES[gameId] || GAMES['xiangqi'];

// Set page heading
const titleEl = document.getElementById('gameTitle');
const subtitleEl = document.getElementById('gameSubtitle');
if (titleEl) titleEl.textContent = gameMeta.title;
if (subtitleEl) subtitleEl.textContent = gameMeta.subtitle;
document.title = `CaritaHub — ${gameMeta.title}`;

// Cover image (same banner used on the games index) — falls back to the
// generic xiangqi banner if this game id has no dedicated cover yet.
const bannerEl = document.getElementById('gameBanner');
if (bannerEl) {
  bannerEl.src = `/img/banner-${gameId}.jpg`;
  bannerEl.alt = gameMeta.title;
  bannerEl.onerror = () => { bannerEl.onerror = null; bannerEl.src = '/img/banner-xiangqi.jpg'; };
}

if (inviteRoom) {
  statusMsg.textContent = 'Enter your name to join the game.';
  createBtn.textContent = 'Join Game';
}

// Dev auto-join: if devname param is set, auto-fill name and click join
const devName = params.get('devname');
if (devName) {
  nameInput.value = devName;
  setTimeout(() => createBtn.click(), 500);
}

// ── Handlers ─────────────────────────────────────────────────────────
createBtn.addEventListener('click', () => {
  const name = nameInput.value.trim();
  if (!name) {
    statusMsg.textContent = 'Please enter your name first.';
    statusMsg.classList.add('error');
    return;
  }
  myName = name;
  statusMsg.classList.remove('error');
  statusMsg.textContent = 'Connecting…';
  createBtn.disabled = true;

  socket.emit('join_game', {
    roomId: inviteRoom || null,
    playerName: name,
    gameType: gameId
  });
});

nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') createBtn.click(); });

startBtn.addEventListener('click', () => {
  socket.emit('start_game');
  startBtn.disabled = true;
  statusMsg.textContent = 'Starting game…';
});

// ── Server events ────────────────────────────────────────────────────
socket.on('joined', ({ roomId, color }) => {
  myRoomId = roomId;
  myColor = color;

  // Dev tool: broadcast room ID so other tabs can auto-detect it
  try { localStorage.setItem('dev_last_room', JSON.stringify({ roomId, game: gameId, ts: Date.now() })); } catch (e) {}

  if (color === 'spectator') {
    statusMsg.textContent = 'You joined as a spectator.';
    createBtn.classList.add('hidden');
    return;
  }

  const colorLabel = colorDisplayName(color);
  statusMsg.textContent = `You are the ${colorLabel} player.`;
  createBtn.classList.add('hidden');
  qrPanel.classList.remove('hidden');

  if (!inviteRoom) {
    // QR encodes /join?room=...&game=... so the joining player lands on the right lobby
    const joinUrl = `${location.origin}/join?room=${roomId}&game=${gameId}`;
    joinLinkEl.textContent = joinUrl;

    qrContainer.innerHTML = '';
    new QRCode(qrContainer, {
      text: joinUrl,
      width: 260,
      height: 260,
      correctLevel: QRCode.CorrectLevel.H
    });
  }
});

socket.on('room_update', ({ players }) => {
  renderPlayerList(players);

  const connectedCount = players.filter(p => p.connected).length;
  const allReady = connectedCount >= gameMeta.maxPlayers;
  const isHost = gameMeta.hostColors.includes(myColor);

  if (isHost && allReady) {
    startBtn.classList.remove('hidden');
    const needed = gameMeta.maxPlayers;
    statusMsg.textContent = `All ${needed} players connected! You can start the game.`;
  } else if (isHost) {
    startBtn.classList.add('hidden');
    const waiting = gameMeta.maxPlayers - connectedCount;
    statusMsg.textContent = `Waiting for ${waiting} more player${waiting > 1 ? 's' : ''}…`;
  }
});

socket.on('game_started', () => {
  window.location.href =
    `${gameMeta.gamePage}?room=${myRoomId}&color=${myColor}&name=${encodeURIComponent(myName)}&game=${gameId}` +
    (identityQS.toString() ? `&${identityQS}` : '');
});

socket.on('error', ({ message }) => {
  statusMsg.textContent = message;
  statusMsg.classList.add('error');
  createBtn.disabled = false;
  startBtn.disabled = false;
});

socket.on('connect_error', () => {
  statusMsg.textContent = 'Connection failed. Please refresh.';
  statusMsg.classList.add('error');
});

// ── Helpers ──────────────────────────────────────────────────────────
function colorDisplayName(color) {
  const map = {
    red: 'Red', white: 'White', black: 'Black',
    south: 'South', west: 'West', north: 'North', east: 'East',
    caller: 'Caller', p1: 'Player 1', p2: 'Player 2', p3: 'Player 3', p4: 'Player 4',
    p5: 'Player 5', p6: 'Player 6', p7: 'Player 7', p8: 'Player 8',
    red: 'Red', blue: 'Blue', green: 'Green', yellow: 'Yellow', purple: 'Purple'
  };
  return map[color] || color;
}

function renderPlayerList(players) {
  playerListEl.innerHTML = '';
  players.forEach(p => {
    const div = document.createElement('div');
    div.className = 'player-item';
    const dot = document.createElement('span');
    dot.className = `player-dot dot-${p.color}`;
    const label = document.createElement('span');
    label.textContent = `${p.name} (${colorDisplayName(p.color)})${p.connected ? '' : ' — disconnected'}`;
    div.appendChild(dot);
    div.appendChild(label);
    playerListEl.appendChild(div);
  });
}
