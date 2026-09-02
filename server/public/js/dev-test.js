'use strict';

/**
 * Dev Multiplayer Testing Tool
 * Press Shift+Ctrl+T to open the testing panel.
 * - Regular games: creates room via socket, opens all player lobby tabs
 * - TV games: opens TV display page, detects room ID, opens mobile play pages
 */
(function () {
  // Dev tool available everywhere (localhost + deployed)

  let panel = null;

  // ── Auto-join for play pages (TV mobile) ──────────────────────────────────
  // If devname param is present on a play page, auto-fill name and click join
  const devNameParam = new URLSearchParams(location.search).get('devname');
  if (devNameParam) {
    // Wait for DOM to be ready and elements to exist
    const tryAutoJoin = () => {
      const nameInput = document.getElementById('nameInput');
      const joinBtn = document.getElementById('joinBtn');
      if (nameInput && joinBtn) {
        nameInput.value = devNameParam;
        // Trigger input event for any validation listeners
        nameInput.dispatchEvent(new Event('input', { bubbles: true }));
        setTimeout(() => {
          joinBtn.disabled = false;
          joinBtn.click();
        }, 300);
      }
    };
    // Try after a short delay (scripts may not have attached listeners yet)
    setTimeout(tryAutoJoin, 800);
  }

  // ── Game configs ──────────────────────────────────────────────────────────
  const REGULAR_GAMES = {
    xiangqi:               { label: '象棋 Xiangqi',         players: 2 },
    chess:                 { label: 'Chess',                players: 2 },
    ludo:                  { label: '飞行棋 Ludo',           players: [2, 3, 4] },
    chordaidi:             { label: '大老二 Chor Dai Di',    players: 4 },
    bingo:                 { label: 'Bingo',                players: [2, 3, 4] },
    boggle:                { label: 'Boggle',               players: [2, 3, 4] },
    'singapore-trivia':    { label: 'Singapore Trivia',     players: [2, 3, 4] },
    'spot-the-difference': { label: 'Spot the Difference',  players: [2, 3] },
    'rhythm-tap':          { label: 'Rhythm Tap',           players: [1, 2, 3] },
    'gin-rummy':           { label: 'Gin Rummy',            players: 2 },
    hearts:                { label: 'Hearts',               players: 4 },
    'crazy-eights':        { label: 'Crazy Eights',         players: [2, 3, 4] },
  };

  const TV_GAMES = {
    'tv-bingo':          { label: 'TV Bingo',            mobilePlayers: [1, 2, 3, 4], tvPage: '/tv-bingo.html',          playPage: '/tv-bingo-play' },
    'tv-higher-lower':   { label: 'TV Higher or Lower',  mobilePlayers: [1, 2, 3, 4], tvPage: '/tv-higher-lower.html',   playPage: '/tv-higher-lower-play' },
    'tv-boggle':         { label: 'TV Boggle',           mobilePlayers: [1, 2, 3, 4], tvPage: '/tv-boggle.html',         playPage: '/tv-boggle-play' },
    'tv-racing':         { label: 'TV RC Racing',        mobilePlayers: [1, 2, 3, 4], tvPage: '/tv-racing.html',         playPage: '/tv-racing-play' },
    'tv-maze':           { label: 'TV Maze Runner',      mobilePlayers: [1, 2, 3, 4], tvPage: '/tv-maze.html',           playPage: '/maze-play' },
    'tv-wordle':         { label: 'TV Wordle Race',      mobilePlayers: [1, 2, 3, 4], tvPage: '/tv-wordle.html',         playPage: '/wordle-play' },
    'tv-20-questions':   { label: 'TV 20 Questions',     mobilePlayers: [1, 2, 3, 4], tvPage: '/tv-20-questions.html',   playPage: '/tv-20-questions-play' },
    'tv-sumix':          { label: 'TV Sumix',            mobilePlayers: [1, 2, 3, 4], tvPage: '/tv-sumix.html',          playPage: '/tv-sumix-play' },
    'tv-taboo':          { label: 'TV Taboo',            mobilePlayers: [1, 2, 3, 4], tvPage: '/tv-taboo.html',          playPage: '/tv-taboo-play' },
    'tv-math-cross':     { label: 'TV Math Cross',       mobilePlayers: [1, 2, 3, 4], tvPage: '/tv-math-cross.html',     playPage: '/math-cross-play' },
    'tv-lumeno':         { label: 'TV Lumeno',           mobilePlayers: [1, 2, 3, 4], tvPage: '/tv-lumeno.html',          playPage: '/lumeno-play' },
    'tv-pipe-puzzle':    { label: 'TV Pipe Puzzle',      mobilePlayers: [1, 2, 3, 4], tvPage: '/tv-pipe-puzzle.html',     playPage: '/pipe-puzzle-play' },
    'tv-colour-memory':      { label: 'TV Colour Memory',      mobilePlayers: [1, 2, 3, 4], tvPage: '/tv-colour-memory.html',      playPage: '/colour-memory-play' },
    'tv-face-memory':        { label: 'TV Face Memory',        mobilePlayers: [1, 2, 3, 4], tvPage: '/tv-face-memory.html',        playPage: '/face-memory-play' },
    'tv-daily-arithmetic':   { label: 'TV Daily Arithmetic',   mobilePlayers: [1, 2, 3, 4], tvPage: '/tv-daily-arithmetic.html',   playPage: '/daily-arithmetic-play' },
    'tv-missing-number':     { label: 'TV Missing Number',     mobilePlayers: [1, 2, 3, 4], tvPage: '/tv-missing-number.html',     playPage: '/missing-number-play' },
    'tv-number-sort':        { label: 'TV Number Sort',        mobilePlayers: [1, 2, 3, 4], tvPage: '/tv-number-sort.html',        playPage: '/number-sort-play' },
    'tv-quick-maths':        { label: 'TV Quick Maths ⚡',     mobilePlayers: [1, 2, 3, 4], tvPage: '/tv-quick-maths.html',        playPage: '/quick-maths-play' },
    'tv-sokoban':            { label: 'TV Sokoban 📦',         mobilePlayers: [1, 2, 3, 4], tvPage: '/tv-sokoban.html',            playPage: '/sokoban-play' },
    'tv-ring-sort':          { label: 'TV Ring Sort 💍',        mobilePlayers: [1, 2, 3, 4], tvPage: '/tv-ring-sort.html',          playPage: '/ring-sort-play' },
    'tv-memory-match':       { label: 'TV Memory Match 🃏',    mobilePlayers: [1, 2, 3, 4], tvPage: '/tv-memory-match.html',       playPage: '/memory-match-play' },
    'tv-word-recall':        { label: 'TV Word Recall 📝',     mobilePlayers: [1, 2, 3, 4], tvPage: '/tv-word-recall.html',        playPage: '/word-recall-play' },
    'tv-shopping-list':      { label: 'TV Shopping List 🛒',   mobilePlayers: [1, 2, 3, 4], tvPage: '/tv-shopping-list.html',      playPage: '/shopping-list-play' },
    'tv-pattern-sequence':   { label: 'TV Pattern Sequence 🎵', mobilePlayers: [1, 2, 3, 4], tvPage: '/tv-pattern-sequence.html',  playPage: '/pattern-sequence-play' },
    'tv-speed-tap':          { label: 'TV Speed Tap ⚡',        mobilePlayers: [1, 2, 3, 4], tvPage: '/tv-speed-tap.html',         playPage: '/speed-tap-play' },
    'tv-stroop-colour':      { label: 'TV Stroop Colour 🎨',   mobilePlayers: [1, 2, 3, 4], tvPage: '/tv-stroop-colour.html',     playPage: '/stroop-colour-play' },
    'cooking':               { label: 'Cooking Co-op 🍳',      mobilePlayers: [1, 2, 3, 4], tvPage: '/tv-cooking',                playPage: '/tv-cooking-play' },
  };

  const ALL_GAMES = { ...REGULAR_GAMES, ...TV_GAMES };
  function isTV(key) { return key in TV_GAMES; }

  function ensureSocketIO(cb) {
    if (typeof io !== 'undefined') return cb();
    const script = document.createElement('script');
    script.src = '/socket.io/socket.io.js';
    script.onload = cb;
    script.onerror = () => console.error('Dev tool: failed to load socket.io client');
    document.head.appendChild(script);
  }

  document.addEventListener('keydown', (e) => {
    if (e.shiftKey && e.ctrlKey && e.key === 'T') {
      e.preventDefault();
      ensureSocketIO(() => togglePanel());
    }
  });

  // ── Double-click QR to launch 2 players ────────────────────────────────────
  // On TV game lobby pages, double-clicking the QR code area opens 2 player tabs
  (function initQRDoubleClick() {
    const qrEl = document.getElementById('qrcode');
    const qrBox = qrEl ? qrEl.closest('.tv-qr-box') || qrEl.parentElement : null;
    const target = qrBox || qrEl;
    if (!target) return;

    // Detect which TV game this is from the page URL
    const pagePath = location.pathname.replace('.html', '').replace(/^\//, '');
    const tvEntry = Object.entries(TV_GAMES).find(([key, val]) =>
      val.tvPage.replace('.html', '').replace(/^\//, '') === pagePath
    );
    if (!tvEntry) return;

    const [, tv] = tvEntry;

    target.addEventListener('dblclick', function(e) {
      e.preventDefault();
      // Get room ID from the join URL element
      const joinUrlEl = document.getElementById('joinUrl');
      if (!joinUrlEl || !joinUrlEl.textContent) return;
      const urlMatch = joinUrlEl.textContent.match(/room=([^&]+)/);
      if (!urlMatch) return;
      const roomId = urlMatch[1];

      // Open 2 player tabs
      for (let i = 1; i <= 2; i++) {
        setTimeout(function() {
          const playUrl = location.origin + tv.playPage + '?room=' + roomId + '&devname=Player-' + i;
          window.open(playUrl, '_dev_qr_p' + i + '_' + roomId);
        }, (i - 1) * 400);
      }
    });

    // Visual hint: change cursor on QR area
    target.style.cursor = 'pointer';
    target.title = 'Double-click to open 2 test players';
  })();

  function togglePanel() {
    if (panel) { panel.remove(); panel = null; return; }
    createPanel();
  }

  function createPanel() {
    panel = document.createElement('div');
    panel.id = 'dev-test-panel';
    panel.innerHTML = `
      <style>
        #dev-test-panel {
          position: fixed; top: 10px; right: 10px; z-index: 99999;
          background: #1a1a2e; color: #eee; border-radius: 12px;
          padding: 16px; width: 340px; font-family: system-ui, sans-serif;
          font-size: 14px; box-shadow: 0 4px 24px rgba(0,0,0,0.5);
          max-height: 90vh; overflow-y: auto;
        }
        #dev-test-panel h3 { margin: 0 0 4px; color: #e94560; font-size: 16px; }
        #dev-test-panel .dt-subtitle { color: #666; font-size: 11px; margin-bottom: 12px; }
        #dev-test-panel .dt-close { position: absolute; top: 8px; right: 12px; background: none; border: none; color: #888; font-size: 20px; cursor: pointer; }
        #dev-test-panel .dt-section { margin-bottom: 12px; }
        #dev-test-panel label { display: block; margin-bottom: 4px; color: #aaa; font-size: 12px; }
        #dev-test-panel select, #dev-test-panel input[type="text"] {
          width: 100%; padding: 8px; border-radius: 6px; border: 1px solid #333;
          background: #16213e; color: #eee; font-size: 14px; box-sizing: border-box;
        }
        #dev-test-panel .dt-btn {
          width: 100%; padding: 10px; border: none; border-radius: 6px;
          font-size: 14px; font-weight: 600; cursor: pointer; margin-top: 4px;
        }
        #dev-test-panel .dt-btn-primary { background: #e94560; color: #fff; }
        #dev-test-panel .dt-btn-primary:hover { background: #c73a52; }
        #dev-test-panel .dt-btn-tv { background: #533483; color: #fff; }
        #dev-test-panel .dt-btn-tv:hover { background: #6b44a0; }
        #dev-test-panel .dt-btn-secondary { background: #0f3460; color: #eee; }
        #dev-test-panel .dt-btn-secondary:hover { background: #1a4a7a; }
        #dev-test-panel .dt-info { font-size: 11px; color: #666; margin-top: 8px; }
        #dev-test-panel .dt-row { display: flex; gap: 8px; }
        #dev-test-panel .dt-row > * { flex: 1; }
        #dev-test-panel hr { border: none; border-top: 1px solid #333; margin: 12px 0; }
        #dev-test-panel .dt-status { color: #4ecca3; font-size: 12px; margin-top: 8px; min-height: 16px; }
        #dev-test-panel .dt-mode-info { background: #16213e; border-radius: 8px; padding: 10px; margin-bottom: 12px; font-size: 12px; color: #aaa; line-height: 1.5; }
        #dev-test-panel .dt-mode-info strong { color: #eee; }
      </style>
      <button class="dt-close" id="dtClose">&times;</button>
      <h3>Dev Test Tool</h3>
      <div class="dt-subtitle">Shift+Ctrl+T to toggle</div>

      <div class="dt-section">
        <label>Game</label>
        <select id="dtGame"></select>
      </div>

      <div id="dtModeInfo" class="dt-mode-info"></div>

      <div class="dt-section">
        <label id="dtPlayersLabel">Number of Players</label>
        <select id="dtPlayers"></select>
      </div>

      <div class="dt-section">
        <button class="dt-btn dt-btn-primary" id="dtLaunch">Launch</button>
      </div>

      <div class="dt-status" id="dtStatus"></div>

      <hr>

      <div class="dt-section">
        <label>Quick: Open extra player tab for a room</label>
        <div class="dt-row">
          <input id="dtRoomId" type="text" placeholder="Room ID" />
          <button class="dt-btn dt-btn-secondary" id="dtJoinExtra">Join</button>
        </div>
      </div>

      <div class="dt-info">localhost only</div>
    `;
    document.body.appendChild(panel);

    const gameSelect = document.getElementById('dtGame');
    const playerSelect = document.getElementById('dtPlayers');
    const modeInfo = document.getElementById('dtModeInfo');
    const playersLabel = document.getElementById('dtPlayersLabel');
    const launchBtn = document.getElementById('dtLaunch');

    // Populate with optgroups
    const regularGroup = document.createElement('optgroup');
    regularGroup.label = 'Regular Games';
    Object.entries(REGULAR_GAMES).forEach(([key, val]) => {
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = val.label;
      regularGroup.appendChild(opt);
    });
    gameSelect.appendChild(regularGroup);

    const tvGroup = document.createElement('optgroup');
    tvGroup.label = 'Smart TV Games';
    Object.entries(TV_GAMES).forEach(([key, val]) => {
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = val.label;
      tvGroup.appendChild(opt);
    });
    gameSelect.appendChild(tvGroup);

    // Auto-detect current game
    const urlParams = new URLSearchParams(location.search);
    const currentGame = urlParams.get('game');
    if (currentGame && ALL_GAMES[currentGame]) gameSelect.value = currentGame;

    function updateUI() {
      const gameKey = gameSelect.value;
      playerSelect.innerHTML = '';

      if (isTV(gameKey)) {
        const tv = TV_GAMES[gameKey];
        modeInfo.innerHTML = '<strong>TV Mode:</strong> Opens a <strong>TV display</strong> tab (emulates Smart TV) + mobile player tab(s) that auto-join';
        playersLabel.textContent = 'Mobile Players';
        launchBtn.textContent = 'Open TV + Player Tabs';
        launchBtn.className = 'dt-btn dt-btn-tv';

        tv.mobilePlayers.forEach(n => {
          const opt = document.createElement('option');
          opt.value = n;
          opt.textContent = n + ' player' + (n > 1 ? 's' : '');
          playerSelect.appendChild(opt);
        });
        playerSelect.value = tv.mobilePlayers.includes(2) ? 2 : tv.mobilePlayers[0];
      } else {
        const game = REGULAR_GAMES[gameKey];
        modeInfo.innerHTML = '<strong>Regular Mode:</strong> Opens lobby tabs for all players that auto-join';
        playersLabel.textContent = 'Number of Players';
        launchBtn.textContent = 'Create Room & Open All Tabs';
        launchBtn.className = 'dt-btn dt-btn-primary';

        const counts = Array.isArray(game.players) ? game.players : [game.players];
        counts.forEach(n => {
          const opt = document.createElement('option');
          opt.value = n;
          opt.textContent = n + ' player' + (n > 1 ? 's' : '');
          playerSelect.appendChild(opt);
        });
        playerSelect.value = counts[counts.length - 1];
      }
    }
    gameSelect.addEventListener('change', updateUI);
    updateUI();

    // Auto-fill room ID from URL
    const roomFromUrl = urlParams.get('room');
    if (roomFromUrl) document.getElementById('dtRoomId').value = roomFromUrl;

    // ── Launch handler ──────────────────────────────────────────────────────
    launchBtn.addEventListener('click', () => {
      const gameKey = gameSelect.value;
      const numPlayers = parseInt(playerSelect.value);
      const status = document.getElementById('dtStatus');
      launchBtn.disabled = true;

      if (isTV(gameKey)) {
        launchTV(gameKey, numPlayers, status);
      } else {
        launchRegular(gameKey, numPlayers, status);
      }
    });

    // ── Regular game launch ─────────────────────────────────────────────────
    function launchRegular(gameKey, numPlayers, status) {
      status.textContent = 'Creating room...';

      const tmpSocket = io({ forceNew: true });

      tmpSocket.on('connect', () => {
        tmpSocket.emit('join_game', {
          roomId: null,
          playerName: 'Dev-P1',
          gameType: gameKey
        });
      });

      tmpSocket.on('joined', ({ roomId }) => {
        tmpSocket.disconnect();
        status.textContent = `Room ${roomId} created! Opening ${numPlayers} tab(s)...`;

        for (let i = 1; i <= numPlayers; i++) {
          setTimeout(() => {
            const url = `${location.origin}/lobby.html?game=${gameKey}&room=${roomId}&devname=Dev-P${i}`;
            window.open(url, `_dev_p${i}_${gameKey}_${roomId}`);
          }, (i - 1) * 300);
        }

        setTimeout(() => {
          status.textContent = `Done! ${numPlayers} tabs opened for room ${roomId}`;
          launchBtn.disabled = false;
        }, numPlayers * 300);
      });

      tmpSocket.on('error', ({ message }) => {
        status.textContent = `Error: ${message}`;
        launchBtn.disabled = false;
        tmpSocket.disconnect();
      });

      tmpSocket.on('connect_error', () => {
        status.textContent = 'Connection failed.';
        launchBtn.disabled = false;
      });
    }

    // ── TV game launch ──────────────────────────────────────────────────────
    // Uses the new unified /tv-lobby.html?game=<gameKey> screen to mint the
    // room, then opens each mobile player as a floating popup window pointed
    // at /tv-join (the same flow a real scanned QR would produce).
    function launchTV(gameKey, numMobilePlayers, status) {
      const tv = TV_GAMES[gameKey];
      status.textContent = 'Opening TV lobby...';

      // Step 1: Open the new TV lobby as a floating window.
      const tvLobbyUrl = `${location.origin}/tv-lobby.html?game=${encodeURIComponent(gameKey)}`;
      const tvWin = window.open(
        tvLobbyUrl,
        `_dev_tv_${gameKey}`,
        'popup=yes,width=1280,height=800,left=40,top=40,resizable=yes,scrollbars=yes'
      );

      // Step 2: Poll the lobby page for the room ID. The new lobby surfaces
      // the code in #lobbyJoinCode and the full join URL in #lobbyJoinUrl.
      status.textContent = 'Waiting for TV lobby to create room...';
      let pollCount = 0;
      const pollInterval = setInterval(() => {
        pollCount++;
        try {
          const doc = tvWin && tvWin.document;
          if (doc) {
            const codeEl = doc.getElementById('lobbyJoinCode');
            const urlEl  = doc.getElementById('lobbyJoinUrl');
            let roomId = null;
            if (urlEl && urlEl.textContent) {
              const m = urlEl.textContent.match(/room=([^&\s]+)/);
              if (m) roomId = m[1];
            }
            if (!roomId && codeEl && codeEl.textContent && codeEl.textContent.trim() && codeEl.textContent.trim() !== '----') {
              roomId = codeEl.textContent.trim();
            }

            if (roomId) {
              clearInterval(pollInterval);
              status.textContent = `Room ${roomId} found! Opening ${numMobilePlayers} mobile popup(s)...`;

              // Floating popup windows, staggered so the browser's popup
              // blocker doesn't throw them out. Tile left→right across the
              // top of the screen so multiple are visible at once.
              for (let i = 1; i <= numMobilePlayers; i++) {
                setTimeout(() => {
                  const playUrl = `${location.origin}/tv-join?game=${encodeURIComponent(gameKey)}&room=${encodeURIComponent(roomId)}&devname=${encodeURIComponent('Player-' + i)}`;
                  const left = 80 + (i - 1) * 440;
                  const features = `popup=yes,width=420,height=820,left=${left},top=80,resizable=yes,scrollbars=yes`;
                  const w = window.open(playUrl, `_dev_mobile_p${i}_${gameKey}_${roomId}`, features);
                  if (!w) {
                    status.textContent = 'Popups blocked — allow popups for this site and retry.';
                  }
                }, (i - 1) * 400);
              }

              setTimeout(() => {
                status.textContent = `Done! TV lobby + ${numMobilePlayers} mobile player popup(s) for room ${roomId}`;
                launchBtn.disabled = false;
              }, numMobilePlayers * 400 + 200);
              return;
            }
          }
        } catch (e) {
          // cross-origin or not ready yet — keep trying
        }

        if (pollCount > 30) {
          clearInterval(pollInterval);
          status.textContent = 'Could not detect room ID from TV lobby. Try the manual join below.';
          launchBtn.disabled = false;
        }
      }, 500);
    }

    // ── Manual join ─────────────────────────────────────────────────────────
    document.getElementById('dtJoinExtra').addEventListener('click', () => {
      const roomId = document.getElementById('dtRoomId').value.trim();
      if (!roomId) return;
      const gameKey = gameSelect.value;

      if (isTV(gameKey)) {
        const playUrl = `${location.origin}/tv-join?game=${encodeURIComponent(gameKey)}&room=${encodeURIComponent(roomId)}&devname=Dev-Extra`;
        window.open(
          playUrl,
          `_dev_extra_${Date.now()}`,
          'popup=yes,width=420,height=820,left=120,top=120,resizable=yes,scrollbars=yes'
        );
      } else {
        const url = `${location.origin}/lobby.html?game=${gameKey}&room=${roomId}&devname=Dev-Extra`;
        window.open(url, `_dev_extra_${Date.now()}`);
      }
      document.getElementById('dtStatus').textContent = `Opened join tab for room ${roomId}`;
    });

    document.getElementById('dtClose').addEventListener('click', () => {
      panel.remove();
      panel = null;
    });
  }
})();
