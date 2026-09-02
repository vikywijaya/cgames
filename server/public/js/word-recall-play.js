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
let allRecalled = false;

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

const myScoreEl     = document.getElementById('myScore');
const myRecalledEl  = document.getElementById('myRecalled');
const roundInfoEl   = document.getElementById('roundInfo');
const watchTv       = document.getElementById('watchTv');
const watchTvText   = document.getElementById('watchTvText');
const watchTvSub    = document.getElementById('watchTvSub');
const recallArea    = document.getElementById('recallArea');
const wordInput     = document.getElementById('wordInput');
const submitBtn     = document.getElementById('submitBtn');
const feedbackEl    = document.getElementById('feedback');
const recalledTitle = document.getElementById('recalledTitle');
const recalledList  = document.getElementById('recalledList');
const allDoneOverlay = document.getElementById('allDoneOverlay');

const goTrophy   = document.getElementById('goTrophy');
const goTitle    = document.getElementById('goTitle');
const goScore    = document.getElementById('goScore');
const goPersonal = document.getElementById('goPersonal');

let feedbackTimeout = null;

// ── Socket ────────────────────────────────────────────────────────────────────
const socket = io({ reconnectionAttempts: Infinity, reconnectionDelay: 1000, transports: ['websocket', 'polling'] });

// ── Autojoin: jump straight to waiting screen ──────────────────────────────
if (_autoJoinHandoff) {
  if (typeof waitingName !== 'undefined' && waitingName) waitingName.textContent = `You joined as ${myName}`;
  showScreen('waiting');
}

socket.on('connect', () => {
  reconnectOverlay.classList.remove('show');
  if (myName && roomId) socket.emit('join_game', { roomId, playerName: myName, gameType: 'tv-word-recall', reconnect: true });
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
  socket.emit('join_game', { roomId, playerName: name, gameType: 'tv-word-recall' });
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
  if (state.gameType !== 'tv-word-recall') return;
  sfx.gameStart();
  syncState(state);
  showScreen('playing');
  renderPlaying(state);
});

socket.on('game_state', (state) => {
  if (state.gameType !== 'tv-word-recall') return;
  syncState(state);
  if (!playingScreen.classList.contains('active')) showScreen('playing');
  renderPlaying(state);
});

socket.on('round_over', ({ currentRound, totalRounds, players }) => {
  allRecalled = false;
  sfx.roundOver();
  if (allDoneOverlay) allDoneOverlay.classList.remove('show');
  wordInput.disabled = true;
  submitBtn.disabled = true;
  const myData = players ? players.find(p => p.name === myName) : null;
  const pts = myData ? myData.score : 0;
  watchTvText.textContent = `Round ${currentRound + 1}/${totalRounds} done!`;
  watchTvSub.textContent = `You have ${pts} pts`;
  watchTv.classList.remove('hidden');
  recallArea.style.display = 'none';
});

socket.on('game_over', ({ winner, players, reason }) => {
  if (allDoneOverlay) allDoneOverlay.classList.remove('show');
  winner === myName ? sfx.victory() : sfx.roundOver();
  const didWin = winner === myName;
  const myData = players ? players.find(p => p.name === myName) : null;
  const myScore = myData ? myData.score : (gameState && mySeat >= 0 ? (gameState.sessionScores[mySeat] || 0) : 0);
  goTrophy.textContent = didWin ? '🏆' : '🧠';
  goTitle.textContent = didWin ? 'You Win!' : 'Game Over!';
  goScore.textContent = `${myScore} pts`;
  goPersonal.textContent = didWin ? '🎉 Congratulations!' : `${winner || 'Someone'} wins! ${reason || ''}`;
  showScreen('gameover');
});

socket.on('word_recall_result', ({ result, recalledCount, wordCount }) => {
  showFeedback(result, recalledCount, wordCount);
});

socket.on('play_again', () => {
  gameState = null;
  showScreen('waiting');
});

socket.on('error', ({ message }) => { joinError.textContent = message; joinBtn.disabled = false; });

// ── Sync + Render ─────────────────────────────────────────────────────────────
function syncState(state) {
  gameState = state;
  if (mySeat >= 0) {
    allRecalled = state.solvedOrder && state.solvedOrder.includes(mySeat);
  }
}

function renderPlaying(state) {
  const { phase, currentRound, totalRounds, wordCount, sessionScores, recalledCounts, recalledWords } = state;
  roundInfoEl.textContent = `${currentRound + 1}/${totalRounds}`;
  const myPts = mySeat >= 0 ? (sessionScores[mySeat] || 0) : 0;
  myScoreEl.textContent = `${myPts} pts`;
  const myCount = mySeat >= 0 ? (recalledCounts[mySeat] || 0) : 0;
  myRecalledEl.textContent = `${myCount}/${wordCount}`;

  if (phase === 'study') {
    watchTvText.textContent = 'Watch the TV screen!';
    watchTvSub.textContent = 'Study the words carefully';
    watchTv.classList.remove('hidden');
    recallArea.style.display = 'none';
    wordInput.disabled = true;
    submitBtn.disabled = true;
    if (allDoneOverlay) allDoneOverlay.classList.remove('show');
    allRecalled = false;
  } else if (phase === 'recall') {
    watchTv.classList.add('hidden');
    recallArea.style.display = 'flex';

    if (allRecalled) {
      wordInput.disabled = true;
      submitBtn.disabled = true;
      if (allDoneOverlay) allDoneOverlay.classList.add('show');
    } else {
      wordInput.disabled = false;
      submitBtn.disabled = false;
      if (allDoneOverlay) allDoneOverlay.classList.remove('show');
      // Focus input on recall start
      setTimeout(() => wordInput.focus(), 100);
    }

    // Render recalled words
    const myWords = mySeat >= 0 ? (recalledWords[mySeat] || []) : [];
    recalledTitle.textContent = `Words recalled (${myWords.length}/${wordCount})`;
    recalledList.innerHTML = myWords.map(w =>
      `<div class="recalled-chip">${escHtml(w)}</div>`
    ).join('');
  }
}

// ── Word submission ───────────────────────────────────────────────────────────
submitBtn.addEventListener('click', doSubmit);
wordInput.addEventListener('keydown', e => { if (e.key === 'Enter') doSubmit(); });

function doSubmit() {
  const word = wordInput.value.trim();
  if (!word) return;
  if (allRecalled) return;
  sfx.tap();
  socket.emit('tv_word_recall_submit', { word });
  wordInput.value = '';
  wordInput.focus();
}

function showFeedback(result, count, total) {
  if (feedbackTimeout) clearTimeout(feedbackTimeout);
  feedbackEl.className = 'feedback';
  if (result === 'found') {
    feedbackEl.textContent = `Correct! (${count}/${total})`;
    feedbackEl.classList.add('success');
    sfx.correct();
  } else if (result === 'already') {
    feedbackEl.textContent = 'Already recalled!';
    feedbackEl.classList.add('already');
  } else if (result === 'notFound') {
    feedbackEl.textContent = 'Not on the list!';
    feedbackEl.classList.add('wrong');
    sfx.wrong();
  }
  feedbackTimeout = setTimeout(() => { feedbackEl.textContent = ''; }, 2500);
}

// ── Screen switching ──────────────────────────────────────────────────────────
function showScreen(name) {
  [joinScreen, waitingScreen, playingScreen, gameoverScreen].forEach(s => s && s.classList.remove('active'));
  if (name === 'join')     joinScreen.classList.add('active');
  if (name === 'waiting')  waitingScreen.classList.add('active');
  if (name === 'playing')  playingScreen.classList.add('active');
  if (name === 'gameover') gameoverScreen.classList.add('active');
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── Dev tool auto-join ────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  const devname = params.get('devname');
  if (devname && nameInput) {
    nameInput.value = devname;
    setTimeout(() => joinBtn && joinBtn.click(), 500);
  }
});
