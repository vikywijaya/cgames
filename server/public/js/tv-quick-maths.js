'use strict';

// ── URL params (host handoff from /tv-lobby) ────────────────────────────────
const _qmParams    = new URLSearchParams(location.search);
const _hostHandoff = _qmParams.get('host') === '1';
const _initialRoom = _qmParams.get('room');

let myRoomId = _initialRoom || null;
let gameState = null;
let selectedDifficulty = 'easy';
let roundOverTimer = null;

// ── DOM refs ──────────────────────────────────────────────────────────────────
const lobbyPhase       = document.getElementById('lobbyPhase');
const playingPhase     = document.getElementById('playingPhase');
const roundOverPhase   = document.getElementById('roundOverPhase');
const gameoverPhase    = document.getElementById('gameoverPhase');
const reconnectOverlay = document.getElementById('reconnectOverlay');

const qrContainer      = document.getElementById('qrcode');
const joinUrlEl        = document.getElementById('joinUrl');
const lobbyPlayerList  = document.getElementById('lobbyPlayerList');
const startBtn         = document.getElementById('startBtn');
const diffBtns         = document.querySelectorAll('.tv-diff-btn');

const questionText     = document.getElementById('questionText');
const answerTilesWrap  = document.getElementById('answerTiles');
const answerTiles      = document.querySelectorAll('.tv-answer-tile');
const roundInfo        = document.getElementById('playingMeta');
const timerBar         = document.getElementById('timerBar');
const playerBoards     = document.getElementById('playerBoards');

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

// ── Hide lobby instantly when arriving via host-handoff ─────────────────────
if (_hostHandoff && lobbyPhase) lobbyPhase.classList.remove('active');

socket.on('connect', () => {
  reconnectOverlay.classList.add('hidden');
  socket.emit('join_game', { roomId: myRoomId || null, playerName: 'TV Display', gameType: 'tv-quick-maths', reconnect: !!myRoomId });
});
socket.on('disconnect', () => reconnectOverlay.classList.remove('hidden'));
socket.on('connect_error', () => reconnectOverlay.classList.remove('hidden'));

let _hostStartFired = false;
socket.on('joined', ({ roomId }) => {
  myRoomId = roomId;

  // Host handoff: auto-start game on reconnect
  if (_hostHandoff && !_hostStartFired && !playingPhase.classList.contains('active')) {
    _hostStartFired = true;
    setTimeout(() => socket.emit('tv_quick_maths_start', { difficulty: selectedDifficulty }), 400);
    return;
  }

  const joinUrl = `${location.origin}/tv-join?game=tv-quick-maths&room=${roomId}`;
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
  if (state.gameType !== 'tv-quick-maths') return;
  gameState = state;
  sfx.gameStart();
  switchPhase('playing');
  renderQuestion(state);
});

socket.on('game_state', (state) => {
  if (state.gameType !== 'tv-quick-maths') return;
  gameState = state;
  if (playingPhase.classList.contains('active')) {
    renderQuestion(state);
  }
  if (roundOverPhase.classList.contains('active') && !state.isRoundOver) {
    if (roundOverTimer) clearInterval(roundOverTimer);
    sfx.gameStart();
    switchPhase('playing');
    renderQuestion(state);
  }
});

socket.on('round_over', ({ currentRound, totalRounds, players, nextRoundIn, correctAnswer, options }) => {
  sfx.roundOver();
  switchPhase('roundover');
  stopTimerBar();
  revealCorrectTile(correctAnswer, options);
  renderRoundOver(currentRound, totalRounds, players, nextRoundIn);
});

socket.on('game_over', ({ winner, players, reason }) => {
  if (roundOverTimer) clearInterval(roundOverTimer);
  sfx.victory();
  stopTimerBar();
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
diffBtns.forEach(function(btn) {
  btn.addEventListener('click', function() {
    diffBtns.forEach(function(b) { b.classList.remove('active'); });
    btn.classList.add('active');
    selectedDifficulty = btn.dataset.diff;
  });
});

startBtn.addEventListener('click', () => {
  startBtn.disabled = true;
  startBtn.textContent = 'Starting...';
  socket.emit('tv_quick_maths_start', { difficulty: selectedDifficulty });
  setTimeout(() => {
    if (lobbyPhase.classList.contains('active')) { startBtn.disabled = false; startBtn.textContent = 'Start Game'; }
  }, 3000);
});

playAgainBtn.addEventListener('click', () => {
  socket.emit('play_again');
  setTimeout(function(){ location.replace('/tv-lobby?game=tv-quick-maths' + (myRoomId ? '&room=' + myRoomId : '')); }, 60);
});

socket.on('play_again', () => {
  gameState = null;
  if (typeof roundOverTimer !== 'undefined' && roundOverTimer) clearInterval(roundOverTimer);
  switchPhase('lobby');
});

// ── Phase switching ───────────────────────────────────────────────────────────
function switchPhase(phase) {
  [lobbyPhase, playingPhase, roundOverPhase, gameoverPhase].forEach(function(p) { p.classList.remove('active'); });
  if (phase === 'lobby')     lobbyPhase.classList.add('active');
  if (phase === 'playing')   playingPhase.classList.add('active');
  if (phase === 'roundover') roundOverPhase.classList.add('active');
  if (phase === 'gameover')  gameoverPhase.classList.add('active');
}

// ── Lobby ─────────────────────────────────────────────────────────────────────
function renderLobbyPlayers(players) {
  lobbyPlayerList.innerHTML = '';
  const connected = players.filter(function(p) { return p.connected; });
  if (!connected.length) { lobbyPlayerList.innerHTML = '<div class="tv-player-empty">Waiting for players...</div>'; return; }
  connected.forEach(function(p) {
    const div = document.createElement('div');
    div.className = 'tv-player-item';
    div.innerHTML = '<span class="tv-player-dot"></span>' + escHtml(p.name);
    lobbyPlayerList.appendChild(div);
  });
}

// ── Timer bar ─────────────────────────────────────────────────────────────────
// Idle (no time limit): bar stays full width with a gentle pulse.
// Grace (after first correct): bar counts down from 100% → 0% over graceSec seconds.

function idleTimerBar() {
  if (!timerBar) return;
  timerBar.classList.remove('urgent');
  timerBar.style.transition = 'none';
  timerBar.style.width = '100%';
}

function startGraceCountdown(graceSec) {
  if (!timerBar) return;
  timerBar.classList.remove('urgent');
  timerBar.style.transition = 'none';
  timerBar.style.width = '100%';
  void timerBar.offsetWidth;
  timerBar.style.transition = 'width ' + graceSec + 's linear';
  timerBar.style.width = '0%';
  // Turn red at last 2 seconds
  const urgentDelay = Math.max(0, (graceSec - 2) * 1000);
  setTimeout(function() { timerBar.classList.add('urgent'); }, urgentDelay);
}

function stopTimerBar() {
  if (!timerBar) return;
  timerBar.classList.remove('urgent');
  timerBar.style.transition = 'none';
  timerBar.style.width = '0%';
}

socket.on('quick_maths_grace', function({ graceSec }) {
  startGraceCountdown(graceSec);
});

// ── Question rendering ────────────────────────────────────────────────────────
function renderQuestion(state) {
  if (!state.question) return;
  const q = state.question;

  questionText.textContent = q.a + ' ' + q.op + ' ' + q.b + ' = ?';
  questionText.style.animation = 'none';
  void questionText.offsetWidth;
  questionText.style.animation = '';

  roundInfo.textContent = 'Question ' + state.questionNumber + ' of ' + state.totalQuestions;

  // Hide answer tiles during play (anti-cheat)
  if (answerTilesWrap) answerTilesWrap.classList.remove('show');
  const options = q.options || [];
  answerTiles.forEach(function(tile, i) {
    tile.classList.remove('tile-correct', 'tile-wrong');
    tile.textContent = options[i] !== undefined ? options[i] : '';
  });

  // Show full idle bar — no countdown until grace period starts
  idleTimerBar();

  // Player boards
  renderPlayerBoards(state);
}

function renderPlayerBoards(state) {
  if (!playerBoards) return;
  playerBoards.innerHTML = '';
  const players = state.players || [];
  const answers = state.answers || [];
  players.forEach(function(player, i) {
    const answered = answers[i] !== null && answers[i] !== undefined;
    const div = document.createElement('div');
    div.className = 'tv-player-board' + (answered ? ' board-answered' : '');
    div.innerHTML =
      '<div class="tv-player-board-name">' + escHtml(player.name) + (answered ? ' <span class="badge-answered">✓</span>' : '') + '</div>' +
      '<div class="tv-player-score">' + (player.score || 0) + ' pts</div>';
    playerBoards.appendChild(div);
  });
}

function revealCorrectTile(correctAnswer, options) {
  if (!options || correctAnswer === undefined) return;
  if (answerTilesWrap) answerTilesWrap.classList.add('show');
  answerTiles.forEach(function(tile, i) {
    if (options[i] === correctAnswer) {
      tile.classList.add('tile-correct');
    }
  });
}

// ── Round Over ────────────────────────────────────────────────────────────────
function renderRoundOver(currentRound, totalRounds, players, nextRoundIn) {
  roundOverTitle.textContent = 'Round ' + (currentRound + 1) + ' Complete!';
  const sorted = (players || []).slice().sort(function(a, b) { return b.score - a.score; });
  roundOverScores.innerHTML = sorted.map(function(p, idx) {
    const medal = ['🥇', '🥈', '🥉'][idx] || '';
    return '<div class="tv-round-score-row">' +
      '<span class="tv-round-score-medal">' + medal + '</span>' +
      '<span class="tv-round-score-name">' + escHtml(p.name) + '</span>' +
      '<span class="tv-round-score-pts">' + p.score + ' pts</span>' +
      '</div>';
  }).join('');

  let countdown = nextRoundIn || 5;
  roundOverCountdown.textContent = 'Next round in ' + countdown + 's\u2026';
  if (roundOverTimer) clearInterval(roundOverTimer);
  roundOverTimer = setInterval(function() {
    countdown--;
    if (countdown <= 0) { clearInterval(roundOverTimer); roundOverCountdown.textContent = 'Get ready!'; sfx.gameStart(); }
    else { countdown <= 3 ? sfx.tickUrgent() : sfx.tick(); roundOverCountdown.textContent = 'Next round in ' + countdown + 's\u2026'; }
  }, 1000);
}

// ── Final Scores ──────────────────────────────────────────────────────────────
function renderFinalScores(players) {
  if (!players || !gameoverScores) return;
  const sorted = players.slice().sort(function(a, b) { return b.score - a.score; });
  gameoverScores.innerHTML = sorted.map(function(p) {
    return '<div class="tv-final-score-row"><span>' + escHtml(p.name) + '</span><span>' + p.score + ' pts</span></div>';
  }).join('');
}

// ── Confetti ──────────────────────────────────────────────────────────────────
function spawnConfetti() {
  if (!confettiContainer) return;
  confettiContainer.classList.remove('hidden');
  confettiContainer.innerHTML = '';
  const colors = ['#ef4444', '#3b82f6', '#22c55e', '#eab308', '#a855f7', '#f97316', '#ffd700', '#4ecca3'];
  for (let i = 0; i < 80; i++) {
    const p = document.createElement('div');
    p.className = 'confetti-piece';
    p.style.left = Math.random() * 100 + 'vw';
    p.style.background = colors[Math.floor(Math.random() * colors.length)];
    p.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
    p.style.animationDelay = Math.random() * 2 + 's';
    confettiContainer.appendChild(p);
    setTimeout(function() { p.remove(); }, 5000);
  }
}

function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
