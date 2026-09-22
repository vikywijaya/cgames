/**
 * Congkak — traditional Malay/Indonesian mancala, simplified single round.
 *
 * Board is a flat array of 16:
 *   0-6   P1 houses      7   P1 store
 *   8-14  P2 houses     15   P2 store
 *
 * Sowing runs anticlockwise (increasing index, mod 16) and SKIPS the
 * opponent's store. Houses face each other symmetrically: opposite(i) = 14 - i.
 *
 * Interface:
 *   createGame({ maxSowSteps }) -> {
 *     state()               — { board, turn, isGameOver, winner }
 *     legalMoves(seat)      — number[]  (empty unless it is that seat's turn)
 *     move(seat, hole)      — { ok, reason?, steps, state }
 *     restore({board,turn}) — replace state wholesale (undo, tests)
 *   }
 */

export const HOUSES_PER_SIDE = 7;
export const SEEDS_PER_HOUSE = 7;
export const BOARD_SIZE = 16;

/** Store index per seat. */
export const STORE = [7, 15];

/**
 * Hard cap on sow steps within a single move. The continuous-sow rule has no
 * trivial termination proof, so this guarantees a move always ends rather
 * than hanging the tablet. It should never fire in real play.
 */
export const MAX_SOW_STEPS = 10000;

/** The house directly across the board from house i. */
export function opposite(i) {
  return 14 - i;
}

/** True when index i is one of seat's HOUSES (a store is not a house). */
export function ownsHouse(seat, i) {
  return seat === 0 ? i >= 0 && i <= 6 : i >= 8 && i <= 14;
}

function initialBoard() {
  const board = new Array(BOARD_SIZE).fill(0);
  for (let i = 0; i <= 6; i++) board[i] = SEEDS_PER_HOUSE;
  for (let i = 8; i <= 14; i++) board[i] = SEEDS_PER_HOUSE;
  return board;
}

/**
 * The next index when sowing for `seat`: one step anticlockwise, skipping
 * the OPPONENT's store (each player sows through their own store only).
 */
function nextIndex(seat, i) {
  let n = (i + 1) % BOARD_SIZE;
  if (n === STORE[1 - seat]) n = (n + 1) % BOARD_SIZE;
  return n;
}

export function createGame({ maxSowSteps = MAX_SOW_STEPS } = {}) {
  let board = initialBoard();
  let turn = 0;
  let isGameOver = false;
  let winner = null;

  function state() {
    return { board: [...board], turn, isGameOver, winner };
  }

  function legalMoves(seat) {
    if (isGameOver || seat !== turn) return [];
    const moves = [];
    for (let i = 0; i < BOARD_SIZE; i++) {
      if (ownsHouse(seat, i) && board[i] > 0) moves.push(i);
    }
    return moves;
  }

  function restore(snapshot) {
    board = [...snapshot.board];
    turn = snapshot.turn;
    isGameOver = snapshot.isGameOver ?? false;
    winner = snapshot.winner ?? null;
  }

  function move(seat, hole) {
    if (isGameOver)               return { ok: false, reason: 'game-over', steps: [], state: state() };
    if (seat !== turn)            return { ok: false, reason: 'not-your-turn', steps: [], state: state() };
    if (!ownsHouse(seat, hole))   return { ok: false, reason: 'not-your-house', steps: [], state: state() };
    if (board[hole] === 0)        return { ok: false, reason: 'empty-house', steps: [], state: state() };

    const steps = [];
    let sowCount = 0;
    let extraTurn = false;

    let hand = board[hole];
    let current = hole;
    board[hole] = 0;
    steps.push({ type: 'pickup', hole, count: hand });

    // Outer loop runs once per relay; the inner loop sows the current hand.
    for (;;) {
      let forced = false;
      while (hand > 0) {
        if (sowCount >= maxSowSteps) { forced = true; break; }
        current = nextIndex(seat, current);
        board[current] += 1;
        hand -= 1;
        sowCount += 1;
        steps.push({ type: 'sow', hole: current, seedsRemaining: hand });
      }

      if (forced) {
        // Return the undistributed hand to the mover's store so seeds are
        // conserved, then end the move. See MAX_SOW_STEPS.
        board[STORE[seat]] += hand;
        steps.push({ type: 'forceEnd', seat, seedsReturned: hand });
        hand = 0;
        break;
      }

      // Rule 1 — landed in own store: extra turn.
      if (current === STORE[seat]) {
        extraTurn = true;
        steps.push({ type: 'extraTurn', seat });
        break;
      }

      // Rule 2 — landed on a hole that already held seeds: lift and sow on.
      if (board[current] > 1) {
        hand = board[current];
        board[current] = 0;
        steps.push({ type: 'relay', hole: current, count: hand });
        continue;
      }

      // board[current] === 1, so the hole was empty before this seed landed.
      const facing = opposite(current);

      // Rule 3 — empty house on the mover's own side, with seeds opposite.
      // Read board[facing] LIVE, not a pre-move snapshot: a long sow can
      // wrap all the way around and drop a seed into `facing` earlier in
      // this SAME move (see the "skips the opponent store" tests) — that
      // seed is legitimately sitting there now and is captured too, same as
      // a real physical board where sowing mutates holes as you go.
      if (ownsHouse(seat, current) && board[facing] > 0) {
        const count = board[current] + board[facing];
        board[current] = 0;
        board[facing] = 0;
        board[STORE[seat]] += count;
        steps.push({
          type: 'capture', hole: current, oppositeHole: facing,
          count, store: STORE[seat],
        });
        break;
      }

      // Rule 3 boundary (opposite house empty) and rule 4 (mati on the
      // opponent's side) both simply end the move with the seed left in place.
      break;
    }

    if (!extraTurn) turn = 1 - seat;

    return { ok: true, steps, state: state() };
  }

  return { state, legalMoves, move, restore };
}
