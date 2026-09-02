'use strict';

// ── URL params (host handoff from /tv-lobby) ────────────────────────────────
const _tvParams    = new URLSearchParams(location.search);
const _hostHandoff = _tvParams.get('host') === '1';
const _initialRoom = _tvParams.get('room');

let myRoomId = _initialRoom || null;
let gameState = null;
let selectedDifficulty = 'easy';
let roundOverTimer = null;
let studyTimer = null;
let recallTimer = null;
let studyCountdown = 0;
let recallCountdown = 0;

// ── DOM refs ──────────────────────────────────────────────────────────────────
const lobbyPhase      = document.getElementById('lobbyPhase');
const playingPhase    = document.getElementById('playingPhase');
const roundOverPhase  = document.getElementById('roundOverPhase');
const gameoverPhase   = document.getElementById('gameoverPhase');
const reconnectOverlay = document.getElementById('reconnectOverlay');

const qrContainer     = document.getElementById('qrcode');
const joinUrlEl       = document.getElementById('joinUrl');
const lobbyPlayerList = document.getElementById('lobbyPlayerList');
const startBtn        = document.getElementById('startBtn');
const diffBtns        = document.querySelectorAll('.tv-diff-btn');

const playingMeta     = document.getElementById('playingMeta');
const phaseLabel      = document.getElementById('phaseLabel');
const countdownLabel  = document.getElementById('countdownLabel');
const countdownEl     = document.getElementById('countdown');
const wordGrid        = document.getElementById('wordGrid');
const playerBoards    = document.getElementById('playerBoards');

const roundOverTitle     = document.getElementById('roundOverTitle');
const roundOverScores    = document.getElementById('roundOverScores');
const roundOverCountdown = document.getElementById('roundOverCountdown');

const gameoverWinnerName = document.getElementById('gameoverWinnerName');
const gameoverWinner     = document.getElementById('gameoverWinner');
const gameoverScores     = document.getElementById('gameoverScores');
const playAgainBtn       = document.getElementById('playAgainBtn');
const confettiContainer  = document.getElementById('confettiContainer');

// ── Socket ────────────────────────────────────────────────────────────────────
const socket = io({ reconnectionAttempts: Infinity, reconnectionDelay: 1000, transports: ['websocket', 'polling'] });

if (_hostHandoff && lobbyPhase) lobbyPhase.classList.remove('active');

socket.on('connect', () => {
  reconnectOverlay.classList.add('hidden');
  socket.emit('join_game', { roomId: myRoomId || null, playerName: 'TV Display', gameType: 'tv-word-recall', reconnect: !!myRoomId });
});
socket.on('disconnect', () => reconnectOverlay.classList.remove('hidden'));
socket.on('connect_error', () => reconnectOverlay.classList.remove('hidden'));

let _hostStartFired = false;
socket.on('joined', ({ roomId }) => {
  myRoomId = roomId;

  if (_hostHandoff && !_hostStartFired && !playingPhase.classList.contains('active')) {
    _hostStartFired = true;
    setTimeout(() => socket.emit('tv_word_recall_start', { difficulty: selectedDifficulty }), 400);
    return;
  }

  const joinUrl = `${location.origin}/tv-join?game=tv-word-recall&room=${roomId}`;
  joinUrlEl.textContent = joinUrl;
  qrContainer.innerHTML = '';
  try { new QRCode(qrContainer, { text: joinUrl, width: 200, height: 200, correctLevel: QRCode.CorrectLevel.H }); }
  catch (e) { qrContainer.textContent = joinUrl; }
});

socket.on('room_update', ({ players }) => {
  const phone = players.filter(p => p.color !== 'tv-host');
  renderLobbyPlayers(phone);
  startBtn.disabled = phone.filter(p => p.connected).length < 1;
});

socket.on('game_started', (state) => {
  if (state.gameType !== 'tv-word-recall') return;
  gameState = state;
  sfx.gameStart();
  switchPhase('playing');
  renderStudyPhase(state);
});

socket.on('game_state', (state) => {
  if (state.gameType !== 'tv-word-recall') return;
  gameState = state;
  // Always show playing phase when we get game_state
  switchPhase('playing');
  if (state.phase === 'study') {
    renderStudyPhase(state);
  } else if (state.phase === 'recall') {
    renderRecallPhase(state);
  }
});

socket.on('round_over', ({ currentRound, totalRounds, players, nextRoundIn }) => {
  clearTimers();
  sfx.roundOver();
  switchPhase('roundover');
  renderRoundOver(currentRound, totalRounds, players, nextRoundIn);
});

socket.on('game_over', ({ winner, players, reason }) => {
  clearTimers();
  sfx.victory();
  gameoverWinnerName.textContent = winner || 'Nobody';
  gameoverWinner.textContent = reason || '';
  renderFinalScores(players);
  switchPhase('gameover');
  spawnConfetti();
});

socket.on('error', ({ message }) => {
  const el = document.getElementById('tvStartError');
  if (el) { el.textContent = message; setTimeout(() => { el.textContent = ''; }, 4000); }
  startBtn.disabled = false;
  startBtn.textContent = 'Start Game';
});

// ── Difficulty + Start ────────────────────────────────────────────────────────
diffBtns.forEach(btn => btn.addEventListener('click', () => {
  diffBtns.forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  selectedDifficulty = btn.dataset.diff;
}));

startBtn.addEventListener('click', () => {
  startBtn.disabled = true;
  startBtn.textContent = 'Starting...';
  socket.emit('tv_word_recall_start', { difficulty: selectedDifficulty });
  setTimeout(() => {
    if (lobbyPhase.classList.contains('active')) { startBtn.disabled = false; startBtn.textContent = 'Start Game'; }
  }, 3000);
});

playAgainBtn.addEventListener('click', () => {
  socket.emit('play_again');
  setTimeout(function(){ location.replace('/tv-lobby?game=tv-word-recall' + (myRoomId ? '&room=' + myRoomId : '')); }, 60);
});

socket.on('play_again', () => {
  gameState = null;
  if (typeof roundOverTimer !== 'undefined' && roundOverTimer) clearInterval(roundOverTimer);
  switchPhase('lobby');
});

// ── Phase switching ───────────────────────────────────────────────────────────
function switchPhase(phase) {
  [lobbyPhase, playingPhase, roundOverPhase, gameoverPhase].forEach(p => p.classList.remove('active'));
  if (phase === 'lobby')     lobbyPhase.classList.add('active');
  if (phase === 'playing')   playingPhase.classList.add('active');
  if (phase === 'roundover') roundOverPhase.classList.add('active');
  if (phase === 'gameover')  gameoverPhase.classList.add('active');
}

// ── Lobby ─────────────────────────────────────────────────────────────────────
function renderLobbyPlayers(players) {
  lobbyPlayerList.innerHTML = '';
  const connected = players.filter(p => p.connected);
  if (!connected.length) { lobbyPlayerList.innerHTML = '<div class="tv-player-empty">Waiting for players...</div>'; return; }
  connected.forEach(p => {
    const div = document.createElement('div');
    div.className = 'tv-player-item';
    div.innerHTML = `<span class="tv-player-dot"></span>${escHtml(p.name)}`;
    lobbyPlayerList.appendChild(div);
  });
}

// ── Study Phase ──────────────────────────────────────────────────────────────
function renderStudyPhase(state) {
  const { wordList, config, currentRound, totalRounds, difficulty, wordCount } = state;
  playingMeta.textContent = `${difficulty.toUpperCase()} \u2014 Round ${currentRound + 1} of ${totalRounds} \u2014 ${wordCount} words`;
  phaseLabel.textContent = 'STUDY THESE WORDS!';
  countdownLabel.textContent = 'Time to study';
  playerBoards.innerHTML = '';

  // Render word chips
  const words = wordList || [];
  wordGrid.innerHTML = words.map(w =>
    `<div class="tv-word-chip">${escHtml(w)}</div>`
  ).join('');
  wordGrid.classList.remove('hidden');

  // Start study countdown (only if not already running for this round)
  clearTimers();
  studyCountdown = config.studySeconds;
  countdownEl.textContent = studyCountdown;
  countdownEl.classList.remove('urgent');

  studyTimer = setInterval(() => {
    studyCountdown--;
    if (studyCountdown <= 5) countdownEl.classList.add('urgent');
    if (studyCountdown <= 3 && studyCountdown > 0) sfx.tickUrgent();
    else if (studyCountdown > 0) sfx.tick();

    if (studyCountdown <= 0) {
      clearInterval(studyTimer);
      studyTimer = null;
      countdownEl.textContent = '0';
      // Signal server that study phase is done
      socket.emit('tv_word_recall_study_done');
    } else {
      countdownEl.textContent = studyCountdown;
    }
  }, 1000);
}

// ── Recall Phase ──────────────────────────────────────────────────────────────
function renderRecallPhase(state) {
  const { players, recalledCounts, solvedOrder, sessionScores, wordCount, config, currentRound, totalRounds, difficulty } = state;
  playingMeta.textContent = `${difficulty.toUpperCase()} \u2014 Round ${currentRound + 1} of ${totalRounds} \u2014 ${wordCount} words`;
  phaseLabel.textContent = 'RECALL PHASE \u2014 TYPE THE WORDS!';
  countdownLabel.textContent = 'Time remaining';

  // Hide word grid
  wordGrid.innerHTML = '';
  wordGrid.classList.add('hidden');

  // Start recall countdown if not already running
  if (!recallTimer) {
    recallCountdown = config.recallSeconds;
    countdownEl.textContent = recallCountdown;
    countdownEl.classList.remove('urgent');

    recallTimer = setInterval(() => {
      recallCountdown--;
      if (recallCountdown <= 10) countdownEl.classList.add('urgent');
      if (recallCountdown <= 5 && recallCountdown > 0) sfx.tickUrgent();

      if (recallCountdown <= 0) {
        clearInterval(recallTimer);
        recallTimer = null;
        countdownEl.textContent = '0';
        // Signal server that recall time expired
        socket.emit('tv_word_recall_time_up');
      } else {
        countdownEl.textContent = recallCountdown;
      }
    }, 1000);
  }

  // Render player boards
  playerBoards.innerHTML = '';
  if (!players) return;

  players.forEach((player, i) => {
    const count = recalledCounts[i] || 0;
    const isFinished = solvedOrder.includes(i);
    const board = document.createElement('div');
    board.className = 'tv-player-board' + (isFinished ? ' board-finished' : '');

    const nameHtml = isFinished
      ? `${escHtml(player.name)} <span class="badge-solved">ALL</span>`
      : escHtml(player.name);

    const pct = wordCount > 0 ? Math.round((count / wordCount) * 100) : 0;

    board.innerHTML = `
      <div class="tv-player-board-name">${nameHtml}</div>
      <div class="tv-player-score">${sessionScores[i] || 0} pts</div>
      <div class="tv-player-progress">${count} / ${wordCount}</div>
      <div class="tv-player-progress-bar"><div class="tv-player-progress-fill" style="width:${pct}%"></div></div>
    `;
    playerBoards.appendChild(board);
  });
}

// ── Round Over ────────────────────────────────────────────────────────────────
function renderRoundOver(currentRound, totalRounds, players, nextRoundIn) {
  roundOverTitle.textContent = `Round ${currentRound + 1} Complete!`;
  const sorted = [...players].sort((a, b) => b.score - a.score);
  roundOverScores.innerHTML = sorted.map((p, idx) => {
    const medal = ['\uD83E\uDD47','\uD83E\uDD48','\uD83E\uDD49'][idx] || '';
    return `<div class="tv-round-score-row">
      <span class="tv-round-score-medal">${medal}</span>
      <span class="tv-round-score-name">${escHtml(p.name)}</span>
      <span class="tv-round-score-pts">${p.score} pts</span>
    </div>`;
  }).join('');

  let countdown = nextRoundIn;
  roundOverCountdown.textContent = `Next round in ${countdown}s\u2026`;
  if (roundOverTimer) clearInterval(roundOverTimer);
  roundOverTimer = setInterval(() => {
    countdown--;
    if (countdown <= 0) { clearInterval(roundOverTimer); roundOverCountdown.textContent = 'Get ready!'; sfx.gameStart(); }
    else { countdown <= 3 ? sfx.tickUrgent() : sfx.tick(); roundOverCountdown.textContent = `Next round in ${countdown}s\u2026`; }
  }, 1000);
}

// ── Final Scores ──────────────────────────────────────────────────────────────
function renderFinalScores(players) {
  if (!players) return;
  const sorted = [...players].sort((a, b) => b.score - a.score);
  gameoverScores.innerHTML = sorted.map(p =>
    `<div class="tv-final-score-row"><span>${escHtml(p.name)}</span><span>${p.score} pts</span></div>`
  ).join('');
}

// ── Timer cleanup ─────────────────────────────────────────────────────────────
function clearTimers() {
  if (studyTimer) { clearInterval(studyTimer); studyTimer = null; }
  if (recallTimer) { clearInterval(recallTimer); recallTimer = null; }
}

// ── Confetti ──────────────────────────────────────────────────────────────────
function spawnConfetti() {
  confettiContainer.classList.remove('hidden');
  confettiContainer.innerHTML = '';
  const colors = ['#10b981','#34d399','#6ee7b7','#ffd700','#3b82f6','#a855f7','#f97316','#ef4444'];
  for (let i = 0; i < 80; i++) {
    const p = document.createElement('div');
    p.className = 'confetti-piece';
    p.style.left = Math.random() * 100 + 'vw';
    p.style.background = colors[Math.floor(Math.random() * colors.length)];
    p.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
    p.style.animationDelay = Math.random() * 2 + 's';
    confettiContainer.appendChild(p);
    setTimeout(() => p.remove(), 5000);
  }
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
