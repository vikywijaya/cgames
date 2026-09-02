'use strict';

// ── URL params (host handoff from /tv-lobby) ────────────────────────────────
const _tvParams    = new URLSearchParams(location.search);
const _hostHandoff = _tvParams.get('host') === '1';
const _initialRoom = _tvParams.get('room');

let myRoomId = _initialRoom || null;
let gameState = null;
let roundOverTimer = null;
let nextStimulusTimer = null;
let questionCountdownTimer = null;
let selectedDifficulty = 'easy';

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

const playingMeta     = document.getElementById('playingMeta');
const stimulusWord    = document.getElementById('stimulusWord');
const questionCounter = document.getElementById('questionCounter');
const questionTimerEl = document.getElementById('questionTimer');
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
  socket.emit('join_game', { roomId: myRoomId || null, playerName: 'TV Display', gameType: 'tv-stroop-colour', reconnect: !!myRoomId });
});
socket.on('disconnect', () => reconnectOverlay.classList.remove('hidden'));
socket.on('connect_error', () => reconnectOverlay.classList.remove('hidden'));

let _hostStartFired = false;
socket.on('joined', ({ roomId }) => {
  myRoomId = roomId;

  if (_hostHandoff && !_hostStartFired && !playingPhase.classList.contains('active')) {
    _hostStartFired = true;
    setTimeout(() => socket.emit('tv_stroop_colour_start', { difficulty: selectedDifficulty }), 400);
    return;
  }

  const joinUrl = `${location.origin}/tv-join?game=tv-stroop-colour&room=${roomId}`;
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

let lastQuestionIndex = -1;

socket.on('game_started', (state) => {
  if (state.gameType !== 'tv-stroop-colour') return;
  gameState = state;
  lastQuestionIndex = -1;
  sfx.gameStart();
  showPhase('playing');
  renderPlaying(state);
  startQuestionCountdown();
});

socket.on('game_state', (state) => {
  if (state.gameType !== 'tv-stroop-colour') return;
  const prevQIdx = gameState ? gameState.questionIndex : -1;
  gameState = state;
  showPhase('playing');
  renderPlaying(state);
  // New question arrived — restart countdown
  if (state.questionIndex !== prevQIdx) {
    startQuestionCountdown();
  }
});

socket.on('stroop_all_answered', () => {
  // Server handles advancement — stop countdown and dim stimulus
  if (questionCountdownTimer) { clearInterval(questionCountdownTimer); questionCountdownTimer = null; }
  if (questionTimerEl) questionTimerEl.textContent = '';
  if (stimulusWord) stimulusWord.style.opacity = '0.5';
});

socket.on('round_over', ({ currentRound, totalRounds, players, nextRoundIn }) => {
  if (nextStimulusTimer) { clearTimeout(nextStimulusTimer); nextStimulusTimer = null; }
  if (questionCountdownTimer) { clearInterval(questionCountdownTimer); questionCountdownTimer = null; }
  sfx.roundOver();
  showPhase('roundover');
  renderRoundOver(currentRound, totalRounds, players, nextRoundIn);
});

socket.on('game_over', ({ winner, players, reason }) => {
  if (nextStimulusTimer) { clearTimeout(nextStimulusTimer); nextStimulusTimer = null; }
  if (questionCountdownTimer) { clearInterval(questionCountdownTimer); questionCountdownTimer = null; }
  if (roundOverTimer) clearInterval(roundOverTimer);
  sfx.victory();
  gameoverWinnerName.textContent = winner || 'Nobody';
  gameoverWinner.textContent = reason || '';
  renderFinalScores(players);
  showPhase('gameover');
  spawnConfetti();
});

socket.on('error', ({ message }) => {
  const el = document.getElementById('tvStartError');
  if (el) { el.textContent = message; setTimeout(() => { el.textContent = ''; }, 4000); }
  startBtn.disabled = false;
  startBtn.textContent = 'Start Game';
});

// ── Start ─────────────────────────────────────────────────────────────────────
document.querySelectorAll('.tv-diff-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tv-diff-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedDifficulty = btn.dataset.diff;
  });
});

startBtn.addEventListener('click', () => {
  startBtn.disabled = true;
  startBtn.textContent = 'Starting...';
  socket.emit('tv_stroop_colour_start', { difficulty: selectedDifficulty });
  setTimeout(() => {
    if (lobbyPhase.classList.contains('active')) { startBtn.disabled = false; startBtn.textContent = 'Start Game'; }
  }, 3000);
});

playAgainBtn.addEventListener('click', () => {
  socket.emit('play_again');
  setTimeout(function(){ location.replace('/tv-lobby?game=tv-stroop-colour' + (myRoomId ? '&room=' + myRoomId : '')); }, 60);
});

socket.on('play_again', () => {
  gameState = null;
  lastQuestionIndex = -1;
  if (roundOverTimer) { clearInterval(roundOverTimer); roundOverTimer = null; }
  if (questionCountdownTimer) { clearInterval(questionCountdownTimer); questionCountdownTimer = null; }
  if (nextStimulusTimer) { clearTimeout(nextStimulusTimer); nextStimulusTimer = null; }
  startBtn.disabled = false;
  startBtn.textContent = 'Start Game';
  showPhase('lobby');
});

// ── Phase switching ───────────────────────────────────────────────────────────
function showPhase(phase) {
  [lobbyPhase, playingPhase, roundOverPhase, gameoverPhase].forEach(p => p.classList.remove('active'));
  if (phase === 'lobby')     lobbyPhase.classList.add('active');
  if (phase === 'playing')   playingPhase.classList.add('active');
  if (phase === 'roundover') roundOverPhase.classList.add('active');
  if (phase === 'gameover')  gameoverPhase.classList.add('active');
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
  const { stimulus, questionIndex, totalQuestions, currentRound, totalRounds, difficulty, playerAnswered, playerScores, players } = state;

  playingMeta.textContent = `${(difficulty || '').toUpperCase()} — Round ${currentRound + 1} of ${totalRounds}`;

  if (stimulus) {
    stimulusWord.textContent = stimulus.word;
    stimulusWord.style.color = stimulus.inkHex;
    stimulusWord.style.opacity = '1';
    questionCounter.textContent = `Question ${questionIndex + 1} of ${totalQuestions}`;
  } else {
    stimulusWord.textContent = '';
    questionCounter.textContent = '';
  }

  // Player boards
  playerBoards.innerHTML = '';
  if (players) {
    players.forEach((player, i) => {
      const answered = playerAnswered[i];
      const board = document.createElement('div');
      board.className = 'tv-player-board' + (answered ? ' board-answered' : '');

      const nameHtml = answered
        ? `${escHtml(player.name)} <span class="badge-answered">✓</span>`
        : escHtml(player.name);

      board.innerHTML = `
        <div class="tv-player-board-name">${nameHtml}</div>
        <div class="tv-player-board-score">${playerScores[i] || 0} / ${questionIndex + 1}</div>
        <div class="tv-player-board-status">${state.sessionScores[i] || 0} session pts</div>
      `;
      playerBoards.appendChild(board);
    });
  }
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
    if (countdown <= 0) { clearInterval(roundOverTimer); roundOverCountdown.textContent = 'Get ready!'; sfx.gameStart(); }
    else { countdown <= 3 ? sfx.tickUrgent() : sfx.tick(); roundOverCountdown.textContent = `Next round in ${countdown}s…`; }
  }, 1000);
}

// ── Final Scores ──────────────────────────────────────────────────────────────
function renderFinalScores(players) {
  if (!players) return;
  const sorted = [...players].sort((a, b) => b.score - a.score);
  gameoverScores.innerHTML = sorted.map(p =>
    `<div class="tv-final-score-row"><span>${escHtml(p.name)}</span><span>${p.score} pts</span></div>`
  ).join('');
}

// ── Confetti ──────────────────────────────────────────────────────────────────
function spawnConfetti() {
  confettiContainer.classList.remove('hidden');
  confettiContainer.innerHTML = '';
  const colors = ['#f87171','#60a5fa','#4ade80','#fbbf24','#c084fc','#fb923c','#ffd700','#4ecca3'];
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

function startQuestionCountdown() {
  if (questionCountdownTimer) clearInterval(questionCountdownTimer);
  const timerMs = gameState && gameState.timerMs ? gameState.timerMs : 8000;
  let remaining = Math.ceil(timerMs / 1000);
  if (questionTimerEl) questionTimerEl.textContent = remaining + 's';
  questionCountdownTimer = setInterval(() => {
    remaining--;
    if (remaining <= 0) {
      clearInterval(questionCountdownTimer);
      questionCountdownTimer = null;
      if (questionTimerEl) questionTimerEl.textContent = '';
    } else {
      if (questionTimerEl) questionTimerEl.textContent = remaining + 's';
    }
  }, 1000);
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
