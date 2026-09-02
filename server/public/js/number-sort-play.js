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

const questionInfo   = document.getElementById('questionInfo');
const sortHint       = document.getElementById('sortHint');
const watchTvMsg     = document.getElementById('watchTvMsg');
const sortSection    = document.getElementById('sortSection');
const numberGrid     = document.getElementById('numberGrid');
const finishedMsg    = document.getElementById('finishedMsg');

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
  if (myName && roomId) socket.emit('join_game', { roomId, playerName: myName, gameType: 'tv-number-sort', reconnect: true });
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
  socket.emit('join_game', { roomId, playerName: name, gameType: 'tv-number-sort' });
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
  if (state.gameType !== 'tv-number-sort') return;
  gameState = state;
  sfx.gameStart();
  showScreen('playing');
  renderPlaying(state);
});

socket.on('game_state', (state) => {
  if (state.gameType !== 'tv-number-sort') return;
  gameState = state;
  if (!playingScreen.classList.contains('active')) showScreen('playing');
  renderPlaying(state);
});

socket.on('round_over', ({ questionNumber, totalQuestions, sessionScores }) => {
  sfx.roundOver();
  watchTvMsg.classList.remove('hidden');
  sortSection.classList.add('hidden');
  finishedMsg.classList.add('hidden');
  const myScore = (sessionScores && mySeat >= 0) ? (sessionScores[mySeat] || 0) : 0;
  sortHint.textContent = `Round done! You have ${myScore} pts`;
});

socket.on('game_over', ({ winner, players, reason }) => {
  const didWin = winner === myName;
  const myData = players ? players.find(p => p.name === myName) : null;
  const myScore = myData ? myData.score : (gameState && mySeat >= 0 ? (gameState.sessionScores[mySeat] || 0) : 0);
  gameoverEmoji.textContent = didWin ? '🏆' : '🔢';
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
  questionInfo.textContent = `Round ${qNum} of ${qTotal}`;

  if ((phase === 'sorting' || phase === 'question') && state.numbers && state.numbers.length) {
    watchTvMsg.classList.add('hidden');
    sortSection.classList.remove('hidden');

    const myTaps = (mySeat >= 0 && state.taps && state.taps[mySeat]) ? state.taps[mySeat] : [];
    const isFinished = (mySeat >= 0 && state.finished) ? (state.finished[mySeat] || false) : false;

    const wasFinished = gameState && mySeat >= 0 && gameState.finished && gameState.finished[mySeat];
    if (isFinished) {
      if (!wasFinished) sfx.sequenceDone();
      finishedMsg.classList.remove('hidden');
      sortHint.textContent = 'Done! ✓';
      renderNumberButtons(state.numbers, myTaps, true);
    } else {
      finishedMsg.classList.add('hidden');
      sortHint.textContent = `Tap numbers in order: smallest first`;
      renderNumberButtons(state.numbers, myTaps, false);
    }
  } else {
    watchTvMsg.classList.remove('hidden');
    sortSection.classList.add('hidden');
    finishedMsg.classList.add('hidden');
  }
}

function renderNumberButtons(numbers, taps, allDone) {
  numberGrid.innerHTML = '';
  // Sorted list known so far; next expected = sorted asc, position = taps.length
  const sortedTaps = taps.slice().sort((a, b) => a - b);
  numbers.forEach(num => {
    const tapIndex = taps.indexOf(num);
    const isTapped = tapIndex !== -1;
    const btn = document.createElement('button');
    btn.className = 'number-btn' + (isTapped ? ' tapped' : '');
    btn.disabled = isTapped || allDone;
    btn.dataset.value = num;
    if (isTapped) {
      const order = sortedTaps.indexOf(num) + 1;
      btn.innerHTML = `<span class="tap-order">${order}</span>${num}<span class="check-mark">✓</span>`;
    } else {
      btn.textContent = num;
    }
    btn.addEventListener('click', () => {
      if (isTapped || allDone) return;
      // Determine if this tap is correct: smallest among untapped numbers
      const untapped = numbers.filter(n => taps.indexOf(n) === -1).sort((a, b) => a - b);
      const isCorrect = untapped[0] === num;
      if (isCorrect) {
        sfx.numberTap(taps.length);
      } else {
        sfx.wrong && sfx.wrong();
        btn.classList.add('wrong-flash');
        setTimeout(() => btn.classList.remove('wrong-flash'), 420);
      }
      socket.emit('tv_number_sort_tap', { value: num });
    });
    numberGrid.appendChild(btn);
  });
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
