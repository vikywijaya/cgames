require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const rateLimit = require('express-rate-limit');
const path = require('path');

const app = express();
const httpServer = http.createServer(app);

const corsOrigin = process.env.CORS_ORIGIN || '*';

const io = new Server(httpServer, {
  cors: { origin: corsOrigin, methods: ['GET', 'POST'] },
  // Fly.io: ensure WebSocket upgrades work behind the proxy
  transports: ['websocket', 'polling'],
  allowEIO3: true
});

// Rate limit static/API routes (generous; join_xiangqi is rate-limited in socket events)
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false
});
app.use(limiter);

// Serve static files
const publicDir = path.join(__dirname, 'public');
app.use(express.static(publicDir));

// Helper: serve a file from public/ using root-relative path (avoids dotfile issues in dev worktrees)
const sendPublic = (res, filename) => res.sendFile(filename, { root: publicDir });

// Expose cgames' scoring utilities verbatim so Play with a Friend game clients can
// write to the same caritahub_scores localStorage bucket and callback contract that
// solo games use, without duplicating scoreStore.js/buildPayload.js (see
// docs/superpowers/specs/2026-07-20-play-with-a-friend-scoring-design.md).
app.use('/shared', express.static(path.join(__dirname, '..', 'src/utils')));

// ── Cognitive games SPA (cgames), mounted at /games ──────────────────────
// Vendored build output lives at ../dist (built via `npm run build` at repo root,
// see the root Dockerfile). Vite is configured with base: '/games/' so its own
// asset URLs already point under this prefix.
const cgamesDistDir = path.join(__dirname, '..', 'dist');

app.get('/games/api/daily-challenge', async (req, res) => {
  try {
    const { buildDailyGames, gameIconFilename } = await import('../src/shared/gameData.js');

    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers.host;
    const baseUrl = `${protocol}://${host}`;

    const completedParam = req.query?.completed || '';
    const completedSet = new Set(completedParam.split(',').filter(Boolean));

    const games = buildDailyGames();
    const data = games.map((game) => ({
      id:          game.id,
      name:        game.title,
      description: game.description,
      domain:      game.domain,
      category:    game.categoryName,
      icon_url:    `${baseUrl}/games/games/${gameIconFilename(game.id)}`,
      url:         `${baseUrl}/games/${game.id}`,
      is_complete: completedSet.has(game.id),
    }));

    res.json({ status: 'success', data });
  } catch (err) {
    res.status(500).json({ status: 'fail', message: 'Not available' });
  }
});

app.use('/games', express.static(cgamesDistDir));

// SPA fallback — client-side game routes like /games/math-cross resolve to index.html
app.get('/games/*splat', (req, res) => {
  res.sendFile('index.html', { root: cgamesDistDir });
});

// /join encodes ?room=&game= — serve the game lobby page
app.get('/join', (req, res) => sendPublic(res, 'lobby.html'));

// Universal TV join page (?game=tv-bingo&room=ABC) — handles join + waiting,
// then redirects player to the game-specific play page with ?autojoin=1.
app.get('/tv-join', (req, res) => sendPublic(res, 'tv-join.html'));

// Universal TV lobby page (?game=tv-bingo) — host views this on the TV,
// players scan the QR. On Start, redirects to /<game>-tv?room=XXX&host=1
app.get('/tv-lobby', (req, res) => sendPublic(res, 'tv-lobby.html'));

// TV play-only routes (lobby skipped — entered from /tv-lobby with ?room&host=1)
// These serve the existing tv-<game>.html files.
app.get('/tv-bingo-tv',             (req, res) => sendPublic(res, 'tv-bingo.html'));
app.get('/tv-quick-maths-tv',       (req, res) => sendPublic(res, 'tv-quick-maths.html'));
app.get('/tv-higher-lower-tv',      (req, res) => sendPublic(res, 'tv-higher-lower.html'));
app.get('/tv-boggle-tv',            (req, res) => sendPublic(res, 'tv-boggle.html'));
app.get('/tv-sumix-tv',             (req, res) => sendPublic(res, 'tv-sumix.html'));
app.get('/tv-frog-drop-tv',         (req, res) => sendPublic(res, 'tv-frog-drop.html'));
app.get('/tv-taboo-tv',             (req, res) => sendPublic(res, 'tv-taboo.html'));
app.get('/tv-20-questions-tv',      (req, res) => sendPublic(res, 'tv-20-questions.html'));
app.get('/tv-racing-tv',            (req, res) => sendPublic(res, 'tv-racing.html'));
app.get('/tv-math-cross-tv',        (req, res) => sendPublic(res, 'tv-math-cross.html'));
app.get('/tv-colour-memory-tv',     (req, res) => sendPublic(res, 'tv-colour-memory.html'));
app.get('/tv-face-memory-tv',       (req, res) => sendPublic(res, 'tv-face-memory.html'));
app.get('/tv-daily-arithmetic-tv',  (req, res) => sendPublic(res, 'tv-daily-arithmetic.html'));
app.get('/tv-missing-number-tv',    (req, res) => sendPublic(res, 'tv-missing-number.html'));
app.get('/tv-number-sort-tv',       (req, res) => sendPublic(res, 'tv-number-sort.html'));
app.get('/tv-maze-tv',              (req, res) => sendPublic(res, 'tv-maze.html'));
app.get('/tv-wordle-tv',            (req, res) => sendPublic(res, 'tv-wordle.html'));
app.get('/tv-lumeno-tv',            (req, res) => sendPublic(res, 'tv-lumeno.html'));
app.get('/tv-memory-match-tv',      (req, res) => sendPublic(res, 'tv-memory-match.html'));
app.get('/tv-pattern-sequence-tv',  (req, res) => sendPublic(res, 'tv-pattern-sequence.html'));
app.get('/tv-pipe-puzzle-tv',       (req, res) => sendPublic(res, 'tv-pipe-puzzle.html'));
app.get('/tv-ring-sort-tv',         (req, res) => sendPublic(res, 'tv-ring-sort.html'));
app.get('/tv-shopping-list-tv',     (req, res) => sendPublic(res, 'tv-shopping-list.html'));
app.get('/tv-sokoban-tv',           (req, res) => sendPublic(res, 'tv-sokoban.html'));
app.get('/tv-speed-tap-tv',         (req, res) => sendPublic(res, 'tv-speed-tap.html'));
app.get('/tv-stroop-colour-tv',     (req, res) => sendPublic(res, 'tv-stroop-colour.html'));
app.get('/tv-word-recall-tv',       (req, res) => sendPublic(res, 'tv-word-recall.html'));
app.get('/cooking-tv',              (req, res) => sendPublic(res, 'tv-cooking.html'));

// TV-only landing page (for Flutter TV app WebView)
app.get('/tv', (req, res) => sendPublic(res, 'tv.html'));

// TV Bingo — TV display (host) page
app.get('/tv-bingo', (req, res) => sendPublic(res, 'tv-bingo.html'));

// TV Bingo — mobile player page (seniors scan QR to reach this)
app.get('/tv-bingo-play', (req, res) => sendPublic(res, 'tv-bingo-play.html'));

// TV Higher or Lower — TV display (host) page
app.get('/tv-higher-lower', (req, res) => sendPublic(res, 'tv-higher-lower.html'));

// TV Higher or Lower — mobile player page
app.get('/tv-higher-lower-play', (req, res) => sendPublic(res, 'tv-higher-lower-play.html'));

// TV Boggle — TV display (host) page
app.get('/tv-boggle', (req, res) => sendPublic(res, 'tv-boggle.html'));

// TV Boggle — mobile player page
app.get('/tv-boggle-play', (req, res) => sendPublic(res, 'tv-boggle-play.html'));

// TV RC Racing — TV display (host) page
app.get('/tv-racing', (req, res) => sendPublic(res, 'tv-racing.html'));

// TV RC Racing — mobile player page
app.get('/tv-racing-play', (req, res) => sendPublic(res, 'tv-racing-play.html'));

// TV 20 Questions — TV display (host) page
app.get('/tv-20-questions', (req, res) => sendPublic(res, 'tv-20-questions.html'));

// TV 20 Questions — mobile player page
app.get('/tv-20-questions-play', (req, res) => sendPublic(res, 'tv-20-questions-play.html'));

// TV Maze — TV display (host) page
app.get('/tv-maze', (req, res) => sendPublic(res, 'tv-maze.html'));

// TV Maze — mobile player page
app.get('/maze-play', (req, res) => sendPublic(res, 'maze-play.html'));

// TV Wordle — TV display (host) page
app.get('/tv-wordle', (req, res) => sendPublic(res, 'tv-wordle.html'));

// TV Wordle — mobile player page
app.get('/wordle-play', (req, res) => sendPublic(res, 'wordle-play.html'));

// TV Sumix — TV display (host) page
app.get('/tv-sumix', (req, res) => sendPublic(res, 'tv-sumix.html'));

// TV Sumix — mobile player page
app.get('/tv-sumix-play', (req, res) => sendPublic(res, 'tv-sumix-play.html'));

// TV Frog Drop — TV display + mobile player
app.get('/tv-frog-drop',      (req, res) => sendPublic(res, 'tv-frog-drop.html'));
app.get('/tv-frog-drop-play', (req, res) => sendPublic(res, 'tv-frog-drop-play.html'));

// TV Taboo — TV host display
app.get('/tv-taboo', (req, res) => sendPublic(res, 'tv-taboo.html'));

// TV Taboo — mobile player page
app.get('/tv-taboo-play', (req, res) => sendPublic(res, 'tv-taboo-play.html'));

// TV Stroop Colour — TV display (host) page
app.get('/tv-stroop-colour', (req, res) => sendPublic(res, 'tv-stroop-colour.html'));

// TV Stroop Colour — mobile player page
app.get('/stroop-colour-play', (req, res) => sendPublic(res, 'stroop-colour-play.html'));

// TV Pattern Sequence
app.get('/tv-pattern-sequence',    (req, res) => sendPublic(res, 'tv-pattern-sequence.html'));
app.get('/pattern-sequence-play',  (req, res) => sendPublic(res, 'pattern-sequence-play.html'));

// TV Speed Tap
app.get('/tv-speed-tap',    (req, res) => sendPublic(res, 'tv-speed-tap.html'));
app.get('/speed-tap-play',  (req, res) => sendPublic(res, 'speed-tap-play.html'));

// TV Colour Memory — TV display (host) page
app.get('/tv-colour-memory', (req, res) => sendPublic(res, 'tv-colour-memory.html'));

// TV Colour Memory — mobile player page
app.get('/colour-memory-play', (req, res) => sendPublic(res, 'colour-memory-play.html'));

// TV Face Memory — TV display (host) page
app.get('/tv-face-memory', (req, res) => sendPublic(res, 'tv-face-memory.html'));

// TV Face Memory — mobile player page
app.get('/face-memory-play', (req, res) => sendPublic(res, 'face-memory-play.html'));

// TV MathCross — TV display (host) page
app.get('/tv-math-cross', (req, res) => sendPublic(res, 'tv-math-cross.html'));

// TV MathCross — mobile player page
app.get('/math-cross-play', (req, res) => sendPublic(res, 'math-cross-play.html'));

// TV Pipe Puzzle — TV display (host) page
app.get('/tv-pipe-puzzle', (req, res) => sendPublic(res, 'tv-pipe-puzzle.html'));

// TV Pipe Puzzle — mobile player page
app.get('/pipe-puzzle-play', (req, res) => sendPublic(res, 'pipe-puzzle-play.html'));

// TV Lumeno — TV display (host) page
app.get('/tv-lumeno', (req, res) => sendPublic(res, 'tv-lumeno.html'));

// TV Lumeno — mobile player page
app.get('/lumeno-play', (req, res) => sendPublic(res, 'lumeno-play.html'));

// TV Daily Arithmetic
app.get('/tv-daily-arithmetic', (req, res) => sendPublic(res, 'tv-daily-arithmetic.html'));
app.get('/daily-arithmetic-play', (req, res) => sendPublic(res, 'daily-arithmetic-play.html'));

// TV Missing Number
app.get('/tv-missing-number', (req, res) => sendPublic(res, 'tv-missing-number.html'));
app.get('/missing-number-play', (req, res) => sendPublic(res, 'missing-number-play.html'));

// TV Number Sort
app.get('/tv-number-sort', (req, res) => sendPublic(res, 'tv-number-sort.html'));
app.get('/number-sort-play', (req, res) => sendPublic(res, 'number-sort-play.html'));

// TV Cooking (multiplayer co-op)
app.get('/tv-cooking', (req, res) => sendPublic(res, 'tv-cooking.html'));
app.get('/tv-cooking-play', (req, res) => sendPublic(res, 'tv-cooking-play.html'));

// TV Quick Maths
app.get('/tv-quick-maths', (req, res) => sendPublic(res, 'tv-quick-maths.html'));
app.get('/quick-maths-play', (req, res) => sendPublic(res, 'quick-maths-play.html'));

// TV Sokoban
app.get('/tv-sokoban', (req, res) => sendPublic(res, 'tv-sokoban.html'));
app.get('/sokoban-play', (req, res) => sendPublic(res, 'sokoban-play.html'));

// TV Ring Sort
app.get('/tv-ring-sort', (req, res) => sendPublic(res, 'tv-ring-sort.html'));
app.get('/ring-sort-play',      (req, res) => sendPublic(res, 'ring-sort-play.html'));

// TV Memory Match
app.get('/tv-memory-match',     (req, res) => sendPublic(res, 'tv-memory-match.html'));
app.get('/memory-match-play',   (req, res) => sendPublic(res, 'memory-match-play.html'));

// TV Word Recall
app.get('/tv-word-recall',      (req, res) => sendPublic(res, 'tv-word-recall.html'));
app.get('/word-recall-play',    (req, res) => sendPublic(res, 'word-recall-play.html'));

// TV Shopping List
app.get('/tv-shopping-list',    (req, res) => sendPublic(res, 'tv-shopping-list.html'));
app.get('/shopping-list-play',  (req, res) => sendPublic(res, 'shopping-list-play.html'));

// Leaderboard endpoint
app.get('/api/leaderboard', (req, res) => {
  const leaderboard = require('./src/leaderboard');
  res.json(leaderboard.getAllLeaderboards(10));
});

// Health endpoint
app.get('/health', (req, res) => {
  const roomManager = require('./src/rooms/roomManager');
  res.json({
    status: 'ok',
    rooms: roomManager.roomCount(),
    connections: io.engine.clientsCount
  });
});

// Socket.IO setup — room events wired in rooms module
require('./src/rooms/socketEvents')(io);

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`caritahub-games listening on port ${PORT}`);
});

module.exports = { io };
