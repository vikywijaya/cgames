'use strict';

const params = new URLSearchParams(location.search);
const roomId = params.get('room');
const isAutoJoin = (new URLSearchParams(window.location.search)).get('autojoin') === '1';
let _autoJoinHandoff = null;
if (isAutoJoin && roomId) {
  try {
    const _raw = sessionStorage.getItem(`caritahub_pending_join_${roomId}`);
    if (_raw) {
      const _d = JSON.parse(_raw);
      if (_d && _d.name && _d.color && Date.now() - (_d.ts || 0) < 30 * 60 * 1000) {
        _autoJoinHandoff = _d;
      }
    }
  } catch (e) { /* ignore */ }
}


const TV_COLOURS = ['tv-host', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'];
function seatForColor(c) {
  if (c === 'tv-host') return -1;
  const i = TV_COLOURS.indexOf(c);
  return i > 0 ? i - 1 : -1;
}

let myColor = _autoJoinHandoff ? _autoJoinHandoff.color : null;
let mySeat = (_autoJoinHandoff ? (['tv-host','p1','p2','p3','p4','p5','p6','p7','p8'].indexOf(_autoJoinHandoff.color) > 0 ? ['tv-host','p1','p2','p3','p4','p5','p6','p7','p8'].indexOf(_autoJoinHandoff.color) - 1 : -1) : -1);
let myName = _autoJoinHandoff ? _autoJoinHandoff.name : '';
let myCurrentScore = 0;
let hasTapped = false;
let lastQuestionIndex = -1;
let lastQPhase = '';

// ── DOM ───────────────────────────────────────────────────────────────────────
const joinScreen       = document.getElementById('joinScreen');
const waitingScreen    = document.getElementById('waitingScreen');
const playingScreen    = document.getElementById('playingScreen');
const gameoverScreen   = document.getElementById('gameoverScreen');
const reconnectOverlay = document.getElementById('reconnectOverlay');

const nameInput   = document.getElementById('nameInput');
const joinBtn     = document.getElementById('joinBtn');
const joinError   = document.getElementById('joinError');
const waitingName = document.getElementById('waitingName');

const myScoreEl   = document.getElementById('myScore');
const myCorrectEl = document.getElementById('myCorrect');
const roundInfoEl = document.getElementById('roundInfo');
const feedbackEl  = document.getElementById('feedback');
const targetEmojiEl = document.getElementById('targetEmoji');
const emojiGrid   = document.getElementById('emojiGrid');
const gridArea    = document.getElementById('gridArea');
const watchTv     = document.getElementById('watchTv');
const watchTvText = document.getElementById('watchTvText');
const watchTvSub  = document.getElementById('watchTvSub');

const goTrophy    = document.getElementById('goTrophy');
const goTitle     = document.getElementById('goTitle');
const goScore     = document.getElementById('goScore');
const goPersonal  = document.getElementById('goPersonal');

// ── Socket ────────────────────────────────────────────────────────────────────
const socket = io({ reconnectionAttempts: Infinity, reconnectionDelay: 1000, transports: ['websocket', 'polling'] });

// ── Autojoin: jump straight to waiting screen ──────────────────────────────
if (_autoJoinHandoff) {
  if (typeof waitingName !== 'undefined' && waitingName) waitingName.textContent = `You joined as ${myName}`;
  showScreen('waiting');
}

socket.on('connect', () => {
  reconnectOverlay.classList.remove('show');
  if (myName && roomId) socket.emit('join_game', { roomId, playerName: myName, gameType: 'tv-speed-tap', reconnect: true });
});
socket.on('disconnect',    () => reconnectOverlay.classList.add('show'));
socket.on('connect_error', () => reconnectOverlay.classList.add('show'));

// ── Join ──────────────────────────────────────────────────────────────────────
joinBtn.addEventListener('click', doJoin);
nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') doJoin(); });

function doJoin() {
  const name = nameInput.value.trim();
  if (!name)   { joinError.textContent = 'Please enter your name.'; return; }
  if (!roomId) { joinError.textContent = 'No room ID — scan the QR code.'; return; }
  myName = name;
  joinError.textContent = '';
  joinBtn.disabled = true;
  socket.emit('join_game', { roomId, playerName: name, gameType: 'tv-speed-tap' });
}

socket.on('joined', ({ color }) => {
  myColor = color;
  mySeat = seatForColor(color);
  if (color === 'spectator' || color === 'tv-host') {
    joinError.textContent = 'Room is full — joined as spectator.';
    joinBtn.disabled = false;
    return;
  }
  sfx.join();
  waitingName.textContent = myName;
  showScreen('waiting');
});

socket.on('room_update', () => {});

// ── Game events ───────────────────────────────────────────────────────────────
socket.on('game_started', (state) => {
  if (state.gameType !== 'tv-speed-tap') return;
  myCurrentScore = 0;
  lastQuestionIndex = -1;
  lastQPhase = '';
  sfx.gameStart();
  showScreen('playing');
  applyState(state);
});

socket.on('game_state', (state) => {
  if (state.gameType !== 'tv-speed-tap') return;
  if (!playingScreen.classList.contains('active')) showScreen('playing');
  applyState(state);
});

socket.on('tv_speed_tap_result', ({ correct }) => {
  if (correct) {
    feedbackEl.textContent = 'Correct!';
    feedbackEl.style.color = '#4ade80';
    sfx.correct();
  } else {
    feedbackEl.textContent = 'Wrong!';
    feedbackEl.style.color = '#f87171';
    sfx.wrong();
  }
  // Flash the tapped button
  const tappedBtn = emojiGrid.querySelector('.emoji-btn.tapped');
  if (tappedBtn) {
    tappedBtn.classList.add(correct ? 'correct' : 'wrong');
  }
});

socket.on('tv_speed_tap_all_answered', () => {
  if (!hasTapped) {
    feedbackEl.textContent = "Time's up!";
    feedbackEl.style.color = '#94a3b8';
    hasTapped = true;
  }
  // Disable all buttons
  const btns = emojiGrid.querySelectorAll('.emoji-btn');
  btns.forEach(b => { b.style.pointerEvents = 'none'; b.classList.add('timeout'); });
});

let roundCountdownTimer = null;

socket.on('round_over', ({ currentRound, totalRounds, players, sessionScores, nextRoundIn }) => {
  sfx.roundOver();

  if (sessionScores && mySeat >= 0) myCurrentScore = sessionScores[mySeat] || 0;

  const rn = (currentRound !== undefined ? currentRound : 0) + 1;
  const rt = totalRounds || 1;
  const isLastRound = rn >= rt;

  myScoreEl.textContent = myCurrentScore + ' pts';
  watchTvText.textContent = `Round ${rn} of ${rt} done!`;
  watchTv.classList.remove('hidden');
  feedbackEl.textContent = '';

  if (!isLastRound) {
    let countdown = nextRoundIn || 5;
    watchTvSub.textContent = `${myCurrentScore} pts — next round in ${countdown}s`;
    if (roundCountdownTimer) clearInterval(roundCountdownTimer);
    roundCountdownTimer = setInterval(() => {
      countdown--;
      if (countdown <= 0) {
        clearInterval(roundCountdownTimer);
        watchTvSub.textContent = 'Next round starting...';
      } else {
        watchTvSub.textContent = `${myCurrentScore} pts — next round in ${countdown}s`;
      }
    }, 1000);
  } else {
    watchTvSub.textContent = `Your score: ${myCurrentScore} pts — final results soon...`;
  }
});

socket.on('game_over', ({ winner, players }) => {
  const didWin = winner === myName;
  const myData = players ? players.find(p => p.name === myName) : null;
  const finalScore = myData ? myData.score : myCurrentScore;

  goTrophy.textContent = didWin ? '🏆' : '🎯';
  goTitle.textContent = didWin ? 'You Win!' : 'Game Over!';
  goScore.textContent = finalScore + ' pts';
  goPersonal.textContent = didWin ? 'Fastest tapper!' : `${winner || 'Someone'} was faster!`;

  didWin ? sfx.victory() : sfx.roundOver();
  showScreen('gameover');
});

socket.on('play_again', () => {
  gameState = null;
  showScreen('waiting');
});

socket.on('error', ({ message }) => { joinError.textContent = message; joinBtn.disabled = false; });

// ── Ready countdown overlay on mobile ────────────────────────────────────────
let mobileCountdownTimer = null;
const readyOverlay = document.getElementById('readyOverlay');
const readyNumber = document.getElementById('readyNumber');

function startMobileCountdown() {
  stopMobileCountdown();
  let count = 5;
  readyOverlay.classList.remove('hidden');
  readyNumber.textContent = count;
  sfx.tick();
  mobileCountdownTimer = setInterval(function() {
    count--;
    if (count <= 0) {
      stopMobileCountdown();
      readyNumber.textContent = 'GO!';
      sfx.gameStart();
      setTimeout(function() { readyOverlay.classList.add('hidden'); }, 600);
    } else {
      readyNumber.textContent = count;
      count <= 2 ? sfx.tickUrgent() : sfx.tick();
    }
  }, 1000);
}

function stopMobileCountdown() {
  if (mobileCountdownTimer) { clearInterval(mobileCountdownTimer); mobileCountdownTimer = null; }
  if (readyOverlay) readyOverlay.classList.add('hidden');
}

// ── Apply server state ────────────────────────────────────────────────────────
function applyState(state) {
  const { currentRound, totalRounds, currentQuestion, questionIndex, totalQuestions, playerScores, sessionScores, playerAnswered } = state;

  roundInfoEl.textContent = `${(currentRound || 0) + 1}/${totalRounds || 3}`;

  if (sessionScores && mySeat >= 0) myCurrentScore = sessionScores[mySeat] || 0;
  myScoreEl.textContent = myCurrentScore + ' pts';

  const qPhase = state.questionPhase || 'answering';

  // Countdown phase — show "Ready!" with countdown
  if (qPhase === 'countdown') {
    if (!mobileCountdownTimer) startMobileCountdown();
    return;
  }
  stopMobileCountdown();

  const myRoundScore = playerScores && mySeat >= 0 ? playerScores[mySeat] || 0 : 0;
  myCorrectEl.textContent = `${myRoundScore}/${(questionIndex || 0) + 1}`;

  // New question detected
  if (questionIndex !== lastQuestionIndex) {
    lastQuestionIndex = questionIndex;
    hasTapped = false;
    feedbackEl.textContent = '';
    feedbackEl.style.color = '';
    watchTv.classList.add('hidden');

    if (currentQuestion) {
      // Buildup: show grid with shuffle animation, hide target
      if (qPhase === 'buildup') {
        targetEmojiEl.textContent = '?';
        targetEmojiEl.classList.add('buildup');
        drawGridWithShuffle(currentQuestion.grid, currentQuestion.gridSize);
        sfx.gridShuffle();
      } else {
        targetEmojiEl.textContent = currentQuestion.target;
        targetEmojiEl.classList.remove('buildup');
        drawGrid(currentQuestion.grid, currentQuestion.gridSize, false);
      }
    }
  }

  // Phase changed to answering — reveal target, enable grid
  if (qPhase === 'answering' && lastQPhase !== 'answering') {
    clearShuffleTimers();
    targetEmojiEl.textContent = currentQuestion ? currentQuestion.target : '';
    targetEmojiEl.classList.remove('buildup');
    sfx.reveal();
    // Play tick-tock during answer timer
    var showMs = (gameState && gameState.showMs) || 3000;
    var ticks = Math.min(Math.floor(showMs / 500), 8);
    sfx.tickTock(ticks, 500);
    // Set final emojis and enable all buttons
    const btns = emojiGrid.querySelectorAll('.emoji-btn');
    btns.forEach(function(b, i) {
      if (currentQuestion && currentQuestion.grid[i] !== undefined) b.textContent = currentQuestion.grid[i];
      b.style.pointerEvents = '';
      b.disabled = false;
      b.classList.remove('disabled', 'shuffle-in', 'shuffle-swap', 'shuffle-settle');
      b.style.animationDelay = '';
    });
  }
  lastQPhase = qPhase;

  // If we already answered this question (reconnect case)
  if (playerAnswered && mySeat >= 0 && playerAnswered[mySeat] && !hasTapped) {
    hasTapped = true;
    const btns = emojiGrid.querySelectorAll('.emoji-btn');
    btns.forEach(b => b.classList.add('tapped'));
  }
}

// ── Draw grid ────────────────────────────────────────────────────────────────
function drawGrid(grid, gridSize, disabled) {
  if (!grid) return;

  // Calculate columns: sqrt-ish layout
  let cols;
  if (gridSize <= 4) cols = 2;
  else if (gridSize <= 6) cols = 3;
  else if (gridSize <= 9) cols = 3;
  else cols = 4;

  const areaW = gridArea.clientWidth || window.innerWidth;
  const gap = 10;
  const maxCellW = Math.floor((areaW - 32 - gap * (cols + 1)) / cols);
  const cellSize = Math.max(64, Math.min(100, maxCellW));
  const fontSize = Math.floor(cellSize * 0.5);

  emojiGrid.style.gridTemplateColumns = `repeat(${cols}, ${cellSize}px)`;
  emojiGrid.innerHTML = '';

  for (let i = 0; i < grid.length; i++) {
    const btn = document.createElement('button');
    btn.className = 'emoji-btn' + (disabled ? ' disabled' : '');
    btn.setAttribute('role', 'button');
    btn.setAttribute('aria-label', 'Emoji option');
    btn.style.width = cellSize + 'px';
    btn.style.height = cellSize + 'px';
    btn.style.fontSize = fontSize + 'px';
    btn.textContent = grid[i];
    if (disabled) btn.style.pointerEvents = 'none';
    btn.addEventListener('click', () => {
      if (hasTapped) return;
      hasTapped = true;
      btn.classList.add('tapped');
      // Disable all buttons
      const btns = emojiGrid.querySelectorAll('.emoji-btn');
      btns.forEach(b => { b.style.pointerEvents = 'none'; });
      socket.emit('tv_speed_tap_tap', { emoji: grid[i] });
    });
    emojiGrid.appendChild(btn);
  }
}

// ── Shuffle animation grid ──────────────────────────────────────────────────
let shuffleTimers = [];

function clearShuffleTimers() {
  shuffleTimers.forEach(t => clearTimeout(t));
  shuffleTimers = [];
}

function drawGridWithShuffle(grid, gridSize) {
  clearShuffleTimers();
  if (!grid) return;

  let cols;
  if (gridSize <= 4) cols = 2;
  else if (gridSize <= 6) cols = 3;
  else if (gridSize <= 9) cols = 3;
  else cols = 4;

  const areaW = gridArea.clientWidth || window.innerWidth;
  const gap = 10;
  const maxCellW = Math.floor((areaW - 32 - gap * (cols + 1)) / cols);
  const cellSize = Math.max(64, Math.min(100, maxCellW));
  const fontSize = Math.floor(cellSize * 0.5);

  emojiGrid.style.gridTemplateColumns = 'repeat(' + cols + ', ' + cellSize + 'px)';
  emojiGrid.innerHTML = '';

  // All available emojis for shuffling display
  const allEmojis = grid.slice();
  const btns = [];

  for (let i = 0; i < grid.length; i++) {
    const btn = document.createElement('button');
    btn.className = 'emoji-btn disabled shuffle-in';
    btn.style.width = cellSize + 'px';
    btn.style.height = cellSize + 'px';
    btn.style.fontSize = fontSize + 'px';
    btn.style.pointerEvents = 'none';
    btn.style.animationDelay = (i * 80) + 'ms';
    // Start with a random emoji
    btn.textContent = allEmojis[Math.floor(Math.random() * allEmojis.length)];
    btn.addEventListener('click', function() {
      if (hasTapped) return;
      hasTapped = true;
      btn.classList.add('tapped');
      var all = emojiGrid.querySelectorAll('.emoji-btn');
      all.forEach(function(b) { b.style.pointerEvents = 'none'; });
      socket.emit('tv_speed_tap_tap', { emoji: grid[i] });
    });
    emojiGrid.appendChild(btn);
    btns.push(btn);
  }

  // Emoji cycling during buildup (2 shuffles, slower)
  var shuffleCount = 2;
  for (var s = 0; s < shuffleCount; s++) {
    (function(step) {
      var t = setTimeout(function() {
        btns.forEach(function(b) {
          b.textContent = allEmojis[Math.floor(Math.random() * allEmojis.length)];
          b.classList.add('shuffle-swap');
          setTimeout(function() { b.classList.remove('shuffle-swap'); }, 250);
        });
        sfx.gridShuffle();
      }, 400 + step * 500);
      shuffleTimers.push(t);
    })(s);
  }

  // Final settle: show real emojis
  var settleT = setTimeout(function() {
    btns.forEach(function(b, i) {
      b.textContent = grid[i];
      b.classList.remove('shuffle-in');
      b.classList.add('shuffle-settle');
    });
  }, 400 + shuffleCount * 500);
  shuffleTimers.push(settleT);
}

// ── Screen switch ─────────────────────────────────────────────────────────────
function showScreen(name) {
  [joinScreen, waitingScreen, playingScreen, gameoverScreen].forEach(s => s.classList.remove('active'));
  ({ join: joinScreen, waiting: waitingScreen, playing: playingScreen, gameover: gameoverScreen })[name]?.classList.add('active');
}

// ── Dev auto-join ─────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  const devname = params.get('devname');
  if (devname && nameInput) {
    nameInput.value = devname;
    setTimeout(() => joinBtn?.click(), 500);
  }
});
