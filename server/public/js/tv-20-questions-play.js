'use strict';

// ── State ────────────────────────────────────────────────────────────────────
let myRoomId = null;
let myName = '';
let mySeat = -1;
let gameState = null;
let cooldownTimer = null;
let screen = 'join'; // 'join' | 'waiting' | 'playing' | 'gameover'

// ── DOM refs ─────────────────────────────────────────────────────────────────
const joinScreen       = document.getElementById('joinScreen');
const waitingScreen    = document.getElementById('waitingScreen');
const playingScreen    = document.getElementById('playingScreen');
const gameoverScreen   = document.getElementById('gameoverScreen');
const reconnectOverlay = document.getElementById('reconnectOverlay');

// Join
const nameInput = document.getElementById('nameInput');
const joinBtn   = document.getElementById('joinBtn');
const joinError = document.getElementById('joinError');

// Waiting
const waitingName       = document.getElementById('waitingName');
const waitingPlayerList = document.getElementById('waitingPlayerList');

// Playing
const mCategoryBadge   = document.getElementById('mCategoryBadge');
const mQuestionCounter = document.getElementById('mQuestionCounter');
const qaHistory        = document.getElementById('qaHistory');
const questionInput    = document.getElementById('questionInput');
const askBtn           = document.getElementById('askBtn');
const guessBtn         = document.getElementById('guessBtn');
const cooldownText     = document.getElementById('cooldownText');
const micBtn           = document.getElementById('micBtn');

// Game over
const mGameoverAnswer   = document.getElementById('mGameoverAnswer');
const mGameoverPersonal = document.getElementById('mGameoverPersonal');
const mGameoverMsg      = document.getElementById('mGameoverMsg');

// ── Get room from URL ────────────────────────────────────────────────────────
const urlParams = new URLSearchParams(window.location.search);
const roomFromUrl = urlParams.get('room');
const isAutoJoin = urlParams.get('autojoin') === '1';

// ── Autojoin handoff (from /tv-join) ────────────────────────────────────────
let _autoJoinHandoff = null;
if (isAutoJoin && roomFromUrl) {
  try {
    const _raw = sessionStorage.getItem(`caritahub_pending_join_${roomFromUrl}`);
    if (_raw) {
      const _d = JSON.parse(_raw);
      if (_d && _d.name && _d.color && Date.now() - (_d.ts || 0) < 30 * 60 * 1000) {
        _autoJoinHandoff = _d;
        myRoomId = roomFromUrl;
        myName   = _d.name;
        const _sc = ['tv-host','p1','p2','p3','p4','p5','p6','p7','p8'];
        const _i  = _sc.indexOf(_d.color);
        mySeat    = _i > 0 ? _i - 1 : -1;
      }
    }
  } catch (e) { /* ignore */ }
}

// ── Socket ───────────────────────────────────────────────────────────────────
const socket = io({
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  transports: ['websocket', 'polling']
});

// ── Autojoin: jump straight to waiting screen ──────────────────────────────
if (_autoJoinHandoff) {
  if (waitingName) waitingName.textContent = `You joined as ${myName}`;
  switchScreen('waiting');
}

socket.on('connect', () => {
  reconnectOverlay.classList.add('hidden');
  if (myRoomId && myName) {
    socket.emit('join_game', {
      roomId: myRoomId,
      playerName: myName,
      gameType: 'tv-20-questions',
      reconnect: true
    });
  }
});

socket.on('disconnect', () => {
  reconnectOverlay.classList.remove('hidden');
});

socket.on('connect_error', () => {
  reconnectOverlay.classList.remove('hidden');
});

// ── Join ──────────────────────────────────────────────────────────────────────
joinBtn.addEventListener('click', doJoin);
nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doJoin(); });

function doJoin() {
  const name = nameInput.value.trim();
  if (!name) {
    joinError.textContent = 'Please enter your name';
    return;
  }
  joinError.textContent = '';
  joinBtn.disabled = true;
  myName = name;

  socket.emit('join_game', {
    roomId: roomFromUrl || null,
    playerName: name,
    gameType: 'tv-20-questions',
    reconnect: false
  });
}

// ── Joined ───────────────────────────────────────────────────────────────────
socket.on('joined', ({ roomId, color }) => {
  myRoomId = roomId;
  mySeat = colorToSeat(color);
  waitingName.textContent = `Joined as: ${myName}`;
  switchScreen('waiting');
});

// ── Room update ──────────────────────────────────────────────────────────────
socket.on('room_update', ({ players }) => {
  const phonePlayers = players.filter(p => p.color !== 'tv-host');
  waitingPlayerList.innerHTML = '';
  phonePlayers.forEach(p => {
    const div = document.createElement('div');
    div.className = 'waiting-player-item';
    div.textContent = p.name;
    if (!p.connected) div.style.opacity = '0.5';
    waitingPlayerList.appendChild(div);
  });
});

// ── Game started ─────────────────────────────────────────────────────────────
socket.on('game_started', (state) => {
  gameState = state;
  switchScreen('playing');
  applyState(state);
});

// ── Game state ───────────────────────────────────────────────────────────────
socket.on('game_state', (state) => {
  if (state.gameType !== 'tv-20-questions') return;
  gameState = state;
  if (screen === 'waiting') switchScreen('playing');
  applyState(state);
});

// ── Question answered (for feedback) ─────────────────────────────────────────
socket.on('tv_20q_answer', (data) => {
  // Visual feedback on the input
  const { answer, hint } = data;
  if (answer === 'yes') {
    questionInput.style.borderColor = '#4ecca3';
  } else if (answer === 'no') {
    questionInput.style.borderColor = '#e74c3c';
  } else if (answer === 'hint' && hint) {
    questionInput.style.borderColor = '#1155cc';
    // Show hint as a toast
    const toast = document.createElement('div');
    toast.textContent = '💡 ' + hint;
    toast.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:#1155cc;color:#fff;padding:14px 24px;border-radius:12px;font-size:18px;font-weight:bold;z-index:9999;text-align:center;box-shadow:0 4px 12px rgba(0,0,0,0.3);animation:fadeInOut 4s ease forwards;max-width:90%;';
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
  } else {
    questionInput.style.borderColor = '#aab';
  }
  setTimeout(() => {
    questionInput.style.borderColor = '#4ecca3';
  }, 1500);
});

// ── Guess result ─────────────────────────────────────────────────────────────
socket.on('tv_20q_guess_result', (data) => {
  if (data.correct) {
    questionInput.style.borderColor = '#ffd700';
  } else {
    questionInput.style.borderColor = '#e74c3c';
    setTimeout(() => {
      questionInput.style.borderColor = '#4ecca3';
    }, 1500);
  }
});

// ── Game over ────────────────────────────────────────────────────────────────
socket.on('game_over', ({ winner, answer, reason }) => {
  mGameoverAnswer.textContent = answer || '???';

  if (winner === myName) {
    mGameoverPersonal.textContent = 'You got it!';
    launchConfetti();
  } else if (winner) {
    mGameoverPersonal.textContent = `${winner} guessed it!`;
  } else {
    mGameoverPersonal.textContent = 'Nobody guessed it';
  }

  mGameoverMsg.textContent = reason || '';

  setTimeout(() => {
    switchScreen('gameover');
  }, 1500);
});

// ── Play again ───────────────────────────────────────────────────────────────
socket.on('play_again', () => {
  gameState = null;
  qaHistory.innerHTML = '';
  questionInput.value = '';
  cooldownText.textContent = '';
  if (cooldownTimer) { clearInterval(cooldownTimer); cooldownTimer = null; }
  const confettiEl = document.getElementById('confettiContainer');
  if (confettiEl) { confettiEl.classList.add('hidden'); confettiEl.innerHTML = ''; }
  switchScreen('waiting');
});

socket.on('error', ({ message }) => {
  joinError.textContent = message;
  joinBtn.disabled = false;
});

// ── Rephrase prompt (not a yes/no question) ─────────────────────────────────
socket.on('tv_20q_rephrase', ({ message }) => {
  // Show the rephrase message prominently on the playing screen
  questionInput.style.borderColor = '#ff9f43';
  questionInput.placeholder = message || 'Try a different question!';

  // Also show a temporary toast message
  const toast = document.createElement('div');
  toast.className = 'rephrase-toast';
  toast.textContent = message || 'Please ask a yes or no question!';
  toast.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:#ff9f43;color:#fff;padding:14px 24px;border-radius:12px;font-size:18px;font-weight:bold;z-index:9999;text-align:center;box-shadow:0 4px 12px rgba(0,0,0,0.3);animation:fadeInOut 3s ease forwards;';
  document.body.appendChild(toast);

  setTimeout(() => {
    questionInput.style.borderColor = '#4ecca3';
    questionInput.placeholder = 'Type or tap mic to speak...';
    toast.remove();
  }, 3000);

  // Re-enable the ask button since the question wasn't counted
  askBtn.disabled = false;
  cooldownText.textContent = '';
  if (cooldownTimer) { clearInterval(cooldownTimer); cooldownTimer = null; }
});

// ── Ask question ─────────────────────────────────────────────────────────────
askBtn.addEventListener('click', doAsk);

function doAsk() {
  const text = questionInput.value.trim();
  if (!text) return;
  socket.emit('tv_20q_ask', { text });
  questionInput.value = '';
  startCooldown();
}

// ── Guess ────────────────────────────────────────────────────────────────────
guessBtn.addEventListener('click', doGuess);

function doGuess() {
  const text = questionInput.value.trim();
  if (!text) return;
  socket.emit('tv_20q_guess', { text });
  questionInput.value = '';
}

// ── Submit on enter (defaults to ask) ────────────────────────────────────────
questionInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    if (askBtn.disabled) {
      doGuess();
    } else {
      doAsk();
    }
  }
});

// ── Cooldown ─────────────────────────────────────────────────────────────────
function startCooldown() {
  askBtn.disabled = true;
  let remaining = 2;
  cooldownText.textContent = `Wait ${remaining}s...`;

  if (cooldownTimer) clearInterval(cooldownTimer);
  cooldownTimer = setInterval(() => {
    remaining--;
    if (remaining <= 0) {
      clearInterval(cooldownTimer);
      cooldownTimer = null;
      askBtn.disabled = false;
      cooldownText.textContent = '';
    } else {
      cooldownText.textContent = `Wait ${remaining}s...`;
    }
  }, 1000);
}

// ── Apply state ──────────────────────────────────────────────────────────────
function applyState(state) {
  if (!state) return;

  mCategoryBadge.textContent = `Category: ${state.category}`;
  mQuestionCounter.textContent = `${state.questionsUsed} / ${state.maxQuestions}`;

  // Q&A history
  const questions = state.questionsAsked || [];
  qaHistory.innerHTML = '';
  questions.forEach((q) => {
    const item = document.createElement('div');
    item.className = 'qa-item';

    const textEl = document.createElement('div');
    textEl.className = 'qa-item-text';
    const player = (state.players || []).find(p => p.seat === q.seat);
    const name = player ? player.name : `P${q.seat + 1}`;
    textEl.innerHTML = `<strong>${escHtml(name)}:</strong> ${escHtml(q.text)}`;

    const badge = document.createElement('div');
    badge.className = 'qa-item-badge ' + q.answer;
    if (q.answer === 'yes') badge.textContent = 'YES';
    else if (q.answer === 'no') badge.textContent = 'NO';
    else if (q.answer === 'hint') {
      badge.textContent = '💡';
      badge.title = q.hint || '';
      // Show hint text inline
      if (q.hint) {
        const hintEl = document.createElement('div');
        hintEl.style.cssText = 'font-size:14px;color:#1155cc;font-style:italic;margin-top:2px;';
        hintEl.textContent = '→ ' + q.hint;
        textEl.appendChild(hintEl);
      }
    }
    else if (q.answer === 'unsure') badge.textContent = '?';
    else if (q.answer === 'correct') badge.textContent = 'CORRECT';
    else if (q.answer === 'wrong-guess') badge.textContent = 'NOPE';

    item.appendChild(textEl);
    item.appendChild(badge);
    qaHistory.appendChild(item);
  });

  // Auto-scroll
  qaHistory.scrollTop = qaHistory.scrollHeight;

  // Disable ask if all questions used
  if (state.questionsUsed >= state.maxQuestions && !cooldownTimer) {
    askBtn.disabled = true;
    cooldownText.textContent = 'All 20 questions used! Guess the answer!';
  }
}

// ── Screen switching ─────────────────────────────────────────────────────────
function switchScreen(name) {
  screen = name;
  joinScreen.classList.toggle('active', name === 'join');
  waitingScreen.classList.toggle('active', name === 'waiting');
  playingScreen.classList.toggle('active', name === 'playing');
  gameoverScreen.classList.toggle('active', name === 'gameover');
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function colorToSeat(color) {
  if (color === 'tv-host') return -1;
  const match = color.match(/^p(\d+)$/);
  return match ? parseInt(match[1], 10) - 1 : -1;
}

function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Speech-to-Text ──────────────────────────────────────────────────────────
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let isListening = false;

if (SpeechRecognition) {
  micBtn.classList.remove('hidden');
  recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = 'en-US';
  recognition.maxAlternatives = 1;

  recognition.onresult = (event) => {
    let transcript = '';
    for (let i = 0; i < event.results.length; i++) {
      transcript = event.results[i][0].transcript;
    }
    questionInput.value = transcript;

    // Auto-submit on final result
    if (event.results[event.results.length - 1].isFinal) {
      stopListening();
      if (transcript.trim()) {
        // If it sounds like a guess (no question mark, short, declarative), use guess
        // Otherwise default to ask
        if (askBtn.disabled) {
          doGuess();
        } else {
          doAsk();
        }
      }
    }
  };

  recognition.onerror = (event) => {
    console.warn('Speech recognition error:', event.error);
    stopListening();
  };

  recognition.onend = () => {
    stopListening();
  };
}

micBtn.addEventListener('click', () => {
  if (isListening) {
    recognition.abort();
    stopListening();
  } else {
    startListening();
  }
});

function startListening() {
  if (!recognition) return;
  try {
    questionInput.value = '';
    recognition.start();
    isListening = true;
    micBtn.classList.add('listening');
    questionInput.placeholder = 'Listening...';
  } catch (e) {
    // Already started
  }
}

function stopListening() {
  isListening = false;
  micBtn.classList.remove('listening');
  questionInput.placeholder = 'Type or tap mic to speak...';
}

// ── Confetti ─────────────────────────────────────────────────────────────────
function launchConfetti() {
  const container = document.getElementById('confettiContainer');
  if (!container) return;
  container.classList.remove('hidden');
  container.innerHTML = '';
  const colors = ['#ffd700', '#ff6b6b', '#4ecca3', '#1155cc', '#7d3c98', '#ff9f43'];
  for (let i = 0; i < 80; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.background = colors[Math.floor(Math.random() * colors.length)];
    piece.style.animationDelay = `${Math.random() * 2}s`;
    piece.style.animationDuration = `${2 + Math.random() * 2}s`;
    if (Math.random() > 0.5) piece.style.borderRadius = '50%';
    const size = 8 + Math.random() * 10;
    piece.style.width = `${size}px`;
    piece.style.height = `${size}px`;
    container.appendChild(piece);
  }
  setTimeout(() => {
    container.classList.add('hidden');
    container.innerHTML = '';
  }, 6000);
}
