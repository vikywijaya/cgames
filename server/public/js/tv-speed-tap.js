'use strict';

const params = new URLSearchParams(location.search);

// ── URL params (host handoff from /tv-lobby) ────────────────────────────────
const _hostHandoff = params.get('host') === '1';
const _initialRoom = params.get('room');

let myRoomId = _initialRoom || null;
let roomPlayers = [];
let gameState = null;
let questionTimer = null;
let selectedDifficulty = 'easy';
let timerStart = 0;
let timerMs = 0;

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
const targetEmoji      = document.getElementById('targetEmoji');
const targetTimer      = document.getElementById('targetTimer');
const questionProgress = document.getElementById('questionProgress');
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
    gameType: 'tv-speed-tap',
    reconnect: !!myRoomId
  });
});

let _hostStartFired = false;
socket.on('joined', ({ roomId }) => {
  myRoomId = roomId;

  if (_hostHandoff && !_hostStartFired && !playingPhase.classList.contains('active')) {
    _hostStartFired = true;
    setTimeout(() => socket.emit('tv_speed_tap_start', { difficulty: selectedDifficulty }), 400);
    return;
  }

  const joinUrl = `${location.origin}/tv-join?game=tv-speed-tap&room=${roomId}`;
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
  socket.emit('tv_speed_tap_start', { difficulty: selectedDifficulty });
});

socket.on('error', ({ message }) => {
  startError.textContent = message;
  startBtn.disabled = false;
});

// ── Game events ───────────────────────────────────────────────────────────────
let lastQuestionIndex = -1;
let lastQuestionPhase = '';

socket.on('game_started', (state) => {
  if (state.gameType !== 'tv-speed-tap') return;
  gameState = state;
  lastQuestionIndex = -1;
  lastQuestionPhase = '';
  showPhase('playing');
  renderPlaying(state);
  handleQuestionPhase(state);
});

socket.on('game_state', (state) => {
  if (state.gameType !== 'tv-speed-tap') return;
  gameState = state;
  showPhase('playing');
  renderPlaying(state);
  handleQuestionPhase(state);
});

function handleQuestionPhase(state) {
  const newQ = state.questionIndex !== lastQuestionIndex;
  const phaseChanged = state.questionPhase !== lastQuestionPhase;
  lastQuestionIndex = state.questionIndex;
  lastQuestionPhase = state.questionPhase;

  if (state.questionPhase === 'countdown') {
    // Show countdown on TV
    clearQuestionTimer();
    targetEmoji.classList.remove('buildup', 'reveal');
    targetTimer.textContent = '';
    questionProgress.textContent = '';
    startReadyCountdown();
    return;
  } else if (state.questionPhase === 'buildup' && newQ) {
    // Buildup: hide target, shuffle grid with shuffle sfx
    stopReadyCountdown();
    clearQuestionTimer();
    targetEmoji.textContent = '?';
    targetEmoji.classList.add('buildup');
    targetTimer.textContent = '';
    sfx.gridShuffle();
  } else if (state.questionPhase === 'answering' && phaseChanged) {
    // Reveal: show target with dramatic effect
    targetEmoji.classList.remove('buildup');
    targetEmoji.classList.add('reveal');
    sfx.reveal();
    setTimeout(() => targetEmoji.classList.remove('reveal'), 500);
    // Start visual countdown with tick-tock
    startQuestionTimer(state.showMs);
    const ticks = Math.min(Math.floor((state.showMs || 3000) / 500), 8);
    sfx.tickTock(ticks, 500);
  }
}

socket.on('tv_speed_tap_all_answered', () => {
  // Server handles advancement — just stop the countdown
  clearQuestionTimer();
  if (targetTimer) targetTimer.textContent = '';
});

socket.on('round_over', ({ currentRound, totalRounds, solvedOrder, pointsAwarded, sessionScores, players, nextRoundIn }) => {
  clearQuestionTimer();
  const roundNum = (currentRound !== undefined ? currentRound : 0) + 1;
  roundOverTitle.textContent = `Round ${roundNum} Done!`;

  roundOverResults.innerHTML = '';
  const medals = ['🥇', '🥈', '🥉'];
  (solvedOrder || []).forEach((seat, i) => {
    const p = players && players[seat] ? players[seat] : { name: `P${seat + 1}` };
    const pts = pointsAwarded && pointsAwarded[seat] !== undefined ? pointsAwarded[seat] : 0;
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
  clearQuestionTimer();
  gameOverWinner.textContent = winner ? `🏆 ${winner} wins!` : "It's a tie!";
  gameOverFinal.innerHTML = (players || []).map(p =>
    `<div class="tv-final-score-row"><span>${p.name}</span><span>${p.score} pts</span></div>`
  ).join('');
  showPhase('gameover');
});

// ── Timer ─────────────────────────────────────────────────────────────────────
// ── Ready countdown overlay ─────────────────────────────────────────────────
let readyCountdownTimer = null;
const tvReadyOverlay = document.getElementById('tvReadyOverlay');
const tvReadyNumber = document.getElementById('tvReadyNumber');

function startReadyCountdown() {
  stopReadyCountdown();
  let count = 5;
  tvReadyOverlay.classList.remove('hidden');
  tvReadyNumber.textContent = count;
  targetEmoji.textContent = '';
  targetTimer.textContent = '';
  sfx.tick();
  readyCountdownTimer = setInterval(() => {
    count--;
    if (count <= 0) {
      clearInterval(readyCountdownTimer);
      readyCountdownTimer = null;
      tvReadyNumber.textContent = 'GO!';
      sfx.gameStart();
      setTimeout(() => { tvReadyOverlay.classList.add('hidden'); }, 600);
    } else {
      tvReadyNumber.textContent = count;
      count <= 2 ? sfx.tickUrgent() : sfx.tick();
    }
  }, 1000);
}

function stopReadyCountdown() {
  if (readyCountdownTimer) { clearInterval(readyCountdownTimer); readyCountdownTimer = null; }
  if (tvReadyOverlay) tvReadyOverlay.classList.add('hidden');
}

function startQuestionTimer(ms) {
  clearQuestionTimer();
  timerMs = ms;
  timerStart = Date.now();
  updateTimerDisplay();
  questionTimer = setInterval(() => {
    const elapsed = Date.now() - timerStart;
    const remaining = Math.max(0, timerMs - elapsed);
    updateTimerDisplay(remaining);
    if (remaining <= 0) {
      clearQuestionTimer();
      // Server handles advancement — just show time's up
      if (targetTimer) targetTimer.textContent = '';
    }
  }, 100);
}

function clearQuestionTimer() {
  if (questionTimer) { clearInterval(questionTimer); questionTimer = null; }
}

function updateTimerDisplay(remaining) {
  if (remaining === undefined) remaining = timerMs;
  const secs = (remaining / 1000).toFixed(1);
  targetTimer.textContent = `${secs}s`;
  targetTimer.classList.toggle('urgent', remaining < 1000);
}

// ── Render playing ────────────────────────────────────────────────────────────
function renderPlaying(state) {
  const { currentRound, totalRounds, currentQuestion, questionIndex, totalQuestions, playerScores, playerAnswered, sessionScores } = state;
  playingMeta.textContent = `Round ${(currentRound || 0) + 1} of ${totalRounds || 3}`;

  // Target emoji — only show during answering phase
  if (currentQuestion) {
    if (state.questionPhase === 'buildup') {
      targetEmoji.textContent = '?';
    } else {
      targetEmoji.textContent = currentQuestion.target;
    }
  }

  // Question progress
  questionProgress.textContent = `Question ${(questionIndex || 0) + 1} of ${totalQuestions || 10}`;

  // Scoreboard
  const players = roomPlayers.filter(p => p.color !== 'tv-host');
  scoreboardPlaying.innerHTML = players.map((p, i) => {
    const answered = playerAnswered && playerAnswered[i];
    const score = playerScores && playerScores[i] || 0;
    const sessScore = sessionScores && sessionScores[i] || 0;
    let chipClass = 'tv-score-chip';
    if (answered) chipClass += ' answered';
    return `<div class="${chipClass}">
      <div class="tv-score-name">${p.name}</div>
      <div class="tv-score-correct">${score}/${(questionIndex || 0) + 1} correct</div>
      <div class="tv-score-pts">${sessScore} pts</div>
    </div>`;
  }).join('');
}

// ── Phase switching ───────────────────────────────────────────────────────────
// ── Play Again ───────────────────────────────────────────────────────────────
const playAgainBtn = document.getElementById('playAgainBtn');
if (playAgainBtn) playAgainBtn.addEventListener('click', () => {
  socket.emit('play_again');
  setTimeout(function(){ location.replace('/tv-lobby?game=tv-speed-tap' + (myRoomId ? '&room=' + myRoomId : '')); }, 60);
});

socket.on('play_again', () => {
  gameState = null;
  lastQuestionIndex = -1;
  lastQuestionPhase = '';
  clearQuestionTimer();
  stopReadyCountdown();
  startBtn.disabled = false;
  showPhase('lobby');
});

function showPhase(name) {
  [lobbyPhase, playingPhase, roundOverPhase, gameOverPhase].forEach(el => el.classList.remove('active'));
  if (name === 'lobby')     lobbyPhase.classList.add('active');
  if (name === 'playing')   playingPhase.classList.add('active');
  if (name === 'roundover') roundOverPhase.classList.add('active');
  if (name === 'gameover')  gameOverPhase.classList.add('active');
}
