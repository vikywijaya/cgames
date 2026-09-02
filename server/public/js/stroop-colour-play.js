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
let hasAnswered = false;

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

const nameInput      = document.getElementById('nameInput');
const joinBtn        = document.getElementById('joinBtn');
const joinError      = document.getElementById('joinError');
const waitingName    = document.getElementById('waitingName');

const roundInfo      = document.getElementById('roundInfo');
const phoneStimulus  = document.getElementById('phoneStimulus');
const feedbackText   = document.getElementById('feedbackText');
const optionsGrid    = document.getElementById('optionsGrid');
const scoreDisplay   = document.getElementById('scoreDisplay');

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
  if (myName && roomId) socket.emit('join_game', { roomId, playerName: myName, gameType: 'tv-stroop-colour', reconnect: true });
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
  socket.emit('join_game', { roomId, playerName: name, gameType: 'tv-stroop-colour' });
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
  if (state.gameType !== 'tv-stroop-colour') return;
  sfx.gameStart();
  gameState = state;
  hasAnswered = false;
  showScreen('playing');
  renderPlaying(state);
});

socket.on('game_state', (state) => {
  if (state.gameType !== 'tv-stroop-colour') return;
  gameState = state;
  // Reset answered state when new stimulus arrives
  if (mySeat >= 0 && !state.playerAnswered[mySeat]) {
    hasAnswered = false;
  }
  if (!playingScreen.classList.contains('active')) showScreen('playing');
  renderPlaying(state);
});

socket.on('stroop_all_answered', () => {
  // Time's up or all answered — lock buttons
  hasAnswered = true;
  const btns = optionsGrid.querySelectorAll('.colour-option');
  btns.forEach(b => { b.disabled = true; });
  if (!feedbackText.textContent) {
    feedbackText.textContent = "Time's up!";
    feedbackText.className = 'feedback-text wrong';
  }
});

socket.on('stroop_result', ({ correct, correctColour }) => {
  if (correct) {
    sfx.tap();
    feedbackText.textContent = 'Correct!';
    feedbackText.className = 'feedback-text correct';
    // Highlight correct button
    const btns = optionsGrid.querySelectorAll('.colour-option');
    btns.forEach(b => {
      if (b.dataset.name === correctColour) b.classList.add('correct-flash');
      b.disabled = true;
    });
  } else {
    sfx.wrong && sfx.wrong();
    feedbackText.textContent = `Wrong! It was ${correctColour}`;
    feedbackText.className = 'feedback-text wrong';
    // Highlight correct and wrong
    const btns = optionsGrid.querySelectorAll('.colour-option');
    btns.forEach(b => {
      if (b.dataset.name === correctColour) b.classList.add('show-correct');
      b.disabled = true;
    });
  }

  // Update score display
  if (gameState && mySeat >= 0) {
    const score = gameState.playerScores[mySeat] + (correct ? 1 : 0);
    scoreDisplay.textContent = `Score: ${score} / ${gameState.questionIndex + 1}`;
  }
});

socket.on('round_over', ({ currentRound, totalRounds, players }) => {
  hasAnswered = false;
  sfx.roundOver();
  const myData = players ? players.find(p => p.name === myName) : null;
  const pts = myData ? myData.score : 0;
  feedbackText.textContent = '';
  feedbackText.className = 'feedback-text';
  phoneStimulus.textContent = '';
  optionsGrid.innerHTML = '';
  roundInfo.textContent = `Round ${currentRound + 1}/${totalRounds} done!`;
  scoreDisplay.textContent = `Session score: ${pts} pts`;
});

socket.on('game_over', ({ winner, players, reason }) => {
  winner === myName ? sfx.victory() : sfx.roundOver();
  const didWin = winner === myName;
  const myData = players ? players.find(p => p.name === myName) : null;
  const myScore = myData ? myData.score : 0;
  gameoverEmoji.textContent = didWin ? '🏆' : '🎨';
  gameoverTitle.textContent = didWin ? 'You Win!' : 'Game Over!';
  gameoverPersonal.textContent = didWin ? `You won with ${myScore} pts!` : `${winner || 'Someone'} wins!`;
  gameoverMsg.textContent = reason || '';
  showScreen('gameover');
});

socket.on('play_again', () => {
  gameState = null;
  showScreen('waiting');
});

socket.on('error', ({ message }) => { joinError.textContent = message; joinBtn.disabled = false; });

// ── Render ────────────────────────────────────────────────────────────────────
function renderPlaying(state) {
  const { stimulus, questionIndex, totalQuestions, currentRound, totalRounds, difficulty, playerScores } = state;

  roundInfo.textContent = `${(difficulty || '').toUpperCase()} · Round ${currentRound + 1} of ${totalRounds} · Q${questionIndex + 1}/${totalQuestions}`;

  if (stimulus && !hasAnswered) {
    phoneStimulus.textContent = stimulus.word;
    phoneStimulus.style.color = stimulus.inkHex;
    feedbackText.textContent = '';
    feedbackText.className = 'feedback-text';

    // Render options
    optionsGrid.innerHTML = '';
    stimulus.options.forEach(opt => {
      const btn = document.createElement('button');
      btn.className = 'colour-option';
      btn.dataset.name = opt.name;
      btn.setAttribute('aria-label', `${opt.name} colour`);
      btn.innerHTML = `<span class="colour-swatch" style="background:${opt.hex}"></span>${escHtml(opt.name)}`;
      btn.addEventListener('click', () => {
        if (hasAnswered) return;
        hasAnswered = true;
        // Mark selected
        btn.classList.add(opt.name === stimulus.inkName ? 'correct-flash' : 'wrong-flash');
        socket.emit('tv_stroop_colour_answer', { colourName: opt.name });
      });
      optionsGrid.appendChild(btn);
    });
  } else if (stimulus && hasAnswered) {
    // Already answered, buttons should be disabled
    const btns = optionsGrid.querySelectorAll('.colour-option');
    btns.forEach(b => { b.disabled = true; });
  }

  if (mySeat >= 0) {
    scoreDisplay.textContent = `Score: ${playerScores[mySeat] || 0} / ${questionIndex + 1}`;
  }
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
