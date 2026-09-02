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


let myColor = _autoJoinHandoff ? _autoJoinHandoff.color : null;
let mySeat = (_autoJoinHandoff ? (['tv-host','p1','p2','p3','p4','p5','p6','p7','p8'].indexOf(_autoJoinHandoff.color) > 0 ? ['tv-host','p1','p2','p3','p4','p5','p6','p7','p8'].indexOf(_autoJoinHandoff.color) - 1 : -1) : -1);
let myName = _autoJoinHandoff ? _autoJoinHandoff.name : '';
let gameState = null;
let answeredCurrentQuestion = false;

const TV_COLORS = ['tv-host', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'];
function seatForColor(color) {
  if (color === 'tv-host') return -1;
  const idx = TV_COLORS.indexOf(color);
  return idx > 0 ? idx - 1 : -1;
}

// ── DOM refs ──────────────────────────────────────────────────────────────────
const joinScreen      = document.getElementById('joinScreen');
const waitingScreen   = document.getElementById('waitingScreen');
const playingScreen   = document.getElementById('playingScreen');
const gameoverScreen  = document.getElementById('gameoverScreen');
const reconnectOverlay = document.getElementById('reconnectOverlay');

const nameInput   = document.getElementById('nameInput');
const joinBtn     = document.getElementById('joinBtn');
const joinError   = document.getElementById('joinError');
const waitingName = document.getElementById('waitingName');

const roundInfo    = document.getElementById('roundInfo');
const gameHint     = document.getElementById('gameHint');
const studyMsg     = document.getElementById('studyMsg');
const recallSection = document.getElementById('recallSection');
const scoreDisplay = document.getElementById('scoreDisplay');
const faceImgBig   = document.getElementById('faceImgBig');
const optionsGrid  = document.getElementById('optionsGrid');

const gameoverEmoji    = document.getElementById('gameoverEmoji');
const gameoverTitle    = document.getElementById('gameoverTitle');
const gameoverScore    = document.getElementById('gameoverScore');
const gameoverPersonal = document.getElementById('gameoverPersonal');
const gameoverMsg      = document.getElementById('gameoverMsg');

// ── Socket ────────────────────────────────────────────────────────────────────
const socket = io({ reconnectionAttempts: Infinity, reconnectionDelay: 1000, transports: ['websocket', 'polling'] });

// ── Autojoin: jump straight to waiting screen ──────────────────────────────
if (_autoJoinHandoff) {
  if (typeof waitingName !== 'undefined' && waitingName) waitingName.textContent = `You joined as ${myName}`;
  showScreen('waiting');
}

socket.on('connect', () => {
  reconnectOverlay.classList.remove('show');
  if (myName && roomId) socket.emit('join_game', { roomId, playerName: myName, gameType: 'tv-face-memory', reconnect: true });
});
socket.on('disconnect', () => reconnectOverlay.classList.add('show'));
socket.on('connect_error', () => reconnectOverlay.classList.add('show'));

// ── Join ──────────────────────────────────────────────────────────────────────
joinBtn.addEventListener('click', doJoin);
nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') doJoin(); });

function doJoin() {
  const name = nameInput.value.trim();
  if (!name) { joinError.textContent = 'Please enter your name.'; return; }
  if (!roomId) { joinError.textContent = 'No room ID. Please scan the QR code.'; return; }
  myName = name;
  joinError.textContent = '';
  joinBtn.disabled = true;
  socket.emit('join_game', { roomId, playerName: name, gameType: 'tv-face-memory' });
}

socket.on('joined', ({ color }) => {
  myColor = color;
  mySeat = seatForColor(color);
  if (color === 'spectator' || color === 'tv-host') {
    joinError.textContent = 'Game is full. You joined as a spectator.';
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
  if (state.gameType !== 'tv-face-memory') return;
  gameState = state;
  answeredCurrentQuestion = false;
  sfx.gameStart();
  showScreen('playing');
  renderPlaying(state);
});

socket.on('game_state', (state) => {
  if (state.gameType !== 'tv-face-memory') return;
  // Reset answered flag when question changes
  if (gameState && state.questionIndex !== gameState.questionIndex) {
    answeredCurrentQuestion = false;
    _lastAnsweredBtn = null;
    gameHint.style.color = '';
  }
  gameState = state;
  if (!playingScreen.classList.contains('active')) showScreen('playing');
  renderPlaying(state);
});

socket.on('round_over', ({ currentRound, totalRounds, players }) => {
  answeredCurrentQuestion = false;
  sfx.roundOver();
  const myData = players ? players.find(p => p.name === myName) : null;
  const pts = myData ? myData.score : 0;
  gameHint.textContent = `Round ${currentRound + 1}/${totalRounds} done! You have ${pts} pts`;
  studyMsg.style.display = 'flex';
  recallSection.style.display = 'none';
});

socket.on('game_over', ({ winner, players, reason }) => {
  const didWin = winner === myName;
  const myData = players ? players.find(p => p.name === myName) : null;
  const myScore = myData ? myData.score : (gameState && mySeat >= 0 ? (gameState.sessionScores[mySeat] || 0) : 0);
  gameoverEmoji.textContent = didWin ? '🏆' : '🧠';
  gameoverTitle.textContent = didWin ? 'You Win!' : 'Game Over!';
  if (gameoverScore) gameoverScore.textContent = myScore + ' pts';
  gameoverPersonal.textContent = didWin ? '🎉 You remembered the most!' : `${winner || 'Someone'} had better memory!`;
  gameoverMsg.textContent = reason || '';
  didWin ? sfx.victory() : sfx.roundOver();
  showScreen('gameover');
});

socket.on('play_again', () => {
  gameState = null;
  showScreen('waiting');
});

socket.on('error', ({ message }) => { joinError.textContent = message; joinBtn.disabled = false; });

// ── Render ────────────────────────────────────────────────────────────────────
function renderPlaying(state) {
  const { phase, currentRound, totalRounds, difficulty, currentQuestion, questionIndex, totalQuestions } = state;
  roundInfo.textContent = `${difficulty.toUpperCase()} · Round ${currentRound + 1} of ${totalRounds}`;

  if (phase === 'study') {
    gameHint.textContent = 'Watch the TV screen!';
    studyMsg.style.display = 'flex';
    recallSection.style.display = 'none';
  } else if (phase === 'recall') {
    studyMsg.style.display = 'none';
    recallSection.style.display = 'flex';

    const myCorrect = mySeat >= 0 ? (state.correctAnswers[mySeat] || 0) : 0;
    scoreDisplay.textContent = `✓ ${myCorrect} correct`;

    if (!currentQuestion) {
      gameHint.textContent = 'Round ending...';
      return;
    }

    gameHint.textContent = answeredCurrentQuestion
      ? 'Waiting for next question...'
      : `Question ${questionIndex + 1} of ${totalQuestions}`;

    faceImgBig.src = currentQuestion.face.img;

    // Rebuild options only if changed (avoid flicker)
    const existingOptions = optionsGrid.querySelectorAll('.option-btn');
    const optionNames = currentQuestion.options;
    const needsRebuild = existingOptions.length !== optionNames.length ||
      [...existingOptions].some((btn, i) => btn.dataset.name !== optionNames[i]);

    if (needsRebuild) {
      optionsGrid.innerHTML = '';
      optionNames.forEach(name => {
        const btn = document.createElement('button');
        btn.className = 'option-btn';
        btn.dataset.name = name;
        btn.textContent = name;
        btn.addEventListener('click', () => onOptionTap(name, btn));
        optionsGrid.appendChild(btn);
      });
    }

    // Disable buttons if already answered
    optionsGrid.querySelectorAll('.option-btn').forEach(btn => {
      btn.disabled = answeredCurrentQuestion;
    });
  }
}

let _lastAnsweredBtn = null;

function onOptionTap(name, btn) {
  if (answeredCurrentQuestion) return;
  answeredCurrentQuestion = true;
  sfx.tap();

  // Disable all buttons immediately (optimistic)
  optionsGrid.querySelectorAll('.option-btn').forEach(b => { b.disabled = true; });
  btn.classList.add('selected');
  _lastAnsweredBtn = btn;

  socket.emit('tv_face_memory_answer', { name });
}

socket.on('face_memory_result', ({ correct, correctName }) => {
  if (correct) {
    sfx.correct();
    gameHint.textContent = '✓ Correct!';
    gameHint.style.color = '#4ade80';
    if (_lastAnsweredBtn) _lastAnsweredBtn.classList.add('correct');
  } else {
    sfx.wrong();
    gameHint.textContent = `✗ Wrong! It was ${correctName}`;
    gameHint.style.color = '#f87171';
    if (_lastAnsweredBtn) _lastAnsweredBtn.classList.add('wrong');
    // Highlight correct answer
    optionsGrid.querySelectorAll('.option-btn').forEach(b => {
      if (b.dataset.name === correctName) b.classList.add('correct');
    });
  }
  setTimeout(() => {
    gameHint.style.color = '';
  }, 1500);
});

// ── Screen switching ──────────────────────────────────────────────────────────
function showScreen(name) {
  [joinScreen, waitingScreen, playingScreen, gameoverScreen].forEach(s => s && s.classList.remove('active'));
  if (name === 'join')     joinScreen.classList.add('active');
  if (name === 'waiting')  waitingScreen.classList.add('active');
  if (name === 'playing')  playingScreen.classList.add('active');
  if (name === 'gameover') gameoverScreen.classList.add('active');
}

// ── Dev tool auto-join ────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  const devname = params.get('devname');
  if (devname && nameInput) {
    nameInput.value = devname;
    setTimeout(() => joinBtn && joinBtn.click(), 500);
  }
});
