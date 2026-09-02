'use strict';

const params = new URLSearchParams(location.search);

// ── URL params (host handoff from /tv-lobby) ────────────────────────────────
const _hostHandoff = params.get('host') === '1';
const _initialRoom = params.get('room');

let myRoomId = _initialRoom || null;
let roomPlayers = [];
let gameState = null;
let flashTimeout = null;
let selectedDifficulty = 'easy';

// ── DOM ───────────────────────────────────────────────────────────────────────
const lobbyPhase     = document.getElementById('lobbyPhase');
const playingPhase   = document.getElementById('playingPhase');
const roundOverPhase = document.getElementById('roundOverPhase');
const gameOverPhase  = document.getElementById('gameOverPhase');

const lobbyPlayerList = document.getElementById('lobbyPlayerList');
const startBtn        = document.getElementById('startBtn');
const startError      = document.getElementById('startError');
const joinUrlEl       = document.getElementById('joinUrl');
const playingMeta     = document.getElementById('playingMeta');
const phaseLabel      = document.getElementById('phaseLabel');
const scoreboardPlaying = document.getElementById('scoreboardPlaying');
const progressGrid    = document.getElementById('progressGrid');

const pads = [
  document.getElementById('pad0'),
  document.getElementById('pad1'),
  document.getElementById('pad2'),
  document.getElementById('pad3')
];

const roundOverTitle   = document.getElementById('roundOverTitle');
const roundOverResults = document.getElementById('roundOverResults');
const roundOverNext    = document.getElementById('roundOverNext');
const gameOverWinner   = document.getElementById('gameOverWinner');
const gameOverFinal    = document.getElementById('gameOverFinal');

// ── Socket ────────────────────────────────────────────────────────────────────
const socket = io({ reconnectionAttempts: Infinity, reconnectionDelay: 1000, transports: ['websocket', 'polling'] });

if (_hostHandoff && lobbyPhase) lobbyPhase.classList.remove('active');

socket.on('connect', () => {
  socket.emit('join_game', {
    roomId: myRoomId || null,
    playerName: 'TV Display',
    gameType: 'tv-pattern-sequence',
    reconnect: !!myRoomId
  });
});

let _hostStartFired = false;
socket.on('joined', ({ roomId }) => {
  myRoomId = roomId;

  if (_hostHandoff && !_hostStartFired && !playingPhase.classList.contains('active')) {
    _hostStartFired = true;
    setTimeout(() => socket.emit('tv_pattern_sequence_start', { difficulty: selectedDifficulty }), 400);
    return;
  }

  const joinUrl = `${location.origin}/tv-join?game=tv-pattern-sequence&room=${roomId}`;
  joinUrlEl.textContent = joinUrl;
  const qrEl = document.getElementById('qrcode');
  qrEl.innerHTML = '';
  try {
    new QRCode(qrEl, { text: joinUrl, width: 200, height: 200, correctLevel: QRCode.CorrectLevel.H });
  } catch (e) {
    qrEl.textContent = joinUrl;
  }
});

socket.on('room_update', ({ players }) => {
  roomPlayers = players || [];
  const phonePlayers = roomPlayers.filter(p => p.color !== 'tv-host');
  renderLobbyPlayers(phonePlayers);
  startBtn.disabled = phonePlayers.length < 1;
});

function renderLobbyPlayers(phonePlayers) {
  if (phonePlayers.length === 0) {
    lobbyPlayerList.innerHTML = '<div class="tv-player-empty">Waiting for players...</div>';
    return;
  }
  lobbyPlayerList.innerHTML = phonePlayers.map(p =>
    `<div class="tv-player-item"><span class="tv-player-dot"></span>${p.name}</div>`
  ).join('');
}

document.querySelectorAll('.tv-diff-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tv-diff-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedDifficulty = btn.dataset.diff;
  });
});

startBtn.addEventListener('click', () => {
  startBtn.disabled = true;
  startError.textContent = '';
  socket.emit('tv_pattern_sequence_start', { difficulty: selectedDifficulty });
});

socket.on('error', ({ message }) => {
  startError.textContent = message;
  startBtn.disabled = false;
});

// ── Ready countdown ─────────────────────────────────────────────────────────
const readyOverlay = document.getElementById('readyOverlay');
const readyNumber = document.getElementById('readyNumber');
let readyCountdownTimer = null;

function startReadyCountdown() {
  stopReadyCountdown();
  if (readyOverlay) readyOverlay.classList.remove('hidden');
  let count = 3;
  if (readyNumber) readyNumber.textContent = count;
  sfx.tick();
  readyCountdownTimer = setInterval(() => {
    count--;
    if (count <= 0) {
      clearInterval(readyCountdownTimer);
      readyCountdownTimer = null;
      if (readyNumber) readyNumber.textContent = 'GO!';
      sfx.gameStart();
      setTimeout(() => {
        if (readyOverlay) readyOverlay.classList.add('hidden');
      }, 1500);
    } else {
      if (readyNumber) readyNumber.textContent = count;
      count <= 2 ? sfx.tickUrgent() : sfx.tick();
    }
  }, 1000);
}

function stopReadyCountdown() {
  if (readyCountdownTimer) { clearInterval(readyCountdownTimer); readyCountdownTimer = null; }
  if (readyOverlay) readyOverlay.classList.add('hidden');
}

// ── Game events ───────────────────────────────────────────────────────────────
socket.on('game_started', (state) => {
  if (state.gameType !== 'tv-pattern-sequence') return;
  gameState = state;
  showPhase('playing');
  render(state);
  if (state.phase === 'countdown') {
    startReadyCountdown();
  }
});

socket.on('game_state', (state) => {
  if (state.gameType !== 'tv-pattern-sequence') return;
  gameState = state;
  stopReadyCountdown();
  showPhase('playing');
  render(state);
});

socket.on('round_over', ({ currentRound, totalRounds, solvedOrder, pointsAwarded, sessionScores, players, nextRoundIn }) => {
  clearFlashAnimation();
  const roundNum = (currentRound !== undefined ? currentRound : 0) + 1;
  roundOverTitle.textContent = `Round ${roundNum} Done!`;

  roundOverResults.innerHTML = '';
  const medals = ['🥇', '🥈', '🥉'];
  (solvedOrder || []).forEach((seat, i) => {
    const p = players && players[seat] ? players[seat] : { name: `P${seat + 1}` };
    const pts = pointsAwarded && pointsAwarded[seat] !== undefined ? pointsAwarded[seat] : 0;
    roundOverResults.innerHTML += `
      <div class="result-card">
        <div class="result-pos">${medals[i] || ''}</div>
        <div class="result-name">${p.name}</div>
        <div class="result-pts">+${pts} pts — ${(sessionScores || [])[seat] || 0} total</div>
      </div>`;
  });

  if (solvedOrder.length === 0) {
    roundOverResults.innerHTML = '<div class="result-card"><div class="result-name">No one completed this round!</div></div>';
  }

  const nextIn = nextRoundIn || 5;
  let countdown = nextIn;
  roundOverNext.textContent = `Next round in ${countdown}...`;
  const iv = setInterval(() => {
    countdown--;
    if (countdown <= 0) { clearInterval(iv); roundOverNext.textContent = 'Starting...'; }
    else roundOverNext.textContent = `Next round in ${countdown}...`;
  }, 1000);

  showPhase('roundover');
});

socket.on('game_over', ({ winner, players }) => {
  clearFlashAnimation();
  gameOverWinner.textContent = winner ? `🏆 ${winner} wins!` : "It's a tie!";
  gameOverFinal.innerHTML = (players || []).map(p =>
    `<div class="final-card"><div class="final-name">${p.name}</div><div class="final-score">${p.score} pts</div></div>`
  ).join('');
  showPhase('gameover');
});

// ── Render ────────────────────────────────────────────────────────────────────
let lastShowingSequence = null;

function render(state) {
  const { currentRound, totalRounds, phase, sequence, sequenceLength, playerInputs, playerFinished, playerFailed, sessionScores, flashMs, gapMs } = state;
  playingMeta.textContent = `Round ${(currentRound || 0) + 1} of ${totalRounds || 3}`;

  // Scoreboard
  const players = roomPlayers.filter(p => p.color !== 'tv-host');
  scoreboardPlaying.innerHTML = players.map((p, i) =>
    `<div class="score-chip"><div class="score-name">${p.name}</div><div class="score-pts">${(sessionScores || [])[i] || 0} pts</div></div>`
  ).join('');

  // Phase label
  if (phase === 'countdown') {
    phaseLabel.textContent = '';
    phaseLabel.className = 'playing-phase-label';
    clearFlashAnimation();
  } else if (phase === 'showing') {
    phaseLabel.textContent = `Watch the pattern! (${sequenceLength} pads)`;
    phaseLabel.className = 'playing-phase-label watching';
    // Animate the pads flashing
    const seqKey = (sequence || []).join(',');
    if (seqKey !== lastShowingSequence) {
      lastShowingSequence = seqKey;
      animateSequence(sequence || [], flashMs || 600, gapMs || 200);
    }
  } else if (phase === 'input') {
    phaseLabel.textContent = `Your turn! Repeat the ${sequenceLength}-pad sequence`;
    phaseLabel.className = 'playing-phase-label';
    clearFlashAnimation();
  }

  // Player progress
  renderProgress(state, players);
}

function renderProgress(state, players) {
  const { playerInputs, playerFinished, playerFailed, sequenceLength, sessionScores } = state;
  progressGrid.innerHTML = players.map((p, i) => {
    const inputs = (playerInputs || [])[i] || [];
    const finished = (playerFinished || [])[i];
    const failed = (playerFailed || [])[i];
    const extraClass = finished ? ' finished' : failed ? ' failed' : '';
    const statusText = finished ? 'Completed!' : failed ? 'Failed' : `${inputs.length}/${sequenceLength || 0}`;

    let dotsHtml = '';
    for (let d = 0; d < (sequenceLength || 0); d++) {
      if (d < inputs.length) {
        dotsHtml += `<div class="dot correct"></div>`;
      } else {
        dotsHtml += `<div class="dot"></div>`;
      }
    }
    if (failed && inputs.length > 0) {
      // Mark last dot as wrong
      const lastIdx = inputs.length - 1;
      const dots = dotsHtml.split('</div>');
      // Rebuild — simpler to just redo
      dotsHtml = '';
      for (let d = 0; d < (sequenceLength || 0); d++) {
        if (d < inputs.length - 1) {
          dotsHtml += '<div class="dot correct"></div>';
        } else if (d === inputs.length - 1) {
          dotsHtml += '<div class="dot wrong"></div>';
        } else {
          dotsHtml += '<div class="dot"></div>';
        }
      }
    }

    return `
      <div class="progress-card${extraClass}">
        <div class="progress-name">${p.name}</div>
        <div class="progress-dots">${dotsHtml}</div>
        <div class="progress-status">${statusText}</div>
        <div class="progress-score">${(sessionScores || [])[i] || 0} pts</div>
      </div>`;
  }).join('');
}

// ── Pad flash animation ──────────────────────────────────────────────────────
let flashTimeouts = [];

function clearFlashAnimation() {
  flashTimeouts.forEach(t => clearTimeout(t));
  flashTimeouts = [];
  pads.forEach(p => p.classList.remove('flash'));
  lastShowingSequence = null;
}

function animateSequence(sequence, flashMs, gapMs) {
  clearFlashAnimation();
  const stepTime = flashMs + gapMs;

  sequence.forEach((padIdx, i) => {
    // Flash on
    const onTimer = setTimeout(() => {
      pads.forEach(p => p.classList.remove('flash'));
      if (pads[padIdx]) pads[padIdx].classList.add('flash');
      try { sfx.click(); } catch (e) {}
    }, i * stepTime);
    flashTimeouts.push(onTimer);

    // Flash off
    const offTimer = setTimeout(() => {
      if (pads[padIdx]) pads[padIdx].classList.remove('flash');
    }, i * stepTime + flashMs);
    flashTimeouts.push(offTimer);
  });

  // After full sequence, emit showing_done
  const doneTimer = setTimeout(() => {
    pads.forEach(p => p.classList.remove('flash'));
    socket.emit('tv_pattern_sequence_showing_done');
  }, sequence.length * stepTime);
  flashTimeouts.push(doneTimer);
}

// ── Phase switching ───────────────────────────────────────────────────────────
// ── Play Again ───────────────────────────────────────────────────────────────
const playAgainBtn = document.getElementById('playAgainBtn');
if (playAgainBtn) playAgainBtn.addEventListener('click', () => {
  socket.emit('play_again');
  setTimeout(function(){ location.replace('/tv-lobby?game=tv-pattern-sequence' + (myRoomId ? '&room=' + myRoomId : '')); }, 60);
});

socket.on('play_again', () => {
  gameState = null;
  clearFlashAnimation();
  stopReadyCountdown();
  startBtn.disabled = false;
  showPhase('lobby');
});

function showPhase(name) {
  [lobbyPhase, playingPhase, roundOverPhase, gameOverPhase].forEach(el => el.classList.remove('active'));
  if (name === 'lobby')     lobbyPhase.classList.add('active');
  if (name === 'playing')   playingPhase.classList.add('active');
  if (name === 'roundover') roundOverPhase.classList.add('active');
  if (name === 'gameover')  gameOverPhase.classList.add('active');
}
