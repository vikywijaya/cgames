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
function seatForColor(color) {
  if (color === 'tv-host') return -1;
  const idx = TV_COLOURS.indexOf(color);
  return idx > 0 ? idx - 1 : -1;
}

let myColor = _autoJoinHandoff ? _autoJoinHandoff.color : null;
let mySeat = (_autoJoinHandoff ? (['tv-host','p1','p2','p3','p4','p5','p6','p7','p8'].indexOf(_autoJoinHandoff.color) > 0 ? ['tv-host','p1','p2','p3','p4','p5','p6','p7','p8'].indexOf(_autoJoinHandoff.color) - 1 : -1) : -1);
let myName = _autoJoinHandoff ? _autoJoinHandoff.name : '';
let gameState = null;
let hasAnswered = false;

// ── DOM refs ──────────────────────────────────────────────────────────────────
const joinScreen       = document.getElementById('joinScreen');
const waitingScreen    = document.getElementById('waitingScreen');
const playingScreen    = document.getElementById('playingScreen');
const gameoverScreen   = document.getElementById('gameoverScreen');
const reconnectOverlay = document.getElementById('reconnectOverlay');

const nameInput   = document.getElementById('nameInput');
const joinBtn     = document.getElementById('joinBtn');
const joinError   = document.getElementById('joinError');
const waitingName = document.getElementById('waitingName');

const questionInfo    = document.getElementById('questionInfo');
const questionDisplay = document.getElementById('questionDisplay');
const watchTvMsg      = document.getElementById('watchTvMsg');
const answerSection   = document.getElementById('answerSection');
const optionBtns      = document.querySelectorAll('.option-btn');
const answeredMsg     = document.getElementById('answeredMsg');

const gameoverEmoji    = document.getElementById('gameoverEmoji');
const gameoverTitle    = document.getElementById('gameoverTitle');
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
  if (myName && roomId) socket.emit('join_game', { roomId, playerName: myName, gameType: 'tv-daily-arithmetic', reconnect: true });
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
  socket.emit('join_game', { roomId, playerName: name, gameType: 'tv-daily-arithmetic' });
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
  if (state.gameType !== 'tv-daily-arithmetic') return;
  gameState = state;
  hasAnswered = false;
  sfx.gameStart();
  showScreen('playing');
  renderPlaying(state);
});

socket.on('game_state', (state) => {
  if (state.gameType !== 'tv-daily-arithmetic') return;
  gameState = state;
  if (!playingScreen.classList.contains('active')) showScreen('playing');
  renderPlaying(state);
});

socket.on('round_over', ({ questionNumber, totalQuestions, sessionScores }) => {
  hasAnswered = false;
  sfx.roundOver();
  setOptionBtnsDisabled(true);
  answeredMsg.textContent = '';
  watchTvMsg.classList.remove('hidden');
  answerSection.classList.add('hidden');
  const myScore = (sessionScores && mySeat >= 0) ? (sessionScores[mySeat] || 0) : 0;
  questionDisplay.textContent = `Question ${questionNumber} done! You have ${myScore} pts`;
});

socket.on('game_over', ({ winner, players, reason }) => {
  const didWin = winner === myName;
  const myData = players ? players.find(p => p.name === myName) : null;
  const myScore = myData ? myData.score : (gameState && mySeat >= 0 ? (gameState.sessionScores[mySeat] || 0) : 0);
  gameoverEmoji.textContent = didWin ? '🏆' : '🧮';
  gameoverTitle.textContent = didWin ? 'You Win!' : 'Game Over!';
  gameoverPersonal.textContent = didWin ? `🎉 You won with ${myScore} pts!` : `${winner || 'Someone'} wins!`;
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
  const { phase, questionNumber, totalQuestions } = state;
  const qNum = questionNumber || 0;
  const qTotal = totalQuestions || 0;
  questionInfo.textContent = `Question ${qNum} of ${qTotal}`;

  if (phase === 'question' && state.question) {
    const { a, op, b, options } = state.question;
    questionDisplay.textContent = `${a} ${op} ${b} = ?`;
    watchTvMsg.classList.add('hidden');
    answerSection.classList.remove('hidden');

    const myAnswer = (mySeat >= 0 && state.answers) ? state.answers[mySeat] : null;
    if (myAnswer !== null && myAnswer !== undefined) {
      const wasAnswered = hasAnswered;
      hasAnswered = true;
      setOptionBtnsDisabled(true);
      const correct = (mySeat >= 0 && state.correct) ? state.correct[mySeat] : null;
      if (correct === true) {
        if (!wasAnswered) sfx.correct();
        answeredMsg.textContent = 'Correct! ✓';
        answeredMsg.style.color = '#4ecca3';
      } else if (correct === false) {
        if (!wasAnswered) sfx.wrong();
        answeredMsg.textContent = 'Wrong ✗';
        answeredMsg.style.color = '#ef4444';
      } else {
        answeredMsg.textContent = 'Answered! ✓';
        answeredMsg.style.color = '#ffd700';
      }
    } else {
      hasAnswered = false;
      answeredMsg.textContent = '';
      setOptionBtnsDisabled(false);
      optionBtns.forEach(b => b.classList.remove('tapped', 'correct', 'wrong-flash'));
    }

    if (options && options.length) {
      optionBtns.forEach((btn, i) => {
        btn.textContent = options[i] !== undefined ? options[i] : '';
        btn.dataset.idx = i;
      });
    }
  } else {
    watchTvMsg.classList.remove('hidden');
    answerSection.classList.add('hidden');
  }
}

// ── Option button taps ────────────────────────────────────────────────────────
optionBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    if (hasAnswered) return;
    sfx.tap();
    const idx = parseInt(btn.dataset.idx, 10);
    hasAnswered = true;
    setOptionBtnsDisabled(true);
    optionBtns.forEach(b => b.classList.remove('tapped'));
    btn.classList.add('tapped');
    answeredMsg.textContent = 'Answered! ✓';
    answeredMsg.style.color = '#ffd700';
    socket.emit('tv_daily_arithmetic_answer', { answerIndex: idx });
  });
});

function setOptionBtnsDisabled(disabled) {
  optionBtns.forEach(b => { b.disabled = disabled; });
}

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
