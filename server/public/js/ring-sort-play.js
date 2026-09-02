'use strict';

/**
 * Ring Sort mobile play page.
 * Fully server-authoritative — all rod state comes from server.
 * Exact visual port of cgames RingSort.jsx.
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
let isSolved = false;

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

const myScoreDisplay = document.getElementById('myScoreDisplay');
const roundInfo      = document.getElementById('roundInfo');
const feedbackBar    = document.getElementById('feedbackBar');
const rodsRow        = document.getElementById('rodsRow');
const watchTv        = document.getElementById('watchTv');
const watchTvText    = document.getElementById('watchTvText');
const watchTvSub     = document.getElementById('watchTvSub');

const gameoverTrophy   = document.getElementById('gameoverTrophy');
const gameoverTitle    = document.getElementById('gameoverTitle');
const gameoverScore    = document.getElementById('gameoverScore');
const gameoverPersonal = document.getElementById('gameoverPersonal');

// ── Socket ────────────────────────────────────────────────────────────────────
const socket = io({ reconnectionAttempts: Infinity, reconnectionDelay: 1000, transports: ['websocket', 'polling'] });

// ── Autojoin: jump straight to waiting screen ──────────────────────────────
if (_autoJoinHandoff) {
  if (typeof waitingName !== 'undefined' && waitingName) waitingName.textContent = `You joined as ${myName}`;
  showScreen('waiting');
}

socket.on('connect', () => {
  reconnectOverlay.classList.remove('show');
  if (myName && roomId) socket.emit('join_game', { roomId, playerName: myName, gameType: 'tv-ring-sort', reconnect: true });
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
  socket.emit('join_game', { roomId, playerName: name, gameType: 'tv-ring-sort' });
}

socket.on('joined', ({ color }) => {
  myColor = color;
  mySeat  = seatForColor(color);
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
  if (state.gameType !== 'tv-ring-sort') return;
  isSolved = false;
  myCurrentScore = 0;
  sfx.gameStart();
  showScreen('playing');
  applyState(state);
});

socket.on('game_state', (state) => {
  if (state.gameType !== 'tv-ring-sort') return;
  if (!playingScreen.classList.contains('active')) showScreen('playing');
  applyState(state);
});

let roundCountdownTimer = null;

socket.on('round_over', ({ currentRound, totalRounds, players, sessionScores, nextRoundIn }) => {
  isSolved = false;
  sfx.roundOver();

  if (players && mySeat >= 0 && players[mySeat]) myCurrentScore = players[mySeat].score || 0;
  else if (sessionScores && mySeat >= 0)         myCurrentScore = sessionScores[mySeat] || 0;

  const rn = (currentRound !== undefined ? currentRound : 0) + 1;
  const rt = totalRounds || 3;
  const isLastRound = rn >= rt;
  myScoreDisplay.textContent = `${myCurrentScore} pts`;
  watchTvText.textContent = `Round ${rn} of ${rt} done!`;
  watchTv.classList.remove('hidden');
  feedbackBar.textContent = '';

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
    watchTvSub.textContent = `Your score: ${myCurrentScore} pts — final results soon…`;
  }
});

socket.on('game_over', ({ winner, players }) => {
  const didWin = winner === myName;
  const myData = players ? players.find(p => p.name === myName) : null;
  const finalScore = myData ? myData.score : myCurrentScore;

  gameoverTrophy.textContent   = didWin ? '🏆' : '💍';
  gameoverTitle.textContent    = didWin ? 'You Win!' : 'Game Over!';
  gameoverScore.textContent    = `${finalScore} pts`;
  gameoverPersonal.textContent = didWin ? '🎉 You sorted it first!' : `${winner || 'Someone'} was faster!`;

  didWin ? sfx.victory() : sfx.roundOver();
  showScreen('gameover');
});

socket.on('play_again', () => {
  gameState = null;
  showScreen('waiting');
});

socket.on('error', ({ message }) => { joinError.textContent = message; joinBtn.disabled = false; });

// ── Apply server state ────────────────────────────────────────────────────────
function applyState(state) {
  const { currentRound, totalRounds, playerSolved, sessionScores, moveCounts, playerRods, selectedRods, config } = state;

  roundInfo.textContent = `${(currentRound || 0) + 1} / ${totalRounds || 3}`;

  if (sessionScores && mySeat >= 0) myCurrentScore = sessionScores[mySeat] || 0;
  myScoreDisplay.textContent = `${myCurrentScore} pts`;

  const mySolvedNow = playerSolved && mySeat >= 0 && playerSolved[mySeat];

  if (mySolvedNow && !isSolved) {
    isSolved = true;
    sfx.correct();
    feedbackBar.textContent = '✅ Sorted!';
    feedbackBar.style.color = '#4ade80';
    watchTv.classList.remove('hidden');
    watchTvText.textContent = '✅ You sorted all rings!';
    watchTvSub.textContent  = 'Waiting for others to finish…';
  }

  if (!mySolvedNow) {
    isSolved = false;
    watchTv.classList.add('hidden');
    feedbackBar.textContent = '';
    feedbackBar.style.color = '';
  }

  if (!mySolvedNow && playerRods && mySeat >= 0 && playerRods[mySeat]) {
    const myRods = playerRods[mySeat];
    const mySelected = selectedRods && mySeat >= 0 ? selectedRods[mySeat] : null;
    drawRods(myRods, mySelected, config);
  }
}

// ── Draw rods ─────────────────────────────────────────────────────────────────
let shakingRodIndex = null;

function drawRods(rods, selected, cfg) {
  if (!rods) return;
  const numColors    = cfg ? cfg.numColors    : 2;
  const ringsPerColor = cfg ? cfg.ringsPerColor : 3;

  const availW = Math.min(window.innerWidth - 24, 420);
  const rodW   = Math.max(52, Math.floor((availW - (rods.length - 1) * 12) / rods.length));
  const ringMaxW = rodW - 8;
  const ringMinW = Math.floor(ringMaxW * 0.48);
  const pegH = ringsPerColor * 22 + 16;

  rodsRow.innerHTML = '';

  rods.forEach((rod, ri) => {
    const isSelected = selected === ri;
    const isComplete = rod.length === ringsPerColor && rod.every(r => r.name === rod[0].name);
    const isShaking  = shakingRodIndex === ri;

    const btn = document.createElement('button');
    btn.className = ['rod-btn',
      isSelected ? 'selected' : '',
      isComplete  ? 'complete'  : '',
      isShaking   ? 'shaking'   : '',
    ].filter(Boolean).join(' ');
    btn.style.minWidth = rodW + 'px';
    btn.disabled = isSolved;
    btn.setAttribute('aria-label', `Rod ${ri + 1}, ${rod.length} ring${rod.length !== 1 ? 's' : ''}${isComplete ? ', sorted' : ''}${isSelected ? ', selected' : ''}`);

    // Peg area
    const pegWrap = document.createElement('div');
    pegWrap.className = 'rod-peg-wrap';
    pegWrap.style.height = pegH + 'px';
    pegWrap.style.width  = rodW + 'px';

    const peg = document.createElement('div');
    peg.className = 'rod-peg';
    peg.style.height = pegH + 'px';
    pegWrap.appendChild(peg);

    // Ring stack (column-reverse: index 0 = bottom)
    const ringsCol = document.createElement('div');
    ringsCol.className = 'rod-rings-col';

    rod.forEach((ring, ringIdx) => {
      const isTop = ringIdx === rod.length - 1;
      const w = Math.max(ringMinW, Math.floor(
        ringMaxW - ring.size * ((ringMaxW - ringMinW) / Math.max(ringsPerColor - 1, 1))
      ));
      const el = document.createElement('div');
      el.className = 'ring-item' + (isSelected && isTop ? ' lifted' : '');
      el.style.width      = w + 'px';
      el.style.background = ring.bg;
      ringsCol.appendChild(el);
    });

    pegWrap.appendChild(ringsCol);
    btn.appendChild(pegWrap);

    const base = document.createElement('div');
    base.className = 'rod-base';
    btn.appendChild(base);

    btn.addEventListener('click', () => tapRod(ri));
    rodsRow.appendChild(btn);
  });
}

// ── Controls ──────────────────────────────────────────────────────────────────
function tapRod(rodIdx) {
  if (isSolved) return;
  socket.emit('tv_ring_sort_tap', { rodIdx });
}

// Handle server feedback for invalid moves (shake animation)
socket.on('ring_tap_result', ({ ok, action, shakeRod }) => {
  if (!ok && action === 'full' && shakeRod !== undefined) {
    shakingRodIndex = shakeRod;
    setTimeout(() => { shakingRodIndex = null; }, 320);
    sfx.wrong && sfx.wrong();
  }
});

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
