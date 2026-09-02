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


const COLOUR_NAMES = ['red', 'blue', 'green', 'yellow', 'purple', 'orange'];

let myColor = _autoJoinHandoff ? _autoJoinHandoff.color : null;
let mySeat = (_autoJoinHandoff ? (['tv-host','p1','p2','p3','p4','p5','p6','p7','p8'].indexOf(_autoJoinHandoff.color) > 0 ? ['tv-host','p1','p2','p3','p4','p5','p6','p7','p8'].indexOf(_autoJoinHandoff.color) - 1 : -1) : -1);
let myName = _autoJoinHandoff ? _autoJoinHandoff.name : '';
let gameState = null;
let isFinished = false;
let isFailed   = false;

const TV_COLOURS = ['tv-host', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'];
function seatForColor(color) {
  if (color === 'tv-host') return -1;
  const idx = TV_COLOURS.indexOf(color);
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

const roundInfo     = document.getElementById('roundInfo');
const gameHint      = document.getElementById('gameHint');
const watchTvMsg    = document.getElementById('watchTvMsg');
const recallSection = document.getElementById('recallSection');
const progressDots  = document.getElementById('progressDots');
const colourBtns    = document.querySelectorAll('.colour-btn');
const solvedOverlay = document.getElementById('solvedOverlay');

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
  if (myName && roomId) socket.emit('join_game', { roomId, playerName: myName, gameType: 'tv-colour-memory', reconnect: true });
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
  socket.emit('join_game', { roomId, playerName: name, gameType: 'tv-colour-memory' });
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
  if (state.gameType !== 'tv-colour-memory') return;
  sfx.gameStart();
  syncState(state);
  showScreen('playing');
  renderPlaying(state);
});

socket.on('game_state', (state) => {
  if (state.gameType !== 'tv-colour-memory') return;
  syncState(state);
  if (!playingScreen.classList.contains('active')) showScreen('playing');
  renderPlaying(state);
});

socket.on('round_over', ({ currentRound, totalRounds, players }) => {
  isFinished = false; isFailed = false;
  sfx.roundOver();
  if (solvedOverlay) solvedOverlay.classList.remove('show');
  setColourBtnsDisabled(true);
  const myData = players ? players.find(p => p.name === myName) : null;
  const pts = myData ? myData.score : 0;
  gameHint.textContent = `Round ${currentRound + 1}/${totalRounds} done! You have ${pts} pts`;
  watchTvMsg.classList.remove('hidden');
  recallSection.classList.add('hidden');
});

socket.on('game_over', ({ winner, players, reason }) => {
  if (solvedOverlay) solvedOverlay.classList.remove('show');
  winner === myName ? sfx.victory() : sfx.roundOver();
  const didWin = winner === myName;
  const myData = players ? players.find(p => p.name === myName) : null;
  const myScore = myData ? myData.score : (gameState && mySeat >= 0 ? (gameState.sessionScores[mySeat] || 0) : 0);
  gameoverEmoji.textContent = didWin ? '🏆' : '🎨';
  gameoverTitle.textContent = didWin ? 'You Win!' : 'Game Over!';
  gameoverPersonal.textContent = didWin ? `🎉 You won with ${myScore} pts!` : `${winner || 'Someone'} wins!`;
  gameoverMsg.textContent = reason || '';
  showScreen('gameover');
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
    isFinished = state.finished[mySeat] || false;
    isFailed   = state.failed[mySeat]   || false;
  }
}

function renderPlaying(state) {
  const { phase, currentRound, totalRounds, difficulty, sequenceLength } = state;
  const seqLen = sequenceLength || (state.sequence ? state.sequence.length : 0);
  roundInfo.textContent = `${difficulty.toUpperCase()} · Round ${currentRound + 1} of ${totalRounds}`;

  if (phase === 'showing') {
    gameHint.textContent = 'Watch the TV screen!';
    watchTvMsg.classList.remove('hidden');
    recallSection.classList.add('hidden');
    setColourBtnsDisabled(true);
    if (solvedOverlay) solvedOverlay.classList.remove('show');
  } else if (phase === 'recall') {
    watchTvMsg.classList.add('hidden');
    recallSection.classList.remove('hidden');
    recallSection.style.display = 'flex';

    if (isFinished) {
      if (!gameState || !gameState.finished || !gameState.finished[mySeat]) sfx.sequenceDone();
      gameHint.textContent = '✅ Sequence complete!';
      setColourBtnsDisabled(true);
      if (solvedOverlay) solvedOverlay.classList.add('show');
    } else if (isFailed) {
      gameHint.textContent = '❌ Wrong — better luck next round!';
      setColourBtnsDisabled(true);
    } else {
      const myTaps = mySeat >= 0 ? (state.taps[mySeat] || []) : [];
      gameHint.textContent = `Tap colour ${myTaps.length + 1} of ${seqLen}`;
      setColourBtnsDisabled(false);
    }

    // Progress dots
    const myTaps = mySeat >= 0 ? (state.taps[mySeat] || []) : [];
    progressDots.innerHTML = Array.from({ length: seqLen }, (_, pos) => {
      if (pos < myTaps.length) return `<div class="pdot correct"></div>`;
      if (isFailed && pos === myTaps.length) return `<div class="pdot wrong"></div>`;
      return `<div class="pdot"></div>`;
    }).join('');
  }
}

// ── Colour button taps ────────────────────────────────────────────────────────
colourBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    if (isFinished || isFailed) return;
    sfx.tap();
    const idx = parseInt(btn.dataset.idx, 10);
    socket.emit('tv_colour_memory_tap', { colourIndex: idx });
  });
});

function setColourBtnsDisabled(disabled) {
  colourBtns.forEach(b => { b.disabled = disabled; });
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
