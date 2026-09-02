'use strict';

(function () {
  // ── URL params ──────────────────────────────────────────────────────
  const params = new URLSearchParams(window.location.search);
  const roomId = params.get('room');
  const myColor = params.get('color');
  const myName = params.get('name') || '';
  const gameId = params.get('game') || 'ludo';

  // ── DOM refs ────────────────────────────────────────────────────────
  const statusBar = document.getElementById('statusBar');
  const waitingOverlay = document.getElementById('waitingOverlay');
  const waitingMsg = document.getElementById('waitingMsg');
  const gameUI = document.getElementById('gameUI');
  const ludoPlayers = document.getElementById('ludoPlayers');
  const ludoStatus = document.getElementById('ludoStatus');
  const ludoDice = document.getElementById('ludoDice');
  const rollBtn = document.getElementById('rollBtn');
  const canvas = document.getElementById('ludoCanvas');
  const ctx = canvas.getContext('2d');
  const gameoverOverlay = document.getElementById('gameoverOverlay');
  const gameoverTitle = document.getElementById('gameoverTitle');
  const gameoverMsg = document.getElementById('gameoverMsg');
  const playAgainBtn = document.getElementById('playAgainBtn');
  const reconnectOverlay = document.getElementById('reconnectOverlay');

  // ── Game state ──────────────────────────────────────────────────────
  let state = null;
  let mySeat = -1;
  let validMoves = [];
  const COLORS = ['red', 'blue', 'green', 'yellow'];
  const COLOR_HEX = { red: '#D32F2F', blue: '#1565C0', green: '#2E7D32', yellow: '#F9A825' };
  const COLOR_LIGHT = { red: '#FFCDD2', blue: '#BBDEFB', green: '#C8E6C9', yellow: '#FFF9C4' };
  const SAFE_SQUARES = [0, 8, 13, 21, 26, 34, 39, 47];

  // ── Board geometry ──────────────────────────────────────────────────
  // The Ludo board is a 15x15 grid. Each cell is 40px on the 600px canvas.
  const CELL = 40;

  // Track square coordinates (0-51) mapped to grid [col, row]
  // The track goes clockwise starting from red's entry area
  const TRACK_COORDS = buildTrackCoords();

  function buildTrackCoords() {
    // 52 squares clockwise. Grid is 15x15, columns 6-8 and rows 6-8 are the center cross.
    // Format: [col, row] on the 15x15 grid
    // Square 0 = Red start (bottom-center, going up)
    const coords = [
      // 0-4: Red going up (col 6, rows 13→9)
      [6,13],[6,12],[6,11],[6,10],[6,9],
      // 5-10: Turn left along row 8 (cols 5→0)
      [5,8],[4,8],[3,8],[2,8],[1,8],[0,8],
      // 11-12: Up then right (col 0 row 7, col 0 row 6)
      [0,7],[0,6],
      // 13-17: Blue going right (row 6, cols 1→5)
      [1,6],[2,6],[3,6],[4,6],[5,6],
      // 18-22: Turn up along col 6 (rows 5→1)
      [6,5],[6,4],[6,3],[6,2],[6,1],
      // 23-24: Right then down (col 6 row 0, col 7 row 0)
      [6,0],[7,0],
      // 25-26: Down then right (col 8 row 0, col 8 row 1)
      [8,0],[8,1],
      // 27-30: Green going down (col 8, rows 2→5)
      [8,2],[8,3],[8,4],[8,5],
      // 31-36: Turn right along row 6 (cols 9→14)
      [9,6],[10,6],[11,6],[12,6],[13,6],[14,6],
      // 37-38: Down then left (col 14 row 7, col 14 row 8)
      [14,7],[14,8],
      // 39-43: Yellow going left (row 8, cols 13→9)
      [13,8],[12,8],[11,8],[10,8],[9,8],
      // 44-48: Turn down along col 8 (rows 9→13)
      [8,9],[8,10],[8,11],[8,12],[8,13],
      // 49-50: Left then up (col 8 row 14, col 7 row 14)
      [8,14],[7,14],
      // 51: Back to just before Red start (col 6 row 14)
      [6,14]
    ];
    return coords;
  }

  // Home column coordinates for each player (6 squares each, index 0-5)
  const HOME_COORDS = [
    // Red: goes up the center column from bottom
    [[7,13],[7,12],[7,11],[7,10],[7,9],[7,8]],
    // Blue: goes right from left
    [[1,7],[2,7],[3,7],[4,7],[5,7],[6,7]],
    // Green: goes down from top
    [[7,1],[7,2],[7,3],[7,4],[7,5],[7,6]],
    // Yellow: goes left from right
    [[13,7],[12,7],[11,7],[10,7],[9,7],[8,7]]
  ];

  // Base positions for each player (4 tokens in 2x2 grid)
  const BASE_COORDS = [
    // Red: bottom-left
    [[2,11],[4,11],[2,13],[4,13]],
    // Blue: top-left
    [[2,1],[4,1],[2,3],[4,3]],
    // Green: top-right
    [[10,1],[12,1],[10,3],[12,3]],
    // Yellow: bottom-right
    [[10,11],[12,11],[10,13],[12,13]]
  ];

  const BASE_BG = [
    // Background rect for each base quadrant [x, y, w, h] in grid units
    [0, 9, 6, 6],   // Red bottom-left
    [0, 0, 6, 6],   // Blue top-left
    [9, 0, 6, 6],   // Green top-right
    [9, 9, 6, 6]    // Yellow bottom-right
  ];

  // ── Socket ──────────────────────────────────────────────────────────
  const socket = io();

  socket.on('connect', () => {
    reconnectOverlay.classList.remove('visible');
    if (roomId) {
      socket.emit('join_game', {
        roomId: roomId,
        playerName: myName,
        gameType: gameId
      });
    }
  });

  socket.on('disconnect', () => {
    reconnectOverlay.classList.add('visible');
  });

  socket.on('joined', ({ color }) => {
    mySeat = COLORS.indexOf(color);
    statusBar.textContent = `You are ${color.charAt(0).toUpperCase() + color.slice(1)}`;
  });

  socket.on('room_update', ({ players }) => {
    const count = players.filter(p => p.connected).length;
    waitingMsg.textContent = `${count} player${count !== 1 ? 's' : ''} connected. Waiting for host to start…`;
  });

  socket.on('game_started', (data) => {
    state = data;
    mySeat = findMySeat(data.players);
    waitingOverlay.classList.add('hidden');
    gameUI.classList.remove('hidden');
    validMoves = [];
    renderAll();
  });

  socket.on('game_state', (data) => {
    if (data.gameType !== 'ludo') return;
    state = data;
    if (mySeat < 0) mySeat = findMySeat(data.players);
    waitingOverlay.classList.add('hidden');
    gameUI.classList.remove('hidden');
    renderAll();
  });

  socket.on('ludo_roll_result', (data) => {
    // data: { diceValue, validMoves, autoPass, consecutiveSixes, forfeited }
    ludoDice.textContent = data.diceValue;
    ludoDice.classList.add('rolling');
    setTimeout(() => ludoDice.classList.remove('rolling'), 400);

    if (data.forfeited) {
      ludoStatus.textContent = 'Three 6s in a row! Turn forfeited.';
      validMoves = [];
    } else if (data.autoPass) {
      ludoStatus.textContent = `Rolled ${data.diceValue} — no valid moves.`;
      validMoves = [];
    } else {
      validMoves = data.validMoves || [];
      if (validMoves.length > 0) {
        ludoStatus.textContent = `Rolled ${data.diceValue} — tap a token to move.`;
      }
    }
    renderAll();
  });

  socket.on('ludo_move_result', (data) => {
    // data: { ok, state, captured, ... }
    if (data.state) {
      state = data.state;
      validMoves = [];
      renderAll();
    }
    if (data.captured) {
      ludoStatus.textContent = 'Captured an opponent!';
    }
  });

  socket.on('ludo_state_update', (data) => {
    state = data;
    validMoves = [];
    renderAll();
  });

  socket.on('game_over', ({ winner, reason }) => {
    gameoverTitle.textContent = 'Game Over!';
    gameoverMsg.textContent = reason || `${winner} wins!`;
    gameoverOverlay.classList.add('visible');
  });

  socket.on('error', ({ message }) => {
    statusBar.textContent = message;
  });

  // ── Button handlers ─────────────────────────────────────────────────
  rollBtn.addEventListener('click', () => {
    rollBtn.disabled = true;
    socket.emit('ludo_roll');
  });

  playAgainBtn.addEventListener('click', () => {
    window.location.href = '/';
  });

  // ── Canvas click/tap → token selection ──────────────────────────────
  canvas.addEventListener('click', handleCanvasClick);
  canvas.addEventListener('touchend', (e) => {
    e.preventDefault();
    const touch = e.changedTouches[0];
    const rect = canvas.getBoundingClientRect();
    const scale = canvas.width / rect.width;
    const x = (touch.clientX - rect.left) * scale;
    const y = (touch.clientY - rect.top) * scale;
    handleClick(x, y);
  });

  function handleCanvasClick(e) {
    const rect = canvas.getBoundingClientRect();
    const scale = canvas.width / rect.width;
    const x = (e.clientX - rect.left) * scale;
    const y = (e.clientY - rect.top) * scale;
    handleClick(x, y);
  }

  function handleClick(x, y) {
    if (!state || validMoves.length === 0) return;
    if (state.currentSeat !== mySeat) return;

    // Find which token was clicked
    const myTokens = state.tokens[mySeat];
    let bestDist = Infinity;
    let bestIdx = -1;

    for (const idx of validMoves) {
      const pos = myTokens[idx];
      const [px, py] = tokenPixelPos(mySeat, idx, pos);
      const dist = Math.hypot(x - px, y - py);
      if (dist < 28 && dist < bestDist) {
        bestDist = dist;
        bestIdx = idx;
      }
    }

    if (bestIdx >= 0) {
      socket.emit('ludo_move', { tokenIndex: bestIdx });
      validMoves = [];
      renderAll();
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────────
  function findMySeat(players) {
    if (!players) return -1;
    for (let i = 0; i < players.length; i++) {
      if (players[i].color === myColor) return players[i].seat !== undefined ? players[i].seat : i;
    }
    return -1;
  }

  function escHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ── Rendering ───────────────────────────────────────────────────────
  function renderAll() {
    if (!state) return;
    renderPlayers();
    renderBoard();
    updateControls();
  }

  function renderPlayers() {
    ludoPlayers.innerHTML = '';
    if (!state.players) return;
    state.players.forEach((p, i) => {
      const div = document.createElement('div');
      div.className = 'ludo-player' + (state.currentSeat === (p.seat !== undefined ? p.seat : i) ? ' active' : '');
      const dot = document.createElement('span');
      dot.className = 'ludo-player-dot c-' + p.color;
      const name = document.createElement('span');
      const finished = countFinished(p.seat !== undefined ? p.seat : i);
      name.textContent = `${escHtml(p.name)} (${finished}/4)`;
      div.appendChild(dot);
      div.appendChild(name);
      ludoPlayers.appendChild(div);
    });
  }

  function countFinished(seat) {
    if (!state || !state.tokens || !state.tokens[seat]) return 0;
    return state.tokens[seat].filter(t => t.zone === 'finished').length;
  }

  function updateControls() {
    const isMyTurn = state.currentSeat === mySeat;
    const isRollPhase = state.phase === 'roll';

    rollBtn.disabled = !(isMyTurn && isRollPhase);

    if (!isMyTurn) {
      const currentPlayer = state.players.find((p, i) => (p.seat !== undefined ? p.seat : i) === state.currentSeat);
      ludoStatus.textContent = currentPlayer ? `${currentPlayer.name}'s turn` : 'Waiting…';
    } else if (isRollPhase) {
      ludoStatus.textContent = 'Your turn — roll the dice!';
    } else if (validMoves.length > 0) {
      ludoStatus.textContent = 'Tap a highlighted token to move.';
    }

    if (state.diceValue != null) {
      ludoDice.textContent = state.diceValue;
    } else {
      ludoDice.textContent = '-';
    }
  }

  // ── Board drawing ───────────────────────────────────────────────────
  function renderBoard() {
    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    // Background
    ctx.fillStyle = '#f5f0e8';
    ctx.fillRect(0, 0, W, H);

    // Draw base quadrants
    for (let s = 0; s < state.playerCount; s++) {
      const [bx, by, bw, bh] = BASE_BG[s];
      ctx.fillStyle = COLOR_LIGHT[COLORS[s]];
      ctx.fillRect(bx * CELL, by * CELL, bw * CELL, bh * CELL);
      ctx.strokeStyle = COLOR_HEX[COLORS[s]];
      ctx.lineWidth = 2;
      ctx.strokeRect(bx * CELL, by * CELL, bw * CELL, bh * CELL);
    }

    // Draw center (home)
    ctx.fillStyle = '#e0e0e0';
    ctx.fillRect(6 * CELL, 6 * CELL, 3 * CELL, 3 * CELL);

    // Draw center triangles (finish areas)
    for (let s = 0; s < 4; s++) {
      ctx.fillStyle = COLOR_LIGHT[COLORS[s]];
      ctx.beginPath();
      if (s === 0) { // Red - bottom
        ctx.moveTo(6 * CELL, 9 * CELL);
        ctx.lineTo(9 * CELL, 9 * CELL);
        ctx.lineTo(7.5 * CELL, 7.5 * CELL);
      } else if (s === 1) { // Blue - left
        ctx.moveTo(6 * CELL, 6 * CELL);
        ctx.lineTo(6 * CELL, 9 * CELL);
        ctx.lineTo(7.5 * CELL, 7.5 * CELL);
      } else if (s === 2) { // Green - top
        ctx.moveTo(6 * CELL, 6 * CELL);
        ctx.lineTo(9 * CELL, 6 * CELL);
        ctx.lineTo(7.5 * CELL, 7.5 * CELL);
      } else { // Yellow - right
        ctx.moveTo(9 * CELL, 6 * CELL);
        ctx.lineTo(9 * CELL, 9 * CELL);
        ctx.lineTo(7.5 * CELL, 7.5 * CELL);
      }
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = COLOR_HEX[COLORS[s]];
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Draw track squares
    for (let i = 0; i < 52; i++) {
      const [col, row] = TRACK_COORDS[i];
      const x = col * CELL;
      const y = row * CELL;
      const isSafe = SAFE_SQUARES.includes(i);

      // Color start squares
      let fill = '#fff';
      if (i === 0) fill = COLOR_LIGHT.red;
      else if (i === 13) fill = COLOR_LIGHT.blue;
      else if (i === 26) fill = COLOR_LIGHT.green;
      else if (i === 39) fill = COLOR_LIGHT.yellow;
      else if (isSafe) fill = '#f0f0f0';

      ctx.fillStyle = fill;
      ctx.fillRect(x, y, CELL, CELL);
      ctx.strokeStyle = '#bbb';
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, CELL, CELL);

      // Star on safe squares
      if (isSafe) {
        ctx.fillStyle = '#ccc';
        ctx.font = '16px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('★', x + CELL / 2, y + CELL / 2);
      }
    }

    // Draw home columns
    for (let s = 0; s < state.playerCount; s++) {
      for (let i = 0; i < 6; i++) {
        const [col, row] = HOME_COORDS[s][i];
        const x = col * CELL;
        const y = row * CELL;
        ctx.fillStyle = COLOR_LIGHT[COLORS[s]];
        ctx.fillRect(x, y, CELL, CELL);
        ctx.strokeStyle = COLOR_HEX[COLORS[s]];
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, CELL, CELL);
      }
    }

    // Draw tokens
    for (let s = 0; s < state.playerCount; s++) {
      const tokens = state.tokens[s];
      if (!tokens) continue;
      for (let t = 0; t < tokens.length; t++) {
        const tok = tokens[t];
        if (tok.zone === 'finished') continue;
        const [px, py] = tokenPixelPos(s, t, tok);
        const isMovable = s === mySeat && validMoves.includes(t);
        drawToken(px, py, COLORS[s], t + 1, isMovable);
      }
    }
  }

  function tokenPixelPos(seat, tokenIdx, tok) {
    if (tok.zone === 'base') {
      const [col, row] = BASE_COORDS[seat][tokenIdx];
      return [col * CELL + CELL / 2, row * CELL + CELL / 2];
    } else if (tok.zone === 'track') {
      const [col, row] = TRACK_COORDS[tok.square];
      // Offset slightly if multiple tokens on same square
      const offset = getStackOffset(seat, tokenIdx, tok);
      return [col * CELL + CELL / 2 + offset[0], row * CELL + CELL / 2 + offset[1]];
    } else if (tok.zone === 'home') {
      const [col, row] = HOME_COORDS[seat][tok.square];
      return [col * CELL + CELL / 2, row * CELL + CELL / 2];
    }
    return [0, 0];
  }

  function getStackOffset(seat, tokenIdx, tok) {
    // Count how many of this player's tokens are on the same square and zone
    let count = 0;
    let myOrder = 0;
    const tokens = state.tokens[seat];
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].zone === tok.zone && tokens[i].square === tok.square) {
        if (i < tokenIdx) myOrder++;
        count++;
      }
    }
    if (count <= 1) return [0, 0];
    const offsets = [[-6, -6], [6, -6], [-6, 6], [6, 6]];
    return offsets[myOrder] || [0, 0];
  }

  function drawToken(x, y, color, num, highlight) {
    const r = 14;
    // Glow for movable tokens
    if (highlight) {
      ctx.beginPath();
      ctx.arc(x, y, r + 6, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(17, 85, 204, 0.35)';
      ctx.fill();
    }
    // Token circle
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = COLOR_HEX[color];
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    // Number
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(num, x, y);
  }
})();
