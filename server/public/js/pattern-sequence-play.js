'use strict';

/**
 * Pattern Sequence mobile play page.
 * Server-authoritative — player taps pads, server validates.
 */

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
const seqInfoEl   = document.getElementById('seqInfo');
const roundInfoEl = document.getElementById('roundInfo');
const statusMsg   = document.getElementById('statusMsg');
const dotsRow     = document.getElementById('dotsRow');

const padBtns = [
  document.getElementById('padBtn0'),
  document.getElementById('padBtn1'),
  document.getElementById('padBtn2'),
  document.getElementById('padBtn3')
];

const goTrophy   = document.getElementById('goTrophy');
const goTitle    = document.getElementById('goTitle');
const goScore    = document.getElementById('goScore');
const goPersonal = document.getElementById('goPersonal');

// ── Socket ────────────────────────────────────────────────────────────────────
const socket = io({ reconnectionAttempts: Infinity, reconnectionDelay: 1000, transports: ['websocket', 'polling'] });

// ── Autojoin: jump straight to waiting screen ──────────────────────────────
if (_autoJoinHandoff) {
  if (typeof waitingName !== 'undefined' && waitingName) waitingName.textContent = `You joined as ${myName}`;
  showScreen('waiting');
}

socket.on('connect', () => {
  reconnectOverlay.classList.remove('show');
  if (myName && roomId) socket.emit('join_game', { roomId, playerName: myName, gameType: 'tv-pattern-sequence', reconnect: true });
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
  socket.emit('join_game', { roomId, playerName: name, gameType: 'tv-pattern-sequence' });
}

socket.on('joined', ({ color }) => {
  myColor = color;
  mySeat  = seatForColor(color);
  if (color === 'spectator' || color === 'tv-host') {
    joinError.textContent = 'Room is full — joined as spectator.';
    joinBtn.disabled = false;
    return;
  }
  try { sfx.join(); } catch (e) {}
  waitingName.textContent = myName;
  showScreen('waiting');
});

socket.on('room_update', () => {});

// ── Game events ───────────────────────────────────────────────────────────────
socket.on('game_started', (state) => {
  if (state.gameType !== 'tv-pattern-sequence') return;
  myCurrentScore = 0;
  showScreen('playing');
  applyState(state);
});

socket.on('game_state', (state) => {
  if (state.gameType !== 'tv-pattern-sequence') return;
  if (!playingScreen.classList.contains('active')) showScreen('playing');
  applyState(state);
});

let roundCountdownTimer = null;

socket.on('round_over', ({ currentRound, totalRounds, players, sessionScores, nextRoundIn }) => {
  try { sfx.roundOver(); } catch (e) {}

  if (players && mySeat >= 0 && players[mySeat]) myCurrentScore = players[mySeat].score || 0;
  else if (sessionScores && mySeat >= 0) myCurrentScore = sessionScores[mySeat] || 0;

  const rn = (currentRound !== undefined ? currentRound : 0) + 1;
  const rt = totalRounds || 3;
  const isLastRound = rn >= rt;

  myScoreEl.textContent = myCurrentScore + ' pts';
  setPads(false);

  if (!isLastRound) {
    let countdown = nextRoundIn || 5;
    statusMsg.textContent = `Round done! Next in ${countdown}s`;
    statusMsg.className = 'status-msg watch';
    if (roundCountdownTimer) clearInterval(roundCountdownTimer);
    roundCountdownTimer = setInterval(() => {
      countdown--;
      if (countdown <= 0) {
        clearInterval(roundCountdownTimer);
        statusMsg.textContent = 'Get ready!';
      } else {
        statusMsg.textContent = `Round done! Next in ${countdown}s`;
      }
    }, 1000);
  } else {
    statusMsg.textContent = 'Final round done!';
    statusMsg.className = 'status-msg finished';
  }
});

socket.on('game_over', ({ winner, players }) => {
  const didWin = winner === myName;
  const myData = players ? players.find(p => p.name === myName) : null;
  const finalScore = myData ? myData.score : myCurrentScore;

  goTrophy.textContent   = didWin ? '🏆' : '🎵';
  goTitle.textContent    = didWin ? 'You Win!' : 'Game Over!';
  goScore.textContent    = finalScore + ' pts';
  goPersonal.textContent = didWin ? 'You had the best memory!' : `${winner || 'Someone'} was faster!`;

  try { didWin ? sfx.victory() : sfx.roundOver(); } catch (e) {}
  showScreen('gameover');
});

socket.on('play_again', () => {
  gameState = null;
  showScreen('waiting');
});

socket.on('error', ({ message }) => { joinError.textContent = message; joinBtn.disabled = false; });

// ── Ready countdown ──────────────────────────────────────────────────────────
const mobileReadyOverlay = document.getElementById('mobileReadyOverlay');
const mobileReadyNumber = document.getElementById('mobileReadyNumber');
let mobileCountdownTimer = null;

function startMobileCountdown() {
  stopMobileCountdown();
  if (mobileReadyOverlay) mobileReadyOverlay.classList.remove('hidden');
  let count = 3;
  if (mobileReadyNumber) mobileReadyNumber.textContent = count;
  try { sfx.tick(); } catch (e) {}
  mobileCountdownTimer = setInterval(() => {
    count--;
    if (count <= 0) {
      clearInterval(mobileCountdownTimer);
      mobileCountdownTimer = null;
      if (mobileReadyNumber) mobileReadyNumber.textContent = 'GO!';
      try { sfx.gameStart(); } catch (e) {}
      setTimeout(() => { if (mobileReadyOverlay) mobileReadyOverlay.classList.add('hidden'); }, 1500);
    } else {
      if (mobileReadyNumber) mobileReadyNumber.textContent = count;
      try { count <= 2 ? sfx.tickUrgent() : sfx.tick(); } catch (e) {}
    }
  }, 1000);
}

function stopMobileCountdown() {
  if (mobileCountdownTimer) { clearInterval(mobileCountdownTimer); mobileCountdownTimer = null; }
  if (mobileReadyOverlay) mobileReadyOverlay.classList.add('hidden');
}

// ── Apply server state ────────────────────────────────────────────────────────
function applyState(state) {
  const { currentRound, totalRounds, phase, sequenceLength, playerInputs, playerFinished, playerFailed, sessionScores } = state;

  roundInfoEl.textContent = `${(currentRound || 0) + 1}/${totalRounds || 3}`;

  if (sessionScores && mySeat >= 0) myCurrentScore = sessionScores[mySeat] || 0;
  myScoreEl.textContent = myCurrentScore + ' pts';

  const myInputs = (playerInputs && mySeat >= 0) ? (playerInputs[mySeat] || []) : [];
  const myFinished = playerFinished && mySeat >= 0 && playerFinished[mySeat];
  const myFailed = playerFailed && mySeat >= 0 && playerFailed[mySeat];

  seqInfoEl.textContent = `${myInputs.length}/${sequenceLength || 0}`;

  // Status message and pad state
  if (phase === 'countdown') {
    if (!mobileCountdownTimer) startMobileCountdown();
    statusMsg.textContent = '';
    statusMsg.className = 'status-msg';
    setPads(false);
    return;
  }
  stopMobileCountdown();

  if (phase === 'showing') {
    statusMsg.textContent = 'Watch the TV!';
    statusMsg.className = 'status-msg watch';
    setPads(false);
  } else if (phase === 'input') {
    if (myFailed) {
      statusMsg.textContent = 'Wrong! Wait for next round...';
      statusMsg.className = 'status-msg failed';
      setPads(false);
    } else if (myFinished) {
      statusMsg.textContent = 'Complete! Waiting for others...';
      statusMsg.className = 'status-msg finished';
      setPads(false);
    } else if (myInputs.length >= (sequenceLength || 0)) {
      statusMsg.textContent = 'Waiting for other players...';
      statusMsg.className = 'status-msg finished';
      setPads(false);
    } else {
      statusMsg.textContent = 'Your turn! Tap the sequence!';
      statusMsg.className = 'status-msg input';
      setPads(true);
    }
  } else {
    statusMsg.textContent = 'Get ready...';
    statusMsg.className = 'status-msg watch';
    setPads(false);
  }

  // Progress dots
  renderDots(myInputs, sequenceLength || 0, myFailed);
}

function renderDots(inputs, total, failed) {
  let html = '';
  for (let i = 0; i < total; i++) {
    if (i < inputs.length) {
      if (failed && i === inputs.length - 1) {
        html += '<div class="pdot wrong"></div>';
      } else {
        html += '<div class="pdot correct"></div>';
      }
    } else if (i === inputs.length && !failed) {
      html += '<div class="pdot current"></div>';
    } else {
      html += '<div class="pdot"></div>';
    }
  }
  dotsRow.innerHTML = html;
}

// ── Controls ──────────────────────────────────────────────────────────────────
padBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    if (btn.disabled) return;
    const padIndex = parseInt(btn.dataset.pad, 10);
    socket.emit('tv_pattern_sequence_press', { padIndex });
    btn.classList.add('flash');
    setTimeout(() => btn.classList.remove('flash'), 200);
    try { sfx.tap(); } catch (e) {}
  });
});

function setPads(enabled) {
  padBtns.forEach(b => b.disabled = !enabled);
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
