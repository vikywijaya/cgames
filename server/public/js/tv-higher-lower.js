'use strict';

// ── URL params (host handoff from /tv-lobby) ────────────────────────────────
const _tvParams    = new URLSearchParams(location.search);
const _hostHandoff = _tvParams.get('host') === '1';
const _initialRoom = _tvParams.get('room');

// ── State ────────────────────────────────────────────────────────────────────
let myRoomId = _initialRoom || null;
let gameState = null;
let phase = 'lobby'; // 'lobby' | 'playing' | 'gameover'
const TOTAL_CARDS = 30;

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
const cardsRemainingEl = document.getElementById('cardsRemaining');
const heroNumberEl     = document.getElementById('heroNumber');
const turnIndicatorEl  = document.getElementById('turnIndicator');
const cardGridEl       = document.getElementById('cardGrid');
const playersStripEl   = document.getElementById('playersStrip');

// Game Over
const gameoverWinnerNameEl = document.getElementById('gameoverWinnerName');
const gameoverWinnerEl     = document.getElementById('gameoverWinner');
const playAgainBtn         = document.getElementById('playAgainBtn');

// ── Socket ───────────────────────────────────────────────────────────────────
const socket = io({
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  transports: ['websocket', 'polling']
});

// ── Hide lobby instantly when arriving via host-handoff ─────────────────────
if (_hostHandoff && lobbyPhase) lobbyPhase.classList.remove('active');

socket.on('connect', () => {
  reconnectOverlay.classList.add('hidden');
  socket.emit('join_game', {
    roomId: myRoomId || null,
    playerName: 'TV Display',
    gameType: 'tv-higher-lower',
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
    setTimeout(() => socket.emit('tv_hl_start'), 400);
    return;
  }
  const joinUrl = `${location.origin}/tv-join?game=tv-higher-lower&room=${roomId}`;
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
  buildCardGrid(state);
  applyState(state);
});

// ── Game state update ────────────────────────────────────────────────────────
socket.on('game_state', (state) => {
  if (state.gameType !== 'tv-higher-lower') return;
  gameState = state;
  applyState(state);
});

// ── Card revealed / result ───────────────────────────────────────────────────
socket.on('tv_hl_result', (data) => {
  // data: { seat, guesserName, direction, correct, revealedCard, previousCard, eliminatedName }
  const { guesserName, correct, revealedCard, eliminatedName } = data;

  // The newly revealed card goes at the next grid position
  // gameState still holds the OLD state (game_state arrives after tv_hl_result)
  const cardIndex = gameState ? gameState.revealed.length : 0;

  // Flip the card at the next grid position
  flipCard(cardIndex, revealedCard);

  // Announce the card
  speak(`The card is ${revealedCard}!`);

  // Show result overlay on card after a short delay for the flip
  setTimeout(() => {
    showCardResult(cardIndex, correct);

    if (correct) {
      speak(`${guesserName} guessed correctly!`);
    } else if (data.lostLife && !eliminatedName) {
      speak(`${guesserName} lost a life!`);
    } else if (eliminatedName) {
      speak(`${eliminatedName} is out!`);
    }
  }, 700);

  // Update hero number
  heroNumberEl.textContent = revealedCard;
  heroNumberEl.classList.remove('pop');
  void heroNumberEl.offsetWidth; // force reflow
  heroNumberEl.classList.add('pop');
});

// ── Game over ────────────────────────────────────────────────────────────────
socket.on('game_over', ({ winner, reason }) => {
  gameoverWinnerNameEl.textContent = winner || '';
  gameoverWinnerEl.textContent = reason || `Last one standing!`;

  // Delay so players can see the final card before the winner screen
  setTimeout(() => {
    switchPhase('gameover');
    launchTvConfetti();
    playTvVictorySound();
    speakWinner(winner);
  }, 3000);
});

// ── Play again ───────────────────────────────────────────────────────────────
socket.on('play_again', () => {
  gameState = null;
  heroNumberEl.textContent = '--';
  heroNumberEl.classList.remove('pop');
  cardGridEl.innerHTML = '';
  // Clean up confetti
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
  socket.emit('tv_hl_start');
});

playAgainBtn.addEventListener('click', () => {
  socket.emit('play_again');
  setTimeout(function(){ location.replace('/tv-lobby?game=tv-higher-lower' + (myRoomId ? '&room=' + myRoomId : '')); }, 60);
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

// ── Build the 6x5 card grid ─────────────────────────────────────────────────
function buildCardGrid(state) {
  cardGridEl.innerHTML = '';
  const cards = (state && state.cards) || [];

  for (let i = 0; i < TOTAL_CARDS; i++) {
    const card = document.createElement('div');
    card.className = 'tv-card';
    card.id = `card-${i}`;

    const inner = document.createElement('div');
    inner.className = 'tv-card-inner';

    // Back face (face-down)
    const back = document.createElement('div');
    back.className = 'tv-card-face tv-card-back';
    back.textContent = '?';

    // Front face (face-up) — number filled when revealed
    const front = document.createElement('div');
    front.className = 'tv-card-face tv-card-front';
    front.textContent = '';

    // Result overlay
    const result = document.createElement('div');
    result.className = 'tv-card-result';

    inner.appendChild(back);
    inner.appendChild(front);
    card.appendChild(inner);
    card.appendChild(result);
    cardGridEl.appendChild(card);
  }
}

// ── Flip a card to reveal its number ─────────────────────────────────────────
function flipCard(index, value) {
  const card = document.getElementById(`card-${index}`);
  if (!card) return;

  // Set the number and color class on the front face
  const front = card.querySelector('.tv-card-front');
  if (front) {
    front.textContent = value;
    // Apply color class based on value
    front.className = 'tv-card-face tv-card-front card-color-' + getColorClass(value);
  }

  // Trigger flip animation
  card.classList.add('flip-animate');
  card.classList.add('flipped');

  // Remove animation class after it completes
  setTimeout(() => {
    card.classList.remove('flip-animate');
  }, 700);
}

// ── Show result overlay on card ──────────────────────────────────────────────
function showCardResult(index, correct) {
  const card = document.getElementById(`card-${index}`);
  if (!card) return;

  const resultEl = card.querySelector('.tv-card-result');
  if (!resultEl) return;

  resultEl.textContent = correct ? '\u2713' : '\u2717';
  resultEl.className = 'tv-card-result ' + (correct ? 'correct' : 'wrong');

  // Reset after animation
  setTimeout(() => {
    resultEl.className = 'tv-card-result';
    resultEl.textContent = '';
  }, 1600);
}

// ── Get color class number based on card value ───────────────────────────────
// Maps actual card values to 1-30 color classes
// low=blue, mid=green/purple, high=red/orange
function getColorClass(value) {
  const num = Number(value);
  if (num <= 0 || isNaN(num)) return 15;
  if (num > 30) return 30;
  return num;
}

// ── Apply full game state ────────────────────────────────────────────────────
function applyState(state) {
  if (!state) return;

  // Cards remaining count
  const revealed = state.revealed || [];
  const remaining = state.cardsRemaining != null ? state.cardsRemaining : (TOTAL_CARDS - revealed.length);
  cardsRemainingEl.textContent = `${remaining} cards left`;

  // Reveal already-flipped cards (positions are sequential: 0, 1, 2, ...)
  revealed.forEach((value, index) => {
    const card = document.getElementById(`card-${index}`);
    if (card && !card.classList.contains('flipped')) {
      const front = card.querySelector('.tv-card-front');
      if (front) {
        front.textContent = value;
        front.className = 'tv-card-face tv-card-front card-color-' + getColorClass(value);
      }
      card.classList.add('flipped');
    }
  });

  // Highlight current card (the last revealed card)
  clearCurrentCardHighlight();
  if (revealed.length > 0) {
    const currentCardIndex = revealed.length - 1;
    const currentCard = document.getElementById(`card-${currentCardIndex}`);
    if (currentCard) {
      currentCard.classList.add('current-card');
    }
  }

  // Update hero number
  if (state.currentCard != null) {
    heroNumberEl.textContent = state.currentCard;
  }

  // Turn indicator — find current player name from players array
  const currentPlayer = (state.players || []).find(p => p.seat === state.currentSeat);
  if (currentPlayer && !state.isGameOver) {
    turnIndicatorEl.textContent = `${escHtml(currentPlayer.name)}'s turn`;
  } else if (state.isGameOver) {
    turnIndicatorEl.textContent = 'Game Over';
  } else {
    turnIndicatorEl.textContent = 'Waiting...';
  }

  // Player strip — pass alive array and lives for elimination/lives status
  renderPlayersStrip(state.players, state.currentSeat, state.alive, state.lives, state.startingLives);
}

// ── Clear current card highlight ─────────────────────────────────────────────
function clearCurrentCardHighlight() {
  const prev = cardGridEl.querySelector('.current-card');
  if (prev) prev.classList.remove('current-card');
}

// ── Players strip ────────────────────────────────────────────────────────────
function renderPlayersStrip(players, currentSeat, alive, lives, startingLives) {
  playersStripEl.innerHTML = '';
  (players || []).forEach(p => {
    if (p.color === 'tv-host') return; // skip TV display itself

    const chip = document.createElement('div');
    const isEliminated = alive ? (p.seat >= 0 && !alive[p.seat]) : false;
    const isCurrent = p.seat === currentSeat && !isEliminated;

    let chipClass = 'tv-player-chip';
    if (isEliminated) {
      chipClass += ' eliminated';
    } else if (isCurrent) {
      chipClass += ' alive current-turn';
    } else {
      chipClass += ' alive';
    }
    chip.className = chipClass;

    const nameSpan = `<span class="tv-player-name">${escHtml(p.name)}</span>`;
    // Show lives as hearts when players have multiple lives
    let livesHtml = '';
    if (startingLives > 1 && lives && p.seat >= 0) {
      const playerLives = lives[p.seat] || 0;
      const hearts = [];
      for (let i = 0; i < startingLives; i++) {
        hearts.push(i < playerLives ? '\u2764\uFE0F' : '\uD83D\uDDA4');
      }
      livesHtml = ` <span class="tv-player-lives">${hearts.join('')}</span>`;
    }

    if (isEliminated) {
      chip.innerHTML = `${nameSpan}${livesHtml} <span class="tv-player-status out-status">OUT</span>`;
    } else if (isCurrent) {
      chip.innerHTML = `${nameSpan}${livesHtml} <span class="tv-player-status">\u25C0 TURN</span>`;
    } else {
      chip.innerHTML = `${nameSpan}${livesHtml}`;
    }
    playersStripEl.appendChild(chip);
  });
}

// ── Text-to-speech ───────────────────────────────────────────────────────────
let preferredVoice = null;

function loadVoice() {
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return;
  const preferred = [
    'Google UK English Female', 'Google US English', 'Samantha',
    'Karen', 'Daniel', 'Moira', 'Tessa',
  ];
  for (const name of preferred) {
    const v = voices.find(v => v.name === name);
    if (v) { preferredVoice = v; return; }
  }
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
  utterance.rate = 0.95;
  utterance.pitch = 1.05;
  utterance.volume = 1.0;
  window.speechSynthesis.speak(utterance);
}

function speakWinner(winnerName) {
  if (!('speechSynthesis' in window) || !winnerName) return;
  setTimeout(() => {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(`Congratulations ${winnerName}! You are the winner!`);
    if (preferredVoice) utterance.voice = preferredVoice;
    utterance.rate = 0.9;
    utterance.pitch = 1.15;
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

  // Clean up after animation
  setTimeout(() => {
    container.classList.add('hidden');
    container.innerHTML = '';
  }, 8000);
}

// ── TV Victory Sound (Web Audio API) ─────────────────────────────────────────
function playTvVictorySound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();

    // Fanfare arpeggio: C5, E5, G5, C6 then full chord
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

    // Triumphant chord after arpeggio
    setTimeout(() => {
      const chord = [261.63, 329.63, 392.00, 523.25, 659.25]; // C4-E4-G4-C5-E5
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
    // Audio not available — silently fail
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
