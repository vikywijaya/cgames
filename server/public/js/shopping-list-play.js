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
let hasSubmitted = false;

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

const roundInfo      = document.getElementById('roundInfo');
const gameHint       = document.getElementById('gameHint');
const watchTvMsg     = document.getElementById('watchTvMsg');
const recallSection  = document.getElementById('recallSection');
const choicesGrid    = document.getElementById('choicesGrid');
const submitWrap     = document.getElementById('submitWrap');
const submitBtn      = document.getElementById('submitBtn');
const resultsSection = document.getElementById('resultsSection');
const resultEmoji    = document.getElementById('resultEmoji');
const resultTitle    = document.getElementById('resultTitle');
const resultStats    = document.getElementById('resultStats');
const resultSub      = document.getElementById('resultSub');
const myScoreEl      = document.getElementById('myScore');

// ── Socket ────────────────────────────────────────────────────────────────────
const socket = io({ reconnectionAttempts: Infinity, reconnectionDelay: 1000, transports: ['websocket', 'polling'] });

// ── Autojoin: jump straight to waiting screen ──────────────────────────────
if (_autoJoinHandoff) {
  if (typeof waitingName !== 'undefined' && waitingName) waitingName.textContent = `You joined as ${myName}`;
  showScreen('waiting');
}

socket.on('connect', () => {
  reconnectOverlay.classList.remove('show');
  if (myName && roomId) socket.emit('join_game', { roomId, playerName: myName, gameType: 'tv-shopping-list', reconnect: true });
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
  socket.emit('join_game', { roomId, playerName: name, gameType: 'tv-shopping-list' });
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
  if (state.gameType !== 'tv-shopping-list') return;
  sfx.gameStart();
  hasSubmitted = false;
  syncState(state);
  showScreen('playing');
  renderPlaying(state);
});

socket.on('game_state', (state) => {
  if (state.gameType !== 'tv-shopping-list') return;
  syncState(state);
  if (!playingScreen.classList.contains('active')) showScreen('playing');
  renderPlaying(state);
});

socket.on('round_over', ({ currentRound, totalRounds, players }) => {
  hasSubmitted = false;
  sfx.roundOver();
  const myData = players ? players.find(p => p.name === myName) : null;
  const pts = myData ? myData.score : 0;
  gameHint.textContent = `Round ${currentRound + 1}/${totalRounds} done! You have ${pts} pts`;
  watchTvMsg.classList.remove('hidden');
  recallSection.classList.add('hidden');
  submitWrap.classList.add('hidden');
  resultsSection.classList.add('hidden');
});

socket.on('game_over', ({ winner, players, reason }) => {
  winner === myName ? sfx.victory() : sfx.roundOver();
  const didWin = winner === myName;
  const myData = players ? players.find(p => p.name === myName) : null;
  const myScore = myData ? myData.score : 0;
  document.getElementById('goTrophy').textContent = didWin ? '🏆' : '🛒';
  document.getElementById('goTitle').textContent = didWin ? 'You Win!' : 'Game Over!';
  document.getElementById('goScore').textContent = `${myScore} pts`;
  document.getElementById('goPersonal').textContent = didWin ? '🎉 Congratulations!' : `${winner || 'Someone'} wins! ${reason || ''}`;
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
    hasSubmitted = state.playerSubmitted[mySeat] || false;
  }
}

function renderPlaying(state) {
  const { phase, currentRound, totalRounds, difficulty, sessionScores } = state;
  roundInfo.textContent = `${currentRound + 1}/${totalRounds}`;
  if (mySeat >= 0) myScoreEl.textContent = `${sessionScores[mySeat] || 0} pts`;

  if (phase === 'study') {
    gameHint.textContent = 'Watch the TV screen!';
    watchTvMsg.classList.remove('hidden');
    recallSection.classList.add('hidden');
    submitWrap.classList.add('hidden');
    resultsSection.classList.add('hidden');
  } else if (phase === 'recall') {
    watchTvMsg.classList.add('hidden');

    if (hasSubmitted) {
      // Show results
      recallSection.classList.add('hidden');
      submitWrap.classList.add('hidden');
      resultsSection.classList.remove('hidden');

      const r = state.playerResults[mySeat];
      if (r) {
        const score = r.roundScore;
        resultEmoji.textContent = score > 0 ? '🎉' : '😅';
        resultTitle.textContent = score > 0 ? 'Nice job!' : 'Better luck next time!';
        resultStats.innerHTML = `
          <span class="result-correct">✅ ${r.correct} correct</span><br>
          <span class="result-wrong">❌ ${r.wrong} wrong</span><br>
          <span class="result-missed">⬜ ${r.missed} missed</span>
        `;
        resultSub.textContent = 'Waiting for other players...';
      }
      gameHint.textContent = 'Submitted!';
    } else {
      // Show choices
      recallSection.classList.remove('hidden');
      recallSection.style.display = 'flex';
      submitWrap.classList.remove('hidden');
      submitBtn.disabled = false;
      resultsSection.classList.add('hidden');
      gameHint.textContent = 'Tick the items from the shopping list!';

      renderChoices(state);
    }
  } else if (phase === 'results') {
    // round ending
    watchTvMsg.classList.add('hidden');
    recallSection.classList.add('hidden');
    submitWrap.classList.add('hidden');
    resultsSection.classList.remove('hidden');
  }
}

function renderChoices(state) {
  const { choices, playerTicks } = state;
  const myTicks = new Set(mySeat >= 0 ? (playerTicks[mySeat] || []) : []);

  choicesGrid.innerHTML = '';
  choices.forEach(item => {
    const btn = document.createElement('button');
    btn.className = 'choice-btn' + (myTicks.has(item.name) ? ' ticked' : '');
    btn.innerHTML = `<span class="choice-emoji">${item.emoji}</span>${escHtml(item.name)}<span class="tick-mark">✓</span>`;
    btn.addEventListener('click', () => {
      sfx.tap();
      socket.emit('tv_shopping_list_toggle', { itemName: item.name });
    });
    choicesGrid.appendChild(btn);
  });
}

// ── Submit ─────────────────────────────────────────────────────────────────────
submitBtn.addEventListener('click', () => {
  if (hasSubmitted) return;
  sfx.tap();
  submitBtn.disabled = true;
  socket.emit('tv_shopping_list_submit');
});

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
