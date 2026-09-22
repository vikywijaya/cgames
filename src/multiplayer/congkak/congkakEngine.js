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

  return { state, legalMoves, restore };
}
