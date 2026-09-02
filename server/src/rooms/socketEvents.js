'use strict';

const roomManager = require('./roomManager');
const { createGame: createCookingGame }    = require('../engine/cooking');
const { createGame: createXiangqiGame }    = require('../engine/xiangqi');
const { createGame: createChessGame }      = require('../engine/chess');
const { createGame: createChordaidiGame }  = require('../engine/chordaidi');
const { createGame: createBingoGame }      = require('../engine/bingo');
const { createGame: createBoggleGame }     = require('../engine/boggle');
const { createGame: createTriviaGame }     = require('../engine/singapore-trivia');
const { createGame: createDiffGame }       = require('../engine/spot-the-difference');
const { createGame: createRhythmGame }     = require('../engine/rhythm-tap');
const { createGame: createHigherLowerGame } = require('../engine/higher-lower');
const { createGame: createGinRummyGame }   = require('../engine/gin-rummy');
const { createGame: createHeartsGame }     = require('../engine/hearts');
const { createGame: createCrazyEightsGame } = require('../engine/crazy-eights');
const { createGame: createRcRacingGame }   = require('../engine/rc-racing');
const { createGame: create20QGame }        = require('../engine/twenty-questions');
const { createGame: createMazeGame }      = require('../engine/maze');
const { createGame: createWordleGame }    = require('../engine/wordle');
const { createGame: createLudoGame }     = require('../engine/ludo');
const { createGame: createSumixGame }   = require('../engine/sumix');
const { createGame: createTabooGame }  = require('../engine/taboo');
const { createGame: createMathCrossGame } = require('../engine/math-cross');
const { createGame: createPipePuzzleGame } = require('../engine/pipe-puzzle');
const { createGame: createLumenoGame }     = require('../engine/lumeno');
const { createGame: createColourMemoryGame } = require('../engine/colour-memory');
const { createGame: createFaceMemoryGame }   = require('../engine/face-memory');
const { createGame: createDailyArithmeticGame } = require('../engine/daily-arithmetic');
const { createGame: createMissingNumberGame }   = require('../engine/missing-number');
const { createGame: createNumberSortGame }      = require('../engine/number-sort');
const { createGame: createQuickMathsGame }      = require('../engine/quick-maths');
const { createGame: createSokobanGame }         = require('../engine/sokoban');
const { createGame: createRingSortGame }        = require('../engine/ring-sort');
const { createGame: createMemoryMatchGame }     = require('../engine/memory-match');
const { createGame: createWordRecallGame }      = require('../engine/word-recall');
const { createGame: createShoppingListGame }    = require('../engine/shopping-list');
const { createGame: createStroopColourGame }    = require('../engine/stroop-colour');
const { createGame: createPatternSequenceGame } = require('../engine/pattern-sequence');
const { createGame: createSpeedTapGame }        = require('../engine/speed-tap');
const { createGame: createFrogDropGame }        = require('../engine/frog-drop');
const analytics = require('../analytics/clickhouse');
const leaderboard = require('../leaderboard');

// Active game engines per room
const engines = new Map();
// Game type per room ('xiangqi' | 'chess')
const roomGameTypes = new Map();

// Per-IP join rate limiter (max 10 new joins per minute; reconnects are exempt)
const joinCounts = new Map();
function checkJoinRate(ip) {
  const now = Date.now();
  const entry = joinCounts.get(ip) || { count: 0, resetAt: now + 60_000 };
  if (now > entry.resetAt) { entry.count = 0; entry.resetAt = now + 60_000; }
  entry.count++;
  joinCounts.set(ip, entry);
  return entry.count <= 10;
}

function roomSnapshot(room) {
  return {
    players: room.players.map(p => ({ name: p.name, color: p.color, connected: p.socketId !== null })),
    spectators: room.spectators.map(s => s.name)
  };
}

function gameStatePayload(roomId, room, engine) {
  const isOver = engine.isGameOver();
  let winner = null;
  if (isOver) {
    // Chess engine exposes winner() directly (handles stalemate draw)
    if (typeof engine.winner === 'function') {
      winner = engine.winner();
    } else {
      // Xiangqi: losing side is the one whose turn it is at game over
      winner = engine.turn() === 'w' ? 'black' : 'red';
    }
  }
  return {
    fen: engine.fen(),
    turn: engine.turn(),   // 'w' | 'b'
    inCheck: engine.inCheck(),
    isGameOver: isOver,
    winner,
    players: room.players.map(p => ({ name: p.name, color: p.color, connected: p.socketId !== null }))
  };
}

// ── Chor Dai Di helpers ─────────────────────────────────────────────────────
const CDI_COLORS = ['south', 'west', 'north', 'east'];

function seatForColor(color) { return CDI_COLORS.indexOf(color); }

/** Build the per-player game_state payload (hides other players' cards). */
function chordaidiPayload(roomId, room, engine, myColor) {
  const gs  = engine.state();
  const mySeat = seatForColor(myColor);
  return {
    gameType: 'chordaidi',
    myHand:       mySeat >= 0 ? gs.hands[mySeat] : [],
    handCounts:   gs.hands.map(h => h.length),
    currentSeat:  gs.currentSeat,
    tableCombo:   gs.tableCombo,
    tableOwner:   gs.tableOwner,
    passCount:    gs.passCount,
    isGameOver:   gs.isGameOver,
    winner:       gs.winner,
    players: room.players.map((p, i) => ({
      name: p.name, color: p.color, connected: p.socketId !== null,
      seat: seatForColor(p.color)
    }))
  };
}

/** Broadcast personalised states to all 4 players. */
function broadcastCDI(io, roomId, room, engine) {
  room.players.forEach(p => {
    if (!p.socketId) return;
    io.to(p.socketId).emit('game_state', chordaidiPayload(roomId, room, engine, p.color));
  });
}

// ── Bingo helpers ────────────────────────────────────────────────────────────
const BINGO_COLORS = ['caller', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'];
const BINGO_COLUMNS = ['B', 'I', 'N', 'G', 'O'];

// ── Cooking (multiplayer co-op) helpers ──────────────────────────────────────
const COOKING_COLORS = ['tv-host', 'cook1', 'cook2', 'cook3', 'cook4'];
const cookingTimers = new Map(); // roomId → intervalHandle

function cookingTick(io, roomId) {
  const engine = engines.get(roomId);
  const room   = roomManager.getRoom(roomId);
  if (!engine || !room) {
    clearInterval(cookingTimers.get(roomId));
    cookingTimers.delete(roomId);
    return;
  }
  engine.tick();
  const gs = engine.state();
  io.to(roomId).emit('cooking_state', gs);

  for (const rp of room.players) {
    if (rp.color === 'tv-host' || !rp.socketId) continue;
    const ps = engine.playerState(rp.name);
    if (ps) io.to(rp.socketId).emit('cooking_player_state', ps);
  }

  if (gs.over) {
    clearInterval(cookingTimers.get(roomId));
    cookingTimers.delete(roomId);
    io.to(roomId).emit('cooking_game_over', { score: gs.score, won: gs.won || false });
    engines.delete(roomId);
    roomGameTypes.delete(roomId);
    analytics.logEvent('game_ended', roomId, 'server', 'timer', { score: gs.score, won: gs.won || false, gameType: 'cooking' });
  }
}

// ── TV Bingo helpers ─────────────────────────────────────────────────────────
const TV_BINGO_COLORS = ['tv-host', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'];
const bingoAutoTimers = new Map(); // roomId → intervalHandle
const bingoCallIntervals = new Map(); // roomId → interval in ms (default 15000)

function seatForTvBingoColor(color) {
  if (color === 'tv-host') return -1;
  const idx = TV_BINGO_COLORS.indexOf(color);
  return idx > 0 ? idx - 1 : -1; // p1=0, p2=1, ..., p8=7
}

function tvBingoPayload(roomId, room, engine) {
  const gs = engine.state();
  return {
    gameType: 'tv-bingo',
    called:      gs.called,
    lastCalled:  gs.lastCalled,
    cards:       gs.cards,
    marked:      gs.marked,
    isGameOver:  gs.isGameOver,
    winners:     gs.winners,
    playerCount: gs.playerCount,
    autoCallInterval: (bingoCallIntervals.get(roomId) || 15000) / 1000,
    players: room.players
      .filter(p => p.color !== 'tv-host')
      .map(p => ({
        name: p.name,
        color: p.color,
        connected: p.socketId !== null,
        seat: seatForTvBingoColor(p.color)
      }))
  };
}

function handleTvBingoGameOver(io, roomId, room, engine) {
  const ws = engine.winners();
  const phonePlayers = room.players.filter(p => p.color !== 'tv-host');
  ws.forEach(w => {
    const wp = phonePlayers[w.seat];
    if (wp) leaderboard.recordWin('tv-bingo', wp.name);
  });
  const winNames = ws.map(w => {
    const wp = phonePlayers[w.seat];
    return wp?.name || '?';
  });
  io.to(roomId).emit('game_over', {
    winner: winNames.join(', '),
    reason: `BINGO! ${winNames.join(' & ')} won!`
  });
  engines.delete(roomId);
  roomGameTypes.delete(roomId);
  analytics.logEvent('game_ended', roomId, 'server', 'auto-caller', { winner: winNames.join(', '), gameType: 'tv-bingo' });
}

function seatForBingoColor(color) { return BINGO_COLORS.indexOf(color); }

function bingoPayload(roomId, room, engine) {
  const gs = engine.state();
  return {
    gameType: 'bingo',
    called:      gs.called,
    lastCalled:  gs.lastCalled,
    cards:       gs.cards,
    marked:      gs.marked,
    isGameOver:  gs.isGameOver,
    winners:     gs.winners,
    callerSeat:  gs.callerSeat,
    playerCount: gs.playerCount,
    players: room.players.map(p => ({
      name: p.name, color: p.color, connected: p.socketId !== null,
      seat: seatForBingoColor(p.color)
    }))
  };
}

function broadcastBingo(io, roomId, room, engine) {
  io.to(roomId).emit('game_state', bingoPayload(roomId, room, engine));
}

// ── Boggle helpers ───────────────────────────────────────────────────────────
const BOGGLE_COLORS = ['red', 'blue', 'green', 'purple'];

function seatForBoggleColor(color) { return BOGGLE_COLORS.indexOf(color); }

function bogglePayload(roomId, room, engine) {
  const gs = engine.state();
  return {
    gameType: 'boggle',
    board:              gs.board,
    timeLeft:           gs.timeLeft,
    startTime:          gs.startTime,
    roundSeconds:       gs.roundSeconds,
    submissionCounts:   gs.submissionCounts,
    isGameOver:         gs.isGameOver,
    scores:             gs.scores,
    words:              gs.words,
    playerCount:        gs.playerCount,
    players: room.players.map(p => ({
      name: p.name, color: p.color, connected: p.socketId !== null,
      seat: seatForBoggleColor(p.color)
    }))
  };
}

// Active server-side round timers
const boggleTimers = new Map(); // roomId → timeoutHandle

// ── Singapore Trivia helpers ──────────────────────────────────────────────────
const TRIVIA_COLORS = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'];

function seatForTriviaColor(color) { return TRIVIA_COLORS.indexOf(color); }

function triviaPayload(roomId, room, engine) {
  const gs = engine.state();
  return {
    ...gs,
    players: room.players.map(p => ({
      name: p.name, color: p.color, connected: p.socketId !== null,
      seat: seatForTriviaColor(p.color)
    }))
  };
}

// Active per-question auto-reveal timers
const triviaTimers = new Map(); // roomId → timeoutHandle

// ── Spot the Difference helpers ───────────────────────────────────────────────
const DIFF_COLORS = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'];

function seatForDiffColor(color) { return DIFF_COLORS.indexOf(color); }

function diffPayload(roomId, room, engine) {
  const gs = engine.state();
  return {
    ...gs,
    players: room.players.map(p => ({
      name: p.name, color: p.color, connected: p.socketId !== null,
      seat: seatForDiffColor(p.color)
    }))
  };
}

const diffTimers = new Map(); // roomId → timeoutHandle

// ── Rhythm Tap helpers ────────────────────────────────────────────────────────
const RHYTHM_COLORS = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'];

function seatForRhythmColor(color) { return RHYTHM_COLORS.indexOf(color); }

function rhythmPayload(roomId, room, engine) {
  const gs = engine.state();
  return {
    ...gs,
    players: room.players.map(p => ({
      name: p.name, color: p.color, connected: p.socketId !== null,
      seat: seatForRhythmColor(p.color)
    }))
  };
}

const rhythmTimers = new Map(); // roomId → timeoutHandle

// ── TV Higher or Lower helpers ──────────────────────────────────────────────
const TV_HL_COLORS = ['tv-host', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'];

function seatForTvHlColor(color) {
  if (color === 'tv-host') return -1;
  const idx = TV_HL_COLORS.indexOf(color);
  return idx > 0 ? idx - 1 : -1; // p1=0, p2=1, ..., p8=7
}

function tvHlPayload(roomId, room, engine) {
  const gs = engine.state();
  return {
    gameType: 'tv-higher-lower',
    revealed:       gs.revealed,
    currentCard:    gs.currentCard,
    revealIndex:    gs.revealIndex,
    deckSize:       gs.deckSize,
    cardsRemaining: gs.cardsRemaining,
    alive:          gs.alive,
    currentSeat:    gs.currentSeat,
    lastGuess:      gs.lastGuess,
    isGameOver:     gs.isGameOver,
    winnerSeat:     gs.winnerSeat,
    playerCount:    gs.playerCount,
    players: room.players
      .filter(p => p.color !== 'tv-host')
      .map(p => ({
        name: p.name,
        color: p.color,
        connected: p.socketId !== null,
        seat: seatForTvHlColor(p.color)
      }))
  };
}

// ── TV Boggle helpers ────────────────────────────────────────────────────────
const TV_BOGGLE_COLORS = ['tv-host', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'];
const tvBoggleTimers = new Map(); // roomId → timeoutHandle

// ── TV Frog Drop helpers (module scope so all sockets share state) ──────────
const TV_FROG_DROP_COLORS = ['tv-host', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'];
const FROG_DROP_ROUND_MS = 90_000;
const tvFrogDropTimers = new Map();      // roomId → round-end timeoutHandle
const tvFrogDropRoundEnds = new Map();   // roomId → epoch ms when round ends
const tvFrogDropCountdowns = new Map();  // roomId → 1Hz interval handle (pre-round)

function seatForTvBoggleColor(color) {
  if (color === 'tv-host') return -1;
  const idx = TV_BOGGLE_COLORS.indexOf(color);
  return idx > 0 ? idx - 1 : -1; // p1=0, p2=1, ..., p8=7
}

function tvBogglePayload(roomId, room, engine) {
  const gs = engine.state();
  return {
    gameType: 'tv-boggle',
    board:            gs.board,
    timeLeft:         gs.timeLeft,
    startTime:        gs.startTime,
    roundSeconds:     gs.roundSeconds,
    submissionCounts: gs.submissionCounts,
    isGameOver:       gs.isGameOver,
    scores:           gs.scores,
    words:            gs.words,
    playerCount:      gs.playerCount,
    players: room.players
      .filter(p => p.color !== 'tv-host')
      .map(p => ({
        name: p.name,
        color: p.color,
        connected: p.socketId !== null,
        seat: seatForTvBoggleColor(p.color)
      }))
  };
}

// ── TV Racing helpers ─────────────────────────────────────────────────────────
const TV_RACING_COLORS = ['tv-host', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'];
const racingTickTimers = new Map(); // roomId → intervalHandle

function seatForTvRacingColor(color) {
  if (color === 'tv-host') return -1;
  const idx = TV_RACING_COLORS.indexOf(color);
  return idx > 0 ? idx - 1 : -1; // p1=0, p2=1, ..., p8=7
}

function tvRacingPayload(roomId, room, engine) {
  const gs = engine.state();
  return {
    gameType: 'tv-racing',
    cars:         gs.cars,
    positions:    gs.positions,
    totalLaps:    gs.totalLaps,
    isGameOver:   gs.isGameOver,
    winnerSeat:   gs.winnerSeat,
    playerCount:  gs.playerCount,
    raceStarted:  gs.raceStarted,
    players: room.players
      .filter(p => p.color !== 'tv-host')
      .map(p => ({
        name:      p.name,
        color:     p.color,
        connected: p.socketId !== null,
        seat:      seatForTvRacingColor(p.color)
      }))
  };
}

// ── TV 20 Questions helpers ──────────────────────────────────────────────────
const TV_20Q_COLORS = ['tv-host', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'];

function seatForTv20qColor(color) {
  if (color === 'tv-host') return -1;
  const idx = TV_20Q_COLORS.indexOf(color);
  return idx > 0 ? idx - 1 : -1; // p1=0, p2=1, ..., p8=7
}

function tv20qPayload(roomId, room, engine) {
  const gs = engine.state();
  return {
    gameType: 'tv-20-questions',
    category:           gs.category,
    questionsAsked:     gs.questionsAsked,
    questionsUsed:      gs.questionsUsed,
    maxQuestions:       gs.maxQuestions,
    questionsRemaining: gs.questionsRemaining,
    isGameOver:         gs.isGameOver,
    winnerSeat:         gs.winnerSeat,
    answer:             gs.answer,
    playerCount:        gs.playerCount,
    players: room.players
      .filter(p => p.color !== 'tv-host')
      .map(p => ({
        name: p.name,
        color: p.color,
        connected: p.socketId !== null,
        seat: seatForTv20qColor(p.color)
      }))
  };
}

// ── Gin Rummy helpers ─────────────────────────────────────────────────────────
const GIN_RUMMY_COLORS = ['p1', 'p2'];

function seatForGinColor(color) { return GIN_RUMMY_COLORS.indexOf(color); }

function ginRummyPayload(roomId, room, engine, myColor) {
  const gs = engine.state();
  const mySeat = seatForGinColor(myColor);
  return {
    gameType: 'gin-rummy',
    myHand:               mySeat >= 0 ? gs.hands[mySeat] : [],
    handCounts:           gs.hands.map(h => h.length),
    drawPileCount:        gs.drawPileCount,
    discardTop:           gs.discardTop,
    currentSeat:          gs.currentSeat,
    phase:                gs.phase,
    knocker:              gs.knocker,
    knockerMelds:         gs.knockerMelds,
    knockerDeadwood:      gs.knockerDeadwood ? gs.knockerDeadwood.length : 0,
    knockerDeadwoodPoints: gs.knockerDeadwoodPoints,
    scores:               gs.scores,
    isGameOver:           gs.isGameOver,
    winner:               gs.winner,
    players: room.players.map((p, i) => ({
      name: p.name, color: p.color, connected: p.socketId !== null,
      seat: seatForGinColor(p.color)
    }))
  };
}

function broadcastGinRummy(io, roomId, room, engine) {
  room.players.forEach(p => {
    if (!p.socketId) return;
    io.to(p.socketId).emit('game_state', ginRummyPayload(roomId, room, engine, p.color));
  });
}

// ── Hearts helpers ──────────────────────────────────────────────────────────
const HEARTS_COLORS = ['south', 'west', 'north', 'east'];

function seatForHeartsColor(color) { return HEARTS_COLORS.indexOf(color); }

function heartsPayload(roomId, room, engine, myColor) {
  const gs = engine.state();
  const mySeat = seatForHeartsColor(myColor);
  return {
    gameType: 'hearts',
    myHand:          mySeat >= 0 ? gs.hands[mySeat] : [],
    handCounts:      gs.hands.map(h => h.length),
    currentSeat:     gs.currentSeat,
    trickCards:      gs.trickCards,
    trickLeader:     gs.trickLeader,
    tricksWon:       gs.tricksWon,
    pointsTaken:     gs.pointsTaken,
    heartsBroken:    gs.heartsBroken,
    trickNumber:     gs.trickNumber,
    phase:           gs.phase,
    isGameOver:      gs.isGameOver,
    winner:          gs.winner,
    players: room.players.map((p, i) => ({
      name: p.name, color: p.color, connected: p.socketId !== null,
      seat: seatForHeartsColor(p.color)
    }))
  };
}

function broadcastHearts(io, roomId, room, engine) {
  room.players.forEach(p => {
    if (!p.socketId) return;
    io.to(p.socketId).emit('game_state', heartsPayload(roomId, room, engine, p.color));
  });
}

// ── Crazy Eights helpers ────────────────────────────────────────────────────
const CRAZY_EIGHTS_COLORS = ['p1', 'p2', 'p3', 'p4'];

function seatForC8Color(color) { return CRAZY_EIGHTS_COLORS.indexOf(color); }

function crazyEightsPayload(roomId, room, engine, myColor) {
  const gs = engine.state();
  const mySeat = seatForC8Color(myColor);
  return {
    gameType: 'crazy-eights',
    myHand:        mySeat >= 0 ? gs.hands[mySeat] : [],
    handCounts:    gs.handCounts,
    discardTop:    gs.discardTop,
    currentSuit:   gs.currentSuit,
    currentSeat:   gs.currentSeat,
    drawPileCount: gs.drawPileCount,
    phase:         gs.phase,
    isGameOver:    gs.isGameOver,
    winner:        gs.winner,
    players: room.players.map((p, i) => ({
      name: p.name, color: p.color, connected: p.socketId !== null,
      seat: seatForC8Color(p.color)
    }))
  };
}

function broadcastC8(io, roomId, room, engine) {
  room.players.forEach(p => {
    if (!p.socketId) return;
    io.to(p.socketId).emit('game_state', crazyEightsPayload(roomId, room, engine, p.color));
  });
}

// ── Ludo helpers ─────────────────────────────────────────────────────────────
const LUDO_COLORS = ['red', 'blue', 'green', 'yellow'];

function seatForLudoColor(color) { return LUDO_COLORS.indexOf(color); }

function ludoPayload(roomId, room, engine) {
  const gs = engine.state();
  return {
    gameType: 'ludo',
    tokens: gs.tokens,
    currentSeat: gs.currentSeat,
    diceValue: gs.diceValue,
    phase: gs.phase,
    consecutiveSixes: gs.consecutiveSixes,
    isGameOver: gs.isGameOver,
    winner: gs.winner,
    playerCount: gs.playerCount,
    safeSquares: gs.safeSquares,
    players: room.players.map((p, i) => ({
      name: p.name, color: p.color, connected: p.socketId !== null,
      seat: seatForLudoColor(p.color)
    }))
  };
}

// ── TV Pipe Puzzle helpers ────────────────────────────────────────────────────
const TV_PIPE_PUZZLE_COLORS = ['tv-host', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'];

function seatForPipePuzzleColor(color) {
  if (color === 'tv-host') return -1;
  const idx = TV_PIPE_PUZZLE_COLORS.indexOf(color);
  return idx > 0 ? idx - 1 : -1;
}

function tvPipePuzzlePayload(roomId, room, engine) {
  const gs = engine.state();
  const phonePlayers = room.players.filter(p => p.color !== 'tv-host');
  return {
    gameType: 'tv-pipe-puzzle',
    difficulty: gs.difficulty,
    currentRound: gs.currentRound,
    totalRounds: gs.totalRounds,
    rows: gs.rows,
    cols: gs.cols,
    numColors: gs.numColors,
    grids: gs.grids,
    colorPairs: gs.colorPairs,
    solved: gs.solved,
    solvedOrder: gs.solvedOrder,
    sessionScores: gs.sessionScores,
    connectedCounts: gs.connectedCounts,
    isRoundOver: gs.isRoundOver,
    isSessionOver: gs.isSessionOver,
    playerCount: gs.playerCount,
    players: phonePlayers.map((p, i) => ({
      name: p.name,
      color: p.color,
      connected: p.socketId !== null,
      seat: i,
      solved: gs.solved[i],
    }))
  };
}

// ── TV Lumeno helpers ─────────────────────────────────────────────────────────
const TV_LUMENO_COLORS = ['tv-host', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'];

function seatForLumenoColor(color) {
  if (color === 'tv-host') return -1;
  const idx = TV_LUMENO_COLORS.indexOf(color);
  return idx > 0 ? idx - 1 : -1;
}

function tvLumenoPayload(roomId, room, engine) {
  const gs = engine.state();
  const phonePlayers = room.players.filter(p => p.color !== 'tv-host');
  return {
    gameType: 'tv-lumeno',
    difficulty: gs.difficulty,
    currentRound: gs.currentRound,
    totalRounds: gs.totalRounds,
    rows: gs.rows,
    cols: gs.cols,
    grids: gs.grids,
    movesLeft: gs.movesLeft,
    scores: gs.scores,
    sessionScores: gs.sessionScores,
    finished: gs.finished,
    roundResults: gs.roundResults,
    isRoundOver: gs.isRoundOver,
    isSessionOver: gs.isSessionOver,
    playerCount: gs.playerCount,
    players: phonePlayers.map((p, i) => ({
      name: p.name,
      color: p.color,
      connected: p.socketId !== null,
      seat: i,
      finished: gs.finished[i],
      score: gs.scores[i]
    }))
  };
}

// ── TV Colour Memory helpers ──────────────────────────────────────────────────
const TV_COLOUR_MEMORY_COLORS = ['tv-host', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'];

function seatForColourMemoryColor(color) {
  if (color === 'tv-host') return -1;
  const idx = TV_COLOUR_MEMORY_COLORS.indexOf(color);
  return idx > 0 ? idx - 1 : -1;
}

function tvColourMemoryPayload(roomId, room, engine) {
  const gs = engine.state();
  const phonePlayers = room.players.filter(p => p.color !== 'tv-host');
  const payload = {
    ...gs,
    players: phonePlayers.map((p, i) => ({
      name: p.name, color: p.color, connected: p.socketId !== null, seat: i
    }))
  };
  // Hide sequence during recall to prevent cheating
  if (gs.phase === 'recall') {
    payload.sequence = undefined;
  }
  return payload;
}

// ── TV Face Memory helpers ────────────────────────────────────────────────────
const TV_FACE_MEMORY_COLORS = ['tv-host', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'];

function seatForFaceMemoryColor(color) {
  if (color === 'tv-host') return -1;
  const idx = TV_FACE_MEMORY_COLORS.indexOf(color);
  return idx > 0 ? idx - 1 : -1;
}

function tvFaceMemoryPayload(roomId, room, engine) {
  const gs = engine.state();
  const phonePlayers = room.players.filter(p => p.color !== 'tv-host');
  const payload = {
    ...gs,
    players: phonePlayers.map((p, i) => ({
      name: p.name, color: p.color, connected: p.socketId !== null, seat: i
    }))
  };
  // During recall, strip names from studyFaces so players can't cheat
  if (gs.phase === 'recall') {
    payload.studyFaces = gs.studyFaces.map(f => ({ id: f.id, img: f.img }));
  }
  return payload;
}

// ── TV Math games shared helpers ─────────────────────────────────────────────
const TV_MATH_COLORS = ['tv-host', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'];
function seatForMathColor(color) {
  if (color === 'tv-host') return -1;
  const idx = TV_MATH_COLORS.indexOf(color);
  return idx > 0 ? idx - 1 : -1;
}
function tvMathPayload(room, engine) {
  const gs = engine.state();
  const phonePlayers = room.players.filter(p => p.color !== 'tv-host');
  return {
    ...gs,
    players: phonePlayers.map((p, i) => ({ name: p.name, color: p.color, connected: p.socketId !== null, seat: i, score: gs.sessionScores[i] || 0 }))
  };
}

// ── TV Sokoban helpers ────────────────────────────────────────────────────────
const TV_SOKOBAN_COLORS = ['tv-host', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'];
function seatForSokobanColor(color) {
  if (color === 'tv-host') return -1;
  const idx = TV_SOKOBAN_COLORS.indexOf(color);
  return idx > 0 ? idx - 1 : -1;
}
function tvSokobanPayload(room, engine) {
  const gs = engine.state();
  const phonePlayers = room.players.filter(p => p.color !== 'tv-host');
  return {
    ...gs,
    players: phonePlayers.map((p, i) => ({ name: p.name, color: p.color, connected: p.socketId !== null, seat: i, score: gs.sessionScores[i] || 0 }))
  };
}

// ── TV Ring Sort helpers ──────────────────────────────────────────────────────
const TV_RING_SORT_COLORS = ['tv-host', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'];
function seatForRingSortColor(color) {
  if (color === 'tv-host') return -1;
  const idx = TV_RING_SORT_COLORS.indexOf(color);
  return idx > 0 ? idx - 1 : -1;
}
function tvRingSortPayload(room, engine) {
  const gs = engine.state();
  const phonePlayers = room.players.filter(p => p.color !== 'tv-host');
  return {
    ...gs,
    players: phonePlayers.map((p, i) => ({ name: p.name, color: p.color, connected: p.socketId !== null, seat: i, score: gs.sessionScores[i] || 0 }))
  };
}

// ── TV Memory Match helpers ──────────────────────────────────────────────────
const TV_MEMORY_MATCH_COLORS = ['tv-host', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'];
function seatForMemoryMatchColor(color) {
  if (color === 'tv-host') return -1;
  const idx = TV_MEMORY_MATCH_COLORS.indexOf(color);
  return idx > 0 ? idx - 1 : -1;
}
function tvMemoryMatchPayload(room, engine) {
  const gs = engine.state();
  const phonePlayers = room.players.filter(p => p.color !== 'tv-host');
  return { ...gs, players: phonePlayers.map((p, i) => ({ name: p.name, color: p.color, connected: p.socketId !== null, seat: i })) };
}

// ── TV Word Recall helpers ──────────────────────────────────────────────────
const TV_WORD_RECALL_COLORS = ['tv-host', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'];
function seatForWordRecallColor(color) {
  if (color === 'tv-host') return -1;
  const idx = TV_WORD_RECALL_COLORS.indexOf(color);
  return idx > 0 ? idx - 1 : -1;
}
function tvWordRecallPayload(room, engine) {
  const gs = engine.state();
  const phonePlayers = room.players.filter(p => p.color !== 'tv-host');
  return { ...gs, players: phonePlayers.map((p, i) => ({ name: p.name, color: p.color, connected: p.socketId !== null, seat: i })) };
}

// ── TV Shopping List helpers ─────────────────────────────────────────────────
const TV_SHOPPING_LIST_COLORS = ['tv-host', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'];
function seatForShoppingListColor(color) {
  if (color === 'tv-host') return -1;
  const idx = TV_SHOPPING_LIST_COLORS.indexOf(color);
  return idx > 0 ? idx - 1 : -1;
}
function tvShoppingListPayload(room, engine) {
  const gs = engine.state();
  const phonePlayers = room.players.filter(p => p.color !== 'tv-host');
  return { ...gs, players: phonePlayers.map((p, i) => ({ name: p.name, color: p.color, connected: p.socketId !== null, seat: i })) };
}

// ── TV Stroop Colour helpers ─────────────────────────────────────────────────
const TV_STROOP_COLOUR_COLORS = ['tv-host', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'];
function seatForStroopColourColor(color) {
  if (color === 'tv-host') return -1;
  const idx = TV_STROOP_COLOUR_COLORS.indexOf(color);
  return idx > 0 ? idx - 1 : -1;
}
function tvStroopColourPayload(room, engine) {
  const gs = engine.state();
  const phonePlayers = room.players.filter(p => p.color !== 'tv-host');
  return { ...gs, players: phonePlayers.map((p, i) => ({ name: p.name, color: p.color, connected: p.socketId !== null, seat: i })) };
}

// ── TV Pattern Sequence helpers ──────────────────────────────────────────────
const TV_PATTERN_SEQUENCE_COLORS = ['tv-host', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'];
function seatForPatternSequenceColor(color) {
  if (color === 'tv-host') return -1;
  const idx = TV_PATTERN_SEQUENCE_COLORS.indexOf(color);
  return idx > 0 ? idx - 1 : -1;
}
function tvPatternSequencePayload(room, engine) {
  const gs = engine.state();
  const phonePlayers = room.players.filter(p => p.color !== 'tv-host');
  return { ...gs, players: phonePlayers.map((p, i) => ({ name: p.name, color: p.color, connected: p.socketId !== null, seat: i })) };
}

// ── TV Speed Tap helpers ─────────────────────────────────────────────────────
const TV_SPEED_TAP_COLORS = ['tv-host', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'];
function seatForSpeedTapColor(color) {
  if (color === 'tv-host') return -1;
  const idx = TV_SPEED_TAP_COLORS.indexOf(color);
  return idx > 0 ? idx - 1 : -1;
}
function tvSpeedTapPayload(room, engine) {
  const gs = engine.state();
  const phonePlayers = room.players.filter(p => p.color !== 'tv-host');
  return { ...gs, players: phonePlayers.map((p, i) => ({ name: p.name, color: p.color, connected: p.socketId !== null, seat: i })) };
}

// ── TV MathCross helpers ──────────────────────────────────────────────────────
const TV_MATH_CROSS_COLORS = ['tv-host', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'];

function seatForMathCrossColor(color) {
  if (color === 'tv-host') return -1;
  const idx = TV_MATH_CROSS_COLORS.indexOf(color);
  return idx > 0 ? idx - 1 : -1;
}

function tvMathCrossPayload(roomId, room, engine) {
  const gs = engine.state();
  const phonePlayers = room.players.filter(p => p.color !== 'tv-host');
  return {
    gameType: 'tv-math-cross',
    difficulty: gs.difficulty,
    currentRound: gs.currentRound,
    totalRounds: gs.totalRounds,
    puzzle: gs.puzzle,
    placed: gs.placed,
    solved: gs.solved,
    solvedAt: gs.solvedAt,
    sessionScores: gs.sessionScores,
    isRoundOver: gs.isRoundOver,
    isSessionOver: gs.isSessionOver,
    playerCount: gs.playerCount,
    roundStartTime: gs.roundStartTime,
    players: phonePlayers.map((p, i) => ({
      name: p.name,
      color: p.color,
      connected: p.socketId !== null,
      seat: i,
      solved: gs.solved[i],
      slotsPlaced: Object.keys(gs.placed[i] || {}).length
    }))
  };
}

module.exports = function wireEvents(io) {
  // Shared round timer Maps — must be outside the connection handler so all sockets share them
  const daRoundTimers = new Map();
  const mnRoundTimers = new Map();
  const nsRoundTimers = new Map();
  const qmRoundTimers = new Map();
  const stroopQuestionTimers = new Map(); // roomId → { timer, questionIndex }
  const speedTapQuestionTimers = new Map(); // roomId → { timer, questionIndex }
  const patternSequenceRoundTimers = new Map(); // roomId → timeout (grace timer)
  const patternSequenceShowTimers = new Map(); // roomId → timeout (showing→input)
  const shoppingListSubmitTimers = new Map(); // roomId → timeout
  const memoryMatchGraceTimers = new Map(); // roomId → timeout

  io.on('connection', socket => {
    console.log('connect', socket.id);

    // ── Ping/pong test ──────────────────────────────────────────────
    socket.on('ping', () => socket.emit('pong', { time: Date.now() }));

    // ── Join / Create room ──────────────────────────────────────────
    // Accepts both 'join_game' (new standard) and 'join_xiangqi' (backward compat)
    const handleJoin = ({ roomId, playerName, reconnect, gameType = 'xiangqi' }) => {
      if (!reconnect) {
        const ip = socket.handshake.headers['x-forwarded-for'] || socket.handshake.address;
        if (!checkJoinRate(ip)) {
          return socket.emit('error', { message: 'Too many join attempts. Please wait a moment.' });
        }
      }
      if (!playerName || !playerName.trim()) {
        return socket.emit('error', { message: 'Please enter your name.' });
      }
      const name = playerName.trim().slice(0, 30);

      let targetRoomId = roomId;
      if (!targetRoomId) {
        let colors;
        if (gameType === 'chess')          colors = ['white', 'black'];
        else if (gameType === 'chordaidi') colors = ['south', 'west', 'north', 'east'];
        else if (gameType === 'bingo')     colors = BINGO_COLORS.slice(); // 8 seats
        else if (gameType === 'boggle')         colors = BOGGLE_COLORS.slice(0, 4); // up to 4
        else if (gameType === 'singapore-trivia')  colors = TRIVIA_COLORS.slice(0, 6); // up to 6
        else if (gameType === 'spot-the-difference') colors = DIFF_COLORS.slice(0, 6);
        else if (gameType === 'rhythm-tap')          colors = RHYTHM_COLORS.slice(0, 6);
        else if (gameType === 'tv-bingo')          colors = TV_BINGO_COLORS.slice(); // 1 host + 8 players
        else if (gameType === 'tv-higher-lower')   colors = TV_HL_COLORS.slice(); // 1 host + 8 players
        else if (gameType === 'tv-boggle')           colors = TV_BOGGLE_COLORS.slice(); // 1 host + 8 players
        else if (gameType === 'gin-rummy')           colors = GIN_RUMMY_COLORS.slice();
        else if (gameType === 'hearts')              colors = HEARTS_COLORS.slice();
        else if (gameType === 'crazy-eights')        colors = CRAZY_EIGHTS_COLORS.slice();
        else if (gameType === 'tv-racing')           colors = TV_RACING_COLORS.slice(); // 1 host + 8 players
        else if (gameType === 'tv-20-questions')     colors = TV_20Q_COLORS.slice(); // 1 host + 8 players
        else if (gameType === 'tv-maze')             colors = TV_MAZE_COLORS.slice(); // 1 host + 8 players
        else if (gameType === 'tv-wordle')           colors = TV_WORDLE_COLORS.slice(); // 1 host + 8 players
        else if (gameType === 'tv-sumix')             colors = TV_SUMIX_COLORS.slice(); // 1 host + 8 players
        else if (gameType === 'tv-frog-drop')         colors = TV_FROG_DROP_COLORS.slice(); // 1 host + 8 players
        else if (gameType === 'tv-taboo')             colors = TV_TABOO_COLORS.slice(); // 1 host + 8 players
        else if (gameType === 'tv-math-cross')        colors = TV_MATH_CROSS_COLORS.slice(); // 1 host + 8 players
        else if (gameType === 'tv-pipe-puzzle')       colors = TV_PIPE_PUZZLE_COLORS.slice(); // 1 host + 8 players
        else if (gameType === 'tv-lumeno')            colors = TV_LUMENO_COLORS.slice(); // 1 host + 8 players
        else if (gameType === 'tv-colour-memory')    colors = TV_COLOUR_MEMORY_COLORS.slice();
        else if (gameType === 'tv-face-memory')      colors = TV_FACE_MEMORY_COLORS.slice();
        else if (gameType === 'tv-daily-arithmetic') colors = TV_MATH_COLORS.slice();
        else if (gameType === 'tv-missing-number')   colors = TV_MATH_COLORS.slice();
        else if (gameType === 'tv-number-sort')      colors = TV_MATH_COLORS.slice();
        else if (gameType === 'tv-quick-maths')      colors = TV_MATH_COLORS.slice();
        else if (gameType === 'tv-sokoban')          colors = TV_SOKOBAN_COLORS.slice();
        else if (gameType === 'tv-ring-sort')        colors = TV_RING_SORT_COLORS.slice();
        else if (gameType === 'tv-memory-match')    colors = TV_MEMORY_MATCH_COLORS.slice();
        else if (gameType === 'tv-word-recall')     colors = TV_WORD_RECALL_COLORS.slice();
        else if (gameType === 'tv-shopping-list')   colors = TV_SHOPPING_LIST_COLORS.slice();
        else if (gameType === 'tv-stroop-colour')      colors = TV_STROOP_COLOUR_COLORS.slice();
        else if (gameType === 'tv-pattern-sequence')  colors = TV_PATTERN_SEQUENCE_COLORS.slice();
        else if (gameType === 'tv-speed-tap')         colors = TV_SPEED_TAP_COLORS.slice();
        else if (gameType === 'cooking')              colors = COOKING_COLORS.slice(); // tv-host + up to 4 cooks
        else if (gameType === 'ludo')                colors = LUDO_COLORS.slice(0, 4); // up to 4 players
        else                               colors = ['red', 'black'];
        targetRoomId = roomManager.createRoom({ colors });
        roomGameTypes.set(targetRoomId, gameType);
      }

      const result = roomManager.joinRoom(targetRoomId, socket.id, name);
      if (result.error) {
        return socket.emit('error', { message: result.error });
      }

      socket.join(targetRoomId);
      socket.data.roomId = targetRoomId;
      socket.data.playerName = name;
      socket.data.color = result.color;

      socket.emit('joined', {
        roomId: targetRoomId,
        color: result.color,
        reconnected: result.reconnected
      });

      const room = result.room;

      // If game already in progress, send current state to reconnecting player
      if (engines.has(targetRoomId)) {
        const engine = engines.get(targetRoomId);
        const gt = roomGameTypes.get(targetRoomId) || 'xiangqi';
        if (gt === 'chordaidi') {
          socket.emit('game_state', chordaidiPayload(targetRoomId, room, engine, socket.data.color));
        } else if (gt === 'bingo') {
          socket.emit('game_state', bingoPayload(targetRoomId, room, engine));
        } else if (gt === 'boggle') {
          socket.emit('game_state', bogglePayload(targetRoomId, room, engine));
        } else if (gt === 'singapore-trivia') {
          socket.emit('game_state', triviaPayload(targetRoomId, room, engine));
        } else if (gt === 'spot-the-difference') {
          socket.emit('game_state', diffPayload(targetRoomId, room, engine));
        } else if (gt === 'rhythm-tap') {
          socket.emit('game_state', rhythmPayload(targetRoomId, room, engine));
        } else if (gt === 'tv-bingo') {
          socket.emit('game_state', tvBingoPayload(targetRoomId, room, engine));
        } else if (gt === 'tv-higher-lower') {
          socket.emit('game_state', tvHlPayload(targetRoomId, room, engine));
        } else if (gt === 'tv-boggle') {
          socket.emit('game_state', tvBogglePayload(targetRoomId, room, engine));
        } else if (gt === 'gin-rummy') {
          socket.emit('game_state', ginRummyPayload(targetRoomId, room, engine, socket.data.color));
        } else if (gt === 'hearts') {
          socket.emit('game_state', heartsPayload(targetRoomId, room, engine, socket.data.color));
        } else if (gt === 'crazy-eights') {
          socket.emit('game_state', crazyEightsPayload(targetRoomId, room, engine, socket.data.color));
        } else if (gt === 'tv-racing') {
          socket.emit('game_state', tvRacingPayload(targetRoomId, room, engine));
        } else if (gt === 'tv-20-questions') {
          socket.emit('game_state', tv20qPayload(targetRoomId, room, engine));
        } else if (gt === 'tv-maze') {
          socket.emit('game_state', tvMazePayload(targetRoomId, room, engine));
          // Also send player state for phone players
          const mazeSeat = seatForTvMazeColor(socket.data.color);
          if (mazeSeat >= 0) {
            const ps = engine.playerState(mazeSeat);
            if (ps) socket.emit('maze_player_state', ps);
          }
        } else if (gt === 'tv-wordle') {
          socket.emit('game_state', tvWordlePayload(targetRoomId, room, engine));
          // Also send player state for phone players
          const wordleSeat = seatForTvWordleColor(socket.data.color);
          if (wordleSeat >= 0) {
            const ps = engine.playerState(wordleSeat);
            if (ps) socket.emit('wordle_player_state', ps);
          }
        } else if (gt === 'tv-sumix') {
          socket.emit('game_state', tvSumixPayload(targetRoomId, room, engine));
        } else if (gt === 'tv-frog-drop') {
          socket.emit('game_state', tvFrogDropPayload(targetRoomId, room, engine));
          const fdSeat = seatForTvFrogDropColor(socket.data.color);
          if (fdSeat >= 0) {
            const ps = engine.playerSnapshot(fdSeat);
            if (ps) socket.emit('frog_drop_player_state', ps);
          }
        } else if (gt === 'tv-taboo') {
          socket.emit('game_state', tvTabooPayload(targetRoomId, room, engine));
        } else if (gt === 'tv-lumeno') {
          socket.emit('game_state', tvLumenoPayload(targetRoomId, room, engine));
        } else if (gt === 'tv-math-cross') {
          socket.emit('game_state', tvMathCrossPayload(targetRoomId, room, engine));
        } else if (gt === 'tv-pipe-puzzle') {
          socket.emit('game_state', tvPipePuzzlePayload(targetRoomId, room, engine));
        } else if (gt === 'tv-colour-memory') {
          socket.emit('game_state', tvColourMemoryPayload(targetRoomId, room, engine));
        } else if (gt === 'tv-face-memory') {
          socket.emit('game_state', tvFaceMemoryPayload(targetRoomId, room, engine));
        } else if (gt === 'tv-sokoban') {
          const r = roomManager.getRoom(targetRoomId);
          if (r) socket.emit('game_state', tvSokobanPayload(r, engine));
        } else if (gt === 'tv-ring-sort') {
          const r = roomManager.getRoom(targetRoomId);
          if (r) socket.emit('game_state', tvRingSortPayload(r, engine));
        } else if (gt === 'tv-memory-match') {
          const r = roomManager.getRoom(targetRoomId);
          if (r) socket.emit('game_state', tvMemoryMatchPayload(r, engine));
        } else if (gt === 'tv-word-recall') {
          const r = roomManager.getRoom(targetRoomId);
          if (r) socket.emit('game_state', tvWordRecallPayload(r, engine));
        } else if (gt === 'tv-shopping-list') {
          const r = roomManager.getRoom(targetRoomId);
          if (r) socket.emit('game_state', tvShoppingListPayload(r, engine));
        } else if (gt === 'tv-stroop-colour') {
          const r = roomManager.getRoom(targetRoomId);
          if (r) socket.emit('game_state', tvStroopColourPayload(r, engine));
        } else if (gt === 'tv-pattern-sequence') {
          const r = roomManager.getRoom(targetRoomId);
          if (r) socket.emit('game_state', tvPatternSequencePayload(r, engine));
        } else if (gt === 'tv-speed-tap') {
          const r = roomManager.getRoom(targetRoomId);
          if (r) socket.emit('game_state', tvSpeedTapPayload(r, engine));
        } else if (gt === 'tv-daily-arithmetic' || gt === 'tv-missing-number' || gt === 'tv-number-sort' || gt === 'tv-quick-maths') {
          const r = roomManager.getRoom(targetRoomId);
          if (r) socket.emit('game_state', tvMathPayload(r, engine));
        } else if (gt === 'cooking') {
          socket.emit('cooking_state', engine.state());
          if (socket.data.color !== 'tv-host') {
            const ps = engine.playerState(name);
            if (ps) socket.emit('cooking_player_state', ps);
          }
        } else if (gt === 'ludo') {
          socket.emit('game_state', ludoPayload(targetRoomId, room, engine));
        } else {
          socket.emit('game_state', gameStatePayload(targetRoomId, room, engine));
        }
      }

      io.to(targetRoomId).emit('room_update', roomSnapshot(room));
      analytics.logEvent('player_joined', targetRoomId, socket.id, name, { color: result.color, gameType });
    };

    socket.on('join_game',    handleJoin);
    socket.on('join_xiangqi', (data) => handleJoin({ ...data, gameType: data.gameType || 'xiangqi' }));

    // ── Chor Dai Di: required player count ──────────────────────────
    // start_game is repurposed — for CDI we need 4 players
    // The 'start_game' handler below already handles the count check

    // ── Start game ──────────────────────────────────────────────────
    socket.on('start_game', () => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      const room = roomManager.getRoom(roomId);
      if (!room) return;
      if (engines.has(roomId)) return; // already started

      const gameType = roomGameTypes.get(roomId) || 'xiangqi';
      const nonHostPlayers = room.players.filter(p => p.color !== 'tv-host');
      const requiredPlayers = (gameType === 'chordaidi' || gameType === 'hearts') ? 4
        : gameType === 'cooking' ? 1
        : 2;
      const countForCheck = gameType === 'cooking' ? nonHostPlayers.length : room.players.length;
      if (countForCheck < requiredPlayers) {
        return socket.emit('error', { message: `Waiting for ${requiredPlayers - countForCheck} more player(s).` });
      }

      let engine;
      if (gameType === 'chess')          engine = createChessGame();
      else if (gameType === 'chordaidi') engine = createChordaidiGame();
      else if (gameType === 'bingo')     engine = createBingoGame(room.players.length);
      else if (gameType === 'boggle')           engine = createBoggleGame(room.players.length);
      else if (gameType === 'singapore-trivia')  engine = createTriviaGame(room.players.length);
      else if (gameType === 'spot-the-difference') engine = createDiffGame(room.players.length);
      else if (gameType === 'rhythm-tap')          engine = createRhythmGame(room.players.length);
      else if (gameType === 'gin-rummy')           engine = createGinRummyGame();
      else if (gameType === 'hearts')              engine = createHeartsGame();
      else if (gameType === 'crazy-eights')        engine = createCrazyEightsGame(room.players.length);
      else if (gameType === 'ludo')                engine = createLudoGame(room.players.length);
      else if (gameType === 'cooking') {
        engine = createCookingGame();
        for (const rp of nonHostPlayers) {
          engine.addPlayer(rp.name, rp.name);
        }
      }
      else                               engine = createXiangqiGame();
      engines.set(roomId, engine);

      if (gameType === 'chordaidi') {
        // Send each player their personalised state (private hand)
        room.players.forEach(p => {
          if (!p.socketId) return;
          io.to(p.socketId).emit('game_started', chordaidiPayload(roomId, room, engine, p.color));
        });
      } else if (gameType === 'bingo') {
        io.to(roomId).emit('game_started', bingoPayload(roomId, room, engine));
      } else if (gameType === 'boggle') {
        io.to(roomId).emit('game_started', bogglePayload(roomId, room, engine));
        // Auto-end round after 60 seconds
        const timer = setTimeout(() => {
          const eng = engines.get(roomId);
          const rm  = roomManager.getRoom(roomId);
          if (!eng || !rm) return;
          eng.endRound();
          const payload = bogglePayload(roomId, rm, eng);
          io.to(roomId).emit('game_state', payload);
          // Determine winner and record
          const winSeat = eng.winner();
          const winPlayer = rm.players.find(p => seatForBoggleColor(p.color) === winSeat);
          if (winPlayer) leaderboard.recordWin('boggle', winPlayer.name);
          const winnerColor = winPlayer?.color || null;
          io.to(roomId).emit('game_over', {
            winner: winnerColor,
            reason: winPlayer ? `${winPlayer.name} wins with ${eng.state().scores[winSeat]} points!` : "Time's up!"
          });
          engines.delete(roomId);
          roomGameTypes.delete(roomId);
          boggleTimers.delete(roomId);
          analytics.logEvent('game_ended', roomId, 'timer', 'timer', { winner: winnerColor, gameType: 'boggle' });
        }, 60_000);
        boggleTimers.set(roomId, timer);
      } else if (gameType === 'singapore-trivia') {
        io.to(roomId).emit('game_started', triviaPayload(roomId, room, engine));
      } else if (gameType === 'spot-the-difference') {
        io.to(roomId).emit('game_started', diffPayload(roomId, room, engine));
      } else if (gameType === 'rhythm-tap') {
        io.to(roomId).emit('game_started', rhythmPayload(roomId, room, engine));
      } else if (gameType === 'gin-rummy') {
        room.players.forEach(p => {
          if (!p.socketId) return;
          io.to(p.socketId).emit('game_started', ginRummyPayload(roomId, room, engine, p.color));
        });
      } else if (gameType === 'hearts') {
        room.players.forEach(p => {
          if (!p.socketId) return;
          io.to(p.socketId).emit('game_started', heartsPayload(roomId, room, engine, p.color));
        });
      } else if (gameType === 'crazy-eights') {
        room.players.forEach(p => {
          if (!p.socketId) return;
          io.to(p.socketId).emit('game_started', crazyEightsPayload(roomId, room, engine, p.color));
        });
      } else if (gameType === 'ludo') {
        io.to(roomId).emit('game_started', ludoPayload(roomId, room, engine));
      } else if (gameType === 'cooking') {
        const gs = engine.state();
        io.to(roomId).emit('cooking_started', gs);
        // Tick starts only when TV presses Ready (cooking_htp_done)
        // so the timer doesn't run during the how-to-play screen
      } else {
        const payload = gameStatePayload(roomId, room, engine);
        io.to(roomId).emit('game_started', payload);
      }
      analytics.logEvent('game_started', roomId, socket.id, socket.data.playerName, { gameType });
    });

    // ── Make move ───────────────────────────────────────────────────
    socket.on('make_move', ({ from, to, promotion }) => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      const engine = engines.get(roomId);
      if (!engine) return socket.emit('invalid_move', { reason: 'Game not started' });

      const room = roomManager.getRoom(roomId);
      if (!room) return;

      // Verify it is this socket's color's turn
      const playerColor = socket.data.color;
      const engineTurn = engine.turn();
      const gameType = roomGameTypes.get(roomId) || 'xiangqi';
      const firstColor = gameType === 'chess' ? 'white' : 'red';

      if ((engineTurn === 'w' && playerColor !== firstColor) ||
          (engineTurn === 'b' && playerColor !== 'black')) {
        return socket.emit('invalid_move', { reason: 'Not your turn' });
      }

      if (engine.isGameOver()) {
        return socket.emit('invalid_move', { reason: 'Game is over' });
      }

      const result = engine.move(from, to, promotion || null);
      if (!result.ok) {
        return socket.emit('invalid_move', { reason: result.reason });
      }

      const payload = gameStatePayload(roomId, room, engine);
      io.to(roomId).emit('game_state', payload);
      analytics.logEvent('move_made', roomId, socket.id, socket.data.playerName, { from, to, gameType });

      if (payload.isGameOver) {
        if (payload.winner) {
          const winPlayer = room.players.find(p => p.color === payload.winner);
          if (winPlayer) leaderboard.recordWin(gameType, winPlayer.name);
        }
        analytics.logEvent('game_ended', roomId, socket.id, socket.data.playerName, { winner: payload.winner, gameType });
        // Clean up engine so play_again / rematch is possible
        engines.delete(roomId);
        roomGameTypes.delete(roomId);
      }
    });

    // ── Chor Dai Di: play cards ──────────────────────────────────────
    socket.on('cdi_play', ({ cardIds }) => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      const engine = engines.get(roomId);
      if (!engine) return socket.emit('invalid_move', { reason: 'Game not started' });
      const room = roomManager.getRoom(roomId);
      if (!room) return;

      const seat = seatForColor(socket.data.color);
      const result = engine.play(seat, cardIds);
      if (!result.ok) return socket.emit('invalid_move', { reason: result.reason });

      broadcastCDI(io, roomId, room, engine);
      if (engine.isGameOver()) {
        const winSeat = engine.winner();
        const winPlayer = room.players.find(p => seatForColor(p.color) === winSeat);
        io.to(roomId).emit('game_over', { winner: winPlayer?.color || null, reason: `${winPlayer?.name || 'Someone'} played all cards!` });
        if (winPlayer) leaderboard.recordWin('chordaidi', winPlayer.name);
        engines.delete(roomId);
        roomGameTypes.delete(roomId);
      }
    });

    // ── Chor Dai Di: pass ────────────────────────────────────────────
    socket.on('cdi_pass', () => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      const engine = engines.get(roomId);
      if (!engine) return socket.emit('invalid_move', { reason: 'Game not started' });
      const room = roomManager.getRoom(roomId);
      if (!room) return;

      const seat = seatForColor(socket.data.color);
      const result = engine.pass(seat);
      if (!result.ok) return socket.emit('invalid_move', { reason: result.reason });

      broadcastCDI(io, roomId, room, engine);
    });

    // ── Gin Rummy: draw ─────────────────────────────────────────────
    socket.on('gin_draw', ({ source }) => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      const engine = engines.get(roomId);
      if (!engine) return socket.emit('invalid_move', { reason: 'Game not started' });
      const room = roomManager.getRoom(roomId);
      if (!room) return;

      const seat = seatForGinColor(socket.data.color);
      const result = engine.draw(seat, source);
      if (!result.ok) return socket.emit('invalid_move', { reason: result.reason });

      broadcastGinRummy(io, roomId, room, engine);
      if (result.exhausted) {
        io.to(roomId).emit('game_over', { winner: null, reason: 'Draw pile exhausted — tie!' });
        engines.delete(roomId);
        roomGameTypes.delete(roomId);
      }
    });

    // ── Gin Rummy: discard ────────────────────────────────────────────
    socket.on('gin_discard', ({ cardId }) => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      const engine = engines.get(roomId);
      if (!engine) return socket.emit('invalid_move', { reason: 'Game not started' });
      const room = roomManager.getRoom(roomId);
      if (!room) return;

      const seat = seatForGinColor(socket.data.color);
      const result = engine.discard(seat, cardId);
      if (!result.ok) return socket.emit('invalid_move', { reason: result.reason });

      broadcastGinRummy(io, roomId, room, engine);
      if (result.exhausted) {
        io.to(roomId).emit('game_over', { winner: null, reason: 'Draw pile exhausted — tie!' });
        engines.delete(roomId);
        roomGameTypes.delete(roomId);
      }
    });

    // ── Gin Rummy: knock ─────────────────────────────────────────────
    socket.on('gin_knock', ({ meldGroups }) => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      const engine = engines.get(roomId);
      if (!engine) return socket.emit('invalid_move', { reason: 'Game not started' });
      const room = roomManager.getRoom(roomId);
      if (!room) return;

      const seat = seatForGinColor(socket.data.color);
      // Auto-find best melds if none provided
      const hand = engine.state().hands[seat];
      if (!meldGroups || meldGroups.length === 0) {
        // Try each card as the discard, find the best knock
        const { findBestMelds } = require('../engine/gin-rummy');
        let bestKnock = null;
        for (const discardId of hand) {
          const remaining = hand.filter(id => id !== discardId);
          const best = findBestMelds(remaining);
          if (best.deadwoodPoints <= 10) {
            if (!bestKnock || best.deadwoodPoints < bestKnock.deadwoodPoints) {
              bestKnock = { melds: best.melds, discardId, deadwoodPoints: best.deadwoodPoints };
            }
          }
        }
        if (!bestKnock) return socket.emit('invalid_move', { reason: 'Cannot knock — deadwood exceeds 10' });
        const result = engine.knock(seat, bestKnock.melds, bestKnock.discardId);
        if (!result.ok) return socket.emit('invalid_move', { reason: result.reason });
      } else {
        // Client provided melds — need a discardId too (use last card not in melds)
        const meldCards = new Set(meldGroups.flat());
        const discardId = hand.find(id => !meldCards.has(id));
        const result = engine.knock(seat, meldGroups, discardId);
        if (!result.ok) return socket.emit('invalid_move', { reason: result.reason });
      }

      broadcastGinRummy(io, roomId, room, engine);
      if (engine.isGameOver()) {
        const winSeat = engine.winner();
        const winPlayer = room.players.find(p => seatForGinColor(p.color) === winSeat);
        io.to(roomId).emit('game_over', { winner: winSeat, reason: winPlayer ? `${winPlayer.name} wins!` : 'Game over!' });
        if (winPlayer) leaderboard.recordWin('gin-rummy', winPlayer.name);
        engines.delete(roomId);
        roomGameTypes.delete(roomId);
      }
    });

    // ── Gin Rummy: layoff ────────────────────────────────────────────
    socket.on('gin_layoff', ({ cardId, meldIndex }) => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      const engine = engines.get(roomId);
      if (!engine) return socket.emit('invalid_move', { reason: 'Game not started' });
      const room = roomManager.getRoom(roomId);
      if (!room) return;

      const seat = seatForGinColor(socket.data.color);
      const result = engine.layoff(seat, cardId, meldIndex);
      if (!result.ok) return socket.emit('invalid_move', { reason: result.reason });

      broadcastGinRummy(io, roomId, room, engine);
    });

    // ── Gin Rummy: finish layoff ─────────────────────────────────────
    socket.on('gin_finish_layoff', () => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      const engine = engines.get(roomId);
      if (!engine) return socket.emit('invalid_move', { reason: 'Game not started' });
      const room = roomManager.getRoom(roomId);
      if (!room) return;

      const seat = seatForGinColor(socket.data.color);
      const result = engine.finishLayoff(seat);
      if (!result.ok) return socket.emit('invalid_move', { reason: result.reason });

      broadcastGinRummy(io, roomId, room, engine);
      if (engine.isGameOver()) {
        const winSeat = engine.winner();
        const winPlayer = room.players.find(p => seatForGinColor(p.color) === winSeat);
        io.to(roomId).emit('game_over', { winner: winSeat, reason: winPlayer ? `${winPlayer.name} wins!` : 'Game over!' });
        if (winPlayer) leaderboard.recordWin('gin-rummy', winPlayer.name);
        engines.delete(roomId);
        roomGameTypes.delete(roomId);
      }
    });

    // ── Hearts: play card ────────────────────────────────────────────
    socket.on('hearts_play', ({ cardId }) => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      const engine = engines.get(roomId);
      if (!engine) return socket.emit('invalid_move', { reason: 'Game not started' });
      const room = roomManager.getRoom(roomId);
      if (!room) return;

      const seat = seatForHeartsColor(socket.data.color);
      const result = engine.play(seat, cardId);
      if (!result.ok) return socket.emit('invalid_move', { reason: result.reason });

      broadcastHearts(io, roomId, room, engine);
      if (engine.isGameOver()) {
        const winSeat = engine.winner();
        const winPlayer = room.players.find(p => seatForHeartsColor(p.color) === winSeat);
        const gs = engine.state();
        const scores = gs.pointsTaken.map((pts, i) => {
          const color = HEARTS_COLORS[i];
          const p = room.players.find(pl => pl.color === color);
          return `${p?.name || color}: ${pts}`;
        }).join(', ');
        io.to(roomId).emit('game_over', { winner: winSeat, reason: `${winPlayer?.name || 'Someone'} wins! (${scores})` });
        if (winPlayer) leaderboard.recordWin('hearts', winPlayer.name);
        engines.delete(roomId);
        roomGameTypes.delete(roomId);
      }
    });

    // ── Crazy Eights: play card ──────────────────────────────────────
    socket.on('c8_play', ({ cardId, chosenSuit }) => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      const engine = engines.get(roomId);
      if (!engine) return socket.emit('invalid_move', { reason: 'Game not started' });
      const room = roomManager.getRoom(roomId);
      if (!room) return;

      const seat = seatForC8Color(socket.data.color);
      const result = engine.play(seat, cardId, chosenSuit);
      if (!result.ok) return socket.emit('invalid_move', { reason: result.reason });

      broadcastC8(io, roomId, room, engine);
      if (engine.isGameOver()) {
        const winSeat = engine.winner();
        const winPlayer = room.players.find(p => seatForC8Color(p.color) === winSeat);
        io.to(roomId).emit('game_over', { winner: winSeat, reason: `${winPlayer?.name || 'Someone'} played all cards!` });
        if (winPlayer) leaderboard.recordWin('crazy-eights', winPlayer.name);
        engines.delete(roomId);
        roomGameTypes.delete(roomId);
      }
    });

    // ── Crazy Eights: draw card ──────────────────────────────────────
    socket.on('c8_draw', () => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      const engine = engines.get(roomId);
      if (!engine) return socket.emit('invalid_move', { reason: 'Game not started' });
      const room = roomManager.getRoom(roomId);
      if (!room) return;

      const seat = seatForC8Color(socket.data.color);
      const result = engine.draw(seat);
      if (!result.ok) return socket.emit('invalid_move', { reason: result.reason });

      broadcastC8(io, roomId, room, engine);
    });

    // ── Crazy Eights: pass turn ──────────────────────────────────────
    socket.on('c8_pass', () => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      const engine = engines.get(roomId);
      if (!engine) return socket.emit('invalid_move', { reason: 'Game not started' });
      const room = roomManager.getRoom(roomId);
      if (!room) return;

      const seat = seatForC8Color(socket.data.color);
      const result = engine.pass(seat);
      if (!result.ok) return socket.emit('invalid_move', { reason: result.reason });

      broadcastC8(io, roomId, room, engine);
    });

    // ── Bingo: caller draws next number ─────────────────────────────
    socket.on('bingo_call', () => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      const engine = engines.get(roomId);
      if (!engine) return socket.emit('error', { message: 'Game not started' });
      const room = roomManager.getRoom(roomId);
      if (!room) return;

      const seat = seatForBingoColor(socket.data.color);
      const result = engine.callNumber(seat);
      if (!result.ok) return socket.emit('error', { message: result.reason });

      broadcastBingo(io, roomId, room, engine);

      if (engine.isGameOver()) {
        const ws = engine.winners();
        // Record wins for all winner seats
        ws.forEach(w => {
          const wp = room.players.find(p => seatForBingoColor(p.color) === w.seat);
          if (wp) leaderboard.recordWin('bingo', wp.name);
        });
        const winNames = ws.map(w => {
          const wp = room.players.find(p => seatForBingoColor(p.color) === w.seat);
          return wp?.name || '?';
        });
        io.to(roomId).emit('game_over', {
          winner: winNames.join(', '),
          reason: `BINGO! ${winNames.join(' & ')} won!`
        });
        engines.delete(roomId);
        roomGameTypes.delete(roomId);
        analytics.logEvent('game_ended', roomId, socket.id, socket.data.playerName, { winner: winNames.join(', '), gameType: 'bingo' });
      }
    });

    // ── TV Bingo: host starts auto-call game ───────────────────────────
    socket.on('tv_bingo_start', () => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      if (socket.data.color !== 'tv-host') return;
      const room = roomManager.getRoom(roomId);
      if (!room) return;
      if (engines.has(roomId)) return; // already started

      const phonePlayers = room.players.filter(p => p.color !== 'tv-host');
      if (phonePlayers.length < 1) {
        return socket.emit('error', { message: 'Need at least 1 player to start.' });
      }

      const engine = createBingoGame(phonePlayers.length, { autoCallMode: true });
      engines.set(roomId, engine);
      roomGameTypes.set(roomId, 'tv-bingo');

      io.to(roomId).emit('game_started', tvBingoPayload(roomId, room, engine));
      analytics.logEvent('game_started', roomId, socket.id, 'tv-host', { gameType: 'tv-bingo', playerCount: phonePlayers.length });

      // Auto-call: first number after 5s, then every 15s
      const callAndBroadcast = () => {
        const eng = engines.get(roomId);
        const rm = roomManager.getRoom(roomId);
        if (!eng || !rm) {
          clearInterval(bingoAutoTimers.get(roomId));
          bingoAutoTimers.delete(roomId);
          return;
        }

        const result = eng.callNumber(-1);
        if (!result.ok) {
          clearInterval(bingoAutoTimers.get(roomId));
          bingoAutoTimers.delete(roomId);
          return;
        }

        io.to(roomId).emit('game_state', tvBingoPayload(roomId, rm, eng));
        io.to(roomId).emit('tv_bingo_number_called', {
          number: result.number,
          column: BINGO_COLUMNS[Math.floor((result.number - 1) / 15)],
          calledCount: eng.state().called.length,
          totalNumbers: 75
        });

        // Note: game does NOT end from callNumber in autoCallMode.
        // Game ends when a player marks their winning cell via tv_bingo_mark.
        // But stop the timer if all 75 numbers have been called.
        if (eng.state().pool.length === 0) {
          clearInterval(bingoAutoTimers.get(roomId));
          bingoAutoTimers.delete(roomId);
        }
      };

      // First call after 5 seconds, then recurring at configured interval
      const callMs = bingoCallIntervals.get(roomId) || 15_000;
      const firstCallTimeout = setTimeout(() => {
        callAndBroadcast();
        const interval = setInterval(callAndBroadcast, callMs);
        bingoAutoTimers.set(roomId, interval);
      }, 5_000);
      bingoAutoTimers.set(roomId, firstCallTimeout);
    });

    // ── TV Bingo: host changes auto-call interval ─────────────────────
    socket.on('tv_bingo_set_interval', ({ interval }) => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      if (socket.data.color !== 'tv-host') return;
      const ms = interval === 10 ? 10_000 : 15_000;
      bingoCallIntervals.set(roomId, ms);

      // If game is already running, restart the timer with new interval
      if (bingoAutoTimers.has(roomId) && engines.has(roomId)) {
        clearInterval(bingoAutoTimers.get(roomId));
        const eng = engines.get(roomId);
        const rm = roomManager.getRoom(roomId);
        if (eng && rm) {
          const callAndBroadcast = () => {
            const e = engines.get(roomId);
            const r = roomManager.getRoom(roomId);
            if (!e || !r) {
              clearInterval(bingoAutoTimers.get(roomId));
              bingoAutoTimers.delete(roomId);
              return;
            }
            const result = e.callNumber(-1);
            if (!result.ok) {
              clearInterval(bingoAutoTimers.get(roomId));
              bingoAutoTimers.delete(roomId);
              return;
            }
            io.to(roomId).emit('game_state', tvBingoPayload(roomId, r, e));
            io.to(roomId).emit('tv_bingo_number_called', {
              number: result.number,
              column: BINGO_COLUMNS[Math.floor((result.number - 1) / 15)],
              calledCount: e.state().called.length,
              totalNumbers: 75
            });
            if (e.state().pool.length === 0) {
              clearInterval(bingoAutoTimers.get(roomId));
              bingoAutoTimers.delete(roomId);
            }
          };
          const newInterval = setInterval(callAndBroadcast, ms);
          bingoAutoTimers.set(roomId, newInterval);
        }
      }

      // Broadcast updated interval to all clients
      io.to(roomId).emit('tv_bingo_interval_changed', { interval: ms / 1000 });
    });

    // ── TV Bingo: player taps a cell to mark it ──────────────────────
    socket.on('tv_bingo_mark', ({ row, col }) => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      const engine = engines.get(roomId);
      if (!engine) return socket.emit('error', { message: 'Game not started' });
      const room = roomManager.getRoom(roomId);
      if (!room) return;

      const seat = seatForTvBingoColor(socket.data.color);
      if (seat < 0) return; // tv-host or spectator cannot mark

      const result = engine.markCell(seat, row, col);

      if (!result.ok) {
        if (result.wrongTap) {
          // Player tapped a number that hasn't been called — send feedback
          socket.emit('tv_bingo_wrong_tap', { row, col, number: result.number, reason: result.reason });
        }
        return;
      }

      // Send updated state to the marking player (their card changed)
      socket.emit('tv_bingo_mark_ok', { row, col, number: result.number });

      // Broadcast full state so TV and all players see progress
      io.to(roomId).emit('game_state', tvBingoPayload(roomId, room, engine));

      // Check if this mark triggered BINGO
      if (result.bingo) {
        // Stop the auto-call timer
        if (bingoAutoTimers.has(roomId)) {
          clearInterval(bingoAutoTimers.get(roomId));
          bingoAutoTimers.delete(roomId);
        }
        handleTvBingoGameOver(io, roomId, room, engine);
      }
    });

    // ── TV Higher or Lower: host starts game ──────────────────────────
    socket.on('tv_hl_start', () => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      if (socket.data.color !== 'tv-host') return;
      const room = roomManager.getRoom(roomId);
      if (!room) return;
      if (engines.has(roomId)) return; // already started

      const phonePlayers = room.players.filter(p => p.color !== 'tv-host');
      if (phonePlayers.length < 1) {
        return socket.emit('error', { message: 'Need at least 1 player to start.' });
      }

      const engine = createHigherLowerGame(phonePlayers.length);
      engines.set(roomId, engine);
      roomGameTypes.set(roomId, 'tv-higher-lower');

      io.to(roomId).emit('game_started', tvHlPayload(roomId, room, engine));
      analytics.logEvent('game_started', roomId, socket.id, 'tv-host', { gameType: 'tv-higher-lower', playerCount: phonePlayers.length });
    });

    // ── TV Higher or Lower: player guesses ──────────────────────────────
    socket.on('tv_hl_guess', ({ direction }) => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      const engine = engines.get(roomId);
      if (!engine) return socket.emit('error', { message: 'Game not started' });
      const room = roomManager.getRoom(roomId);
      if (!room) return;

      const seat = seatForTvHlColor(socket.data.color);
      if (seat < 0) return; // tv-host or spectator cannot guess

      const result = engine.guess(seat, direction);
      if (!result.ok) return socket.emit('error', { message: result.reason });

      // Broadcast the result for animation (TV and phones)
      const phonePlayers = room.players.filter(p => p.color !== 'tv-host');
      const guesserName = phonePlayers[seat]?.name || '?';
      const eliminatedName = result.eliminatedSeat !== null
        ? (phonePlayers[result.eliminatedSeat]?.name || '?')
        : null;

      io.to(roomId).emit('tv_hl_result', {
        seat,
        guesserName,
        direction,
        correct: result.correct,
        revealedCard: result.revealedCard,
        previousCard: result.previousCard,
        eliminatedName,
        lostLife: !result.correct && result.eliminatedSeat === null
      });

      // Broadcast full state
      io.to(roomId).emit('game_state', tvHlPayload(roomId, room, engine));

      // Check game over
      if (result.isGameOver) {
        const winSeat = engine.winner();
        const winPlayer = winSeat !== null ? phonePlayers[winSeat] : null;
        if (winPlayer) leaderboard.recordWin('tv-higher-lower', winPlayer.name);
        io.to(roomId).emit('game_over', {
          winner: winPlayer?.name || null,
          reason: winPlayer
            ? `${winPlayer.name} is the last one standing!`
            : 'Game over — no survivors!'
        });
        engines.delete(roomId);
        roomGameTypes.delete(roomId);
        analytics.logEvent('game_ended', roomId, socket.id, socket.data.playerName, { winner: winPlayer?.name || null, gameType: 'tv-higher-lower' });
      }
    });

    // ── TV Racing: host starts race ──────────────────────────────────
    socket.on('tv_racing_start', () => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      if (socket.data.color !== 'tv-host') return;
      const room = roomManager.getRoom(roomId);
      if (!room) return;
      if (engines.has(roomId)) return; // already started

      const phonePlayers = room.players.filter(p => p.color !== 'tv-host');
      if (phonePlayers.length < 1) {
        return socket.emit('error', { message: 'Need at least 1 player to start.' });
      }

      const engine = createRcRacingGame(phonePlayers.length);
      engines.set(roomId, engine);
      roomGameTypes.set(roomId, 'tv-racing');

      io.to(roomId).emit('game_started', tvRacingPayload(roomId, room, engine));
      analytics.logEvent('game_started', roomId, socket.id, 'tv-host', { gameType: 'tv-racing', playerCount: phonePlayers.length });

      // Track per-player lap counts and finish state for events
      const prevLaps     = new Array(phonePlayers.length).fill(0);
      const prevFinished = new Array(phonePlayers.length).fill(false);

      // Build a seat→socketId map so we can send personal events
      function socketForSeat(seat) {
        const p = phonePlayers[seat];
        return p ? p.socketId : null;
      }

      // Delay tick loop by 3.2s for countdown (3-2-1-GO!)
      setTimeout(() => {
      // Start tick loop (~20fps)
      const tickInterval = setInterval(() => {
        const eng = engines.get(roomId);
        const rm = roomManager.getRoom(roomId);
        if (!eng || !rm) {
          clearInterval(racingTickTimers.get(roomId));
          racingTickTimers.delete(roomId);
          return;
        }

        eng.tick(1 / 20);
        const gs = eng.state();
        io.to(roomId).emit('game_state', tvRacingPayload(roomId, rm, eng));

        // Emit lap / finish events to individual players
        gs.cars.forEach((car, seat) => {
          const sid = socketForSeat(seat);
          if (!sid) return;
          if (car.lap > prevLaps[seat]) {
            prevLaps[seat] = car.lap;
            if (!car.finished) {
              io.to(sid).emit('racing_lap', { lap: car.lap, totalLaps: gs.totalLaps });
            }
          }
          if (car.finished && !prevFinished[seat]) {
            prevFinished[seat] = true;
            io.to(sid).emit('racing_finished', { finishOrder: car.finishOrder + 1 });
          }
        });

        // End race when winner crosses the line (don't wait for all players)
        if (eng.winner() !== null) {
          clearInterval(racingTickTimers.get(roomId));
          racingTickTimers.delete(roomId);
          const winSeat = eng.winner();
          const winPlayer = winSeat !== null ? phonePlayers[winSeat] : null;
          if (winPlayer) leaderboard.recordWin('tv-racing', winPlayer.name);
          const positions = gs.positions.map(p => ({
            name: phonePlayers[p.seat] ? phonePlayers[p.seat].name : `P${p.seat + 1}`,
            rank: p.rank,
            finished: p.finished,
          }));
          io.to(roomId).emit('game_over', {
            winner: winPlayer?.name || null,
            reason: winPlayer ? `${winPlayer.name} wins the race!` : 'Race complete!',
            positions,
          });
          engines.delete(roomId);
          roomGameTypes.delete(roomId);
          analytics.logEvent('game_ended', roomId, socket.id, socket.data.playerName, { winner: winPlayer?.name || null, gameType: 'tv-racing' });
        }
      }, 50);
      racingTickTimers.set(roomId, tickInterval);
      }, 3200); // end countdown delay
    });

    // ── TV Racing: player steers ────────────────────────────────────────
    socket.on('tv_racing_steer', ({ direction }) => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      const engine = engines.get(roomId);
      if (!engine) return;

      const seat = seatForTvRacingColor(socket.data.color);
      if (seat < 0) return; // tv-host or spectator cannot steer

      engine.steer(seat, direction);
    });

    // ── TV Racing: player brake ────────────────────────────────────────
    socket.on('tv_racing_brake', ({ braking }) => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      const engine = engines.get(roomId);
      if (!engine) return;

      const seat = seatForTvRacingColor(socket.data.color);
      if (seat < 0) return;

      engine.setBrake(seat, braking);
    });

    // ── TV Boggle: host starts game ─────────────────────────────────
    socket.on('tv_boggle_start', () => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      if (socket.data.color !== 'tv-host') return;
      const room = roomManager.getRoom(roomId);
      if (!room) return;
      if (engines.has(roomId)) return; // already started

      const phonePlayers = room.players.filter(p => p.color !== 'tv-host');
      if (phonePlayers.length < 1) {
        return socket.emit('error', { message: 'Need at least 1 player to start.' });
      }

      const engine = createBoggleGame(phonePlayers.length, { roundSeconds: 120 });
      engines.set(roomId, engine);
      roomGameTypes.set(roomId, 'tv-boggle');

      io.to(roomId).emit('game_started', tvBogglePayload(roomId, room, engine));
      analytics.logEvent('game_started', roomId, socket.id, 'tv-host', { gameType: 'tv-boggle', playerCount: phonePlayers.length });

      // Auto-end round after 120 seconds (2 minutes)
      const timer = setTimeout(() => {
        const eng = engines.get(roomId);
        const rm  = roomManager.getRoom(roomId);
        if (!eng || !rm) return;
        eng.endRound();
        const payload = tvBogglePayload(roomId, rm, eng);
        io.to(roomId).emit('game_state', payload);
        // Determine winner and record
        const winSeat = eng.winner();
        const tvPhonePlayers = rm.players.filter(p => p.color !== 'tv-host');
        const winPlayer = winSeat !== null ? tvPhonePlayers[winSeat] : null;
        if (winPlayer) leaderboard.recordWin('tv-boggle', winPlayer.name);
        io.to(roomId).emit('game_over', {
          winner: winPlayer?.name || null,
          reason: winPlayer ? `${winPlayer.name} wins with ${eng.state().scores[winSeat]} points!` : "Time's up!"
        });
        engines.delete(roomId);
        roomGameTypes.delete(roomId);
        tvBoggleTimers.delete(roomId);
        analytics.logEvent('game_ended', roomId, 'timer', 'timer', { winner: winPlayer?.name || null, gameType: 'tv-boggle' });
      }, 120_000);
      tvBoggleTimers.set(roomId, timer);
    });

    // ── Boggle: submit a word (handles both 'boggle' and 'tv-boggle') ──
    socket.on('boggle_submit', ({ word }) => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      const engine = engines.get(roomId);
      if (!engine) return socket.emit('error', { message: 'Game not started' });
      const room = roomManager.getRoom(roomId);
      if (!room) return;

      const gt = roomGameTypes.get(roomId);
      const seat = gt === 'tv-boggle'
        ? seatForTvBoggleColor(socket.data.color)
        : seatForBoggleColor(socket.data.color);
      if (seat < 0) return; // tv-host or invalid color

      const result = engine.submitWord(seat, word);
      if (!result.ok) return socket.emit('boggle_reject', { word, reason: result.reason });

      // Confirm to submitter; broadcast updated counts to all
      socket.emit('boggle_accept', { word: result.word });
      io.to(roomId).emit('boggle_counts', {
        submissionCounts: engine.state().submissionCounts
      });
    });

    // ── Boggle: host ends round early ────────────────────────────────
    socket.on('boggle_end', () => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      const engine = engines.get(roomId);
      if (!engine) return;
      const room = roomManager.getRoom(roomId);
      if (!room) return;
      // Only the red (seat 0 / host) player can end early
      if (socket.data.color !== 'red') return;

      // Cancel auto-timer
      if (boggleTimers.has(roomId)) {
        clearTimeout(boggleTimers.get(roomId));
        boggleTimers.delete(roomId);
      }

      engine.endRound();
      const payload = bogglePayload(roomId, room, engine);
      io.to(roomId).emit('game_state', payload);

      const winSeat = engine.winner();
      const winPlayer = room.players.find(p => seatForBoggleColor(p.color) === winSeat);
      if (winPlayer) leaderboard.recordWin('boggle', winPlayer.name);
      const winnerColor = winPlayer?.color || null;
      io.to(roomId).emit('game_over', {
        winner: winnerColor,
        reason: winPlayer ? `${winPlayer.name} wins with ${engine.state().scores[winSeat]} points!` : "Game over!"
      });
      engines.delete(roomId);
      roomGameTypes.delete(roomId);
      analytics.logEvent('game_ended', roomId, socket.id, socket.data.playerName, { winner: winnerColor, gameType: 'boggle' });
    });

    // ── Singapore Trivia: host starts/advances question ─────────────
    // Called both to start Q1 (phase='waiting', questionIndex=-1)
    // and to advance from reveal to next question (phase='reveal').
    socket.on('trivia_next', () => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      if (socket.data.color !== 'p1') return; // host only
      const engine = engines.get(roomId);
      if (!engine) return;
      const room = roomManager.getRoom(roomId);
      if (!room) return;

      // Clear any pending auto-reveal timer
      if (triviaTimers.has(roomId)) {
        clearTimeout(triviaTimers.get(roomId));
        triviaTimers.delete(roomId);
      }

      const phase = engine.state().phase;

      // If coming from reveal phase, advance to next/finished first
      if (phase === 'reveal') {
        const advResult = engine.nextQuestion();
        if (!advResult.ok) return socket.emit('error', { message: advResult.reason });
        if (advResult.finished) {
          // All questions done — trivia_finish will handle the game_over
          io.to(roomId).emit('game_state', triviaPayload(roomId, room, engine));
          return;
        }
        // Now phase is 'waiting' — fall through to startQuestion
      }

      // Start the question (phase must be 'waiting')
      const startResult = engine.startQuestion();
      if (!startResult.ok) return socket.emit('error', { message: startResult.reason });

      io.to(roomId).emit('game_state', triviaPayload(roomId, room, engine));

      // Auto-reveal after 20 seconds
      const timer = setTimeout(() => {
        const eng = engines.get(roomId);
        const rm  = roomManager.getRoom(roomId);
        if (!eng || !rm) return;
        if (eng.state().phase !== 'question') return;
        eng.revealAnswers();
        io.to(roomId).emit('game_state', triviaPayload(roomId, rm, eng));
        triviaTimers.delete(roomId);
      }, 20_000);
      triviaTimers.set(roomId, timer);
    });

    // ── Singapore Trivia: host manually reveals answers ──────────────
    socket.on('trivia_reveal', () => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      if (socket.data.color !== 'p1') return; // host only
      const engine = engines.get(roomId);
      if (!engine) return;
      const room = roomManager.getRoom(roomId);
      if (!room) return;

      // Cancel auto-reveal timer
      if (triviaTimers.has(roomId)) {
        clearTimeout(triviaTimers.get(roomId));
        triviaTimers.delete(roomId);
      }

      const result = engine.revealAnswers();
      if (!result.ok) return socket.emit('error', { message: result.reason });
      io.to(roomId).emit('game_state', triviaPayload(roomId, room, engine));
    });

    // ── Singapore Trivia: submit answer ─────────────────────────────
    socket.on('trivia_answer', ({ answerIndex }) => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      const engine = engines.get(roomId);
      if (!engine) return;
      const room = roomManager.getRoom(roomId);
      if (!room) return;

      const seat = seatForTriviaColor(socket.data.color);
      const result = engine.submitAnswer(seat, answerIndex);
      if (!result.ok) return socket.emit('error', { message: result.reason });

      // Broadcast updated answer count to all (no secret info here)
      io.to(roomId).emit('game_state', triviaPayload(roomId, room, engine));

      // If all players answered, auto-reveal
      if (result.allAnswered) {
        if (triviaTimers.has(roomId)) {
          clearTimeout(triviaTimers.get(roomId));
          triviaTimers.delete(roomId);
        }
        engine.revealAnswers();
        io.to(roomId).emit('game_state', triviaPayload(roomId, room, engine));
      }
    });

    // ── Singapore Trivia: host finishes game after last question ─────
    socket.on('trivia_finish', () => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      if (socket.data.color !== 'p1') return; // host only
      const engine = engines.get(roomId);
      if (!engine) return;
      const room = roomManager.getRoom(roomId);
      if (!room) return;

      if (triviaTimers.has(roomId)) {
        clearTimeout(triviaTimers.get(roomId));
        triviaTimers.delete(roomId);
      }

      // nextQuestion sets phase to 'finished' and isGameOver = true
      engine.nextQuestion();

      const gs = engine.state();
      const winSeat = engine.winner();
      const winPlayer = room.players.find(p => seatForTriviaColor(p.color) === winSeat);
      const winnerColor = winPlayer?.color || null;
      if (winPlayer) leaderboard.recordWin('singapore-trivia', winPlayer.name);

      io.to(roomId).emit('game_state', triviaPayload(roomId, room, engine));
      io.to(roomId).emit('game_over', {
        winner: winnerColor,
        reason: winPlayer
          ? `${winPlayer.name} wins with ${gs.scores[winSeat]} points!`
          : "Game over!"
      });
      engines.delete(roomId);
      roomGameTypes.delete(roomId);
      analytics.logEvent('game_ended', roomId, socket.id, socket.data.playerName, { winner: winnerColor, gameType: 'singapore-trivia' });
    });

    // ── Spot the Difference: host starts first round ──────────────────
    socket.on('diff_start', () => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      if (socket.data.color !== 'p1') return;
      const engine = engines.get(roomId);
      if (!engine) return;
      const room = roomManager.getRoom(roomId);
      if (!room) return;

      const result = engine.startRound();
      if (!result.ok) return socket.emit('error', { message: result.reason });

      io.to(roomId).emit('game_state', diffPayload(roomId, room, engine));

      // Auto-timeout after 60 seconds
      const timer = setTimeout(() => {
        const eng = engines.get(roomId);
        const rm  = roomManager.getRoom(roomId);
        if (!eng || !rm) return;
        eng.roundTimeout();
        io.to(roomId).emit('game_state', diffPayload(roomId, rm, eng));
        diffTimers.delete(roomId);
      }, 60_000);
      diffTimers.set(roomId, timer);
      analytics.logEvent('diff_round_start', roomId, socket.id, socket.data.playerName, { round: engine.state().roundIndex });
    });

    // ── Spot the Difference: player clicks a spot ─────────────────────
    socket.on('diff_click', ({ x, y }) => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      const engine = engines.get(roomId);
      if (!engine) return;
      const room = roomManager.getRoom(roomId);
      if (!room) return;

      // Validate coords
      if (typeof x !== 'number' || typeof y !== 'number') return;
      if (x < 0 || x > 100 || y < 0 || y > 100) return;

      const result = engine.clickHotspot(x, y);
      if (!result.ok) return;

      if (result.found) {
        io.to(roomId).emit('game_state', diffPayload(roomId, room, engine));
        analytics.logEvent('diff_found', roomId, socket.id, socket.data.playerName, { hotspotId: result.hotspotId });

        if (result.allFound) {
          // Clear round timer
          if (diffTimers.has(roomId)) {
            clearTimeout(diffTimers.get(roomId));
            diffTimers.delete(roomId);
          }
          if (engine.isGameOver()) {
            const gs = engine.state();
            io.to(roomId).emit('game_over', {
              winner: null,
              reason: `All differences found! Team score: ${gs.teamScore} pts 🎉`
            });
            engines.delete(roomId);
            roomGameTypes.delete(roomId);
            analytics.logEvent('game_ended', roomId, socket.id, socket.data.playerName, { teamScore: gs.teamScore, gameType: 'spot-the-difference' });
          }
        }
      } else {
        // Wrong click — private feedback to the clicker only
        socket.emit('diff_miss', { x, y });
      }
    });

    // ── Spot the Difference: host advances to next round ──────────────
    socket.on('diff_next', () => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      if (socket.data.color !== 'p1') return;
      const engine = engines.get(roomId);
      if (!engine) return;
      const room = roomManager.getRoom(roomId);
      if (!room) return;

      // Cancel existing round timer
      if (diffTimers.has(roomId)) {
        clearTimeout(diffTimers.get(roomId));
        diffTimers.delete(roomId);
      }

      const result = engine.nextRound();
      if (!result.ok) return socket.emit('error', { message: result.reason });

      io.to(roomId).emit('game_state', diffPayload(roomId, room, engine));

      if (engine.isGameOver()) {
        const gs = engine.state();
        io.to(roomId).emit('game_over', {
          winner: null,
          reason: `Game complete! Team score: ${gs.teamScore} pts 🎉`
        });
        engines.delete(roomId);
        roomGameTypes.delete(roomId);
        analytics.logEvent('game_ended', roomId, socket.id, socket.data.playerName, { teamScore: gs.teamScore, gameType: 'spot-the-difference' });
      } else {
        // Start new round timer
        const timer = setTimeout(() => {
          const eng = engines.get(roomId);
          const rm  = roomManager.getRoom(roomId);
          if (!eng || !rm) return;
          eng.roundTimeout();
          io.to(roomId).emit('game_state', diffPayload(roomId, rm, eng));
          diffTimers.delete(roomId);
        }, 60_000);
        diffTimers.set(roomId, timer);
      }
    });

    // ── Spot the Difference: host ends game early ─────────────────────
    socket.on('diff_finish', () => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      if (socket.data.color !== 'p1') return;
      const engine = engines.get(roomId);
      if (!engine) return;
      const room = roomManager.getRoom(roomId);
      if (!room) return;

      if (diffTimers.has(roomId)) {
        clearTimeout(diffTimers.get(roomId));
        diffTimers.delete(roomId);
      }

      engine.finishGame();
      const gs = engine.state();
      io.to(roomId).emit('game_state', diffPayload(roomId, room, engine));
      io.to(roomId).emit('game_over', {
        winner: null,
        reason: `Game ended. Team score: ${gs.teamScore} pts`
      });
      engines.delete(roomId);
      roomGameTypes.delete(roomId);
      analytics.logEvent('game_ended', roomId, socket.id, socket.data.playerName, { teamScore: gs.teamScore, gameType: 'spot-the-difference', reason: 'host_ended' });
    });

    // ── Rhythm Tap: host starts game ──────────────────────────────────
    socket.on('rhythm_start', () => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      if (socket.data.color !== 'p1') return;
      const engine = engines.get(roomId);
      if (!engine) return;
      const room = roomManager.getRoom(roomId);
      if (!room) return;

      const startTime = Date.now();
      const result = engine.startGame(startTime);
      if (!result.ok) return socket.emit('error', { message: result.reason });

      io.to(roomId).emit('game_state', rhythmPayload(roomId, room, engine));

      // Auto-end when last beat expires + 2s buffer
      const lastBeat = engine.lastBeatTime();
      const endDelay = lastBeat + 2000;

      const timer = setTimeout(() => {
        const eng = engines.get(roomId);
        const rm  = roomManager.getRoom(roomId);
        if (!eng || !rm) return;
        eng.endGame();
        const gs = eng.state();
        io.to(roomId).emit('game_state', rhythmPayload(roomId, rm, eng));

        const winSeat   = eng.winner();
        const winPlayer = rm.players.find(p => seatForRhythmColor(p.color) === winSeat);
        const winnerColor = winPlayer?.color || null;
        if (winPlayer) leaderboard.recordWin('rhythm-tap', winPlayer.name);
        io.to(roomId).emit('game_over', {
          winner: winnerColor,
          reason: winPlayer
            ? `${winPlayer.name} wins with ${gs.scores[winSeat]} hits!`
            : 'Game over!'
        });
        engines.delete(roomId);
        roomGameTypes.delete(roomId);
        rhythmTimers.delete(roomId);
        analytics.logEvent('game_ended', roomId, 'timer', 'timer', { winner: winnerColor, gameType: 'rhythm-tap' });
      }, endDelay);
      rhythmTimers.set(roomId, timer);
      analytics.logEvent('game_started', roomId, socket.id, socket.data.playerName, { gameType: 'rhythm-tap', pattern: engine.state().patternName });
    });

    // ── Rhythm Tap: player taps a lane ────────────────────────────────
    socket.on('rhythm_tap', ({ lane, clientTime }) => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      const engine = engines.get(roomId);
      if (!engine) return;
      const room = roomManager.getRoom(roomId);
      if (!room) return;

      if (typeof lane !== 'number' || lane < 0 || lane > 3) return;
      if (typeof clientTime !== 'number') return;

      const seat   = seatForRhythmColor(socket.data.color);
      const result = engine.tapBeat(seat, lane, clientTime);
      if (!result.ok) return;

      // Private timing feedback to the tapping player
      socket.emit('rhythm_tap_result', {
        hit:       result.hit,
        accuracy:  result.accuracy || 'miss',
        beatIndex: result.beatIndex ?? null
      });

      // Broadcast updated scores to all
      const gs = engine.state();
      io.to(roomId).emit('rhythm_score_update', {
        scores:   gs.scores,
        beatsHit: gs.beatsHit
      });
    });

    // ── Rhythm Tap: host ends game early ──────────────────────────────
    socket.on('rhythm_finish', () => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      if (socket.data.color !== 'p1') return;
      const engine = engines.get(roomId);
      if (!engine) return;
      const room = roomManager.getRoom(roomId);
      if (!room) return;

      if (rhythmTimers.has(roomId)) {
        clearTimeout(rhythmTimers.get(roomId));
        rhythmTimers.delete(roomId);
      }

      engine.endGame();
      const gs        = engine.state();
      const winSeat   = engine.winner();
      const winPlayer = room.players.find(p => seatForRhythmColor(p.color) === winSeat);
      const winnerColor = winPlayer?.color || null;
      if (winPlayer) leaderboard.recordWin('rhythm-tap', winPlayer.name);

      io.to(roomId).emit('game_state', rhythmPayload(roomId, room, engine));
      io.to(roomId).emit('game_over', {
        winner: winnerColor,
        reason: winPlayer
          ? `${winPlayer.name} wins with ${gs.scores[winSeat]} hits!`
          : 'Game over!'
      });
      engines.delete(roomId);
      roomGameTypes.delete(roomId);
      analytics.logEvent('game_ended', roomId, socket.id, socket.data.playerName, { winner: winnerColor, gameType: 'rhythm-tap', reason: 'host_ended' });
    });

    // ── Undo request ────────────────────────────────────────────────
    socket.on('request_undo', () => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      const room = roomManager.getRoom(roomId);
      if (!room) return;
      const opponent = room.players.find(p => p.color !== socket.data.color && p.socketId);
      if (!opponent) return socket.emit('error', { message: 'Opponent not connected' });
      io.to(opponent.socketId).emit('undo_requested', { from: socket.data.playerName });
      analytics.logEvent('undo_requested', roomId, socket.id, socket.data.playerName);
    });

    // ── Approve undo ────────────────────────────────────────────────
    socket.on('approve_undo', () => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      const engine = engines.get(roomId);
      if (!engine) return;
      const room = roomManager.getRoom(roomId);
      if (!room) return;
      if (!engine.undo()) return;
      io.to(roomId).emit('game_state', gameStatePayload(roomId, room, engine));
    });

    // ── Decline undo ────────────────────────────────────────────────
    socket.on('decline_undo', () => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      const room = roomManager.getRoom(roomId);
      if (!room) return;
      const requester = room.players.find(p => p.color !== socket.data.color && p.socketId);
      if (!requester) return;
      io.to(requester.socketId).emit('undo_declined');
    });

    // ── Resign ──────────────────────────────────────────────────────
    socket.on('resign', () => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      const room = roomManager.getRoom(roomId);
      if (!room) return;
      // Opponent of the resigning player wins
      const winnerPlayer = room.players.find(p => p.color !== socket.data.color);
      const winner = winnerPlayer?.color || null;
      io.to(roomId).emit('game_over', { winner, reason: `${socket.data.playerName} resigned` });
      const gt = roomGameTypes.get(roomId) || 'xiangqi';
      if (winnerPlayer) leaderboard.recordWin(gt, winnerPlayer.name);
      engines.delete(roomId);
      roomGameTypes.delete(roomId);
      analytics.logEvent('game_ended', roomId, socket.id, socket.data.playerName, { winner, reason: 'resign' });
    });

    // ── TV 20 Questions: host starts game ──────────────────────────────
    socket.on('tv_20q_start', () => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      if (socket.data.color !== 'tv-host') return;
      const room = roomManager.getRoom(roomId);
      if (!room) return;

      const phonePlayers = room.players.filter(p => p.color !== 'tv-host' && p.socketId);
      if (phonePlayers.length < 1) {
        return socket.emit('error', { message: 'Need at least 1 player to start.' });
      }

      const engine = create20QGame(phonePlayers.length);
      engines.set(roomId, engine);
      roomGameTypes.set(roomId, 'tv-20-questions');

      io.to(roomId).emit('game_started', tv20qPayload(roomId, room, engine));
      analytics.logEvent('game_started', roomId, socket.id, 'tv-host', { gameType: 'tv-20-questions', playerCount: phonePlayers.length });
    });

    // ── TV 20 Questions: player asks a question ──────────────────────────
    socket.on('tv_20q_ask', async ({ text }) => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      const engine = engines.get(roomId);
      if (!engine || typeof engine.askQuestion !== 'function') return socket.emit('error', { message: 'Game not started' });
      const room = roomManager.getRoom(roomId);
      if (!room) return;

      const seat = seatForTv20qColor(socket.data.color);
      if (seat < 0) return; // host can't ask

      const result = await engine.askQuestion(seat, text);
      if (!result.ok) {
        // Tell the player (and TV) to rephrase as a yes/no question
        const askerName = socket.data.playerName || 'Player';
        socket.emit('tv_20q_rephrase', { message: result.reason });
        io.to(roomId).emit('tv_20q_rephrase_tv', {
          askerName,
          question: text.trim(),
          message: result.reason
        });
        return;
      }

      // Broadcast the answer event for animation, then full state
      const askerName = socket.data.playerName || 'Player';
      io.to(roomId).emit('tv_20q_answer', {
        seat,
        askerName,
        question: text.trim(),
        answer: result.answer,
        hint: result.hint || null,
        questionNumber: result.questionNumber,
        maxQuestions: result.maxQuestions,
      });

      io.to(roomId).emit('game_state', tv20qPayload(roomId, room, engine));
    });

    // ── TV 20 Questions: player makes a guess ────────────────────────────
    socket.on('tv_20q_guess', ({ text }) => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      const engine = engines.get(roomId);
      if (!engine || typeof engine.makeGuess !== 'function') return socket.emit('error', { message: 'Game not started' });
      const room = roomManager.getRoom(roomId);
      if (!room) return;

      const seat = seatForTv20qColor(socket.data.color);
      if (seat < 0) return;

      const result = engine.makeGuess(seat, text);
      if (!result.ok) return socket.emit('error', { message: result.reason });

      const guesserName = socket.data.playerName || 'Player';

      // Broadcast guess result for animation
      io.to(roomId).emit('tv_20q_guess_result', {
        seat,
        guesserName,
        guess: text.trim(),
        correct: result.correct,
        answer: result.correct ? result.answer : null,
      });

      if (result.isGameOver) {
        const phonePlayers = room.players.filter(p => p.color !== 'tv-host');
        const winPlayer = result.winnerSeat !== null ? phonePlayers[result.winnerSeat] : null;
        if (winPlayer) leaderboard.recordWin('tv-20-questions', winPlayer.name);
        io.to(roomId).emit('game_over', {
          winner: winPlayer?.name || null,
          answer: result.answer,
          reason: winPlayer
            ? `${winPlayer.name} guessed correctly!`
            : 'Nobody guessed it!'
        });
        engines.delete(roomId);
        roomGameTypes.delete(roomId);
        analytics.logEvent('game_ended', roomId, socket.id, socket.data.playerName, { winner: winPlayer?.name || null, gameType: 'tv-20-questions' });
      } else {
        io.to(roomId).emit('game_state', tv20qPayload(roomId, room, engine));
      }
    });

    // ── TV 20 Questions: host gives up ───────────────────────────────────
    socket.on('tv_20q_give_up', () => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      const engine = engines.get(roomId);
      if (!engine || typeof engine.giveUp !== 'function') return;
      if (socket.data.color !== 'tv-host') return;

      const result = engine.giveUp();
      io.to(roomId).emit('game_over', {
        winner: null,
        answer: result.answer,
        reason: 'The host revealed the answer!'
      });
      engines.delete(roomId);
      roomGameTypes.delete(roomId);
    });

    // ── TV Maze helpers ──────────────────────────────────────────────
    const TV_MAZE_COLORS = ['tv-host', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'];

    function seatForTvMazeColor(color) {
      if (color === 'tv-host') return -1;
      const idx = TV_MAZE_COLORS.indexOf(color);
      return idx > 0 ? idx - 1 : -1;
    }

    function tvMazePayload(roomId, room, engine) {
      const gs = engine.state();
      return {
        ...gs,
        enginePlayers: gs.players,  // keep engine player positions (row, col, heading)
        players: room.players
          .filter(p => p.color !== 'tv-host')
          .map(p => ({
            name: p.name,
            color: p.color,
            connected: p.socketId !== null,
            seat: seatForTvMazeColor(p.color)
          }))
      };
    }

    // ── TV Maze: host starts game ─────────────────────────────────────
    socket.on('tv_maze_start', () => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      if (socket.data.color !== 'tv-host') return;
      const room = roomManager.getRoom(roomId);
      if (!room) return;
      if (engines.has(roomId)) return;

      const phonePlayers = room.players.filter(p => p.color !== 'tv-host');
      if (phonePlayers.length < 1) {
        return socket.emit('error', { message: 'Need at least 1 player to start.' });
      }

      const engine = createMazeGame(phonePlayers.length);
      engines.set(roomId, engine);
      roomGameTypes.set(roomId, 'tv-maze');

      const tvPayload = tvMazePayload(roomId, room, engine);
      io.to(roomId).emit('game_started', tvPayload);

      // Send initial player states to each phone
      phonePlayers.forEach((p, i) => {
        if (!p.socketId) return;
        const ps = engine.playerState(i);
        if (ps) io.to(p.socketId).emit('maze_player_state', ps);
      });

      analytics.logEvent('game_started', roomId, socket.id, 'tv-host', { gameType: 'tv-maze', playerCount: phonePlayers.length });
    });

    // ── TV Maze: player action (forward/back/turn) ───────────────────
    socket.on('maze_action', ({ action }) => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      const engine = engines.get(roomId);
      if (!engine) return;
      const room = roomManager.getRoom(roomId);
      if (!room) return;

      const seat = seatForTvMazeColor(socket.data.color);
      if (seat < 0) return;

      let result;
      if (action === 'forward' || action === 'back') {
        result = engine.moveRelative(seat, action);
      } else if (action === 'turn_left' || action === 'turn_right') {
        result = engine.turn(seat, action);
      } else {
        return socket.emit('maze_move_result', { ok: false, reason: 'Invalid action' });
      }

      socket.emit('maze_move_result', result);
      if (!result.ok) return;

      // Send updated player state to the mover
      const ps = engine.playerState(seat);
      if (ps) socket.emit('maze_player_state', ps);

      // Broadcast updated TV state
      const tvHost = room.players.find(p => p.color === 'tv-host');
      if (tvHost && tvHost.socketId) {
        io.to(tvHost.socketId).emit('game_state', tvMazePayload(roomId, room, engine));
      }

      // Check game over
      if (engine.isGameOver()) {
        const phonePlayers = room.players.filter(p => p.color !== 'tv-host');
        const winSeat = engine.winner();
        const winPlayer = winSeat !== null ? phonePlayers[winSeat] : null;
        if (winPlayer) leaderboard.recordWin('tv-maze', winPlayer.name);
        io.to(roomId).emit('game_over', {
          winner: winPlayer?.name || null,
          reason: winPlayer ? `${winPlayer.name} escaped the maze!` : 'Game over!'
        });
        engines.delete(roomId);
        roomGameTypes.delete(roomId);
        analytics.logEvent('game_ended', roomId, socket.id, socket.data.playerName, { winner: winPlayer?.name || null, gameType: 'tv-maze' });
      }
    });

    // ── TV Wordle helpers ─────────────────────────────────────────────
    const TV_WORDLE_COLORS = ['tv-host', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'];

    function seatForTvWordleColor(color) {
      if (color === 'tv-host') return -1;
      const idx = TV_WORDLE_COLORS.indexOf(color);
      return idx > 0 ? idx - 1 : -1;
    }

    function tvWordlePayload(roomId, room, engine) {
      const gs = engine.state();
      return {
        ...gs,
        players: room.players
          .filter(p => p.color !== 'tv-host')
          .map(p => ({
            name: p.name,
            color: p.color,
            connected: p.socketId !== null,
            seat: seatForTvWordleColor(p.color)
          }))
      };
    }

    // ── TV Wordle: host starts game ───────────────────────────────────
    socket.on('tv_wordle_start', () => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      if (socket.data.color !== 'tv-host') return;
      const room = roomManager.getRoom(roomId);
      if (!room) return;
      if (engines.has(roomId)) return;

      const phonePlayers = room.players.filter(p => p.color !== 'tv-host');
      if (phonePlayers.length < 1) {
        return socket.emit('error', { message: 'Need at least 1 player to start.' });
      }

      const engine = createWordleGame(phonePlayers.length);
      engines.set(roomId, engine);
      roomGameTypes.set(roomId, 'tv-wordle');

      // Send TV state (colors only) to everyone
      io.to(roomId).emit('game_started', tvWordlePayload(roomId, room, engine));

      // Send individual player states (with letters) to each phone
      phonePlayers.forEach((p, i) => {
        if (!p.socketId) return;
        const ps = engine.playerState(i);
        if (ps) io.to(p.socketId).emit('wordle_player_state', ps);
      });

      analytics.logEvent('game_started', roomId, socket.id, 'tv-host', { gameType: 'tv-wordle', playerCount: phonePlayers.length });
    });

    // ── TV Wordle: player submits a guess ────────────────────────────
    socket.on('wordle_guess', ({ word }) => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      const engine = engines.get(roomId);
      if (!engine || typeof engine.submitGuess !== 'function') return;
      const room = roomManager.getRoom(roomId);
      if (!room) return;

      const seat = seatForTvWordleColor(socket.data.color);
      if (seat < 0) return;

      const result = engine.submitGuess(seat, word);
      // Send result back ONLY to the guessing player
      socket.emit('wordle_guess_result', result);
      if (!result.ok) return;

      // Send updated TV state ONLY to the TV host (not all players)
      const tvHost = room.players.find(p => p.color === 'tv-host');
      const phonePlayers = room.players.filter(p => p.color !== 'tv-host');
      const playerName = phonePlayers[seat]?.name || `Player ${seat + 1}`;

      if (tvHost && tvHost.socketId) {
        io.to(tvHost.socketId).emit('wordle_player_guessed', {
          seat,
          attempt: result.attempt,
          result: result.result.map(r => ({ status: r.status })),
          solved: result.solved,
          playerName
        });
        io.to(tvHost.socketId).emit('game_state', tvWordlePayload(roomId, room, engine));
      }

      // Check game over
      if (engine.isGameOver()) {
        const winSeat = engine.winner();
        const winPlayer = winSeat !== null ? phonePlayers[winSeat] : null;
        if (winPlayer) leaderboard.recordWin('tv-wordle', winPlayer.name);
        io.to(roomId).emit('game_over', {
          winner: winPlayer?.name || null,
          reason: winPlayer ? `${winPlayer.name} solved it!` : 'Nobody got it!'
        });
        engines.delete(roomId);
        roomGameTypes.delete(roomId);
        analytics.logEvent('game_ended', roomId, socket.id, socket.data.playerName, { winner: winPlayer?.name || null, gameType: 'tv-wordle' });
      }
    });

    // ── TV Sumix ──────────────────────────────────────────────────────
    const TV_SUMIX_COLORS = ['tv-host', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'];

    function seatForTvSumixColor(color) {
      if (color === 'tv-host') return -1;
      const idx = TV_SUMIX_COLORS.indexOf(color);
      return idx > 0 ? idx - 1 : -1;
    }

    function tvSumixPayload(roomId, room, engine) {
      const gs = engine.state();
      return {
        gameType: 'tv-sumix',
        mode: gs.mode,
        gridSize: gs.gridSize,
        grid: gs.grid,
        rowTargets: gs.rowTargets,
        colTargets: gs.colTargets,
        playerMasks: gs.playerMasks,
        correctRows: gs.correctRows,
        correctCols: gs.correctCols,
        isGameOver: gs.isGameOver,
        winnerSeat: gs.winnerSeat,
        playerCount: gs.playerCount,
        players: room.players
          .filter(p => p.color !== 'tv-host')
          .map(p => ({
            name: p.name,
            color: p.color,
            connected: p.socketId !== null,
            seat: seatForTvSumixColor(p.color)
          }))
      };
    }

    // TV Sumix: host starts game
    socket.on('tv_sumix_start', ({ mode }) => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      if (socket.data.color !== 'tv-host') return;
      const room = roomManager.getRoom(roomId);
      if (!room) return;
      if (engines.has(roomId)) return;

      const phonePlayers = room.players.filter(p => p.color !== 'tv-host');
      if (phonePlayers.length < 1) {
        return socket.emit('error', { message: 'Need at least 1 player to start.' });
      }

      const engine = createSumixGame(phonePlayers.length, { mode: mode || 'easy' });
      engines.set(roomId, engine);
      roomGameTypes.set(roomId, 'tv-sumix');

      io.to(roomId).emit('game_started', tvSumixPayload(roomId, room, engine));
      analytics.logEvent('game_started', roomId, socket.id, 'tv-host', { gameType: 'tv-sumix', mode, playerCount: phonePlayers.length });
    });

    // TV Sumix: player toggles a cell on/off
    socket.on('tv_sumix_toggle', ({ row, col }) => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      const engine = engines.get(roomId);
      if (!engine) return;
      const room = roomManager.getRoom(roomId);
      if (!room) return;

      const seat = seatForTvSumixColor(socket.data.color);
      if (seat < 0) return;

      const result = engine.toggleCell(seat, row, col);
      if (!result.ok) return;

      const completion = engine.checkComplete(seat);
      io.to(roomId).emit('game_state', tvSumixPayload(roomId, room, engine));

      if (completion.correct && engine.isGameOver()) {
        const gs = engine.state();
        const phonePlayers = room.players.filter(p => p.color !== 'tv-host');
        const wp = phonePlayers[gs.winnerSeat];
        const winnerName = wp?.name || '?';
        if (wp) leaderboard.recordWin('tv-sumix', wp.name);
        io.to(roomId).emit('game_over', {
          winner: winnerName,
          reason: `${winnerName} solved the puzzle!`
        });
        engines.delete(roomId);
        roomGameTypes.delete(roomId);
        analytics.logEvent('game_ended', roomId, socket.id, socket.data.playerName, { winner: winnerName, gameType: 'tv-sumix' });
      }
    });

    // ── TV Frog Drop ───────────────────────────────────────────────
    function seatForTvFrogDropColor(color) {
      if (color === 'tv-host') return -1;
      const idx = TV_FROG_DROP_COLORS.indexOf(color);
      return idx > 0 ? idx - 1 : -1;
    }

    function tvFrogDropPayload(roomId, room, engine) {
      const gs = engine.state();
      const endsAt = tvFrogDropRoundEnds.get(roomId) || null;
      const timeLeft = endsAt ? Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)) : 0;
      const phonePlayers = room.players.filter(p => p.color !== 'tv-host');
      return {
        gameType: 'tv-frog-drop',
        cols: gs.cols,
        rows: gs.rows,
        maxTier: gs.maxTier,
        playerCount: gs.playerCount,
        ended: gs.ended,
        timeLeft,
        roundDuration: FROG_DROP_ROUND_MS / 1000,
        players: phonePlayers.map(p => {
          const seat = seatForTvFrogDropColor(p.color);
          const snap = seat >= 0 ? gs.players[seat] : null;
          return {
            name: p.name,
            color: p.color,
            connected: p.socketId !== null,
            seat,
            score: snap ? snap.score : 0,
            grid: snap ? snap.grid : null,
            mergeEvents: snap ? snap.mergeEvents : [],
            rainbowEvents: snap ? (snap.rainbowEvents || []) : [],
            rowMatchEvents: snap ? (snap.rowMatchEvents || []) : [],
          };
        })
      };
    }

    function tvFrogDropEndRound(roomId) {
      const engine = engines.get(roomId);
      const room = roomManager.getRoom(roomId);
      if (!engine || !room) return;
      engine.endRound();

      const ranking = engine.rankings();
      const phonePlayers = room.players.filter(p => p.color !== 'tv-host');
      const winnerSeat = ranking.length ? ranking[0].seat : -1;
      const winPlayer = winnerSeat >= 0 ? phonePlayers[winnerSeat] : null;
      const winScore  = ranking.length ? ranking[0].score : 0;

      io.to(roomId).emit('game_state', tvFrogDropPayload(roomId, room, engine));
      io.to(roomId).emit('game_over', {
        winner: winPlayer?.name || null,
        reason: winPlayer ? `${winPlayer.name} wins with ${winScore} points!` : "Time's up!",
        rankings: ranking.map(r => ({
          seat: r.seat,
          score: r.score,
          name: phonePlayers[r.seat]?.name || `Seat ${r.seat + 1}`
        }))
      });

      if (winPlayer && winScore > 0) leaderboard.recordWin('tv-frog-drop', winPlayer.name);

      engines.delete(roomId);
      roomGameTypes.delete(roomId);
      tvFrogDropTimers.delete(roomId);
      tvFrogDropRoundEnds.delete(roomId);
      analytics.logEvent('game_ended', roomId, 'timer', 'timer', { winner: winPlayer?.name || null, gameType: 'tv-frog-drop' });
    }

    socket.on('tv_frog_drop_start', () => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      if (socket.data.color !== 'tv-host') return;
      const room = roomManager.getRoom(roomId);
      if (!room) return;
      if (engines.has(roomId)) return;
      // Already running a countdown for this room? Ignore double-clicks.
      if (tvFrogDropCountdowns.has(roomId)) return;

      const phonePlayers = room.players.filter(p => p.color !== 'tv-host');
      if (phonePlayers.length < 1) {
        return socket.emit('error', { message: 'Need at least 1 player to start.' });
      }

      // ── 3-2-1 countdown phase ────────────────────────────────────────
      const COUNTDOWN_SECS = 3;
      let secsLeft = COUNTDOWN_SECS;
      io.to(roomId).emit('frog_drop_countdown', { secsLeft, total: COUNTDOWN_SECS });

      const tick = setInterval(() => {
        secsLeft -= 1;
        if (secsLeft > 0) {
          io.to(roomId).emit('frog_drop_countdown', { secsLeft, total: COUNTDOWN_SECS });
          return;
        }

        // ── Countdown finished — start the round ─────────────────────
        clearInterval(tick);
        tvFrogDropCountdowns.delete(roomId);
        io.to(roomId).emit('frog_drop_countdown', { secsLeft: 0, total: COUNTDOWN_SECS, go: true });

        // Refresh room ref in case players joined/left during countdown
        const r = roomManager.getRoom(roomId);
        if (!r) return;
        const phonePlayersNow = r.players.filter(p => p.color !== 'tv-host');
        if (phonePlayersNow.length < 1) return;
        if (engines.has(roomId)) return;

        let engine;
        try { engine = createFrogDropGame(phonePlayersNow.length); }
        catch (e) { console.error('[FrogDrop] createGame error', e); return; }
        engines.set(roomId, engine);
        roomGameTypes.set(roomId, 'tv-frog-drop');
        tvFrogDropRoundEnds.set(roomId, Date.now() + FROG_DROP_ROUND_MS);

        const payload = tvFrogDropPayload(roomId, r, engine);
        io.to(roomId).emit('game_started', payload);
        phonePlayersNow.forEach((p, seat) => {
          if (!p.socketId) return;
          const ps = engine.playerSnapshot(seat);
          if (ps) io.to(p.socketId).emit('frog_drop_player_state', ps);
        });
        analytics.logEvent('game_started', roomId, socket.id, 'tv-host', { gameType: 'tv-frog-drop', playerCount: phonePlayersNow.length });

        const t = setTimeout(() => tvFrogDropEndRound(roomId), FROG_DROP_ROUND_MS);
        tvFrogDropTimers.set(roomId, t);
      }, 1000);
      tvFrogDropCountdowns.set(roomId, tick);
    });

    socket.on('tv_frog_drop_drop', ({ col }) => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      const engine = engines.get(roomId);
      if (!engine) return;
      const room = roomManager.getRoom(roomId);
      if (!room) return;
      const seat = seatForTvFrogDropColor(socket.data.color);
      if (seat < 0) return;
      const c = parseInt(col, 10);
      if (Number.isNaN(c)) return;
      const result = engine.dropFrog(seat, c);
      if (!result.ok) return;
      const ps = engine.playerSnapshot(seat);
      if (ps) socket.emit('frog_drop_player_state', ps);
      io.to(roomId).emit('game_state', tvFrogDropPayload(roomId, room, engine));
    });

    socket.on('tv_frog_drop_undo', () => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      const engine = engines.get(roomId);
      if (!engine) return;
      const room = roomManager.getRoom(roomId);
      if (!room) return;
      const seat = seatForTvFrogDropColor(socket.data.color);
      if (seat < 0) return;
      if (!engine.undo(seat)) return;
      const ps = engine.playerSnapshot(seat);
      if (ps) socket.emit('frog_drop_player_state', ps);
      io.to(roomId).emit('game_state', tvFrogDropPayload(roomId, room, engine));
    });

    socket.on('tv_frog_drop_restart', () => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      const engine = engines.get(roomId);
      if (!engine) return;
      const room = roomManager.getRoom(roomId);
      if (!room) return;
      const seat = seatForTvFrogDropColor(socket.data.color);
      if (seat < 0) return;
      if (!engine.restart(seat)) return;
      const ps = engine.playerSnapshot(seat);
      if (ps) socket.emit('frog_drop_player_state', ps);
      io.to(roomId).emit('game_state', tvFrogDropPayload(roomId, room, engine));
    });

    // ── TV Taboo ───────────────────────────────────────────────────
    const TV_TABOO_COLORS = ['tv-host', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'];

    function seatForTvTabooColor(color) {
      if (color === 'tv-host') return -1;
      const idx = TV_TABOO_COLORS.indexOf(color);
      return idx > 0 ? idx - 1 : -1;
    }

    function tvTabooPayload(roomId, room, engine) {
      const gs = engine.state();
      return {
        gameType: 'tv-taboo',
        round: gs.round,
        totalRounds: gs.totalRounds,
        phase: gs.phase,
        keyword: gs.keyword,
        tabooWords: gs.tabooWords,
        clue: gs.clue,
        clueReady: gs.clueReady,
        scores: gs.scores,
        roundWinner: gs.roundWinner,
        guessLog: gs.guessLog,
        players: room.players
          .filter(p => p.color !== 'tv-host')
          .map(p => ({
            name: p.name,
            color: p.color,
            connected: p.socketId !== null,
            seat: seatForTvTabooColor(p.color)
          }))
      };
    }

    // TV Taboo: host starts game
    socket.on('tv_taboo_start', () => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      if (socket.data.color !== 'tv-host') return;
      const room = roomManager.getRoom(roomId);
      if (!room) return;

      const phonePlayers = room.players.filter(p => p.color !== 'tv-host' && p.socketId);
      if (phonePlayers.length < 1) {
        return socket.emit('error', { message: 'Need at least 1 player to start.' });
      }

      const engine = createTabooGame(phonePlayers.length);
      engines.set(roomId, engine);
      roomGameTypes.set(roomId, 'tv-taboo');

      // Generate AI clue for the first round, then emit game_started
      engine.generateClue().then(() => {
        io.to(roomId).emit('game_started', tvTabooPayload(roomId, room, engine));
        analytics.logEvent('game_started', roomId, socket.id, 'tv-host', { gameType: 'tv-taboo', playerCount: phonePlayers.length });
      });
    });

    // TV Taboo: player submits a guess
    socket.on('tv_taboo_guess', ({ text }) => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      const engine = engines.get(roomId);
      if (!engine || typeof engine.makeGuess !== 'function') return;
      const room = roomManager.getRoom(roomId);
      if (!room) return;

      const seat = seatForTvTabooColor(socket.data.color);
      if (seat < 0) return;

      const guesserName = socket.data.playerName || 'Player';

      // Inject player name into guess log
      const result = engine.makeGuess(seat, text);
      if (!result.ok) return socket.emit('error', { message: result.reason });

      // Patch the last guessLog entry with the name
      const gs = engine.state();
      const lastEntry = gs.guessLog[gs.guessLog.length - 1];
      if (lastEntry) lastEntry.name = guesserName;

      // Broadcast guess event for animation
      io.to(roomId).emit('tv_taboo_guess_result', {
        seat,
        guesserName,
        guess: text.trim(),
        correct: result.correct,
      });

      io.to(roomId).emit('game_state', tvTabooPayload(roomId, room, engine));

      // If round was won, wait a few seconds then go to next round
      if (result.correct) {
        if (engine.isGameOver()) return; // handled below
        leaderboard.recordWin('tv-taboo', guesserName);
      }
    });

    // TV Taboo: host skips current round
    socket.on('tv_taboo_skip', () => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      if (socket.data.color !== 'tv-host') return;
      const engine = engines.get(roomId);
      if (!engine) return;
      const room = roomManager.getRoom(roomId);
      if (!room) return;

      engine.skipRound();
      io.to(roomId).emit('game_state', tvTabooPayload(roomId, room, engine));
    });

    // TV Taboo: host advances to next round
    socket.on('tv_taboo_next_round', () => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      if (socket.data.color !== 'tv-host') return;
      const engine = engines.get(roomId);
      if (!engine) return;
      const room = roomManager.getRoom(roomId);
      if (!room) return;

      const result = engine.nextRound();
      if (result.isGameOver) {
        const gs = engine.state();
        const winSeat = engine.winner();
        const phonePlayers = room.players.filter(p => p.color !== 'tv-host');
        const winPlayer = winSeat !== null ? phonePlayers[winSeat] : null;
        io.to(roomId).emit('game_over', {
          winner: winPlayer?.name || null,
          scores: gs.scores,
          reason: winPlayer ? `${winPlayer.name} wins with ${gs.scores[winSeat]} points!` : 'It\'s a tie!'
        });
        engines.delete(roomId);
        roomGameTypes.delete(roomId);
        analytics.logEvent('game_ended', roomId, socket.id, 'tv-host', { winner: winPlayer?.name, gameType: 'tv-taboo' });
        return;
      }

      // Generate clue for next round
      engine.generateClue().then(() => {
        io.to(roomId).emit('game_state', tvTabooPayload(roomId, room, engine));
      });
    });

    // ── Play again ──────────────────────────────────────────────────
    socket.on('play_again', () => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      const room = roomManager.getRoom(roomId);
      if (!room) return;

      // Clear any running Boggle timer
      if (boggleTimers.has(roomId)) {
        clearTimeout(boggleTimers.get(roomId));
        boggleTimers.delete(roomId);
      }
      // Clear any running Trivia timer
      if (triviaTimers.has(roomId)) {
        clearTimeout(triviaTimers.get(roomId));
        triviaTimers.delete(roomId);
      }
      // Clear any running Spot the Difference timer
      if (diffTimers.has(roomId)) {
        clearTimeout(diffTimers.get(roomId));
        diffTimers.delete(roomId);
      }
      // Clear any running Rhythm Tap timer
      if (rhythmTimers.has(roomId)) {
        clearTimeout(rhythmTimers.get(roomId));
        rhythmTimers.delete(roomId);
      }
      // Clear any running TV Bingo auto-call timer
      if (bingoAutoTimers.has(roomId)) {
        clearInterval(bingoAutoTimers.get(roomId));
        bingoAutoTimers.delete(roomId);
      }
      bingoCallIntervals.delete(roomId);
      // Clear any running TV Boggle timer
      if (tvBoggleTimers.has(roomId)) {
        clearTimeout(tvBoggleTimers.get(roomId));
        tvBoggleTimers.delete(roomId);
      }
      // Clear any running TV Frog Drop timer / countdown
      if (tvFrogDropTimers.has(roomId)) {
        clearTimeout(tvFrogDropTimers.get(roomId));
        tvFrogDropTimers.delete(roomId);
      }
      if (tvFrogDropCountdowns.has(roomId)) {
        clearInterval(tvFrogDropCountdowns.get(roomId));
        tvFrogDropCountdowns.delete(roomId);
      }
      tvFrogDropRoundEnds.delete(roomId);
      // Clear any running TV Racing tick timer
      if (racingTickTimers.has(roomId)) {
        clearInterval(racingTickTimers.get(roomId));
        racingTickTimers.delete(roomId);
      }
      // Clear any running Memory Match grace timer
      if (memoryMatchGraceTimers.has(roomId)) {
        clearTimeout(memoryMatchGraceTimers.get(roomId));
        memoryMatchGraceTimers.delete(roomId);
      }
      // Clear any running Shopping List timers
      if (shoppingListSubmitTimers.has(roomId)) {
        clearTimeout(shoppingListSubmitTimers.get(roomId));
        shoppingListSubmitTimers.delete(roomId);
      }
      if (shoppingListSubmitTimers.has('study_' + roomId)) {
        clearTimeout(shoppingListSubmitTimers.get('study_' + roomId));
        shoppingListSubmitTimers.delete('study_' + roomId);
      }
      // Clear any running Pattern Sequence timers
      if (patternSequenceRoundTimers.has(roomId)) {
        clearTimeout(patternSequenceRoundTimers.get(roomId));
        patternSequenceRoundTimers.delete(roomId);
      }
      if (patternSequenceShowTimers.has(roomId)) {
        clearTimeout(patternSequenceShowTimers.get(roomId));
        patternSequenceShowTimers.delete(roomId);
      }
      // Clear any running Speed Tap question timer
      if (speedTapQuestionTimers.has(roomId)) {
        const entry = speedTapQuestionTimers.get(roomId);
        if (entry.timer) clearTimeout(entry.timer);
        if (entry.feedbackTimer) clearTimeout(entry.feedbackTimer);
        speedTapQuestionTimers.delete(roomId);
      }
      // Clear any running Stroop Colour question timer
      if (stroopQuestionTimers.has(roomId)) {
        const entry = stroopQuestionTimers.get(roomId);
        if (entry.timer) clearTimeout(entry.timer);
        if (entry.feedbackTimer) clearTimeout(entry.feedbackTimer);
        stroopQuestionTimers.delete(roomId);
      }
      // Clear engine so start_game can run fresh
      engines.delete(roomId);
      roomGameTypes.delete(roomId);

      // Tell everyone to return to the waiting screen
      io.to(roomId).emit('play_again');
      // Re-broadcast room state so TV host re-evaluates the Start button
      io.to(roomId).emit('room_update', roomSnapshot(room));
    });

    // ── Ludo: roll dice ────────────────────────────────────────────
    socket.on('ludo_roll', () => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      const engine = engines.get(roomId);
      if (!engine) return;
      const room = roomManager.getRoom(roomId);
      if (!room) return;
      const gameType = roomGameTypes.get(roomId);
      if (gameType !== 'ludo') return;

      const seat = seatForLudoColor(socket.data.color);
      if (seat < 0) return;

      const result = engine.rollDice(seat);
      if (!result.ok) {
        return socket.emit('error', { message: result.reason });
      }

      // Send roll result to the rolling player
      socket.emit('ludo_roll_result', {
        diceValue: result.diceValue,
        validMoves: result.validMoves,
        autoPass: result.autoPass,
        consecutiveSixes: result.consecutiveSixes,
        forfeited: result.forfeited
      });

      // Broadcast updated state to all
      const payload = ludoPayload(roomId, room, engine);
      io.to(roomId).emit('ludo_state_update', payload);
    });

    // ── Ludo: move token ─────────────────────────────────────────
    socket.on('ludo_move', ({ tokenIndex }) => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      const engine = engines.get(roomId);
      if (!engine) return;
      const room = roomManager.getRoom(roomId);
      if (!room) return;
      const gameType = roomGameTypes.get(roomId);
      if (gameType !== 'ludo') return;

      const seat = seatForLudoColor(socket.data.color);
      if (seat < 0) return;

      const result = engine.moveToken(seat, tokenIndex);
      if (!result.ok) {
        return socket.emit('error', { message: result.reason });
      }

      const payload = ludoPayload(roomId, room, engine);

      // Send move result to mover
      socket.emit('ludo_move_result', {
        ok: true,
        captured: result.captured,
        state: payload
      });

      // Broadcast updated state
      io.to(roomId).emit('ludo_state_update', payload);

      // Check game over
      if (engine.isGameOver()) {
        const winnerSeat = engine.winner();
        const winnerPlayer = room.players.find(p => seatForLudoColor(p.color) === winnerSeat);
        if (winnerPlayer) leaderboard.recordWin('ludo', winnerPlayer.name);
        io.to(roomId).emit('game_over', {
          winner: winnerPlayer ? winnerPlayer.name : null,
          reason: winnerPlayer ? `${winnerPlayer.name} wins!` : 'Game over!'
        });
        engines.delete(roomId);
        roomGameTypes.delete(roomId);
        analytics.logEvent('game_ended', roomId, 'server', 'ludo', { winner: winnerPlayer?.name, gameType: 'ludo' });
      }
    });

    // ── TV MathCross: host starts game ──────────────────────────────────
    socket.on('tv_math_cross_start', ({ difficulty = 'easy' } = {}) => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      if (socket.data.color !== 'tv-host') return;
      const room = roomManager.getRoom(roomId);
      if (!room) return;
      if (engines.has(roomId)) return;

      const phonePlayers = room.players.filter(p => p.color !== 'tv-host');
      if (phonePlayers.length < 1) {
        return socket.emit('error', { message: 'Need at least 1 player to start.' });
      }

      const diff = ['easy', 'medium', 'hard'].includes(difficulty) ? difficulty : 'easy';
      const engine = createMathCrossGame(phonePlayers.length, diff);
      engine.start();
      engines.set(roomId, engine);
      roomGameTypes.set(roomId, 'tv-math-cross');

      io.to(roomId).emit('game_started', tvMathCrossPayload(roomId, room, engine));
      analytics.logEvent('game_started', roomId, socket.id, 'tv-host', { gameType: 'tv-math-cross', playerCount: phonePlayers.length, difficulty: diff });
    });

    // ── TV MathCross: player places a number ────────────────────────────
    socket.on('tv_math_cross_place', ({ slotKey, value }) => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      const engine = engines.get(roomId);
      if (!engine) return socket.emit('error', { message: 'Game not started' });
      const room = roomManager.getRoom(roomId);
      if (!room) return;

      const seat = seatForMathCrossColor(socket.data.color);
      if (seat < 0) return;

      const result = engine.placeNumber(seat, slotKey, value);
      if (!result.ok) return socket.emit('error', { message: result.reason });

      io.to(roomId).emit('game_state', tvMathCrossPayload(roomId, room, engine));

      if (result.isRoundOver) {
        const roundResult = engine.endRound();
        const phonePlayers = room.players.filter(p => p.color !== 'tv-host');
        const state = engine.state();

        if (state.isSessionOver) {
          // Final session over
          const winnerSeat = engine.winner();
          const winPlayer = winnerSeat !== null ? phonePlayers[winnerSeat] : null;
          if (winPlayer) leaderboard.recordWin('tv-math-cross', winPlayer.name);
          io.to(roomId).emit('game_over', {
            winner: winPlayer?.name || null,
            winnerSeat,
            scores: state.sessionScores,
            players: phonePlayers.map((p, i) => ({ name: p.name, score: state.sessionScores[i] })),
            reason: winPlayer ? `${winPlayer.name} wins with ${state.sessionScores[winnerSeat]} pts!` : 'Game over!'
          });
          engines.delete(roomId);
          roomGameTypes.delete(roomId);
          analytics.logEvent('game_ended', roomId, socket.id, socket.data.playerName, { winner: winPlayer?.name || null, gameType: 'tv-math-cross' });
        } else {
          // Broadcast round over with results, then start next round after 5s
          io.to(roomId).emit('round_over', {
            roundResults: roundResult,
            currentRound: state.currentRound,
            totalRounds: state.totalRounds,
            sessionScores: state.sessionScores,
            players: phonePlayers.map((p, i) => ({ name: p.name, score: state.sessionScores[i] })),
            nextRoundIn: 5
          });

          setTimeout(() => {
            const nextResult = engine.nextRound();
            if (!nextResult.ok) return;
            io.to(roomId).emit('game_state', tvMathCrossPayload(roomId, room, engine));
          }, 5000);
        }
      }
    });

    // ── TV Lumeno: host starts game ──────────────────────────────────────
    socket.on('tv_lumeno_start', ({ difficulty = 'easy' } = {}) => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      if (socket.data.color !== 'tv-host') return;

      const room = roomManager.getRoom(roomId);
      if (!room) return;
      const phonePlayers = room.players.filter(p => p.color !== 'tv-host');
      if (phonePlayers.length < 1) {
        return socket.emit('error', { message: 'Need at least 1 player to start.' });
      }

      const diff = ['easy', 'medium', 'hard'].includes(difficulty) ? difficulty : 'easy';
      const engine = createLumenoGame(phonePlayers.length, diff);
      engine.start();
      engines.set(roomId, engine);
      roomGameTypes.set(roomId, 'tv-lumeno');

      io.to(roomId).emit('game_started', tvLumenoPayload(roomId, room, engine));
      analytics.logEvent('game_started', roomId, socket.id, 'tv-host', { gameType: 'tv-lumeno', playerCount: phonePlayers.length, difficulty: diff });
    });

    // ── TV Lumeno: player clears a chain of orbs ─────────────────────────
    socket.on('tv_lumeno_clear', ({ cells }) => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      const engine = engines.get(roomId);
      if (!engine) return;
      const room = roomManager.getRoom(roomId);
      if (!room) return;

      const seat = seatForLumenoColor(socket.data.color);
      if (seat < 0) return;

      const result = engine.clearChain(seat, cells);
      if (!result.ok) return socket.emit('error', { message: result.reason });

      io.to(roomId).emit('game_state', tvLumenoPayload(roomId, room, engine));

      if (result.isRoundOver) {
        const roundResult = engine.endRound();
        const gs = engine.state();

        if (gs.isSessionOver) {
          // Final session over
          const phonePlayers = room.players.filter(p => p.color !== 'tv-host');
          const winnerSeat = engine.winner();
          const winPlayer = winnerSeat !== null ? phonePlayers[winnerSeat] : null;
          if (winPlayer) leaderboard.recordWin('tv-lumeno', winPlayer.name);
          io.to(roomId).emit('game_over', {
            winner: winPlayer ? winPlayer.name : null,
            winnerSeat,
            reason: `${winPlayer ? winPlayer.name : 'Nobody'} wins the session!`,
            players: phonePlayers.map((p, i) => ({ name: p.name, score: gs.sessionScores[i] }))
          });
          engines.delete(roomId);
          roomGameTypes.delete(roomId);
          analytics.logEvent('game_ended', roomId, socket.id, socket.data.playerName, { winner: winPlayer ? winPlayer.name : null, gameType: 'tv-lumeno' });
        } else {
          // Round over — broadcast results, then start next round after 5s
          const phonePlayers = room.players.filter(p => p.color !== 'tv-host');
          io.to(roomId).emit('round_over', {
            roundResults: gs.roundResults,
            currentRound: gs.currentRound,
            totalRounds: gs.totalRounds,
            sessionScores: gs.sessionScores,
            players: phonePlayers.map((p, i) => ({ name: p.name, seat: i, score: gs.scores[i] })),
            nextRoundIn: 5
          });

          setTimeout(() => {
            const nextResult = engine.nextRound();
            if (!nextResult.ok) return;
            const currentRoom = roomManager.getRoom(roomId);
            if (!currentRoom) return;
            io.to(roomId).emit('game_state', tvLumenoPayload(roomId, currentRoom, engine));
          }, 5000);
        }
      }
    });

    // ── TV MathCross: player removes a number ───────────────────────────
    socket.on('tv_math_cross_remove', ({ slotKey }) => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      const engine = engines.get(roomId);
      if (!engine) return;
      const seat = seatForMathCrossColor(socket.data.color);
      if (seat < 0) return;
      engine.removeNumber(seat, slotKey);
      socket.emit('game_state', tvMathCrossPayload(roomId, roomManager.getRoom(roomId), engine));
    });

    // ── TV Pipe Puzzle: start ───────────────────────────────────────
    socket.on('tv_pipe_puzzle_start', ({ difficulty = 'easy' } = {}) => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      if (socket.data.color !== 'tv-host') return;
      const room = roomManager.getRoom(roomId);
      if (!room) return;
      if (engines.has(roomId)) return;

      const phonePlayers = room.players.filter(p => p.color !== 'tv-host');
      if (phonePlayers.length < 1) {
        return socket.emit('error', { message: 'Need at least 1 player to start.' });
      }

      const diff = ['easy', 'medium', 'hard'].includes(difficulty) ? difficulty : 'easy';
      const engine = createPipePuzzleGame(phonePlayers.length, diff);
      engine.start();
      engines.set(roomId, engine);
      roomGameTypes.set(roomId, 'tv-pipe-puzzle');

      io.to(roomId).emit('game_started', tvPipePuzzlePayload(roomId, room, engine));
      analytics.logEvent('game_started', roomId, socket.id, 'tv-host', { gameType: 'tv-pipe-puzzle', playerCount: phonePlayers.length, difficulty: diff });
    });

    // ── TV Pipe Puzzle: player rotates a tile ───────────────────────
    socket.on('tv_pipe_rotate', ({ row, col }) => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      const engine = engines.get(roomId);
      if (!engine) return socket.emit('error', { message: 'Game not started' });
      const room = roomManager.getRoom(roomId);
      if (!room) return;

      const seat = seatForPipePuzzleColor(socket.data.color);
      if (seat < 0) return;

      const result = engine.rotateTile(seat, row, col);
      if (!result.ok) return socket.emit('error', { message: result.reason });

      io.to(roomId).emit('game_state', tvPipePuzzlePayload(roomId, room, engine));

      if (result.isRoundOver) {
        const roundResult = engine.endRound();
        const phonePlayers = room.players.filter(p => p.color !== 'tv-host');
        const state = engine.state();

        if (state.isSessionOver) {
          const winnerSeat = engine.winner();
          const winPlayer = winnerSeat !== null ? phonePlayers[winnerSeat] : null;
          if (winPlayer) leaderboard.recordWin('tv-pipe-puzzle', winPlayer.name);
          io.to(roomId).emit('game_over', {
            winner: winPlayer ? winPlayer.name : null,
            winnerSeat,
            scores: state.sessionScores,
            players: phonePlayers.map((p, i) => ({ name: p.name, score: state.sessionScores[i] })),
            reason: winPlayer ? `${winPlayer.name} wins with ${state.sessionScores[winnerSeat]} pts!` : 'Game over!'
          });
          engines.delete(roomId);
          roomGameTypes.delete(roomId);
          analytics.logEvent('game_ended', roomId, socket.id, socket.data.playerName, { winner: winPlayer ? winPlayer.name : null, gameType: 'tv-pipe-puzzle' });
        } else {
          io.to(roomId).emit('round_over', {
            roundResults: roundResult,
            currentRound: state.currentRound,
            totalRounds: state.totalRounds,
            sessionScores: state.sessionScores,
            players: phonePlayers.map((p, i) => ({ name: p.name, score: state.sessionScores[i] })),
            nextRoundIn: 5
          });

          setTimeout(() => {
            const nextResult = engine.nextRound();
            if (!nextResult.ok) return;
            io.to(roomId).emit('game_state', tvPipePuzzlePayload(roomId, room, engine));
          }, 5000);
        }
      }
    });

    // ── TV Colour Memory: start ──────────────────────────────────────
    socket.on('tv_colour_memory_start', ({ difficulty = 'easy' } = {}) => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      if (socket.data.color !== 'tv-host') return;
      const room = roomManager.getRoom(roomId);
      if (!room) return;
      if (engines.has(roomId)) return;

      const phonePlayers = room.players.filter(p => p.color !== 'tv-host');
      if (phonePlayers.length < 1) return socket.emit('error', { message: 'Need at least 1 player to start.' });

      const diff = ['easy', 'medium', 'hard'].includes(difficulty) ? difficulty : 'easy';
      const engine = createColourMemoryGame(phonePlayers.length, diff);
      engine.start();
      engines.set(roomId, engine);
      roomGameTypes.set(roomId, 'tv-colour-memory');

      io.to(roomId).emit('game_started', tvColourMemoryPayload(roomId, room, engine));
      analytics.logEvent('game_started', roomId, socket.id, 'tv-host', { gameType: 'tv-colour-memory', playerCount: phonePlayers.length, difficulty: diff });
    });

    // ── TV Colour Memory: TV display signals sequence finished showing ─
    socket.on('tv_colour_memory_reveal_done', () => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      if (socket.data.color !== 'tv-host') return;
      const engine = engines.get(roomId);
      if (!engine) return;
      const room = roomManager.getRoom(roomId);
      if (!room) return;
      const result = engine.revealDone();
      if (!result.ok) return;
      io.to(roomId).emit('game_state', tvColourMemoryPayload(roomId, room, engine));
    });

    // ── TV Colour Memory: player taps a colour ────────────────────────
    const colourMemoryRoundTimers = new Map(); // roomId → timeout
    socket.on('tv_colour_memory_tap', ({ colourIndex }) => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      const engine = engines.get(roomId);
      if (!engine) return socket.emit('error', { message: 'Game not started' });
      const room = roomManager.getRoom(roomId);
      if (!room) return;

      const seat = seatForColourMemoryColor(socket.data.color);
      if (seat < 0) return;

      const result = engine.tapColour(seat, colourIndex);
      if (!result.ok) return;

      io.to(roomId).emit('game_state', tvColourMemoryPayload(roomId, room, engine));

      // First player finishes → start 10s grace timer for others
      if (result.firstFinish && !result.isRoundOver) {
        if (!colourMemoryRoundTimers.has(roomId)) {
          colourMemoryRoundTimers.set(roomId, setTimeout(() => {
            colourMemoryRoundTimers.delete(roomId);
            const eng = engines.get(roomId);
            if (!eng) return;
            finishColourMemoryRound(roomId, eng);
          }, 10000));
        }
      }

      if (result.isRoundOver) {
        const timer = colourMemoryRoundTimers.get(roomId);
        if (timer) { clearTimeout(timer); colourMemoryRoundTimers.delete(roomId); }
        finishColourMemoryRound(roomId, engine);
      }
    });

    function finishColourMemoryRound(roomId, engine) {
      const room = roomManager.getRoom(roomId);
      if (!room) return;
      const roundResult = engine.endRound();
      const phonePlayers = room.players.filter(p => p.color !== 'tv-host');
      const state = engine.state();

      io.to(roomId).emit('game_state', tvColourMemoryPayload(roomId, room, engine));

      if (state.isSessionOver) {
        const winnerSeat = engine.winner();
        const winPlayer = winnerSeat !== null ? phonePlayers[winnerSeat] : null;
        if (winPlayer) leaderboard.recordWin('tv-colour-memory', winPlayer.name);
        io.to(roomId).emit('game_over', {
          winner: winPlayer?.name || null,
          winnerSeat,
          players: phonePlayers.map((p, i) => ({ name: p.name, score: state.sessionScores[i] })),
          reason: winPlayer ? `${winPlayer.name} wins with ${state.sessionScores[winnerSeat]} pts!` : 'Game over!'
        });
        engines.delete(roomId);
        roomGameTypes.delete(roomId);
        analytics.logEvent('game_ended', roomId, socket.id, 'system', { winner: winPlayer?.name || null, gameType: 'tv-colour-memory' });
      } else {
        io.to(roomId).emit('round_over', {
          roundResults: roundResult,
          currentRound: state.currentRound,
          totalRounds: state.totalRounds,
          sessionScores: state.sessionScores,
          players: phonePlayers.map((p, i) => ({ name: p.name, score: state.sessionScores[i] })),
          nextRoundIn: 5
        });
        setTimeout(() => {
          const eng = engines.get(roomId);
          if (!eng) return;
          const nextResult = eng.nextRound();
          if (!nextResult.ok) return;
          const r = roomManager.getRoom(roomId);
          if (!r) return;
          io.to(roomId).emit('game_state', tvColourMemoryPayload(roomId, r, eng));
        }, 5000);
      }
    }

    // ── TV Face Memory: start ─────────────────────────────────────────
    socket.on('tv_face_memory_start', ({ difficulty = 'easy' } = {}) => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      if (socket.data.color !== 'tv-host') return;
      const room = roomManager.getRoom(roomId);
      if (!room) return;
      if (engines.has(roomId)) return;

      const phonePlayers = room.players.filter(p => p.color !== 'tv-host');
      if (phonePlayers.length < 1) return socket.emit('error', { message: 'Need at least 1 player to start.' });

      const diff = ['easy', 'medium', 'hard'].includes(difficulty) ? difficulty : 'easy';
      const engine = createFaceMemoryGame(phonePlayers.length, diff);
      engine.start();
      engines.set(roomId, engine);
      roomGameTypes.set(roomId, 'tv-face-memory');

      const studySecs = { easy: 8, medium: 10, hard: 10 }[diff] || 8;
      io.to(roomId).emit('game_started', tvFaceMemoryPayload(roomId, room, engine));
      analytics.logEvent('game_started', roomId, socket.id, 'tv-host', { gameType: 'tv-face-memory', playerCount: phonePlayers.length, difficulty: diff });

      // Auto-transition study → recall after timer
      setTimeout(() => {
        const eng = engines.get(roomId);
        if (!eng) return;
        const r = roomManager.getRoom(roomId);
        if (!r) return;
        const res = eng.studyDone();
        if (!res.ok) return;
        io.to(roomId).emit('game_state', tvFaceMemoryPayload(roomId, r, eng));
      }, studySecs * 1000);
    });

    // ── TV Face Memory: player answers ────────────────────────────────
    socket.on('tv_face_memory_answer', ({ name }) => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      const engine = engines.get(roomId);
      if (!engine) return socket.emit('error', { message: 'Game not started' });
      const room = roomManager.getRoom(roomId);
      if (!room) return;

      const seat = seatForFaceMemoryColor(socket.data.color);
      if (seat < 0) return;

      const result = engine.answerFace(seat, name);
      if (!result.ok) return;

      // Personal feedback to answering player
      socket.emit('face_memory_result', { correct: result.correct, correctName: result.correctName });

      io.to(roomId).emit('game_state', tvFaceMemoryPayload(roomId, room, engine));

      if (result.advanceQuestion) {
        // Advance to next question after 1.5s to show result
        setTimeout(() => {
          const eng = engines.get(roomId);
          if (!eng) return;
          const r = roomManager.getRoom(roomId);
          if (!r) return;
          const nextResult = eng.nextQuestion();

          if (nextResult.roundOver) {
            const roundResult = eng.endRound();
            const phonePlayers = r.players.filter(p => p.color !== 'tv-host');
            const state = eng.state();

            if (state.isSessionOver) {
              const winnerSeat = eng.winner();
              const winPlayer = winnerSeat !== null ? phonePlayers[winnerSeat] : null;
              if (winPlayer) leaderboard.recordWin('tv-face-memory', winPlayer.name);
              io.to(roomId).emit('game_over', {
                winner: winPlayer?.name || null,
                winnerSeat,
                players: phonePlayers.map((p, i) => ({ name: p.name, score: state.sessionScores[i] })),
                reason: winPlayer ? `${winPlayer.name} wins with ${state.sessionScores[winnerSeat]} pts!` : 'Game over!'
              });
              engines.delete(roomId);
              roomGameTypes.delete(roomId);
              analytics.logEvent('game_ended', roomId, socket.id, socket.data.playerName, { winner: winPlayer?.name || null, gameType: 'tv-face-memory' });
            } else {
              io.to(roomId).emit('round_over', {
                roundResults: roundResult,
                currentRound: state.currentRound,
                totalRounds: state.totalRounds,
                sessionScores: state.sessionScores,
                players: phonePlayers.map((p, i) => ({ name: p.name, score: state.sessionScores[i] })),
                nextRoundIn: 5
              });
              setTimeout(() => {
                const nextEng = engines.get(roomId);
                if (!nextEng) return;
                const nextRoom = roomManager.getRoom(roomId);
                if (!nextRoom) return;
                const nr = nextEng.nextRound();
                if (!nr.ok) return;
                io.to(roomId).emit('game_state', tvFaceMemoryPayload(roomId, nextRoom, nextEng));
                // Start study timer for new round
                const studySecs2 = { easy: 8, medium: 10, hard: 10 }[nextEng.state().difficulty] || 8;
                setTimeout(() => {
                  const e2 = engines.get(roomId);
                  if (!e2) return;
                  const r2 = roomManager.getRoom(roomId);
                  if (!r2) return;
                  const sr = e2.studyDone();
                  if (!sr.ok) return;
                  io.to(roomId).emit('game_state', tvFaceMemoryPayload(roomId, r2, e2));
                }, studySecs2 * 1000);
              }, 5000);
            }
          } else {
            io.to(roomId).emit('game_state', tvFaceMemoryPayload(roomId, r, eng));
          }
        }, 1500);
      }
    });

    // ── TV Math Games shared finish helper ───────────────────────────
    function finishMathRound(roomId, engine, gameType) {
      const room = roomManager.getRoom(roomId);
      if (!room) return;
      engine.endRound();
      const state = engine.state();
      const phonePlayers = room.players.filter(p => p.color !== 'tv-host');
      io.to(roomId).emit('game_state', tvMathPayload(room, engine));
      if (state.isSessionOver) {
        const winnerSeat = engine.winner();
        const winPlayer = winnerSeat !== null ? phonePlayers[winnerSeat] : null;
        if (winPlayer) leaderboard.recordWin(gameType, winPlayer.name);
        io.to(roomId).emit('game_over', {
          winner: winPlayer ? winPlayer.name : null,
          players: phonePlayers.map((p, i) => ({ name: p.name, score: state.sessionScores[i] })),
          reason: winPlayer ? `${winPlayer.name} wins with ${state.sessionScores[winnerSeat]} pts!` : 'Game over!'
        });
        engines.delete(roomId);
        roomGameTypes.delete(roomId);
      } else {
        io.to(roomId).emit('round_over', {
          currentRound: state.currentRound,
          totalRounds: state.totalQuestions || state.totalRounds,
          players: phonePlayers.map((p, i) => ({ name: p.name, score: state.sessionScores[i] })),
          nextRoundIn: 4,
          correctAnswer: state.question ? state.question.answer : undefined,
          options: state.question ? state.question.options : undefined,
          answer: state.answer !== undefined ? state.answer : undefined,
          sequence: state.sequence || undefined,
          numbers: state.numbers || undefined,
          sortedNumbers: state.sortedNumbers || undefined
        });
        setTimeout(() => {
          const eng = engines.get(roomId);
          if (!eng) return;
          const r = roomManager.getRoom(roomId);
          if (!r) return;
          const result = eng.nextRound();
          if (!result.ok) return;
          io.to(roomId).emit('game_state', tvMathPayload(r, eng));
        }, 4000);
      }
    }

    // ── TV Daily Arithmetic ──────────────────────────────────────────
    socket.on('tv_daily_arithmetic_start', ({ difficulty = 'easy' } = {}) => {
      const roomId = socket.data.roomId;
      if (!roomId || socket.data.color !== 'tv-host') return;
      const room = roomManager.getRoom(roomId);
      if (!room || engines.has(roomId)) return;
      const phonePlayers = room.players.filter(p => p.color !== 'tv-host');
      if (phonePlayers.length < 1) return socket.emit('error', { message: 'Need at least 1 player.' });
      const diff = ['easy','medium','hard'].includes(difficulty) ? difficulty : 'easy';
      const engine = createDailyArithmeticGame(phonePlayers.length, diff);
      engine.start();
      engines.set(roomId, engine);
      roomGameTypes.set(roomId, 'tv-daily-arithmetic');
      io.to(roomId).emit('game_started', tvMathPayload(room, engine));
    });

    socket.on('tv_daily_arithmetic_answer', ({ answerIndex }) => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      const engine = engines.get(roomId);
      if (!engine) return;
      const room = roomManager.getRoom(roomId);
      if (!room) return;
      const seat = seatForMathColor(socket.data.color);
      if (seat < 0) return;
      const gs = engine.state();
      const answerValue = gs.question && gs.question.options ? gs.question.options[answerIndex] : answerIndex;
      if (answerValue === undefined) return;
      const result = engine.submitAnswer(seat, answerValue);
      if (!result.ok) return;
      io.to(roomId).emit('game_state', tvMathPayload(room, engine));
      if (result.firstCorrect && !result.isRoundOver) {
        if (!daRoundTimers.has(roomId)) {
          daRoundTimers.set(roomId, setTimeout(() => {
            daRoundTimers.delete(roomId);
            const eng = engines.get(roomId);
            if (eng) finishMathRound(roomId, eng, 'tv-daily-arithmetic');
          }, 8000));
        }
      }
      if (result.isRoundOver) {
        const t = daRoundTimers.get(roomId);
        if (t) { clearTimeout(t); daRoundTimers.delete(roomId); }
        finishMathRound(roomId, engine, 'tv-daily-arithmetic');
      }
    });

    // ── TV Missing Number ────────────────────────────────────────────
    socket.on('tv_missing_number_start', ({ difficulty = 'easy' } = {}) => {
      const roomId = socket.data.roomId;
      if (!roomId || socket.data.color !== 'tv-host') return;
      const room = roomManager.getRoom(roomId);
      if (!room || engines.has(roomId)) return;
      const phonePlayers = room.players.filter(p => p.color !== 'tv-host');
      if (phonePlayers.length < 1) return socket.emit('error', { message: 'Need at least 1 player.' });
      const diff = ['easy','medium','hard'].includes(difficulty) ? difficulty : 'easy';
      const engine = createMissingNumberGame(phonePlayers.length, diff);
      engine.start();
      engines.set(roomId, engine);
      roomGameTypes.set(roomId, 'tv-missing-number');
      io.to(roomId).emit('game_started', tvMathPayload(room, engine));
    });

    socket.on('tv_missing_number_answer', ({ answerIndex }) => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      const engine = engines.get(roomId);
      if (!engine) return;
      const room = roomManager.getRoom(roomId);
      if (!room) return;
      const seat = seatForMathColor(socket.data.color);
      if (seat < 0) return;
      const gs = engine.state();
      const answerValue = gs.options ? gs.options[answerIndex] : answerIndex;
      if (answerValue === undefined) return;
      const result = engine.submitAnswer(seat, answerValue);
      if (!result.ok) return;
      io.to(roomId).emit('game_state', tvMathPayload(room, engine));
      if (result.firstCorrect && !result.isRoundOver) {
        if (!mnRoundTimers.has(roomId)) {
          mnRoundTimers.set(roomId, setTimeout(() => {
            mnRoundTimers.delete(roomId);
            const eng = engines.get(roomId);
            if (eng) finishMathRound(roomId, eng, 'tv-missing-number');
          }, 8000));
        }
      }
      if (result.isRoundOver) {
        const t = mnRoundTimers.get(roomId);
        if (t) { clearTimeout(t); mnRoundTimers.delete(roomId); }
        finishMathRound(roomId, engine, 'tv-missing-number');
      }
    });

    // ── TV Number Sort ───────────────────────────────────────────────
    socket.on('tv_number_sort_start', ({ difficulty = 'easy' } = {}) => {
      const roomId = socket.data.roomId;
      if (!roomId || socket.data.color !== 'tv-host') return;
      const room = roomManager.getRoom(roomId);
      if (!room || engines.has(roomId)) return;
      const phonePlayers = room.players.filter(p => p.color !== 'tv-host');
      if (phonePlayers.length < 1) return socket.emit('error', { message: 'Need at least 1 player.' });
      const diff = ['easy','medium','hard'].includes(difficulty) ? difficulty : 'easy';
      const engine = createNumberSortGame(phonePlayers.length, diff);
      engine.start();
      engines.set(roomId, engine);
      roomGameTypes.set(roomId, 'tv-number-sort');
      io.to(roomId).emit('game_started', tvMathPayload(room, engine));
    });

    socket.on('tv_number_sort_tap', ({ value }) => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      const engine = engines.get(roomId);
      if (!engine) return;
      const room = roomManager.getRoom(roomId);
      if (!room) return;
      const seat = seatForMathColor(socket.data.color);
      if (seat < 0) return;
      const result = engine.submitTap(seat, value);
      if (!result.ok) return;
      io.to(roomId).emit('game_state', tvMathPayload(room, engine));
      if (result.firstCorrect && !result.isRoundOver) {
        if (!nsRoundTimers.has(roomId)) {
          nsRoundTimers.set(roomId, setTimeout(() => {
            nsRoundTimers.delete(roomId);
            const eng = engines.get(roomId);
            if (eng) finishMathRound(roomId, eng, 'tv-number-sort');
          }, 15000));
        }
      }
      if (result.isRoundOver) {
        const t = nsRoundTimers.get(roomId);
        if (t) { clearTimeout(t); nsRoundTimers.delete(roomId); }
        finishMathRound(roomId, engine, 'tv-number-sort');
      }
    });

    // ── TV Quick Maths ───────────────────────────────────────────────
    socket.on('tv_quick_maths_start', ({ difficulty = 'easy' } = {}) => {
      const roomId = socket.data.roomId;
      if (!roomId || socket.data.color !== 'tv-host') return;
      const room = roomManager.getRoom(roomId);
      if (!room || engines.has(roomId)) return;
      const phonePlayers = room.players.filter(p => p.color !== 'tv-host');
      if (phonePlayers.length < 1) return socket.emit('error', { message: 'Need at least 1 player.' });
      const diff = ['easy','medium','hard'].includes(difficulty) ? difficulty : 'easy';
      const engine = createQuickMathsGame(phonePlayers.length, diff);
      engine.start();
      engines.set(roomId, engine);
      roomGameTypes.set(roomId, 'tv-quick-maths');
      io.to(roomId).emit('game_started', tvMathPayload(room, engine));
    });

    socket.on('tv_quick_maths_answer', ({ answerIndex }) => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      const engine = engines.get(roomId);
      if (!engine) return;
      const room = roomManager.getRoom(roomId);
      if (!room) return;
      const seat = seatForMathColor(socket.data.color);
      if (seat < 0) return;
      const gs = engine.state();
      const answerValue = gs.question && gs.question.options ? gs.question.options[answerIndex] : answerIndex;
      if (answerValue === undefined) return;
      const result = engine.submitAnswer(seat, answerValue);
      if (!result.ok) return;
      io.to(roomId).emit('game_state', tvMathPayload(room, engine));
      if (result.firstCorrect && !result.isRoundOver) {
        if (!qmRoundTimers.has(roomId)) {
          const GRACE_MS = 6000;
          io.to(roomId).emit('quick_maths_grace', { graceSec: GRACE_MS / 1000 });
          qmRoundTimers.set(roomId, setTimeout(() => {
            qmRoundTimers.delete(roomId);
            const eng = engines.get(roomId);
            if (eng) finishMathRound(roomId, eng, 'tv-quick-maths');
          }, GRACE_MS));
        }
      }
      if (result.isRoundOver) {
        const t = qmRoundTimers.get(roomId);
        if (t) { clearTimeout(t); qmRoundTimers.delete(roomId); }
        finishMathRound(roomId, engine, 'tv-quick-maths');
      }
    });

    // ── TV Sokoban ───────────────────────────────────────────────────
    socket.on('tv_sokoban_start', () => {
      const roomId = socket.data.roomId;
      if (!roomId || socket.data.color !== 'tv-host') return;
      const room = roomManager.getRoom(roomId);
      if (!room || engines.has(roomId)) return;
      const phonePlayers = room.players.filter(p => p.color !== 'tv-host');
      if (phonePlayers.length < 1) return socket.emit('error', { message: 'Need at least 1 player.' });
      const engine = createSokobanGame(phonePlayers.length);
      engine.start();
      engines.set(roomId, engine);
      roomGameTypes.set(roomId, 'tv-sokoban');
      io.to(roomId).emit('game_started', tvSokobanPayload(room, engine));
      analytics.logEvent('game_started', roomId, socket.id, 'tv-host', { gameType: 'tv-sokoban', playerCount: phonePlayers.length });
    });

    socket.on('tv_sokoban_move', ({ direction }) => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      const engine = engines.get(roomId);
      if (!engine) return;
      const room = roomManager.getRoom(roomId);
      if (!room) return;
      const seat = seatForSokobanColor(socket.data.color);
      if (seat < 0) return;
      const result = engine.move(seat, direction);
      if (!result.ok) return;
      io.to(roomId).emit('game_state', tvSokobanPayload(room, engine));

      if (result.isRoundOver) {
        const roundResult = engine.endRound();
        const phonePlayers = room.players.filter(p => p.color !== 'tv-host');
        const state = engine.state();
        if (state.isSessionOver) {
          const winnerSeat = engine.winner();
          const winPlayer = winnerSeat !== null ? phonePlayers[winnerSeat] : null;
          if (winPlayer) leaderboard.recordWin('tv-sokoban', winPlayer.name);
          io.to(roomId).emit('game_over', {
            winner: winPlayer ? winPlayer.name : null,
            players: phonePlayers.map((p, i) => ({ name: p.name, score: state.sessionScores[i] || 0 }))
          });
          engines.delete(roomId);
          roomGameTypes.delete(roomId);
          analytics.logEvent('game_ended', roomId, socket.id, socket.data.playerName, { winner: winPlayer ? winPlayer.name : null, gameType: 'tv-sokoban' });
        } else {
          io.to(roomId).emit('round_over', {
            currentRound: state.currentRound,
            totalRounds: state.totalRounds,
            solvedOrder: roundResult.solvedOrder,
            pointsAwarded: roundResult.pointsAwarded,
            sessionScores: state.sessionScores,
            players: phonePlayers.map((p, i) => ({ name: p.name, score: state.sessionScores[i] || 0 })),
            nextRoundIn: 5
          });
          setTimeout(() => {
            const eng = engines.get(roomId);
            if (!eng) return;
            const nr = eng.nextRound();
            if (!nr.ok) return;
            const r = roomManager.getRoom(roomId);
            if (r) io.to(roomId).emit('game_state', tvSokobanPayload(r, eng));
          }, 5000);
        }
      }
    });

    socket.on('tv_sokoban_undo', () => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      const engine = engines.get(roomId);
      if (!engine) return;
      const room = roomManager.getRoom(roomId);
      if (!room) return;
      const seat = seatForSokobanColor(socket.data.color);
      if (seat < 0) return;
      engine.undo(seat);
      socket.emit('game_state', tvSokobanPayload(room, engine));
    });

    socket.on('tv_sokoban_restart', () => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      const engine = engines.get(roomId);
      if (!engine) return;
      const room = roomManager.getRoom(roomId);
      if (!room) return;
      const seat = seatForSokobanColor(socket.data.color);
      if (seat < 0) return;
      engine.restart(seat);
      socket.emit('game_state', tvSokobanPayload(room, engine));
    });

    // ── TV Ring Sort ─────────────────────────────────────────────────
    socket.on('tv_ring_sort_start', () => {
      const roomId = socket.data.roomId;
      if (!roomId || socket.data.color !== 'tv-host') return;
      const room = roomManager.getRoom(roomId);
      if (!room || engines.has(roomId)) return;
      const phonePlayers = room.players.filter(p => p.color !== 'tv-host');
      if (phonePlayers.length < 1) return socket.emit('error', { message: 'Need at least 1 player.' });
      const engine = createRingSortGame(phonePlayers.length);
      engine.start();
      engines.set(roomId, engine);
      roomGameTypes.set(roomId, 'tv-ring-sort');
      io.to(roomId).emit('game_started', tvRingSortPayload(room, engine));
      analytics.logEvent('game_started', roomId, socket.id, 'tv-host', { gameType: 'tv-ring-sort', playerCount: phonePlayers.length });
    });

    socket.on('tv_ring_sort_tap', ({ rodIdx }) => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      const engine = engines.get(roomId);
      if (!engine) return;
      const room = roomManager.getRoom(roomId);
      if (!room) return;
      const seat = seatForRingSortColor(socket.data.color);
      if (seat < 0) return;
      const result = engine.tapRod(seat, rodIdx);
      socket.emit('ring_tap_result', result);
      io.to(roomId).emit('game_state', tvRingSortPayload(room, engine));

      if (result.ok && result.isRoundOver) {
        const roundResult = engine.endRound();
        const phonePlayers = room.players.filter(p => p.color !== 'tv-host');
        const state = engine.state();
        if (state.isSessionOver) {
          const winnerSeat = engine.winner();
          const winPlayer = winnerSeat !== null ? phonePlayers[winnerSeat] : null;
          if (winPlayer) leaderboard.recordWin('tv-ring-sort', winPlayer.name);
          io.to(roomId).emit('game_over', {
            winner: winPlayer ? winPlayer.name : null,
            players: phonePlayers.map((p, i) => ({ name: p.name, score: state.sessionScores[i] || 0 }))
          });
          engines.delete(roomId);
          roomGameTypes.delete(roomId);
          analytics.logEvent('game_ended', roomId, socket.id, socket.data.playerName, { winner: winPlayer ? winPlayer.name : null, gameType: 'tv-ring-sort' });
        } else {
          io.to(roomId).emit('round_over', {
            currentRound: state.currentRound,
            totalRounds: state.totalRounds,
            solvedOrder: roundResult.solvedOrder,
            pointsAwarded: roundResult.pointsAwarded,
            sessionScores: state.sessionScores,
            players: phonePlayers.map((p, i) => ({ name: p.name, score: state.sessionScores[i] || 0 })),
            nextRoundIn: 5
          });
          setTimeout(() => {
            const eng = engines.get(roomId);
            if (!eng) return;
            const nr = eng.nextRound();
            if (!nr.ok) return;
            const r = roomManager.getRoom(roomId);
            if (r) io.to(roomId).emit('game_state', tvRingSortPayload(r, eng));
          }, 5000);
        }
      }
    });

    // ── TV Memory Match ────────────────────────────────────────────
    socket.on('tv_memory_match_start', ({ difficulty = 'easy' } = {}) => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      if (socket.data.color !== 'tv-host') return;
      const room = roomManager.getRoom(roomId);
      if (!room) return;
      if (engines.has(roomId)) return;

      const phonePlayers = room.players.filter(p => p.color !== 'tv-host');
      if (phonePlayers.length < 1) return socket.emit('error', { message: 'Need at least 1 player to start.' });

      const diff = ['easy', 'medium', 'hard'].includes(difficulty) ? difficulty : 'easy';
      const engine = createMemoryMatchGame(phonePlayers.length, diff);
      engine.start();
      engines.set(roomId, engine);
      roomGameTypes.set(roomId, 'tv-memory-match');

      // Register state change callback for mismatch auto-flip
      engine.onStateChange(() => {
        const r = roomManager.getRoom(roomId);
        if (r) io.to(roomId).emit('game_state', tvMemoryMatchPayload(r, engine));
      });

      io.to(roomId).emit('game_started', tvMemoryMatchPayload(room, engine));
      analytics.logEvent('game_started', roomId, socket.id, 'tv-host', { gameType: 'tv-memory-match', playerCount: phonePlayers.length });
    });

    socket.on('tv_memory_match_flip', ({ cardIndex }) => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      const engine = engines.get(roomId);
      if (!engine || !engine.flipCard) return;
      const room = roomManager.getRoom(roomId);
      if (!room) return;

      const seat = seatForMemoryMatchColor(socket.data.color);
      if (seat < 0) return;

      const result = engine.flipCard(seat, cardIndex);
      if (!result.ok) return;

      // Send personal feedback
      if (result.action) socket.emit('memory_match_flip_result', { action: result.action });

      io.to(roomId).emit('game_state', tvMemoryMatchPayload(room, engine));

      // First player finishes → 15s grace timer for others
      if (result.action === 'match' && result.matchCount === engine.state().totalPairs && !result.isRoundOver) {
        if (!memoryMatchGraceTimers.has(roomId)) {
          // Notify all players that grace period started
          const finisherName = room.players.find(p => p.color === socket.data.color)?.name || 'Someone';
          io.to(roomId).emit('memory_match_grace', { secondsLeft: 15, finisher: finisherName });
          memoryMatchGraceTimers.set(roomId, setTimeout(() => {
            memoryMatchGraceTimers.delete(roomId);
            const eng = engines.get(roomId);
            if (eng) finishMemoryMatchRound(roomId, eng);
          }, 15000));
        }
      }

      if (result.isRoundOver) {
        const timer = memoryMatchGraceTimers.get(roomId);
        if (timer) { clearTimeout(timer); memoryMatchGraceTimers.delete(roomId); }
        finishMemoryMatchRound(roomId, engine);
      }
    });

    function finishMemoryMatchRound(roomId, engine) {
      const room = roomManager.getRoom(roomId);
      if (!room) return;
      engine.endRound();
      const phonePlayers = room.players.filter(p => p.color !== 'tv-host');
      const st = engine.state();

      if (st.isSessionOver) {
        const winnerSeat = engine.winner();
        const winPlayer = winnerSeat !== null ? phonePlayers[winnerSeat] : null;
        if (winPlayer) leaderboard.recordWin('tv-memory-match', winPlayer.name);
        io.to(roomId).emit('game_over', {
          winner: winPlayer?.name || null,
          players: phonePlayers.map((p, i) => ({ name: p.name, score: st.sessionScores[i] || 0 })),
        });
        engines.delete(roomId);
        roomGameTypes.delete(roomId);
      } else {
        io.to(roomId).emit('round_over', {
          currentRound: st.currentRound,
          totalRounds: st.totalRounds,
          sessionScores: st.sessionScores,
          players: phonePlayers.map((p, i) => ({ name: p.name, score: st.sessionScores[i] || 0 })),
          nextRoundIn: 5,
        });
        setTimeout(() => {
          const eng = engines.get(roomId);
          if (!eng || !eng.nextRound) return;
          const nr = eng.nextRound();
          if (!nr.ok) return;
          const r = roomManager.getRoom(roomId);
          if (r) {
            eng.onStateChange(() => {
              const r2 = roomManager.getRoom(roomId);
              if (r2) io.to(roomId).emit('game_state', tvMemoryMatchPayload(r2, eng));
            });
            io.to(roomId).emit('game_state', tvMemoryMatchPayload(r, eng));
          }
        }, 5000);
      }
    }

    // ── TV Word Recall ──────────────────────────────────────────────
    socket.on('tv_word_recall_start', ({ difficulty = 'easy' } = {}) => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      if (socket.data.color !== 'tv-host') return;
      const room = roomManager.getRoom(roomId);
      if (!room) return;
      if (engines.has(roomId)) return;

      const phonePlayers = room.players.filter(p => p.color !== 'tv-host');
      if (phonePlayers.length < 1) return socket.emit('error', { message: 'Need at least 1 player to start.' });

      const engine = createWordRecallGame(phonePlayers.length);
      engine.start();
      engines.set(roomId, engine);
      roomGameTypes.set(roomId, 'tv-word-recall');

      io.to(roomId).emit('game_started', tvWordRecallPayload(room, engine));
      analytics.logEvent('game_started', roomId, socket.id, 'tv-host', { gameType: 'tv-word-recall', playerCount: phonePlayers.length });
    });

    socket.on('tv_word_recall_study_done', () => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      if (socket.data.color !== 'tv-host') return;
      const engine = engines.get(roomId);
      if (!engine || !engine.studyDone) return;
      const room = roomManager.getRoom(roomId);
      if (!room) return;
      engine.studyDone();
      io.to(roomId).emit('game_state', tvWordRecallPayload(room, engine));
    });

    socket.on('tv_word_recall_submit', ({ word }) => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      const engine = engines.get(roomId);
      if (!engine || !engine.submitWord) return;
      const room = roomManager.getRoom(roomId);
      if (!room) return;

      const seat = seatForWordRecallColor(socket.data.color);
      if (seat < 0) return;

      const result = engine.submitWord(seat, word);
      socket.emit('word_recall_result', result);
      io.to(roomId).emit('game_state', tvWordRecallPayload(room, engine));

      if (result.firstFinish && !result.isRoundOver) {
        // 30s grace timer for others
        if (!wordRecallRoundTimers.has(roomId)) {
          wordRecallRoundTimers.set(roomId, setTimeout(() => {
            wordRecallRoundTimers.delete(roomId);
            const eng = engines.get(roomId);
            if (eng) finishWordRecallRound(roomId, eng);
          }, 30000));
        }
      }

      if (result.isRoundOver) {
        const timer = wordRecallRoundTimers.get(roomId);
        if (timer) { clearTimeout(timer); wordRecallRoundTimers.delete(roomId); }
        finishWordRecallRound(roomId, engine);
      }
    });

    socket.on('tv_word_recall_time_up', () => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      if (socket.data.color !== 'tv-host') return;
      const engine = engines.get(roomId);
      if (!engine) return;
      const timer = wordRecallRoundTimers.get(roomId);
      if (timer) { clearTimeout(timer); wordRecallRoundTimers.delete(roomId); }
      finishWordRecallRound(roomId, engine);
    });

    const wordRecallRoundTimers = new Map();

    function finishWordRecallRound(roomId, engine) {
      const room = roomManager.getRoom(roomId);
      if (!room) return;
      engine.endRound();
      const phonePlayers = room.players.filter(p => p.color !== 'tv-host');
      const st = engine.state();

      if (st.isSessionOver) {
        const winnerSeat = engine.winner();
        const winPlayer = winnerSeat !== null ? phonePlayers[winnerSeat] : null;
        if (winPlayer) leaderboard.recordWin('tv-word-recall', winPlayer.name);
        io.to(roomId).emit('game_over', {
          winner: winPlayer?.name || null,
          players: phonePlayers.map((p, i) => ({ name: p.name, score: st.sessionScores[i] || 0 })),
        });
        engines.delete(roomId);
        roomGameTypes.delete(roomId);
      } else {
        io.to(roomId).emit('round_over', {
          currentRound: st.currentRound,
          totalRounds: st.totalRounds,
          sessionScores: st.sessionScores,
          players: phonePlayers.map((p, i) => ({ name: p.name, score: st.sessionScores[i] || 0 })),
          nextRoundIn: 5,
        });
        setTimeout(() => {
          const eng = engines.get(roomId);
          if (!eng || !eng.nextRound) return;
          const nr = eng.nextRound();
          if (!nr.ok) return;
          eng.start();
          const r = roomManager.getRoom(roomId);
          if (r) io.to(roomId).emit('game_state', tvWordRecallPayload(r, eng));
        }, 5000);
      }
    }

    // ── TV Shopping List ────────────────────────────────────────────
    socket.on('tv_shopping_list_start', ({ difficulty = 'easy' } = {}) => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      if (socket.data.color !== 'tv-host') return;
      const room = roomManager.getRoom(roomId);
      if (!room) return;
      if (engines.has(roomId)) return;

      const phonePlayers = room.players.filter(p => p.color !== 'tv-host');
      if (phonePlayers.length < 1) return socket.emit('error', { message: 'Need at least 1 player to start.' });

      const diff = ['easy', 'medium', 'hard'].includes(difficulty) ? difficulty : 'easy';
      const engine = createShoppingListGame(phonePlayers.length, diff);
      engine.start();
      engines.set(roomId, engine);
      roomGameTypes.set(roomId, 'tv-shopping-list');

      io.to(roomId).emit('game_started', tvShoppingListPayload(room, engine));
      analytics.logEvent('game_started', roomId, socket.id, 'tv-host', { gameType: 'tv-shopping-list', playerCount: phonePlayers.length });

      // Server controls study→recall transition
      const studySec = engine.state().studySec || 10;
      shoppingListSubmitTimers.set('study_' + roomId, setTimeout(() => {
        shoppingListSubmitTimers.delete('study_' + roomId);
        const eng = engines.get(roomId);
        if (!eng || !eng.studyDone) return;
        eng.studyDone();
        const r = roomManager.getRoom(roomId);
        if (r) io.to(roomId).emit('game_state', tvShoppingListPayload(r, eng));
      }, (studySec + 1) * 1000)); // +1s buffer for TV animation
    });

    // Kept for compat but server now controls study→recall
    socket.on('tv_shopping_list_study_done', () => {});

    socket.on('tv_shopping_list_toggle', ({ itemName }) => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      const engine = engines.get(roomId);
      if (!engine || !engine.toggleItem) return;
      const room = roomManager.getRoom(roomId);
      if (!room) return;

      const seat = seatForShoppingListColor(socket.data.color);
      if (seat < 0) return;

      const result = engine.toggleItem(seat, itemName);
      if (!result.ok) return;
      io.to(roomId).emit('game_state', tvShoppingListPayload(room, engine));
    });

    socket.on('tv_shopping_list_submit', () => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      const engine = engines.get(roomId);
      if (!engine || !engine.submitAnswer) return;
      const room = roomManager.getRoom(roomId);
      if (!room) return;

      const seat = seatForShoppingListColor(socket.data.color);
      if (seat < 0) return;

      const result = engine.submitAnswer(seat);
      if (!result.ok) return;

      socket.emit('shopping_list_result', result);
      io.to(roomId).emit('game_state', tvShoppingListPayload(room, engine));

      // First submit → 30s grace timer
      if (!shoppingListSubmitTimers.has(roomId)) {
        shoppingListSubmitTimers.set(roomId, setTimeout(() => {
          shoppingListSubmitTimers.delete(roomId);
          const eng = engines.get(roomId);
          if (eng) finishShoppingListRound(roomId, eng);
        }, 30000));
      }

      if (result.isRoundOver) {
        const timer = shoppingListSubmitTimers.get(roomId);
        if (timer) { clearTimeout(timer); shoppingListSubmitTimers.delete(roomId); }
        finishShoppingListRound(roomId, engine);
      }
    });

    function finishShoppingListRound(roomId, engine) {
      // Clear study timer if pending
      if (shoppingListSubmitTimers.has('study_' + roomId)) {
        clearTimeout(shoppingListSubmitTimers.get('study_' + roomId));
        shoppingListSubmitTimers.delete('study_' + roomId);
      }
      const room = roomManager.getRoom(roomId);
      if (!room) return;
      engine.endRound();
      const phonePlayers = room.players.filter(p => p.color !== 'tv-host');
      const st = engine.state();

      if (st.isSessionOver) {
        const winnerSeat = engine.winner();
        const winPlayer = winnerSeat !== null ? phonePlayers[winnerSeat] : null;
        if (winPlayer) leaderboard.recordWin('tv-shopping-list', winPlayer.name);
        io.to(roomId).emit('game_over', {
          winner: winPlayer?.name || null,
          players: phonePlayers.map((p, i) => ({ name: p.name, score: st.sessionScores[i] || 0 })),
        });
        engines.delete(roomId);
        roomGameTypes.delete(roomId);
      } else {
        io.to(roomId).emit('round_over', {
          currentRound: st.currentRound,
          totalRounds: st.totalRounds,
          sessionScores: st.sessionScores,
          players: phonePlayers.map((p, i) => ({ name: p.name, score: st.sessionScores[i] || 0 })),
          nextRoundIn: 5,
        });
        setTimeout(() => {
          const eng = engines.get(roomId);
          if (!eng || !eng.nextRound) return;
          const nr = eng.nextRound();
          if (!nr.ok) return;
          const r = roomManager.getRoom(roomId);
          if (r) {
            io.to(roomId).emit('game_state', tvShoppingListPayload(r, eng));
            // Schedule study→recall for next round
            const studySec = eng.state().studySec || 10;
            shoppingListSubmitTimers.set('study_' + roomId, setTimeout(() => {
              shoppingListSubmitTimers.delete('study_' + roomId);
              const e2 = engines.get(roomId);
              if (!e2 || !e2.studyDone) return;
              e2.studyDone();
              const r2 = roomManager.getRoom(roomId);
              if (r2) io.to(roomId).emit('game_state', tvShoppingListPayload(r2, e2));
            }, (studySec + 1) * 1000));
          }
        }, 5000);
      }
    }

    // ── TV Stroop Colour: helper to clear question timer ────────────
    function clearStroopTimer(roomId) {
      const entry = stroopQuestionTimers.get(roomId);
      if (entry) {
        clearTimeout(entry.timer);
        if (entry.feedbackTimer) clearTimeout(entry.feedbackTimer);
        stroopQuestionTimers.delete(roomId);
      }
    }

    // Start per-question timer based on difficulty, then auto-advance
    function startStroopQuestionTimer(roomId) {
      clearStroopTimer(roomId);
      const engine = engines.get(roomId);
      if (!engine) return;
      const st = engine.state();
      const qIdx = st.questionIndex;
      const timerMs = st.timerMs || 8000;
      const timer = setTimeout(() => {
        // Time's up — broadcast that all answered (forces advance)
        stroopAdvanceAfterFeedback(roomId, qIdx);
      }, timerMs);
      stroopQuestionTimers.set(roomId, { timer, questionIndex: qIdx, feedbackTimer: null });
    }

    // After all answered or time up: wait 1.5s for feedback, then advance
    function stroopAdvanceAfterFeedback(roomId, expectedQIdx) {
      const entry = stroopQuestionTimers.get(roomId);
      // Prevent double-advance for same question
      if (entry && entry.advanced) return;
      if (entry) {
        clearTimeout(entry.timer);
        entry.advanced = true;
      }

      // Broadcast stroop_all_answered so TV/mobile know answers are locked
      io.to(roomId).emit('stroop_all_answered');

      const feedbackTimer = setTimeout(() => {
        stroopQuestionTimers.delete(roomId);
        const eng = engines.get(roomId);
        if (!eng || !eng.nextStimulus) return;
        const room = roomManager.getRoom(roomId);
        if (!room) return;

        const result = eng.nextStimulus();
        if (!result.ok) return;

        if (result.isRoundOver) {
          finishStroopColourRound(roomId, eng);
        } else {
          io.to(roomId).emit('game_state', tvStroopColourPayload(room, eng));
          startStroopQuestionTimer(roomId);
        }
      }, 1500);

      if (entry) entry.feedbackTimer = feedbackTimer;
      else stroopQuestionTimers.set(roomId, { timer: null, questionIndex: expectedQIdx, feedbackTimer, advanced: true });
    }

    // ── TV Stroop Colour: start ────────────────────────────────────
    socket.on('tv_stroop_colour_start', ({ difficulty = 'easy' } = {}) => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      if (socket.data.color !== 'tv-host') return;
      const room = roomManager.getRoom(roomId);
      if (!room) return;
      if (engines.has(roomId)) return;

      const phonePlayers = room.players.filter(p => p.color !== 'tv-host');
      if (phonePlayers.length < 1) return socket.emit('error', { message: 'Need at least 1 player to start.' });

      const diff = ['easy', 'medium', 'hard'].includes(difficulty) ? difficulty : 'easy';
      const engine = createStroopColourGame(phonePlayers.length, diff);
      engine.start();
      engines.set(roomId, engine);
      roomGameTypes.set(roomId, 'tv-stroop-colour');

      io.to(roomId).emit('game_started', tvStroopColourPayload(room, engine));
      startStroopQuestionTimer(roomId);
      analytics.logEvent('game_started', roomId, socket.id, 'tv-host', { gameType: 'tv-stroop-colour', playerCount: phonePlayers.length });
    });

    // ── TV Stroop Colour: player answers ─────────────────────────────
    socket.on('tv_stroop_colour_answer', ({ colourName }) => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      const engine = engines.get(roomId);
      if (!engine || !engine.answerColour) return;
      const room = roomManager.getRoom(roomId);
      if (!room) return;

      const seat = seatForStroopColourColor(socket.data.color);
      if (seat < 0) return;

      const result = engine.answerColour(seat, colourName);
      if (!result.ok) return;

      const st = engine.state();
      // Send personal feedback to the answering player
      socket.emit('stroop_result', { correct: result.correct, correctColour: st.stimulus ? st.stimulus.inkName : colourName });

      // Broadcast updated state (shows who has answered)
      io.to(roomId).emit('game_state', tvStroopColourPayload(room, engine));

      if (result.allAnswered) {
        // All players answered — advance after feedback delay
        stroopAdvanceAfterFeedback(roomId, st.questionIndex);
      }
    });

    // ── TV Stroop Colour: TV requests next (kept for compatibility but server now auto-advances)
    socket.on('tv_stroop_colour_next', () => {
      // No-op: server now controls question advancement via timers
    });

    function finishStroopColourRound(roomId, engine) {
      clearStroopTimer(roomId);
      const room = roomManager.getRoom(roomId);
      if (!room) return;
      engine.endRound();
      const state = engine.state();
      const phonePlayers = room.players.filter(p => p.color !== 'tv-host');

      io.to(roomId).emit('game_state', tvStroopColourPayload(room, engine));

      if (state.isGameOver) {
        const winnerSeat = engine.winner();
        const winPlayer = winnerSeat !== null ? phonePlayers[winnerSeat] : null;
        if (winPlayer) leaderboard.recordWin('tv-stroop-colour', winPlayer.name);
        io.to(roomId).emit('game_over', {
          winner: winPlayer?.name || null,
          winnerSeat,
          players: phonePlayers.map((p, i) => ({ name: p.name, score: state.sessionScores[i] })),
          reason: winPlayer ? `${winPlayer.name} wins with ${state.sessionScores[winnerSeat]} pts!` : 'Game over!'
        });
        engines.delete(roomId);
        roomGameTypes.delete(roomId);
        analytics.logEvent('game_ended', roomId, socket.id, 'system', { winner: winPlayer?.name || null, gameType: 'tv-stroop-colour' });
      } else {
        io.to(roomId).emit('round_over', {
          currentRound: state.currentRound,
          totalRounds: state.totalRounds,
          sessionScores: state.sessionScores,
          players: phonePlayers.map((p, i) => ({ name: p.name, score: state.sessionScores[i] })),
          nextRoundIn: 5,
        });
        setTimeout(() => {
          const eng = engines.get(roomId);
          if (!eng || !eng.nextRound) return;
          const nr = eng.nextRound();
          if (!nr.ok) return;
          const r = roomManager.getRoom(roomId);
          if (r) {
            io.to(roomId).emit('game_state', tvStroopColourPayload(r, eng));
            startStroopQuestionTimer(roomId);
          }
        }, 5000);
      }
    }

    // ── TV Pattern Sequence ────────────────────────────────────────
    socket.on('tv_pattern_sequence_start', ({ difficulty = 'easy' } = {}) => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      if (socket.data.color !== 'tv-host') return;
      const room = roomManager.getRoom(roomId);
      if (!room) return;
      if (engines.has(roomId)) return;

      const phonePlayers = room.players.filter(p => p.color !== 'tv-host');
      if (phonePlayers.length < 1) return socket.emit('error', { message: 'Need at least 1 player to start.' });

      const diff = ['easy', 'medium', 'hard'].includes(difficulty) ? difficulty : 'easy';
      const engine = createPatternSequenceGame(phonePlayers.length, diff);
      engine.start();
      engines.set(roomId, engine);
      roomGameTypes.set(roomId, 'tv-pattern-sequence');

      io.to(roomId).emit('game_started', tvPatternSequencePayload(room, engine));
      analytics.logEvent('game_started', roomId, socket.id, 'tv-host', { gameType: 'tv-pattern-sequence', playerCount: phonePlayers.length });

      // 3s countdown + 1s "GO!" delay → begin showing sequence
      patternSequenceShowTimers.set(roomId, setTimeout(() => {
        patternSequenceShowTimers.delete(roomId);
        const eng = engines.get(roomId);
        if (!eng || !eng.beginShowing) return;
        eng.beginShowing();
        const r = roomManager.getRoom(roomId);
        if (r) {
          io.to(roomId).emit('game_state', tvPatternSequencePayload(r, eng));
          schedulePatternShowingDone(roomId);
        }
      }, 4000)); // 3s countdown + 1s "GO!" delay
    });

    // Server auto-schedules showing→input transition based on sequence timing
    function schedulePatternShowingDone(roomId) {
      // Clear any existing show timer
      const existing = patternSequenceShowTimers.get(roomId);
      if (existing) clearTimeout(existing);

      const eng = engines.get(roomId);
      if (!eng) return;
      const st = eng.state();
      if (st.phase !== 'showing') return;
      const stepTime = (st.flashMs || 600) + (st.gapMs || 200);
      const totalMs = st.sequenceLength * stepTime + 300; // +300ms buffer
      const timer = setTimeout(() => {
        patternSequenceShowTimers.delete(roomId);
        const e = engines.get(roomId);
        if (!e || !e.showingDone) return;
        const s = e.state();
        if (s.phase !== 'showing') return;
        e.showingDone();
        const r = roomManager.getRoom(roomId);
        if (r) io.to(roomId).emit('game_state', tvPatternSequencePayload(r, e));
      }, totalMs);
      patternSequenceShowTimers.set(roomId, timer);
    }

    // Keep for backwards compat but server now auto-transitions
    socket.on('tv_pattern_sequence_showing_done', () => {});

    socket.on('tv_pattern_sequence_press', ({ padIndex }) => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      const engine = engines.get(roomId);
      if (!engine || !engine.pressPad) return;
      const room = roomManager.getRoom(roomId);
      if (!room) return;

      const seat = seatForPatternSequenceColor(socket.data.color);
      if (seat < 0) return;

      const result = engine.pressPad(seat, padIndex);
      if (!result.ok) return;

      io.to(roomId).emit('game_state', tvPatternSequencePayload(room, engine));

      // If sequence was extended, schedule server-side showing→input transition
      if (result.extended) {
        schedulePatternShowingDone(roomId);
      }

      // First player finishes → 30s grace timer
      if (result.isFinished && !result.isRoundOver) {
        if (!patternSequenceRoundTimers.has(roomId)) {
          patternSequenceRoundTimers.set(roomId, setTimeout(() => {
            patternSequenceRoundTimers.delete(roomId);
            const eng = engines.get(roomId);
            if (eng) finishPatternSequenceRound(roomId, eng);
          }, 30000));
        }
      }

      if (result.isRoundOver) {
        const timer = patternSequenceRoundTimers.get(roomId);
        if (timer) { clearTimeout(timer); patternSequenceRoundTimers.delete(roomId); }
        finishPatternSequenceRound(roomId, engine);
      }
    });

    function finishPatternSequenceRound(roomId, engine) {
      // Clear show timer if still pending
      if (patternSequenceShowTimers.has(roomId)) {
        clearTimeout(patternSequenceShowTimers.get(roomId));
        patternSequenceShowTimers.delete(roomId);
      }
      const room = roomManager.getRoom(roomId);
      if (!room) return;
      engine.endRound();
      const phonePlayers = room.players.filter(p => p.color !== 'tv-host');
      const st = engine.state();

      if (st.isSessionOver) {
        const winnerSeat = engine.winner();
        const winPlayer = winnerSeat !== null ? phonePlayers[winnerSeat] : null;
        if (winPlayer) leaderboard.recordWin('tv-pattern-sequence', winPlayer.name);
        io.to(roomId).emit('game_over', {
          winner: winPlayer?.name || null,
          players: phonePlayers.map((p, i) => ({ name: p.name, score: st.sessionScores[i] || 0 })),
        });
        engines.delete(roomId);
        roomGameTypes.delete(roomId);
      } else {
        io.to(roomId).emit('round_over', {
          currentRound: st.currentRound,
          totalRounds: st.totalRounds,
          sessionScores: st.sessionScores,
          players: phonePlayers.map((p, i) => ({ name: p.name, score: st.sessionScores[i] || 0 })),
          nextRoundIn: 5,
        });
        setTimeout(() => {
          const eng = engines.get(roomId);
          if (!eng || !eng.nextRound) return;
          const nr = eng.nextRound();
          if (!nr.ok) return;
          const r = roomManager.getRoom(roomId);
          if (r) {
            io.to(roomId).emit('game_state', tvPatternSequencePayload(r, eng));
            schedulePatternShowingDone(roomId);
          }
        }, 5000);
      }
    }

    // ── TV Speed Tap ────────────────────────────────────────────────
    // ── Speed Tap: helpers ──────────────────────────────────────────
    function clearSpeedTapTimer(roomId) {
      const entry = speedTapQuestionTimers.get(roomId);
      if (entry) {
        clearTimeout(entry.timer);
        if (entry.feedbackTimer) clearTimeout(entry.feedbackTimer);
        speedTapQuestionTimers.delete(roomId);
      }
    }

    // Buildup (1.5s) → reveal target → answer timer starts
    function startSpeedTapBuildup(roomId) {
      clearSpeedTapTimer(roomId);
      const engine = engines.get(roomId);
      if (!engine) return;
      const qIdx = engine.state().questionIndex;

      // Phase 1: buildup — grid visible, target hidden (1.5s tick-tock)
      const buildupTimer = setTimeout(() => {
        const eng = engines.get(roomId);
        if (!eng || !eng.revealTarget) return;
        eng.revealTarget();
        const room = roomManager.getRoom(roomId);
        if (!room) return;

        // Phase 2: reveal — broadcast with questionPhase='answering', start answer timer
        io.to(roomId).emit('game_state', tvSpeedTapPayload(room, eng));

        const st = eng.state();
        const timerMs = st.showMs || 3000;
        const answerTimer = setTimeout(() => {
          speedTapAdvanceAfterFeedback(roomId, qIdx);
        }, timerMs);
        speedTapQuestionTimers.set(roomId, { timer: answerTimer, questionIndex: qIdx, feedbackTimer: null });
      }, 1500);

      speedTapQuestionTimers.set(roomId, { timer: buildupTimer, questionIndex: qIdx, feedbackTimer: null });
    }

    function speedTapAdvanceAfterFeedback(roomId, expectedQIdx) {
      const entry = speedTapQuestionTimers.get(roomId);
      if (entry && entry.advanced) return;
      if (entry) {
        clearTimeout(entry.timer);
        entry.advanced = true;
      }

      io.to(roomId).emit('tv_speed_tap_all_answered');

      const feedbackTimer = setTimeout(() => {
        speedTapQuestionTimers.delete(roomId);
        const eng = engines.get(roomId);
        if (!eng || !eng.nextQuestion) return;
        const room = roomManager.getRoom(roomId);
        if (!room) return;

        const result = eng.nextQuestion();
        if (!result.ok) return;

        if (result.isRoundOver) {
          finishSpeedTapRound(roomId, eng);
        } else {
          io.to(roomId).emit('game_state', tvSpeedTapPayload(room, eng));
          startSpeedTapBuildup(roomId);
        }
      }, 800);

      if (entry) entry.feedbackTimer = feedbackTimer;
      else speedTapQuestionTimers.set(roomId, { timer: null, questionIndex: expectedQIdx, feedbackTimer, advanced: true });
    }

    socket.on('tv_speed_tap_start', ({ difficulty = 'easy' } = {}) => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      if (socket.data.color !== 'tv-host') return;
      const room = roomManager.getRoom(roomId);
      if (!room) return;
      if (engines.has(roomId)) return;

      const phonePlayers = room.players.filter(p => p.color !== 'tv-host');
      if (phonePlayers.length < 1) return socket.emit('error', { message: 'Need at least 1 player to start.' });

      const diff = ['easy', 'medium', 'hard'].includes(difficulty) ? difficulty : 'easy';
      const engine = createSpeedTapGame(phonePlayers.length, diff);
      engine.start(); // sets questionPhase = 'countdown'
      engines.set(roomId, engine);
      roomGameTypes.set(roomId, 'tv-speed-tap');

      io.to(roomId).emit('game_started', tvSpeedTapPayload(room, engine));
      analytics.logEvent('game_started', roomId, socket.id, 'tv-host', { gameType: 'tv-speed-tap', playerCount: phonePlayers.length });

      // 5-second countdown, then start first question buildup
      const countdownTimer = setTimeout(() => {
        const eng = engines.get(roomId);
        if (!eng || !eng.startFirstQuestion) return;
        eng.startFirstQuestion();
        const r = roomManager.getRoom(roomId);
        if (r) {
          io.to(roomId).emit('game_state', tvSpeedTapPayload(r, eng));
          startSpeedTapBuildup(roomId);
        }
      }, 5000);
      speedTapQuestionTimers.set(roomId, { timer: countdownTimer, questionIndex: -1, feedbackTimer: null });
    });

    socket.on('tv_speed_tap_tap', ({ emoji }) => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      const engine = engines.get(roomId);
      if (!engine || !engine.tapItem) return;
      const room = roomManager.getRoom(roomId);
      if (!room) return;

      const seat = seatForSpeedTapColor(socket.data.color);
      if (seat < 0) return;

      const result = engine.tapItem(seat, emoji);
      if (!result.ok) return;

      socket.emit('tv_speed_tap_result', { correct: result.correct });
      io.to(roomId).emit('game_state', tvSpeedTapPayload(room, engine));

      if (result.allAnswered) {
        speedTapAdvanceAfterFeedback(roomId, engine.state().questionIndex);
      }
    });

    // Kept for compatibility but server now auto-advances
    socket.on('tv_speed_tap_next', () => {});

    function finishSpeedTapRound(roomId, engine) {
      clearSpeedTapTimer(roomId);
      const room = roomManager.getRoom(roomId);
      if (!room) return;
      engine.endRound();
      const phonePlayers = room.players.filter(p => p.color !== 'tv-host');
      const st = engine.state();

      if (st.isSessionOver) {
        const winnerSeat = engine.winner();
        const winPlayer = winnerSeat !== null ? phonePlayers[winnerSeat] : null;
        if (winPlayer) leaderboard.recordWin('tv-speed-tap', winPlayer.name);
        io.to(roomId).emit('game_over', {
          winner: winPlayer?.name || null,
          players: phonePlayers.map((p, i) => ({ name: p.name, score: st.sessionScores[i] || 0 })),
        });
        engines.delete(roomId);
        roomGameTypes.delete(roomId);
      } else {
        io.to(roomId).emit('round_over', {
          currentRound: st.currentRound,
          totalRounds: st.totalRounds,
          sessionScores: st.sessionScores,
          players: phonePlayers.map((p, i) => ({ name: p.name, score: st.sessionScores[i] || 0 })),
          nextRoundIn: 5,
        });
        setTimeout(() => {
          const eng = engines.get(roomId);
          if (!eng || !eng.nextRound) return;
          const nr = eng.nextRound();
          if (!nr.ok) return;
          const r = roomManager.getRoom(roomId);
          if (r) {
            io.to(roomId).emit('game_state', tvSpeedTapPayload(r, eng));
            startSpeedTapBuildup(roomId);
          }
        }, 5000);
      }
    }

    // ── Cooking: TV signals HTP done → start tick + advance phones ─
    socket.on('cooking_htp_done', () => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      io.to(roomId).emit('cooking_htp_done');
      // Start the game tick now (was deferred from start_game)
      if (!cookingTimers.has(roomId) && engines.has(roomId)) {
        const timer = setInterval(() => cookingTick(io, roomId), 200);
        cookingTimers.set(roomId, timer);
      }
    });

    // ── Cooking: player claims a task ──────────────────────────────
    socket.on('cooking_claim_task', ({ taskId }) => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      const engine = engines.get(roomId);
      const room   = roomManager.getRoom(roomId);
      if (!engine || !room) return;
      if (roomGameTypes.get(roomId) !== 'cooking') return;
      const playerName = socket.data.playerName;
      const result = engine.claimTask(playerName, taskId);
      if (!result.ok) {
        socket.emit('cooking_action_error', { reason: result.reason });
        return;
      }
      const gs = engine.state();
      io.to(roomId).emit('cooking_state', gs);
      for (const rp of room.players) {
        if (rp.color === 'tv-host' || !rp.socketId) continue;
        const rps = engine.playerState(rp.name);
        if (rps) io.to(rp.socketId).emit('cooking_player_state', rps);
      }
      analytics.logEvent('move_made', roomId, socket.id, playerName, { action: 'claim_task', taskId, gameType: 'cooking' });
    });

    // ── Cooking: chopping tap ──────────────────────────────────────
    socket.on('cooking_tap', () => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      const engine = engines.get(roomId);
      const room   = roomManager.getRoom(roomId);
      if (!engine || !room) return;
      if (roomGameTypes.get(roomId) !== 'cooking') return;
      const playerName = socket.data.playerName;
      const result = engine.tapAction(playerName);
      if (!result.ok) {
        socket.emit('cooking_action_error', { reason: result.reason });
        return;
      }
      const ps = engine.playerState(playerName);
      if (ps) socket.emit('cooking_player_state', ps);
      if (result.action === 'task_completed') {
        const gs = engine.state();
        io.to(roomId).emit('cooking_state', gs);
        for (const rp of room.players) {
          if (rp.color === 'tv-host' || !rp.socketId) continue;
          const rps = engine.playerState(rp.name);
          if (rps) io.to(rp.socketId).emit('cooking_player_state', rps);
        }
      }
    });

    // ── Cooking: stirring ──────────────────────────────────────────
    socket.on('cooking_stir', ({ circles }) => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      const engine = engines.get(roomId);
      const room   = roomManager.getRoom(roomId);
      if (!engine || !room) return;
      if (roomGameTypes.get(roomId) !== 'cooking') return;
      const playerName = socket.data.playerName;
      const result = engine.stirAction(playerName, circles || 1);
      if (!result.ok) {
        socket.emit('cooking_action_error', { reason: result.reason });
        return;
      }
      const ps = engine.playerState(playerName);
      if (ps) socket.emit('cooking_player_state', ps);
      if (result.action === 'task_completed') {
        const gs = engine.state();
        io.to(roomId).emit('cooking_state', gs);
        for (const rp of room.players) {
          if (rp.color === 'tv-host' || !rp.socketId) continue;
          const rps = engine.playerState(rp.name);
          if (rps) io.to(rp.socketId).emit('cooking_player_state', rps);
        }
      }
    });

    // ── Cooking: flip QTE ──────────────────────────────────────────
    socket.on('cooking_flip', ({ timing }) => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      const engine = engines.get(roomId);
      const room   = roomManager.getRoom(roomId);
      if (!engine || !room) return;
      if (roomGameTypes.get(roomId) !== 'cooking') return;
      const playerName = socket.data.playerName;
      const result = engine.flipAction(playerName, timing || 0);
      if (!result.ok) {
        socket.emit('cooking_action_error', { reason: result.reason });
        return;
      }
      const ps = engine.playerState(playerName);
      if (ps) socket.emit('cooking_player_state', ps);
      if (result.action === 'task_completed') {
        const gs = engine.state();
        io.to(roomId).emit('cooking_state', gs);
        for (const rp of room.players) {
          if (rp.color === 'tv-host' || !rp.socketId) continue;
          const rps = engine.playerState(rp.name);
          if (rps) io.to(rp.socketId).emit('cooking_player_state', rps);
        }
      }
      socket.emit('cooking_flip_result', { result: result.result || result.action });
    });

    // ── Disconnect ──────────────────────────────────────────────────
    socket.on('disconnect', () => {
      console.log('disconnect', socket.id);
      const result = roomManager.leaveRoom(socket.id);
      if (!result) return;
      const { roomId, room, wasPlayer, playerName } = result;
      if (!wasPlayer) return;

      // 2s delay absorbs the lobby→game-page socket transition race
      setTimeout(() => {
        const currentRoom = roomManager.getRoom(roomId);
        if (!currentRoom) return;
        const player = currentRoom.players.find(p => p.name === playerName);
        if (player && player.socketId !== null) return; // already reconnected

        io.to(roomId).emit('player_disconnected', { playerName });
        io.to(roomId).emit('room_update', roomSnapshot(currentRoom));
        analytics.logEvent('player_disconnected', roomId, socket.id, playerName || '');
      }, 2000);
    });
  });
};
