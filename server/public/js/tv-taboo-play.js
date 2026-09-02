'use strict';

/* ── TV Taboo — Mobile Player Logic ── */

const params = new URLSearchParams(window.location.search);
const roomId = params.get('room');
const isAutoJoin = params.get('autojoin') === '1';

// ── Autojoin handoff (from /tv-join) ────────────────────────────────────────
if (isAutoJoin && roomId) {
  try {
    const raw = sessionStorage.getItem(`caritahub_pending_join_${roomId}`);
    if (raw) {
      const data = JSON.parse(raw);
      if (data && data.name && Date.now() - (data.ts || 0) < 30 * 60 * 1000) {
        sessionStorage.setItem('taboo_session', JSON.stringify({ roomId, name: data.name }));
      }
    }
  } catch (e) { /* ignore */ }
}

const socket = io();

// ── Screens ──
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

// ── Session persistence ──
const SESSION_KEY = 'taboo_session';
function saveSession(name) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({ roomId, name }));
}
function loadSession() {
  try {
    const s = JSON.parse(sessionStorage.getItem(SESSION_KEY));
    if (s && s.roomId === roomId) return s;
  } catch (e) {}
  return null;
}

// ── State ──
let myName = '';
let mySeat = -1;
let myScore = 0;

// ── Join ──
const nameInput = document.getElementById('nameInput');
const joinBtn = document.getElementById('joinBtn');
const joinError = document.getElementById('joinError');

// Auto-reconnect on page load (session or autojoin handoff)
const prev = loadSession();
if (prev && prev.name) {
  myName = prev.name;
  showScreen('waitingScreen');
  document.getElementById('waitingName').textContent = myName;
}

joinBtn.addEventListener('click', doJoin);
nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doJoin(); });

function doJoin() {
  const name = nameInput.value.trim();
  if (!name) { joinError.textContent = 'Please enter your name'; return; }
  myName = name;
  saveSession(name);
  socket.emit('join_game', { roomId, playerName: name, gameType: 'tv-taboo' });
  showScreen('waitingScreen');
  document.getElementById('waitingName').textContent = name;
}

socket.on('joined', (data) => {
  mySeat = data.seat != null ? data.seat : -1;
  saveSession(myName);
  const el = document.getElementById('playerIdentityName');
  if (el) el.textContent = myName || '—';
});

socket.on('play_again', () => {
  myScore = 0;
  mySeat = -1;
  showScreen('waitingScreen');
});

socket.on('error', (data) => {
  if (document.getElementById('joinScreen').classList.contains('active')) {
    joinError.textContent = data.message || 'Error joining';
  }
});

// ── Game started ──
socket.on('game_started', (data) => {
  showScreen('playingScreen');
  updateFromState(data);
});

socket.on('game_state', (data) => {
  if (document.getElementById('waitingScreen').classList.contains('active')) {
    showScreen('playingScreen');
  }
  updateFromState(data);
});

function updateFromState(gs) {
  // Find my seat
  if (mySeat < 0 && gs.players) {
    const me = gs.players.find(p => p.name === myName);
    if (me) mySeat = me.seat;
  }

  // Round
  document.getElementById('mRoundBadge').textContent = `Round ${gs.round}/${gs.totalRounds}`;

  // Score
  myScore = mySeat >= 0 ? (gs.scores[mySeat] || 0) : 0;
  document.getElementById('mScoreBadge').textContent = `Score: ${myScore}`;

  // Identity
  const identityNameEl = document.getElementById('playerIdentityName');
  if (identityNameEl) identityNameEl.textContent = myName || '—';

  // Scoreboard strip — all players
  const stripEl = document.getElementById('scoreboardStrip');
  if (stripEl && gs.players && gs.players.length > 0) {
    stripEl.innerHTML = gs.players.map(p => {
      const isMe = p.seat === mySeat;
      const pts = gs.scores[p.seat] || 0;
      return `<div class="score-card${isMe ? ' me' : ''}">
        <div class="score-card-name">${p.name}</div>
        <div class="score-card-pts">${pts}</div>
        ${isMe ? '<div class="score-card-you">You</div>' : ''}
      </div>`;
    }).join('');
  }

  // Clue
  const clueBody = document.getElementById('clueBody');
  if (!gs.clueReady) {
    clueBody.innerHTML = '<span class="clue-loading">AI is thinking...</span>';
  } else {
    clueBody.textContent = gs.clue || '';
  }

  // Taboo words
  const tabooEl = document.getElementById('tabooWords');
  tabooEl.innerHTML = (gs.tabooWords || []).map(w =>
    `<div class="taboo-word-chip">${w}</div>`
  ).join('');

  // Guess history
  const historyEl = document.getElementById('guessHistory');
  historyEl.innerHTML = (gs.guessLog || []).map(g => {
    const isMine = g.seat === mySeat;
    const cls = [g.correct ? 'correct' : 'wrong', isMine ? 'mine' : ''].join(' ');
    return `<div class="guess-item ${cls}">${g.name || 'Player'}: ${g.text} ${g.correct ? '✓' : '✗'}</div>`;
  }).join('');
  historyEl.scrollTop = historyEl.scrollHeight;

  // Revealed keyword
  const revealEl = document.getElementById('revealKeyword');
  if (gs.phase === 'reveal' && gs.keyword) {
    revealEl.style.display = 'block';
    revealEl.textContent = gs.keyword;
  } else {
    revealEl.style.display = 'none';
  }

  // Enable/disable input
  const canGuess = gs.phase === 'guessing' && gs.clueReady;
  document.getElementById('guessInput').disabled = !canGuess;
  document.getElementById('guessBtn').disabled = !canGuess;
}

// ── Guess submission ──
const guessInput = document.getElementById('guessInput');
const guessBtn = document.getElementById('guessBtn');

guessBtn.addEventListener('click', submitGuess);
guessInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') submitGuess(); });

function submitGuess() {
  const text = guessInput.value.trim();
  if (!text) return;
  socket.emit('tv_taboo_guess', { text });
  guessInput.value = '';
}

// ── Guess result toast ──
socket.on('tv_taboo_guess_result', (data) => {
  if (data.guesserName === myName || data.seat === mySeat) {
    showToast(data.correct ? 'Correct!' : 'Wrong!', data.correct ? 'correct' : 'wrong');
    if (data.correct) {
      // Vibrate on correct
      if (navigator.vibrate) navigator.vibrate(200);
    }
  }
});

function showToast(text, type) {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = text;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2200);
}

// ── Game Over ──
socket.on('game_over', (data) => {
  showScreen('gameoverScreen');
  document.getElementById('mGameoverTitle').textContent = data.winner
    ? `${data.winner} wins!`
    : 'It\'s a tie!';
  document.getElementById('mGameoverPersonal').textContent = `Your score: ${myScore}`;
  document.getElementById('mGameoverMsg').textContent = data.reason || '';

  if (data.winner === myName) {
    spawnConfetti();
  }
});

// ── Reconnect ──
socket.on('disconnect', () => {
  document.getElementById('reconnectOverlay').classList.remove('hidden');
});
socket.on('connect', () => {
  document.getElementById('reconnectOverlay').classList.add('hidden');
  const s = loadSession();
  if (s && s.name) {
    socket.emit('join_game', { roomId: s.roomId, playerName: s.name, gameType: 'tv-taboo', reconnect: true });
  }
});

// ── Confetti ──
function spawnConfetti() {
  const container = document.getElementById('confettiContainer');
  container.classList.remove('hidden');
  container.innerHTML = '';
  const colors = ['#ffd700', '#4ecca3', '#e74c3c', '#3498db', '#f39c12', '#9b59b6'];
  for (let i = 0; i < 60; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    piece.style.left = Math.random() * 100 + 'vw';
    piece.style.background = colors[Math.floor(Math.random() * colors.length)];
    piece.style.animationDelay = (Math.random() * 2) + 's';
    piece.style.borderRadius = Math.random() > 0.5 ? '50%' : '0';
    container.appendChild(piece);
  }
  setTimeout(() => container.classList.add('hidden'), 4000);
}
