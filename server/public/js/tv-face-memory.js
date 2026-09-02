'use strict';

// ── URL params (host handoff from /tv-lobby) ────────────────────────────────
const _tvParams    = new URLSearchParams(location.search);
const _hostHandoff = _tvParams.get('host') === '1';
const _initialRoom = _tvParams.get('room');

let myRoomId = _initialRoom || null;
let gameState = null;
let selectedDifficulty = 'easy';
let roundOverTimer = null;
let studyCountdownTimer = null;

// ── DOM refs ──────────────────────────────────────────────────────────────────
const lobbyPhase      = document.getElementById('lobbyPhase');
const playingPhase    = document.getElementById('playingPhase');
const roundOverPhase  = document.getElementById('roundOverPhase');
const gameoverPhase   = document.getElementById('gameoverPhase');
const reconnectOverlay = document.getElementById('reconnectOverlay');

const qrContainer     = document.getElementById('qrcode');
const joinUrlEl       = document.getElementById('joinUrl');
const lobbyPlayerList = document.getElementById('lobbyPlayerList');
const startBtn        = document.getElementById('startBtn');
const diffBtns        = document.querySelectorAll('.tv-diff-btn');

const playingMeta     = document.getElementById('playingMeta');
const phaseLabel      = document.getElementById('phaseLabel');
const studySection    = document.getElementById('studySection');
const studyTimer      = document.getElementById('studyTimer');
const studyGrid       = document.getElementById('studyGrid');
const recallSection   = document.getElementById('recallSection');
const recallFaceImg   = document.getElementById('recallFaceImg');
const questionCounter = document.getElementById('questionCounter');
const playerBoards    = document.getElementById('playerBoards');

const roundOverTitle     = document.getElementById('roundOverTitle');
const roundOverScores    = document.getElementById('roundOverScores');
const roundOverCountdown = document.getElementById('roundOverCountdown');

const gameoverWinnerName = document.getElementById('gameoverWinnerName');
const gameoverWinner     = document.getElementById('gameoverWinner');
const gameoverScores     = document.getElementById('gameoverScores');
const playAgainBtn       = document.getElementById('playAgainBtn');
const confettiContainer  = document.getElementById('confettiContainer');

// ── Socket ────────────────────────────────────────────────────────────────────
const socket = io({ reconnectionAttempts: Infinity, reconnectionDelay: 1000, transports: ['websocket', 'polling'] });

if (_hostHandoff && lobbyPhase) lobbyPhase.classList.remove('active');

socket.on('connect', () => {
  reconnectOverlay.classList.add('hidden');
  socket.emit('join_game', { roomId: myRoomId || null, playerName: 'TV Display', gameType: 'tv-face-memory', reconnect: !!myRoomId });
});
socket.on('disconnect', () => reconnectOverlay.classList.remove('hidden'));
socket.on('connect_error', () => reconnectOverlay.classList.remove('hidden'));

let _hostStartFired = false;
socket.on('joined', ({ roomId }) => {
  myRoomId = roomId;

  if (_hostHandoff && !_hostStartFired && !playingPhase.classList.contains('active')) {
    _hostStartFired = true;
    setTimeout(() => socket.emit('tv_face_memory_start', { difficulty: selectedDifficulty }), 400);
    return;
  }

  const joinUrl = `${location.origin}/tv-join?game=tv-face-memory&room=${roomId}`;
  joinUrlEl.textContent = joinUrl;
  qrContainer.innerHTML = '';
  try { new QRCode(qrContainer, { text: joinUrl, width: 200, height: 200, correctLevel: QRCode.CorrectLevel.H }); }
  catch (e) { qrContainer.textContent = joinUrl; }
});

socket.on('room_update', ({ players }) => {
  const phone = players.filter(p => p.color !== 'tv-host');
  renderLobbyPlayers(phone);
  startBtn.disabled = phone.filter(p => p.connected).length < 1;
});

socket.on('game_started', (state) => {
  if (state.gameType !== 'tv-face-memory') return;
  gameState = state;
  switchPhase('playing');
  renderPlaying(state);
});

socket.on('game_state', (state) => {
  if (state.gameType !== 'tv-face-memory') return;
  gameState = state;
  if (roundOverPhase.classList.contains('active') && !state.isRoundOver) {
    if (roundOverTimer) clearInterval(roundOverTimer);
    switchPhase('playing');
  }
  if (playingPhase.classList.contains('active')) renderPlaying(state);
});

socket.on('round_over', ({ currentRound, totalRounds, players, nextRoundIn }) => {
  if (studyCountdownTimer) clearInterval(studyCountdownTimer);
  switchPhase('roundover');
  renderRoundOver(currentRound, totalRounds, players, nextRoundIn);
});

socket.on('game_over', ({ winner, players, reason }) => {
  if (studyCountdownTimer) clearInterval(studyCountdownTimer);
  if (roundOverTimer) clearInterval(roundOverTimer);
  gameoverWinnerName.textContent = winner || 'Nobody';
  gameoverWinner.textContent = reason || '';
  renderFinalScores(players);
  switchPhase('gameover');
  spawnConfetti();
});

socket.on('error', ({ message }) => {
  const el = document.getElementById('tvStartError');
  if (el) { el.textContent = message; setTimeout(() => { el.textContent = ''; }, 4000); }
  startBtn.disabled = false;
  startBtn.textContent = 'Start Game';
});

// ── Difficulty + Start ────────────────────────────────────────────────────────
diffBtns.forEach(btn => btn.addEventListener('click', () => {
  diffBtns.forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  selectedDifficulty = btn.dataset.diff;
}));

startBtn.addEventListener('click', () => {
  startBtn.disabled = true;
  startBtn.textContent = 'Starting...';
  socket.emit('tv_face_memory_start', { difficulty: selectedDifficulty });
  setTimeout(() => {
    if (lobbyPhase.classList.contains('active')) { startBtn.disabled = false; startBtn.textContent = 'Start Game'; }
  }, 3000);
});

playAgainBtn.addEventListener('click', () => {
  socket.emit('play_again');
  setTimeout(function(){ location.replace('/tv-lobby?game=tv-face-memory' + (myRoomId ? '&room=' + myRoomId : '')); }, 60);
});

socket.on('play_again', () => {
  gameState = null;
  if (typeof roundOverTimer !== 'undefined' && roundOverTimer) clearInterval(roundOverTimer);
  switchPhase('lobby');
});

// ── Phase switching ───────────────────────────────────────────────────────────
function switchPhase(phase) {
  [lobbyPhase, playingPhase, roundOverPhase, gameoverPhase].forEach(p => p.classList.remove('active'));
  if (phase === 'lobby')    lobbyPhase.classList.add('active');
  if (phase === 'playing')  playingPhase.classList.add('active');
  if (phase === 'roundover') roundOverPhase.classList.add('active');
  if (phase === 'gameover') gameoverPhase.classList.add('active');
}

// ── Lobby ─────────────────────────────────────────────────────────────────────
function renderLobbyPlayers(players) {
  lobbyPlayerList.innerHTML = '';
  const connected = players.filter(p => p.connected);
  if (!connected.length) { lobbyPlayerList.innerHTML = '<div class="tv-player-empty">Waiting for players...</div>'; return; }
  connected.forEach(p => {
    const div = document.createElement('div');
    div.className = 'tv-player-item';
    div.innerHTML = `<span class="tv-player-dot"></span>${escHtml(p.name)}`;
    lobbyPlayerList.appendChild(div);
  });
}

// ── Playing ───────────────────────────────────────────────────────────────────
function renderPlaying(state) {
  const { phase, currentRound, totalRounds, difficulty } = state;
  playingMeta.textContent = `${difficulty.toUpperCase()} — Round ${currentRound + 1} of ${totalRounds}`;

  if (phase === 'study') {
    renderStudy(state);
  } else if (phase === 'recall') {
    renderRecall(state);
  }
}

function renderStudy(state) {
  phaseLabel.textContent = 'Memorise the faces!';
  studySection.classList.remove('hidden');
  recallSection.classList.add('hidden');

  // Render face cards
  studyGrid.innerHTML = '';
  state.studyFaces.forEach((face, i) => {
    const card = document.createElement('div');
    card.className = 'tv-face-card';
    card.style.animationDelay = `${i * 120}ms`;
    card.innerHTML = `
      <img class="tv-face-img" src="${face.img}" alt="${escHtml(face.name)}" />
      <div class="tv-face-name">${escHtml(face.name)}</div>
    `;
    studyGrid.appendChild(card);
  });

  // Countdown timer — only start once per study phase (don't restart on re-render)
  if (studyCountdownTimer) return; // already running
  let remaining = state.config.studySec;
  studyTimer.textContent = remaining + 's';
  studyTimer.classList.remove('urgent');

  studyCountdownTimer = setInterval(() => {
    remaining--;
    studyTimer.textContent = remaining + 's';
    if (remaining <= 3) studyTimer.classList.add('urgent');
    if (remaining <= 0) { clearInterval(studyCountdownTimer); studyTimer.textContent = ''; }
  }, 1000);
}

function renderRecall(state) {
  if (studyCountdownTimer) { clearInterval(studyCountdownTimer); studyCountdownTimer = null; }
  phaseLabel.textContent = 'Who is this?';
  studySection.classList.add('hidden');
  recallSection.classList.remove('hidden');

  const { currentQuestion, questionIndex, totalQuestions, players, correctAnswers, answeredThisQuestion, sessionScores } = state;

  // Face image
  if (currentQuestion) {
    recallFaceImg.src = currentQuestion.face.img;
    recallFaceImg.alt = 'Who is this?';
  }
  questionCounter.textContent = `Question ${questionIndex + 1} of ${totalQuestions}`;

  // Player boards
  playerBoards.innerHTML = '';
  players.forEach((player, i) => {
    const answered = answeredThisQuestion[i];
    const board = document.createElement('div');
    board.className = 'tv-player-board';

    board.innerHTML = `
      <div class="tv-player-board-name">${escHtml(player.name)}</div>
      <div class="tv-player-score">${sessionScores[i] || 0} pts</div>
      <div class="tv-player-correct-count">${correctAnswers[i] || 0} ✓</div>
      <div class="tv-answer-status">${answered ? 'Answered' : 'Thinking...'}</div>
    `;
    playerBoards.appendChild(board);
  });
}

// ── Round Over ────────────────────────────────────────────────────────────────
function renderRoundOver(currentRound, totalRounds, players, nextRoundIn) {
  roundOverTitle.textContent = `Round ${currentRound + 1} Complete!`;
  const sorted = [...players].sort((a, b) => b.score - a.score);
  roundOverScores.innerHTML = sorted.map((p, idx) => {
    const medal = ['🥇','🥈','🥉'][idx] || '';
    return `<div class="tv-round-score-row">
      <span class="tv-round-score-medal">${medal}</span>
      <span class="tv-round-score-name">${escHtml(p.name)}</span>
      <span class="tv-round-score-pts">${p.score} pts</span>
    </div>`;
  }).join('');

  let countdown = nextRoundIn;
  roundOverCountdown.textContent = `Next round in ${countdown}s…`;
  if (roundOverTimer) clearInterval(roundOverTimer);
  roundOverTimer = setInterval(() => {
    countdown--;
    if (countdown <= 0) { clearInterval(roundOverTimer); roundOverCountdown.textContent = 'Get ready!'; }
    else roundOverCountdown.textContent = `Next round in ${countdown}s…`;
  }, 1000);
}

function renderFinalScores(players) {
  if (!players) return;
  const sorted = [...players].sort((a, b) => b.score - a.score);
  gameoverScores.innerHTML = sorted.map(p =>
    `<div class="tv-final-score-row"><span>${escHtml(p.name)}</span><span>${p.score} pts</span></div>`
  ).join('');
}

function spawnConfetti() {
  confettiContainer.classList.remove('hidden');
  confettiContainer.innerHTML = '';
  const colors = ['#ffd700','#4ecca3','#ff6b6b','#60a5fa','#f472b6','#a78bfa'];
  for (let i = 0; i < 80; i++) {
    const p = document.createElement('div');
    p.className = 'confetti-piece';
    p.style.left = Math.random() * 100 + 'vw';
    p.style.background = colors[Math.floor(Math.random() * colors.length)];
    p.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
    p.style.animationDelay = Math.random() * 2 + 's';
    confettiContainer.appendChild(p);
    setTimeout(() => p.remove(), 5000);
  }
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
