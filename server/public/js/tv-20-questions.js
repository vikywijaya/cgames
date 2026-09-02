'use strict';

// ── URL params (host handoff from /tv-lobby) ────────────────────────────────
const _tvParams    = new URLSearchParams(location.search);
const _hostHandoff = _tvParams.get('host') === '1';
const _initialRoom = _tvParams.get('room');

// ── State ────────────────────────────────────────────────────────────────────
let myRoomId = _initialRoom || null;
let gameState = null;
let phase = 'lobby'; // 'lobby' | 'playing' | 'gameover'

// ── DOM refs ─────────────────────────────────────────────────────────────────
const lobbyPhase       = document.getElementById('lobbyPhase');
const playingPhase     = document.getElementById('playingPhase');
const gameoverPhase    = document.getElementById('gameoverPhase');
const reconnectOverlay = document.getElementById('reconnectOverlay');

// Lobby
const qrContainer      = document.getElementById('qrcode');
const joinUrlEl        = document.getElementById('joinUrl');
const lobbyPlayerList  = document.getElementById('lobbyPlayerList');
const startBtn         = document.getElementById('startBtn');

// Playing
const categoryBadgeEl  = document.getElementById('categoryBadge');
const questionCountEl  = document.getElementById('questionCount');
const qaListEl         = document.getElementById('qaList');
const playersStripEl   = document.getElementById('playersStrip');
const giveUpBtn        = document.getElementById('giveUpBtn');

// Game Over
const gameoverAnswerEl  = document.getElementById('gameoverAnswer');
const gameoverWinnerEl  = document.getElementById('gameoverWinner');
const gameoverReasonEl  = document.getElementById('gameoverReason');
const playAgainBtn      = document.getElementById('playAgainBtn');

// ── Socket ───────────────────────────────────────────────────────────────────
const socket = io({
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  transports: ['websocket', 'polling']
});

if (_hostHandoff && lobbyPhase) lobbyPhase.classList.remove('active');

socket.on('connect', () => {
  reconnectOverlay.classList.add('hidden');
  socket.emit('join_game', {
    roomId: myRoomId || null,
    playerName: 'TV Display',
    gameType: 'tv-20-questions',
    reconnect: !!myRoomId
  });
});

socket.on('disconnect', () => {
  reconnectOverlay.classList.remove('hidden');
});

socket.on('connect_error', () => {
  reconnectOverlay.classList.remove('hidden');
});

// ── Joined ───────────────────────────────────────────────────────────────────
let _hostStartFired = false;
socket.on('joined', ({ roomId }) => {
  myRoomId = roomId;

  if (_hostHandoff && !_hostStartFired && !playingPhase.classList.contains('active')) {
    _hostStartFired = true;
    setTimeout(() => socket.emit('tv_20q_start'), 400);
    return;
  }

  const joinUrl = `${location.origin}/tv-join?game=tv-20-questions&room=${roomId}`;
  joinUrlEl.textContent = joinUrl;

  qrContainer.innerHTML = '';
  new QRCode(qrContainer, {
    text: joinUrl,
    width: 200, height: 200, correctLevel: QRCode.CorrectLevel.H
  });
});

// ── Room update (lobby) ──────────────────────────────────────────────────────
socket.on('room_update', ({ players }) => {
  const phonePlayers = players.filter(p => p.color !== 'tv-host');
  renderLobbyPlayers(phonePlayers);
  startBtn.disabled = phonePlayers.filter(p => p.connected).length < 1;
});

// ── Game started ─────────────────────────────────────────────────────────────
socket.on('game_started', (state) => {
  gameState = state;
  switchPhase('playing');
  applyState(state);
  speak(`The category is: ${state.category}. Ask your questions!`);
});

// ── Game state update ────────────────────────────────────────────────────────
socket.on('game_state', (state) => {
  if (state.gameType !== 'tv-20-questions') return;
  gameState = state;
  applyState(state);
});

// ── Question answered ────────────────────────────────────────────────────────
socket.on('tv_20q_answer', (data) => {
  const { askerName, question, answer } = data;
  let answerText;
  if (answer === 'yes') answerText = 'Yes!';
  else if (answer === 'no') answerText = 'No!';
  else if (answer === 'hint' && data.hint) answerText = data.hint;
  else answerText = "I'm not sure.";
  speak(`${askerName} asks: ${question}. ${answerText}`);
});

// ── Rephrase prompt (not a yes/no question) ─────────────────────────────────
socket.on('tv_20q_rephrase_tv', (data) => {
  const { askerName, question } = data;
  speak(`${askerName}, that question would give away the answer! Try asking something else.`);
});

// ── Guess result ─────────────────────────────────────────────────────────────
socket.on('tv_20q_guess_result', (data) => {
  const { guesserName, guess, correct } = data;
  if (correct) {
    speak(`${guesserName} guessed ${guess}. That's correct!`);
  } else {
    speak(`${guesserName} guessed ${guess}. That's not it!`);
  }
});

// ── Game over ────────────────────────────────────────────────────────────────
socket.on('game_over', ({ winner, answer, reason }) => {
  gameoverAnswerEl.textContent = answer || '???';
  gameoverWinnerEl.textContent = winner ? winner : '';
  gameoverReasonEl.textContent = reason || '';

  setTimeout(() => {
    switchPhase('gameover');
    if (winner) {
      launchTvConfetti();
      playTvVictorySound();
      speakWinner(winner, answer);
    } else {
      speak(`The answer was ${answer}. Nobody guessed it!`);
    }
  }, 1500);
});

// ── Play again ───────────────────────────────────────────────────────────────
socket.on('play_again', () => {
  gameState = null;
  qaListEl.innerHTML = '<div class="tv-qa-empty">Ask your first question on your phone!</div>';
  const confettiEl = document.getElementById('confettiContainer');
  if (confettiEl) { confettiEl.classList.add('hidden'); confettiEl.innerHTML = ''; }
  switchPhase('lobby');
});

socket.on('error', ({ message }) => {
  console.error('Server error:', message);
});

// ── Button handlers ──────────────────────────────────────────────────────────
startBtn.addEventListener('click', () => {
  startBtn.disabled = true;
  socket.emit('tv_20q_start');
});

giveUpBtn.addEventListener('click', () => {
  socket.emit('tv_20q_give_up');
});

playAgainBtn.addEventListener('click', () => {
  socket.emit('play_again');
  setTimeout(function(){ location.replace('/tv-lobby?game=tv-20-questions' + (myRoomId ? '&room=' + myRoomId : '')); }, 60);
});

// ── Phase switching ──────────────────────────────────────────────────────────
function switchPhase(newPhase) {
  phase = newPhase;
  lobbyPhase.classList.toggle('active', newPhase === 'lobby');
  playingPhase.classList.toggle('active', newPhase === 'playing');
  gameoverPhase.classList.toggle('active', newPhase === 'gameover');
}

// ── Lobby player list ────────────────────────────────────────────────────────
function renderLobbyPlayers(players) {
  if (players.length === 0) {
    lobbyPlayerList.innerHTML = '<div class="tv-player-empty">Waiting for players...</div>';
    return;
  }
  lobbyPlayerList.innerHTML = '';
  players.forEach((p, i) => {
    const div = document.createElement('div');
    div.className = 'tv-player-item';
    div.textContent = `${i + 1}. ${escHtml(p.name)}`;
    if (!p.connected) div.style.opacity = '0.5';
    lobbyPlayerList.appendChild(div);
  });
}

// ── Apply full game state ────────────────────────────────────────────────────
function applyState(state) {
  if (!state) return;

  // Category badge
  categoryBadgeEl.textContent = `Category: ${state.category}`;

  // Question counter
  questionCountEl.textContent = `${state.questionsUsed} / ${state.maxQuestions} questions`;

  // Build Q&A list
  const questions = state.questionsAsked || [];
  if (questions.length === 0) {
    qaListEl.innerHTML = '<div class="tv-qa-empty">Ask your first question on your phone!</div>';
  } else {
    qaListEl.innerHTML = '';
    let qNum = 0;
    questions.forEach((q) => {
      const item = document.createElement('div');
      item.className = 'tv-qa-item';

      // Number (only for actual questions, not guesses)
      const numEl = document.createElement('div');
      numEl.className = 'tv-qa-number';
      if (!q.isGuess && q.answer !== 'unsure') {
        qNum++;
        numEl.textContent = `Q${qNum}`;
      } else if (q.isGuess) {
        numEl.textContent = '\u{1F3AF}'; // dart emoji for guesses
      } else {
        numEl.textContent = '?';
      }

      // Asker name
      const askerEl = document.createElement('div');
      askerEl.className = 'tv-qa-asker';
      const player = (state.players || []).find(p => p.seat === q.seat);
      askerEl.textContent = player ? escHtml(player.name) : `P${q.seat + 1}`;

      // Question text
      const textEl = document.createElement('div');
      textEl.className = 'tv-qa-text';
      textEl.textContent = q.text;

      // Answer badge
      const answerEl = document.createElement('div');
      answerEl.className = 'tv-qa-answer ' + q.answer;
      if (q.answer === 'yes') answerEl.textContent = 'YES';
      else if (q.answer === 'no') answerEl.textContent = 'NO';
      else if (q.answer === 'hint') answerEl.textContent = '💡 ' + (q.hint || 'HINT');
      else if (q.answer === 'unsure') answerEl.textContent = 'UNSURE';
      else if (q.answer === 'correct') answerEl.textContent = 'CORRECT!';
      else if (q.answer === 'wrong-guess') answerEl.textContent = 'WRONG';

      // Style hint answers differently
      if (q.answer === 'hint') {
        answerEl.style.cssText = 'color:#1155cc;font-size:1.1em;max-width:400px;text-align:right;';
      }

      item.appendChild(numEl);
      item.appendChild(askerEl);
      item.appendChild(textEl);
      item.appendChild(answerEl);
      qaListEl.appendChild(item);
    });

    // Auto-scroll to bottom
    qaListEl.scrollTop = qaListEl.scrollHeight;
  }

  // Players strip
  renderPlayersStrip(state.players);
}

// ── Players strip ────────────────────────────────────────────────────────────
function renderPlayersStrip(players) {
  playersStripEl.innerHTML = '';
  (players || []).forEach(p => {
    if (p.color === 'tv-host') return;
    const chip = document.createElement('div');
    chip.className = 'tv-player-chip';
    chip.innerHTML = `<span class="tv-player-name">${escHtml(p.name)}</span>`;
    playersStripEl.appendChild(chip);
  });
}

// ── Text-to-speech ───────────────────────────────────────────────────────────
// Pick a natural-sounding English voice (prefer Google/premium voices)
let preferredVoice = null;

function loadVoice() {
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return;

  // Priority order: Google UK Female, Google US Female, Samantha, Karen, any English female
  const preferred = [
    'Google UK English Female',
    'Google US English',
    'Samantha',        // macOS
    'Karen',           // macOS Australian
    'Daniel',          // macOS British
    'Moira',           // macOS Irish
    'Tessa',           // macOS South African
  ];

  for (const name of preferred) {
    const v = voices.find(v => v.name === name);
    if (v) { preferredVoice = v; return; }
  }

  // Fallback: any English voice
  preferredVoice = voices.find(v => v.lang && v.lang.startsWith('en')) || null;
}

if ('speechSynthesis' in window) {
  loadVoice();
  window.speechSynthesis.onvoiceschanged = loadVoice;
}

function speak(text) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  if (preferredVoice) utterance.voice = preferredVoice;
  utterance.rate = 0.95;   // slightly slower for clarity
  utterance.pitch = 1.05;  // slightly higher for warmth
  utterance.volume = 1.0;
  window.speechSynthesis.speak(utterance);
}

function speakWinner(winnerName, answer) {
  if (!('speechSynthesis' in window) || !winnerName) return;
  setTimeout(() => {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(
      `The answer was ${answer}! Congratulations ${winnerName}, you guessed it!`
    );
    if (preferredVoice) utterance.voice = preferredVoice;
    utterance.rate = 0.9;
    utterance.pitch = 1.15;  // slightly excited
    utterance.volume = 1.0;
    window.speechSynthesis.speak(utterance);
  }, 1500);
}

// ── TV Confetti ──────────────────────────────────────────────────────────────
function launchTvConfetti() {
  const container = document.getElementById('confettiContainer');
  if (!container) return;
  container.classList.remove('hidden');
  container.innerHTML = '';

  const colors = ['#ffd700', '#ff6b6b', '#4ecca3', '#1155cc', '#7d3c98', '#ff9f43', '#ee5a24', '#00d2d3'];
  const shapes = ['circle', 'square'];

  for (let i = 0; i < 150; i++) {
    const piece = document.createElement('div');
    piece.className = 'tv-confetti-piece';
    const color = colors[Math.floor(Math.random() * colors.length)];
    const shape = shapes[Math.floor(Math.random() * shapes.length)];
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.background = color;
    piece.style.animationDelay = `${Math.random() * 3}s`;
    piece.style.animationDuration = `${3 + Math.random() * 3}s`;
    if (shape === 'circle') piece.style.borderRadius = '50%';
    const size = 10 + Math.random() * 15;
    piece.style.width = `${size}px`;
    piece.style.height = `${size}px`;
    container.appendChild(piece);
  }

  setTimeout(() => {
    container.classList.add('hidden');
    container.innerHTML = '';
  }, 8000);
}

// ── TV Victory Sound (Web Audio API) ─────────────────────────────────────────
function playTvVictorySound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const notes = [523.25, 659.25, 783.99, 1046.50];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.4, ctx.currentTime + i * 0.18);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + i * 0.18 + 0.5);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.18);
      osc.stop(ctx.currentTime + i * 0.18 + 0.6);
    });

    setTimeout(() => {
      const chord = [261.63, 329.63, 392.00, 523.25, 659.25];
      chord.forEach(freq => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.25, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 1.2);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 1.5);
      });
    }, 800);
  } catch (e) {
    // Audio not available
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
