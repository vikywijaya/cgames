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
let isFinished = false;
let lastCardStateHash = '';

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
const myPairsEl   = document.getElementById('myPairs');
const roundInfoEl = document.getElementById('roundInfo');
const feedbackEl  = document.getElementById('feedback');
const cardGrid    = document.getElementById('cardGrid');
const cardArea    = document.getElementById('cardArea');
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
  if (myName && roomId) socket.emit('join_game', { roomId, playerName: myName, gameType: 'tv-memory-match', reconnect: true });
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
  socket.emit('join_game', { roomId, playerName: name, gameType: 'tv-memory-match' });
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
  if (state.gameType !== 'tv-memory-match') return;
  isFinished = false;
  myCurrentScore = 0;
  lastCardStateHash = '';
  if (graceTimer) { clearInterval(graceTimer); graceTimer = null; }
  sfx.gameStart();
  showScreen('playing');
  applyState(state);
});

socket.on('game_state', (state) => {
  if (state.gameType !== 'tv-memory-match') return;
  if (!playingScreen.classList.contains('active')) showScreen('playing');
  applyState(state);
});

socket.on('memory_match_flip_result', ({ action }) => {
  if (action === 'match') {
    sfx.correct();
    feedbackEl.textContent = 'Match!';
    feedbackEl.style.color = '#4ade80';
    // Add pop animation to matched cards
    const cards = cardGrid.querySelectorAll('.card.matched');
    cards.forEach(c => { c.classList.add('match-pop'); setTimeout(() => c.classList.remove('match-pop'), 500); });
  } else if (action === 'mismatch') {
    sfx.wrong();
    feedbackEl.textContent = 'No match';
    feedbackEl.style.color = '#f87171';
  }
  // Clear feedback after a moment
  setTimeout(() => { feedbackEl.textContent = ''; feedbackEl.style.color = ''; }, 800);
});

let roundCountdownTimer = null;
let graceTimer = null;

socket.on('memory_match_grace', ({ secondsLeft, finisher }) => {
  if (isFinished) return; // I already finished, don't show
  let remaining = secondsLeft;
  feedbackEl.textContent = `${finisher} finished! ${remaining}s left`;
  feedbackEl.style.color = '#fbbf24';
  if (graceTimer) clearInterval(graceTimer);
  graceTimer = setInterval(() => {
    remaining--;
    if (remaining <= 0) {
      clearInterval(graceTimer);
      graceTimer = null;
      feedbackEl.textContent = "Time's up!";
      feedbackEl.style.color = '#f87171';
    } else {
      feedbackEl.textContent = `${finisher} finished! ${remaining}s left`;
      remaining <= 5 ? sfx.tickUrgent() : sfx.tick();
    }
  }, 1000);
});

socket.on('round_over', ({ currentRound, totalRounds, players, sessionScores, nextRoundIn }) => {
  isFinished = false;
  lastCardStateHash = '';
  if (graceTimer) { clearInterval(graceTimer); graceTimer = null; }
  sfx.roundOver();

  if (players && mySeat >= 0 && players[mySeat]) myCurrentScore = players[mySeat].score || 0;
  else if (sessionScores && mySeat >= 0) myCurrentScore = sessionScores[mySeat] || 0;

  const rn = (currentRound !== undefined ? currentRound : 0) + 1;
  const rt = totalRounds || 3;
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

  goTrophy.textContent = didWin ? '🏆' : '🃏';
  goTitle.textContent = didWin ? 'You Win!' : 'Game Over!';
  goScore.textContent = finalScore + ' pts';
  goPersonal.textContent = didWin ? 'You found all pairs fastest!' : `${winner || 'Someone'} was faster!`;

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
  const { currentRound, totalRounds, cols, rows, cards, cardStates, matchCounts, totalPairs, finished, sessionScores, locked } = state;

  roundInfoEl.textContent = `${(currentRound || 0) + 1}/${totalRounds || 3}`;

  if (sessionScores && mySeat >= 0) myCurrentScore = sessionScores[mySeat] || 0;
  myScoreEl.textContent = myCurrentScore + ' pts';

  const mc = matchCounts && mySeat >= 0 ? matchCounts[mySeat] || 0 : 0;
  const tp = totalPairs || 0;
  myPairsEl.textContent = `${mc}/${tp}`;

  const myFinishedNow = finished && mySeat >= 0 && finished[mySeat];

  if (myFinishedNow && !isFinished) {
    isFinished = true;
    sfx.victory();
    feedbackEl.textContent = '';
    watchTv.classList.remove('hidden');
    watchTvText.textContent = 'All pairs found!';
    watchTvSub.textContent = 'Waiting for other players...';
  }

  if (!myFinishedNow) {
    isFinished = false;
    watchTv.classList.add('hidden');
  }

  // Draw card grid — only when MY state changes to avoid interrupting animations
  if (cards && cardStates && mySeat >= 0 && cardStates[mySeat]) {
    const hash = 'R' + currentRound + '_' + cardStates[mySeat].map(c => (c.isFlipped ? 'F' : '_') + (c.isMatched ? 'M' : '_')).join('') + (locked && locked[mySeat] ? 'L' : '');
    if (hash !== lastCardStateHash) {
      lastCardStateHash = hash;
      drawCards(cards, cardStates[mySeat], cols, rows, locked && locked[mySeat]);
    }
  }
}

// ── Draw cards ────────────────────────────────────────────────────────────────
function drawCards(cards, myCardStates, cols, rows, isLocked) {
  const areaW = cardArea.clientWidth || window.innerWidth;
  const areaH = cardArea.clientHeight || (window.innerHeight * 0.6);
  const gap = 6;
  const maxW = Math.floor((areaW - gap * (cols + 1)) / cols);
  const maxH = Math.floor((areaH - gap * (rows + 1)) / rows);
  const cellSize = Math.max(48, Math.min(80, Math.min(maxW, maxH)));

  cardGrid.style.gridTemplateColumns = `repeat(${cols}, ${cellSize}px)`;
  cardGrid.style.gridTemplateRows = `repeat(${rows}, ${cellSize}px)`;

  // Rebuild grid if card count changed
  if (cardGrid.children.length !== cards.length) {
    cardGrid.innerHTML = '';
    for (let i = 0; i < cards.length; i++) {
      const card = document.createElement('div');
      card.className = 'card';
      card.setAttribute('role', 'button');
      card.setAttribute('aria-label', `Card ${i + 1}`);
      card.style.width = cellSize + 'px';
      card.style.height = cellSize + 'px';
      card.innerHTML = `
        <div class="card-inner">
          <div class="card-face card-front">?</div>
          <div class="card-face card-back"></div>
        </div>`;
      card.addEventListener('click', () => {
        sfx.tap();
        socket.emit('tv_memory_match_flip', { cardIndex: i });
      });
      cardGrid.appendChild(card);
    }
  }

  // Update state
  const cardEls = cardGrid.children;
  for (let i = 0; i < cards.length; i++) {
    const el = cardEls[i];
    const cs = myCardStates[i];
    const back = el.querySelector('.card-back');
    const fontSize = Math.floor(cellSize * 0.5);
    back.style.fontSize = fontSize + 'px';
    back.textContent = cards[i];

    el.style.width = cellSize + 'px';
    el.style.height = cellSize + 'px';

    el.classList.toggle('flipped', cs.isFlipped && !cs.isMatched);
    el.classList.toggle('matched', cs.isMatched);
    el.style.pointerEvents = (cs.isFlipped || cs.isMatched || isLocked || isFinished) ? 'none' : 'auto';
  }
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
