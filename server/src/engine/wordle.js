'use strict';

const WORDS = [
  'ABOUT','ABOVE','ABUSE','ACTOR','ACUTE','ADMIT','ADOPT','ADULT','AFTER','AGAIN',
  'AGENT','AGREE','AHEAD','ALARM','ALBUM','ALERT','ALIEN','ALIGN','ALIVE','ALLEY',
  'ALLOW','ALONE','ALONG','ALTER','AMPLE','ANGEL','ANGER','ANGLE','ANGRY','ANIME',
  'ANKLE','ANNEX','APART','APPLE','APPLY','ARENA','ARGUE','ARISE','ARMOR','ARRAY',
  'ASIDE','ASSET','ATTIC','AVOID','AWAKE','AWARD','AWARE','BACON','BADGE','BASIC',
  'BASIN','BASIS','BATCH','BEACH','BEARD','BEAST','BEGIN','BEING','BELOW','BENCH',
  'BERRY','BLACK','BLADE','BLAME','BLAND','BLANK','BLAST','BLAZE','BLEED','BLEND',
  'BLESS','BLIND','BLISS','BLOCK','BLOOD','BLOOM','BLOWN','BOARD','BOAST','BONUS',
  'BOOST','BOUND','BRAIN','BRAND','BRAVE','BREAD','BREAK','BREED','BRICK','BRIDE',
  'BRIEF','BRING','BROAD','BROKE','BROOK','BROWN','BRUSH','BUILD','BUNCH','BURST',
  'BUYER','CABIN','CABLE','CANDY','CARRY','CATCH','CAUSE','CEASE','CHAIN','CHAIR',
  'CHARM','CHART','CHASE','CHEAP','CHECK','CHEEK','CHEER','CHESS','CHEST','CHIEF',
  'CHILD','CHILL','CHINA','CHUNK','CIVIL','CLAIM','CLASS','CLEAN','CLEAR','CLERK',
  'CLICK','CLIFF','CLIMB','CLING','CLOCK','CLONE','CLOSE','CLOTH','CLOUD','COACH',
  'COAST','COLOR','COMET','CORAL','COUNT','COURT','COVER','CRACK','CRAFT','CRANE',
  'CRASH','CRAZY','CREAM','CREEK','CRIME','CROSS','CROWD','CROWN','CRUSH','CURVE',
  'CYCLE','DAILY','DANCE','DEATH','DEBUT','DECAY','DELAY','DENSE','DEPTH','DERBY',
  'DEVIL','DIARY','DIRTY','DOUBT','DOUGH','DRAFT','DRAIN','DRAKE','DRAMA','DRANK',
  'DRAWN','DREAM','DRESS','DRIED','DRIFT','DRILL','DRINK','DRIVE','DROPS','DROVE',
  'DRUGS','DRUNK','DYING','EAGER','EAGLE','EARLY','EARTH','EIGHT','ELECT','ELITE',
  'EMPTY','ENEMY','ENJOY','ENTER','ENTRY','EQUAL','ERROR','EVENT','EVERY','EXACT',
  'EXAMS','EXIST','EXTRA','FABLE','FAITH','FALSE','FANCY','FATAL','FAULT','FEAST',
  'FENCE','FIBER','FIELD','FIFTH','FIFTY','FIGHT','FINAL','FLAME','FLASH','FLEET',
  'FLESH','FLOAT','FLOOD','FLOOR','FLOUR','FLUID','FLUSH','FOCUS','FORCE','FORGE',
  'FORTH','FORUM','FOUND','FRAME','FRANK','FRAUD','FRESH','FRONT','FROST','FRUIT',
  'FULLY','GIANT','GIVEN','GLASS','GLOBE','GLOOM','GLORY','GLOVE','GRACE','GRADE',
  'GRAIN','GRAND','GRANT','GRAPE','GRASP','GRASS','GRAVE','GREAT','GREEN','GREET',
  'GRIEF','GRILL','GRIND','GROSS','GROUP','GROVE','GROWN','GUARD','GUESS','GUEST',
  'GUIDE','GUILT','HABIT','HAPPY','HARSH','HAVEN','HEART','HEAVY','HENCE','HOBBY',
  'HONOR','HORSE','HOTEL','HOUSE','HUMAN','HUMOR','HURRY','IDEAL','IMAGE','IMPLY',
];

const STATUS_RANK = { absent: 0, present: 1, correct: 2 };

function evaluateGuess(guess, answer) {
  const result = new Array(5).fill(null);
  const answerLetters = answer.split('');
  const guessLetters = guess.split('');
  const remaining = new Array(5).fill(true); // tracks unmatched answer positions

  // First pass: mark correct (exact matches)
  for (let i = 0; i < 5; i++) {
    if (guessLetters[i] === answerLetters[i]) {
      result[i] = { letter: guessLetters[i], status: 'correct' };
      remaining[i] = false;
    }
  }

  // Second pass: mark present or absent
  for (let i = 0; i < 5; i++) {
    if (result[i]) continue; // already marked correct

    const letter = guessLetters[i];
    // Find an unmatched position in the answer with this letter
    const matchIdx = answerLetters.findIndex((ch, j) => remaining[j] && ch === letter);

    if (matchIdx !== -1) {
      result[i] = { letter, status: 'present' };
      remaining[matchIdx] = false;
    } else {
      result[i] = { letter, status: 'absent' };
    }
  }

  return result;
}

function createGame(playerCount) {
  if (!playerCount || playerCount < 1 || playerCount > 8) {
    playerCount = 2;
  }

  const answer = WORDS[Math.floor(Math.random() * WORDS.length)];

  // Per-player state
  const players = [];
  for (let i = 0; i < playerCount; i++) {
    players.push({
      grid: [],        // array of attempts, each attempt is array of {letter, status}
      keyboard: {},    // letter → best status
      solved: false,
      failed: false,
      currentAttempt: 0,
    });
  }

  let winnerSeat = null;
  let gameOver = false;

  function checkGameOver() {
    if (gameOver) return;
    // Any player solved?
    for (let i = 0; i < playerCount; i++) {
      if (players[i].solved && winnerSeat === null) {
        winnerSeat = i;
        gameOver = true;
        return;
      }
    }
    // All players failed?
    if (players.every(p => p.failed)) {
      gameOver = true;
    }
  }

  function submitGuess(seat, word) {
    if (seat < 0 || seat >= playerCount) {
      return { ok: false, reason: 'Invalid seat' };
    }

    const player = players[seat];

    if (gameOver) {
      return { ok: false, reason: 'Game is over' };
    }
    if (player.solved) {
      return { ok: false, reason: 'Already solved' };
    }
    if (player.failed) {
      return { ok: false, reason: 'No attempts remaining' };
    }

    if (typeof word !== 'string') {
      return { ok: false, reason: 'Invalid guess' };
    }

    const normalized = word.toUpperCase().trim();

    if (normalized.length !== 5 || !/^[A-Z]{5}$/.test(normalized)) {
      return { ok: false, reason: 'Guess must be exactly 5 letters' };
    }

    const result = evaluateGuess(normalized, answer);
    const attemptIndex = player.currentAttempt;

    player.grid.push(result);
    player.currentAttempt++;

    // Update keyboard status
    for (const cell of result) {
      const current = player.keyboard[cell.letter];
      if (!current || STATUS_RANK[cell.status] > STATUS_RANK[current]) {
        player.keyboard[cell.letter] = cell.status;
      }
    }

    // Check if solved
    const solved = result.every(c => c.status === 'correct');
    if (solved) {
      player.solved = true;
    } else if (player.currentAttempt >= 6) {
      player.failed = true;
    }

    checkGameOver();

    return {
      ok: true,
      attempt: attemptIndex,
      result: result,
      solved: player.solved,
      failed: player.failed,
    };
  }

  function state() {
    // TV state: colors only, no letters
    const grids = players.map(p =>
      p.grid.map(attempt =>
        attempt.map(cell => ({ status: cell.status }))
      )
    );

    return {
      gameType: 'tv-wordle',
      grids,
      solved: players.map(p => p.solved),
      failed: players.map(p => p.failed),
      isGameOver: gameOver,
      winnerSeat,
      playerCount,
    };
  }

  function playerState(seat) {
    if (seat < 0 || seat >= playerCount) return null;
    const player = players[seat];

    return {
      seat,
      grid: player.grid.map(attempt =>
        attempt.map(cell => ({ letter: cell.letter, status: cell.status }))
      ),
      keyboard: Object.assign({}, player.keyboard),
      solved: player.solved,
      failed: player.failed,
      currentAttempt: player.currentAttempt,
      isGameOver: gameOver,
      winnerSeat,
    };
  }

  function isGameOver() {
    return gameOver;
  }

  function winner() {
    return winnerSeat;
  }

  return {
    state,
    playerState,
    submitGuess,
    isGameOver,
    winner,
  };
}

module.exports = { createGame };
