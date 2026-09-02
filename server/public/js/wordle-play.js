'use strict';

(function () {
  // --- URL params ---
  const params = new URLSearchParams(window.location.search);
  const roomId = params.get('room');
  const isAutoJoin = params.get('autojoin') === '1';
  var myName = params.get('name') || '';

  // ── Autojoin handoff (from /tv-join) ──────────────────────────────────────
  if (isAutoJoin && roomId && !myName) {
    try {
      const _raw = sessionStorage.getItem(`caritahub_pending_join_${roomId}`);
      if (_raw) {
        const _d = JSON.parse(_raw);
        if (_d && _d.name && Date.now() - (_d.ts || 0) < 30 * 60 * 1000) {
          myName = _d.name;
        }
      }
    } catch (e) { /* ignore */ }
  }

  // --- Socket ---
  const socket = io();

  // --- Screens ---
  const joinScreen = document.getElementById('join-screen');
  const waitingScreen = document.getElementById('waiting-screen');
  const playingScreen = document.getElementById('playing-screen');
  const gameoverScreen = document.getElementById('gameover-screen');
  const statusMessage = document.getElementById('status-message');
  const gameoverMessage = document.getElementById('gameover-message');
  const gridEl = document.getElementById('grid');
  const keyboardEl = document.getElementById('keyboard');
  const nameInput = document.getElementById('nameInput');
  const joinBtn = document.getElementById('joinBtn');
  const joinError = document.getElementById('joinError');
  const waitingNameEl = document.getElementById('waitingName');
  const reconnectOverlay = document.getElementById('reconnectOverlay');
  const triesLeftEl = document.getElementById('triesLeft');
  const playerCountEl = document.getElementById('playerCount');
  const solvedCountEl = document.getElementById('solvedCount');
  const playerChipsEl = document.getElementById('playerChips');
  const wordleTopMetaEl = document.getElementById('wordleTopMeta');

  var allScreens = [joinScreen, waitingScreen, playingScreen, gameoverScreen];

  function showScreen(screen) {
    allScreens.forEach(function (s) { s.classList.remove('active'); });
    screen.classList.add('active');
  }

  // --- Join flow ---
  if (myName) {
    nameInput.value = myName;
  }

  function doJoin() {
    var name = nameInput.value.trim();
    if (!name) {
      joinError.textContent = 'Please enter your name';
      return;
    }
    myName = name;
    joinBtn.disabled = true;
    joinError.textContent = '';
    if (roomId) {
      socket.emit('join_game', { roomId: roomId, playerName: myName, gameType: 'tv-wordle' });
    }
    waitingNameEl.textContent = 'Joined as: ' + myName;
    showScreen(waitingScreen);
  }

  joinBtn.addEventListener('click', doJoin);
  nameInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') doJoin(); });

  // Auto-join if name provided in URL
  if (myName && roomId) {
    if (isAutoJoin) {
      waitingNameEl.textContent = 'Joined as: ' + myName;
      showScreen(waitingScreen);
    } else {
      doJoin();
    }
  }

  // --- Game state ---
  let currentWord = '';
  let currentRow = 0;
  let maxAttempts = 6;
  let solved = false;
  let failed = false;
  let gameActive = false;
  let cells = [];       // 2D array [row][col]
  let keyboardStatus = {}; // letter -> 'correct'|'present'|'absent'

  // --- Build grid ---
  function buildGrid() {
    gridEl.innerHTML = '';
    cells = [];
    for (var r = 0; r < maxAttempts; r++) {
      var row = document.createElement('div');
      row.className = 'grid-row';
      row.setAttribute('data-row', r);
      var rowCells = [];
      for (var c = 0; c < 5; c++) {
        var cell = document.createElement('div');
        cell.className = 'cell';
        row.appendChild(cell);
        rowCells.push(cell);
      }
      gridEl.appendChild(row);
      cells.push(rowCells);
    }
  }

  // --- Build keyboard ---
  var KEYBOARD_ROWS = [
    ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
    ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
    ['ENTER', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', '⌫']
  ];

  function buildKeyboard() {
    keyboardEl.innerHTML = '';
    KEYBOARD_ROWS.forEach(function (row) {
      var rowEl = document.createElement('div');
      rowEl.className = 'keyboard-row';
      row.forEach(function (key) {
        var btn = document.createElement('button');
        btn.className = 'key';
        btn.textContent = key;
        btn.setAttribute('data-key', key);
        if (key === 'ENTER' || key === '⌫') {
          btn.classList.add('wide');
        }
        btn.addEventListener('click', function (e) {
          e.preventDefault();
          onKeyPress(key);
        });
        rowEl.appendChild(btn);
      });
      keyboardEl.appendChild(rowEl);
    });
  }

  function updateKeyboardColors() {
    var keys = keyboardEl.querySelectorAll('.key');
    keys.forEach(function (btn) {
      var letter = btn.getAttribute('data-key');
      if (letter.length === 1 && keyboardStatus[letter]) {
        btn.className = 'key ' + keyboardStatus[letter];
      }
    });
  }

  // --- Input handling ---
  function onKeyPress(key) {
    if (solved || failed || !gameActive) return;

    if (key === '⌫' || key === 'BACKSPACE') {
      handleBackspace();
    } else if (key === 'ENTER') {
      handleSubmit();
    } else if (key.length === 1 && /^[A-Z]$/i.test(key)) {
      handleKeyPress(key.toUpperCase());
    }
  }

  function handleKeyPress(letter) {
    if (currentWord.length >= 5) return;
    currentWord += letter;
    var col = currentWord.length - 1;
    cells[currentRow][col].textContent = letter;
    cells[currentRow][col].classList.add('filled');
  }

  function handleBackspace() {
    if (currentWord.length === 0) return;
    var col = currentWord.length - 1;
    cells[currentRow][col].textContent = '';
    cells[currentRow][col].classList.remove('filled');
    currentWord = currentWord.slice(0, -1);
  }

  function handleSubmit() {
    if (currentWord.length !== 5) {
      showStatus('Not enough letters');
      shakeRow(currentRow);
      return;
    }
    socket.emit('wordle_guess', { word: currentWord.toLowerCase() });
  }

  // --- Status messages ---
  var statusTimer = null;
  function showStatus(msg, persist) {
    statusMessage.textContent = msg;
    if (statusTimer) clearTimeout(statusTimer);
    if (!persist) {
      statusTimer = setTimeout(function () {
        statusMessage.textContent = '';
      }, 2000);
    }
  }

  // --- Shake animation ---
  function shakeRow(row) {
    var rowEl = gridEl.querySelector('[data-row="' + row + '"]');
    if (!rowEl) return;
    rowEl.classList.add('shake');
    setTimeout(function () {
      rowEl.classList.remove('shake');
    }, 500);
  }

  // --- Reveal animation ---
  function revealRow(row, result, callback) {
    // result is array of { letter, status } where status is 'correct'|'present'|'absent'
    var delay = 0;
    result.forEach(function (r, i) {
      var cell = cells[row][i];
      setTimeout(function () {
        // Flip: scale Y to 0
        cell.style.transform = 'scaleY(0)';
        setTimeout(function () {
          cell.textContent = r.letter.toUpperCase();
          cell.classList.remove('filled');
          cell.classList.add(r.status);
          cell.style.transform = 'scaleY(1)';
        }, 150);
      }, delay);
      delay += 300;
    });
    // Call callback after all flips complete
    setTimeout(function () {
      if (callback) callback();
    }, delay + 200);
  }

  // --- Update keyboard status (promote only: absent < present < correct) ---
  function updateKeyStatus(result) {
    var priority = { absent: 0, present: 1, correct: 2 };
    result.forEach(function (r) {
      var letter = r.letter.toUpperCase();
      var current = keyboardStatus[letter];
      if (!current || priority[r.status] > priority[current]) {
        keyboardStatus[letter] = r.status;
      }
    });
    updateKeyboardColors();
  }

  // --- Restore grid from server state (reconnect) ---
  function restoreFromState(playerState) {
    if (!playerState) return;
    var attempts = playerState.attempts || [];
    var results = playerState.results || [];
    currentRow = attempts.length;
    solved = playerState.solved || false;
    failed = playerState.failed || false;

    for (var r = 0; r < attempts.length; r++) {
      var word = attempts[r].toUpperCase();
      var result = results[r];
      for (var c = 0; c < 5; c++) {
        cells[r][c].textContent = word[c];
        cells[r][c].classList.remove('filled');
        if (result && result[c]) {
          cells[r][c].classList.add(result[c].status);
        }
      }
      if (result) {
        updateKeyStatus(result);
      }
    }

    if (solved) {
      showStatus('You solved it!', true);
    } else if (failed) {
      showStatus('Out of attempts', true);
    }
  }

  // --- Physical keyboard ---
  document.addEventListener('keydown', function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var key = e.key;
    if (key === 'Enter') {
      onKeyPress('ENTER');
    } else if (key === 'Backspace') {
      onKeyPress('BACKSPACE');
    } else if (key.length === 1 && /^[a-zA-Z]$/.test(key)) {
      onKeyPress(key.toUpperCase());
    }
  });

  // --- Socket events ---

  // Reconnect overlay
  socket.on('connect', function () {
    if (reconnectOverlay) reconnectOverlay.classList.add('hidden');
    if (myName && roomId) {
      socket.emit('join_game', { roomId: roomId, playerName: myName, gameType: 'tv-wordle', reconnect: true });
    }
  });
  socket.on('disconnect', function () {
    if (reconnectOverlay) reconnectOverlay.classList.remove('hidden');
  });

  function updateInfoBar(data) {
    if (!data) return;
    var players = data.players || [];
    var solvedArr = data.solved || [];
    if (playerCountEl) playerCountEl.textContent = players.length || data.playerCount || '--';
    if (solvedCountEl) solvedCountEl.textContent = solvedArr.filter(Boolean).length;
    if (triesLeftEl) triesLeftEl.textContent = Math.max(0, maxAttempts - currentRow);
    if (wordleTopMetaEl) wordleTopMetaEl.textContent = players.length > 0 ? players.length + ' player' + (players.length !== 1 ? 's' : '') : '';
    if (playerChipsEl && players.length > 0) {
      playerChipsEl.innerHTML = players.map(function (p) {
        var cls = 'wordle-player-chip';
        var seat = p.seat != null ? p.seat : -1;
        if (seat >= 0 && solvedArr[seat]) cls += ' solved';
        else if (seat >= 0 && data.failed && data.failed[seat]) cls += ' failed';
        return '<div class="' + cls + '"><div class="wordle-player-dot"></div>' + p.name + '</div>';
      }).join('');
    }
  }

  function initPlayScreen() {
    gameActive = true;
    solved = false;
    failed = false;
    currentRow = 0;
    currentWord = '';
    keyboardStatus = {};
    buildGrid();
    buildKeyboard();
    showScreen(playingScreen);
    showStatus('');
  }

  socket.on('game_started', function (data) {
    initPlayScreen();
    if (data) updateInfoBar(data);
  });

  socket.on('wordle_guess_result', function (data) {
    // data: { ok, attempt, result, solved, failed, reason }
    if (!data.ok) {
      showStatus(data.reason || 'Invalid word');
      shakeRow(currentRow);
      return;
    }

    // Successful guess — reveal the row
    var row = currentRow;
    currentWord = '';
    currentRow++;

    revealRow(row, data.result, function () {
      updateKeyStatus(data.result);
      if (triesLeftEl) triesLeftEl.textContent = Math.max(0, maxAttempts - currentRow);

      if (data.solved) {
        solved = true;
        gameActive = false;
        showStatus('You solved it! 🎉', true);
      } else if (data.failed) {
        failed = true;
        gameActive = false;
        showStatus('Out of attempts', true);
      }
    });
  });

  socket.on('game_state', function (data) {
    if (!data || data.gameType !== 'tv-wordle') return;
    if (!playingScreen.classList.contains('active')) {
      maxAttempts = data.maxAttempts || 6;
      initPlayScreen();
    }
    updateInfoBar(data);
  });

  socket.on('wordle_player_state', function (ps) {
    if (!ps) return;
    if (!playingScreen.classList.contains('active')) {
      maxAttempts = 6;
      initPlayScreen();
    }
    restoreFromState({
      attempts: ps.grid.map(row => row.map(c => c.letter).join('')).filter(w => w.trim()),
      results: ps.grid.map(row => row.map(c => ({ letter: c.letter, status: c.status }))).filter((_, i) => ps.grid[i][0].letter),
      solved: ps.solved,
      failed: ps.failed
    });
    if (ps.solved || ps.failed) gameActive = false;
  });

  socket.on('play_again', () => {
    gameActive = false;
    solved = false;
    failed = false;
    showScreen(waitingScreen);
  });

socket.on('game_over', function (data) {
    gameActive = false;
    var msg = '';
    if (data.winnerName) {
      msg = '<span id="winner-name">' + data.winnerName + '</span> wins!';
    } else {
      msg = 'Game over!';
    }
    if (data.word) {
      msg += '<br>The word was: <strong>' + data.word.toUpperCase() + '</strong>';
    }
    gameoverMessage.innerHTML = msg;
    showScreen(gameoverScreen);
  });

  socket.on('room_error', function (data) {
    showStatus(data.message || 'Error', true);
  });
})();
