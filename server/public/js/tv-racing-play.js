'use strict';

// ── URL params ──────────────────────────────────────────────────────────
const params = new URLSearchParams(window.location.search);
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


if (!roomId) {
  document.getElementById('joinError').textContent = 'No room specified. Scan the QR code from the TV.';
}

const PLAYER_COLORS = [
  '#e74c3c', '#3498db', '#2ecc71', '#f39c12',
  '#9b59b6', '#1abc9c', '#e67e22', '#e91e63',
];

const TV_RACING_COLORS = ['tv-host', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'];

function seatForColor(color) {
  if (color === 'tv-host') return -1;
  const idx = TV_RACING_COLORS.indexOf(color);
  return idx > 0 ? idx - 1 : -1;
}

// ── DOM refs ────────────────────────────────────────────────────────────
const joinScreen   = document.getElementById('joinScreen');
const waitScreen   = document.getElementById('waitScreen');
const raceScreen   = document.getElementById('raceScreen');
const resultScreen = document.getElementById('resultScreen');
const nameInput    = document.getElementById('nameInput');
const joinBtn      = document.getElementById('joinBtn');
const joinError    = document.getElementById('joinError');
const waitColor    = document.getElementById('waitColor');
const hudPosition  = document.getElementById('hudPosition');
const hudLap       = document.getElementById('hudLap');
const hudSpeed     = document.getElementById('hudSpeed');
const btnLeft      = document.getElementById('btnLeft');
const btnRight     = document.getElementById('btnRight');
const btnBrake     = document.getElementById('btnBrake');
const resultBadge    = document.getElementById('resultBadge');
const resultBadgeSvg = document.getElementById('resultBadgeSvg');
const resultTitle    = document.getElementById('resultTitle');
const resultPos      = document.getElementById('resultPosition');
const resultMsg      = document.getElementById('resultMsg');
const resultBack     = document.getElementById('resultBackBtn');
const hudSpeedBar    = document.getElementById('hudSpeedBar');

// ── State ───────────────────────────────────────────────────────────────
let myColor = _autoJoinHandoff ? _autoJoinHandoff.color : null;
let mySeat = (_autoJoinHandoff ? (['tv-host','p1','p2','p3','p4','p5','p6','p7','p8'].indexOf(_autoJoinHandoff.color) > 0 ? ['tv-host','p1','p2','p3','p4','p5','p6','p7','p8'].indexOf(_autoJoinHandoff.color) - 1 : -1) : -1);
let myName = _autoJoinHandoff ? _autoJoinHandoff.name : '';
let currentSteer = 'none';
let isBraking = false;

// ── Socket ──────────────────────────────────────────────────────────────
const socket = io({ reconnectionAttempts: 5, reconnectionDelay: 1000 });

// ── Autojoin: jump straight to waiting screen ──────────────────────────────
if (_autoJoinHandoff) {
  showScreen(waitScreen);
}

// ── Session persistence ─────────────────────────────────────────────────
function saveSession() {
  try {
    sessionStorage.setItem('tv-racing-session', JSON.stringify({
      myName, myColor, mySeat, roomId, ts: Date.now()
    }));
  } catch (_) {}
}

function restoreSession() {
  try {
    const data = JSON.parse(sessionStorage.getItem('tv-racing-session') || 'null');
    if (data && data.roomId === roomId && Date.now() - data.ts < 30 * 60_000) {
      myName = data.myName;
      myColor = data.myColor;
      mySeat = data.mySeat;
      return true;
    }
  } catch (_) {}
  return false;
}

// ── Screen management ───────────────────────────────────────────────────
function showScreen(screen) {
  [joinScreen, waitScreen, raceScreen, resultScreen].forEach(s => s.classList.remove('active'));
  screen.classList.add('active');
}

// ── Join flow ───────────────────────────────────────────────────────────
socket.on('connect', () => {
  if (restoreSession() && myName) {
    socket.emit('join_game', {
      roomId,
      playerName: myName,
      reconnect: true,
      gameType: 'tv-racing',
    });
  } else if (_autoJoinHandoff && roomId && myName) {
    socket.emit('join_game', {
      roomId,
      playerName: myName,
      reconnect: true,
      gameType: 'tv-racing',
    });
  }
});

joinBtn.addEventListener('click', () => {
  const name = nameInput.value.trim();
  if (!name) {
    joinError.textContent = 'Please enter your name.';
    return;
  }
  myName = name;
  joinBtn.disabled = true;
  joinError.textContent = '';
  socket.emit('join_game', {
    roomId,
    playerName: name,
    gameType: 'tv-racing',
  });
});

nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') joinBtn.click(); });

socket.on('joined', ({ color }) => {
  myColor = color;
  mySeat = seatForColor(color);
  saveSession();

  if (color === 'tv-host') {
    joinError.textContent = 'This page is for players, not the TV host.';
    return;
  }

  const colorIdx = mySeat >= 0 ? mySeat : 0;
  waitColor.innerHTML = `You are <span class="color-badge" style="background:${PLAYER_COLORS[colorIdx]}"></span> Player ${mySeat + 1}`;
  showScreen(waitScreen);
});

socket.on('error', ({ message }) => {
  joinError.textContent = message;
  joinBtn.disabled = false;
});

// ── Game events ─────────────────────────────────────────────────────────
socket.on('game_started', (state) => {
  if (state.gameType !== 'tv-racing') return;
  showScreen(raceScreen);
  updateHUD(state);
});

socket.on('game_state', (state) => {
  if (state.gameType !== 'tv-racing') return;
  if (!raceScreen.classList.contains('active')) showScreen(raceScreen);
  updateHUD(state);
});

socket.on('racing_lap', ({ lap, totalLaps }) => {
  try { navigator.vibrate([60, 40, 60]); } catch (_) {}
  const hud = document.querySelector('.race-hud');
  if (hud) {
    hud.style.background = 'rgba(61,114,232,0.35)';
    setTimeout(() => { hud.style.background = ''; }, 500);
  }
  // Show lap flash
  const flash = document.getElementById('lapFlash');
  if (flash) {
    flash.textContent = lap >= totalLaps ? 'FINAL LAP!' : `LAP ${lap + 1}`;
    flash.classList.add('show');
    setTimeout(() => flash.classList.remove('show'), 1500);
  }
});

socket.on('racing_finished', ({ finishOrder }) => {
  try { navigator.vibrate([100, 60, 100, 60, 200]); } catch (_) {}
  const flash = document.getElementById('lapFlash');
  if (flash) {
    flash.textContent = finishOrder === 1 ? '🏆 FINISHED!' : `P${finishOrder} FINISHED!`;
    flash.classList.add('show');
  }
});

socket.on('game_over', ({ winner, reason, positions }) => {
  showGameOver(winner, reason, positions);
});

socket.on('play_again', () => {
  currentSteer = 'none';
  isBraking = false;
  showScreen(waitScreen);
});

// ── HUD update ──────────────────────────────────────────────────────────
let prevLap = 0;
function updateHUD(state) {
  if (!state || !state.positions) return;
  const myPos = state.positions.find(p => p.seat === mySeat);
  if (myPos) {
    hudPosition.textContent = `P${myPos.rank}`;
  }
  const carData = state.cars?.[mySeat];
  if (carData) {
    const lap = carData.lap;
    hudLap.textContent = carData.finished ? 'DONE' : `LAP ${lap + 1}/${state.totalLaps}`;
    // Speed display + bar
    const speedKmh = Math.round((carData.speed || 0) * 0.6);
    hudSpeed.textContent = speedKmh;
    const speedPct = Math.min(100, (carData.speed || 0) / 210 * 100);
    hudSpeedBar.style.width = speedPct + '%';
    // Haptic + flash on lap change
    if (lap > prevLap) {
      try { navigator.vibrate([80, 50, 80]); } catch (_) {}
      // Brief green flash on HUD
      const hud = document.querySelector('.race-hud');
      if (hud) {
        hud.style.background = 'rgba(45,175,123,0.3)';
        setTimeout(() => { hud.style.background = ''; }, 400);
      }
    }
    prevLap = lap;

    // Position indicator color
    const posBox = document.querySelector('.hud-pos-box');
    if (posBox && myPos) {
      posBox.style.background = myPos.rank === 1 ? 'linear-gradient(135deg, #E07820, #d06810)'
        : myPos.rank === 2 ? 'linear-gradient(135deg, #94a3b8, #64748b)'
        : 'linear-gradient(135deg, #78716c, #57534e)';
    }
  }
}

// ── Steering controls ───────────────────────────────────────────────────
function startSteer(direction) {
  if (currentSteer === direction) return;
  currentSteer = direction;
  socket.emit('tv_racing_steer', { direction });
}

function stopSteer() {
  if (currentSteer === 'none') return;
  currentSteer = 'none';
  socket.emit('tv_racing_steer', { direction: 'none' });
}

// Brake controls
function startBrake() {
  if (isBraking) return;
  isBraking = true;
  socket.emit('tv_racing_brake', { braking: true });
}

function stopBrake() {
  if (!isBraking) return;
  isBraking = false;
  socket.emit('tv_racing_brake', { braking: false });
}

// ── Touch/mouse event binding helper ────────────────────────────────────
function bindControl(el, onStart, onEnd) {
  el.addEventListener('touchstart', e => { e.preventDefault(); onStart(); el.classList.add('pressed'); }, { passive: false });
  el.addEventListener('touchend', e => { e.preventDefault(); onEnd(); el.classList.remove('pressed'); }, { passive: false });
  el.addEventListener('touchcancel', e => { e.preventDefault(); onEnd(); el.classList.remove('pressed'); }, { passive: false });
  el.addEventListener('mousedown', () => { onStart(); el.classList.add('pressed'); });
  el.addEventListener('mouseup', () => { onEnd(); el.classList.remove('pressed'); });
  el.addEventListener('mouseleave', () => { onEnd(); el.classList.remove('pressed'); });
}

// Steering
bindControl(btnLeft,  () => startSteer('left'),  stopSteer);
bindControl(btnRight, () => startSteer('right'), stopSteer);

// Brake
bindControl(btnBrake, startBrake, stopBrake);

// ── Game over ───────────────────────────────────────────────────────────
function showGameOver(winnerName, reason, positions) {
  showScreen(resultScreen);

  const isWinner = winnerName === myName;
  const myResult = positions ? positions.find(p => p.name === myName) : null;
  const myRank = myResult ? myResult.rank : null;
  const rankLabels = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th'];

  resultBadge.className = 'result-badge ' + (isWinner ? 'win' : 'lose');
  resultBadgeSvg.setAttribute('stroke', isWinner ? '#E07820' : 'rgba(255,255,255,0.3)');
  resultTitle.textContent = isWinner ? 'You Win!' : 'Race Over!';
  resultPos.textContent = myRank ? rankLabels[myRank - 1] || `P${myRank}` : '';
  resultMsg.textContent = isWinner
    ? 'Congratulations! You crossed the line first!'
    : `${winnerName || 'Someone'} won the race!`;

  if (isWinner) {
    try { navigator.vibrate([200, 100, 200, 100, 400]); } catch (_) {}
  }
}

resultBack.addEventListener('click', () => {
  window.location.href = '/';
});

// ── Visibility handling ─────────────────────────────────────────────────
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && !socket.connected) {
    socket.connect();
  }
});
