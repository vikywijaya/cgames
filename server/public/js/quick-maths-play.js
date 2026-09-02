'use strict';

const params = new URLSearchParams(location.search);
const roomId = params.get('room');
const isAutoJoin = params.get('autojoin') === '1';

// ── Autojoin handoff (from /tv-join) ────────────────────────────────────────
// If we arrived via the universal join page, read the pending-join record
// it left behind, restore identity, and let the existing reconnect flow on
// socket 'connect' do its thing.
let _autoJoinHandoff = null;
if (isAutoJoin && roomId) {
  try {
    const raw = sessionStorage.getItem(`caritahub_pending_join_${roomId}`);
    if (raw) {
      const data = JSON.parse(raw);
      if (data && data.name && data.color && Date.now() - (data.ts || 0) < 30 * 60 * 1000) {
        _autoJoinHandoff = data;
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
let mySeat  = _autoJoinHandoff ? seatForColor(_autoJoinHandoff.color) : -1;
let myName  = _autoJoinHandoff ? _autoJoinHandoff.name : '';
let gameState = null;
let hasAnswered = false;
let myCurrentScore = 0;

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
const progressBar     = document.getElementById('progressBar');
const myScoreDisplay  = document.getElementById('myScoreDisplay');
const feedbackMsg     = document.getElementById('feedbackMsg');
const watchTvMsg      = document.getElementById('watchTvMsg');
const watchTvText     = document.getElementById('watchTvText');
const watchTvScore    = document.getElementById('watchTvScore');
const optionBtns      = document.querySelectorAll('.option-btn');

const gameoverTrophy   = document.getElementById('gameoverTrophy');
const gameoverTitle    = document.getElementById('gameoverTitle');
const gameoverScore    = document.getElementById('gameoverScore');
const gameoverPersonal = document.getElementById('gameoverPersonal');
const gameoverMsg      = document.getElementById('gameoverMsg');

// ── Socket ────────────────────────────────────────────────────────────────────
const socket = io({ reconnectionAttempts: Infinity, reconnectionDelay: 1000, transports: ['websocket', 'polling'] });

socket.on('connect', () => {
  reconnectOverlay.classList.remove('show');
  if (myName && roomId) socket.emit('join_game', { roomId, playerName: myName, gameType: 'tv-quick-maths', reconnect: true });
});
socket.on('disconnect', () => reconnectOverlay.classList.add('show'));
socket.on('connect_error', () => reconnectOverlay.classList.add('show'));

// ── Autojoin: skip the join screen, show waiting until the server responds ──
if (_autoJoinHandoff) {
  waitingName.textContent = `You joined as ${myName}`;
  showScreen('waiting');
}

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
  socket.emit('join_game', { roomId, playerName: name, gameType: 'tv-quick-maths' });
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
  if (state.gameType !== 'tv-quick-maths') return;
  gameState = state;
  hasAnswered = false;
  myCurrentScore = 0;
  sfx.gameStart();
  showScreen('playing');
  renderPlaying(state);
});

socket.on('game_state', (state) => {
  if (state.gameType !== 'tv-quick-maths') return;
  gameState = state;
  if (!playingScreen.classList.contains('active')) showScreen('playing');
  renderPlaying(state);
});

socket.on('round_over', ({ currentRound, totalRounds, players, sessionScores }) => {
  hasAnswered = false;
  sfx.roundOver();

  // Resolve my score from whichever field is present
  if (players && mySeat >= 0 && players[mySeat]) {
    myCurrentScore = players[mySeat].score || 0;
  } else if (sessionScores && mySeat >= 0) {
    myCurrentScore = sessionScores[mySeat] || 0;
  }

  const roundNum = (currentRound !== undefined ? currentRound : 0) + 1;
  const total = totalRounds || (gameState && gameState.totalQuestions) || '?';

  setOptionBtnsState('neutral');
  feedbackMsg.textContent = '';
  myScoreDisplay.textContent = `${myCurrentScore} pts`;

  watchTvText.textContent = `Round ${roundNum} of ${total} done!`;
  watchTvScore.textContent = `Your score: ${myCurrentScore} pts — next round starting soon…`;
  watchTvMsg.classList.remove('hidden');
});

socket.on('game_over', ({ winner, players, reason }) => {
  const didWin = winner === myName;
  const myData = players ? players.find(p => p.name === myName) : null;
  const finalScore = myData ? myData.score : myCurrentScore;

  gameoverTrophy.textContent = didWin ? '🏆' : '⚡';
  gameoverTitle.textContent = didWin ? 'You Win!' : 'Game Over!';
  gameoverScore.textContent = `${finalScore} pts`;
  gameoverPersonal.textContent = didWin ? `🎉 Fastest mind in the room!` : `${winner || 'Someone'} was faster this time`;
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
  const { questionNumber, totalQuestions } = state;
  const qNum = questionNumber || 1;
  const qTotal = totalQuestions || '?';

  questionInfo.textContent = `${qNum} / ${qTotal}`;

  // Update progress bar
  if (totalQuestions) {
    progressBar.style.width = `${((qNum - 1) / totalQuestions) * 100}%`;
  }

  // Update score
  if (state.sessionScores && mySeat >= 0) {
    myCurrentScore = state.sessionScores[mySeat] || 0;
  }
  myScoreDisplay.textContent = `${myCurrentScore} pts`;

  if (state.question) {
    watchTvMsg.classList.add('hidden');

    const { a, op, b, options } = state.question;
    questionDisplay.textContent = `${a} ${op} ${b} = ?`;

    const myAnswer = (mySeat >= 0 && state.answers) ? state.answers[mySeat] : null;
    const myCorrect = (mySeat >= 0 && state.correct) ? state.correct[mySeat] : null;

    if (myAnswer !== null && myAnswer !== undefined) {
      const wasAnswered = hasAnswered;
      hasAnswered = true;
      if (myCorrect === true) {
        if (!wasAnswered) sfx.correct();
        feedbackMsg.textContent = '✓ Correct!';
        feedbackMsg.style.color = '#4ade80';
        setOptionBtnsState('answered-correct', myAnswer, options);
      } else if (myCorrect === false) {
        if (!wasAnswered) sfx.wrong();
        feedbackMsg.textContent = '✗ Wrong!';
        feedbackMsg.style.color = '#f87171';
        setOptionBtnsState('answered-wrong', myAnswer, options);
      } else {
        feedbackMsg.textContent = '✓ Answered!';
        feedbackMsg.style.color = '#fbbf24';
        setOptionBtnsState('neutral');
      }
    } else {
      hasAnswered = false;
      feedbackMsg.textContent = '';
      setOptionBtnsState('active');
    }

    if (options && options.length) {
      optionBtns.forEach((btn, i) => {
        btn.textContent = options[i] !== undefined ? options[i] : '';
        btn.dataset.idx = i;
        btn.dataset.val = options[i];
      });
    }
  } else {
    watchTvMsg.classList.remove('hidden');
    watchTvText.textContent = 'Watch the TV screen!';
    watchTvScore.textContent = '';
  }
}

function setOptionBtnsState(mode, myAnswer, options) {
  optionBtns.forEach((btn, i) => {
    btn.classList.remove('opt-correct', 'opt-wrong', 'opt-reveal-correct');
    btn.disabled = false;
    if (mode === 'active') {
      btn.disabled = false;
    } else if (mode === 'neutral') {
      btn.disabled = true;
    } else if (mode === 'answered-correct') {
      btn.disabled = true;
      const val = options && options[i] !== undefined ? options[i] : null;
      if (val === myAnswer) btn.classList.add('opt-correct');
    } else if (mode === 'answered-wrong') {
      btn.disabled = true;
      const val = options && options[i] !== undefined ? options[i] : null;
      if (val === myAnswer) btn.classList.add('opt-wrong');
    }
  });
}

// ── Option button taps ────────────────────────────────────────────────────────
optionBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    if (hasAnswered) return;
    sfx.tap();
    const idx = parseInt(btn.dataset.idx, 10);
    hasAnswered = true;
    btn.disabled = true;
    feedbackMsg.textContent = '✓ Answered!';
    feedbackMsg.style.color = '#fbbf24';
    socket.emit('tv_quick_maths_answer', { answerIndex: idx });
  });
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
