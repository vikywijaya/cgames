'use strict';

const GRID_SIZE = 20;
const MAX_CAN_SEE = 5;

const DIRECTIONS = {
  north: { dr: -1, dc: 0, wall: 'north', opposite: 'south' },
  south: { dr: 1, dc: 0, wall: 'south', opposite: 'north' },
  east: { dr: 0, dc: 1, wall: 'east', opposite: 'west' },
  west: { dr: 0, dc: -1, wall: 'west', opposite: 'east' },
};

const TURN_LEFT = { north: 'west', west: 'south', south: 'east', east: 'north' };
const TURN_RIGHT = { north: 'east', east: 'south', south: 'west', west: 'north' };

function generateMaze(rows, cols) {
  // Initialize grid with all walls up
  const grid = [];
  for (let r = 0; r < rows; r++) {
    grid[r] = [];
    for (let c = 0; c < cols; c++) {
      grid[r][c] = { north: true, south: true, east: true, west: true };
    }
  }

  // Recursive backtracking using explicit stack
  const visited = Array.from({ length: rows }, () => Array(cols).fill(false));
  const stack = [{ r: 0, c: 0 }];
  visited[0][0] = true;

  while (stack.length > 0) {
    const current = stack[stack.length - 1];
    const { r, c } = current;

    // Collect unvisited neighbors
    const neighbors = [];
    for (const [dir, { dr, dc }] of Object.entries(DIRECTIONS)) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && !visited[nr][nc]) {
        neighbors.push({ dir, nr, nc });
      }
    }

    if (neighbors.length === 0) {
      stack.pop();
    } else {
      // Pick a random unvisited neighbor
      const { dir, nr, nc } = neighbors[Math.floor(Math.random() * neighbors.length)];

      // Remove walls between current and chosen neighbor
      grid[r][c][dir] = false;
      grid[nr][nc][DIRECTIONS[dir].opposite] = false;

      visited[nr][nc] = true;
      stack.push({ r: nr, c: nc });
    }
  }

  return grid;
}

function createGame(playerCount) {
  playerCount = Math.max(1, Math.min(8, playerCount || 1));

  const grid = generateMaze(GRID_SIZE, GRID_SIZE);
  const goalRow = GRID_SIZE - 1;
  const goalCol = GRID_SIZE - 1;

  const players = [];
  const visitedCells = [];

  for (let i = 0; i < playerCount; i++) {
    players.push({ row: 0, col: 0, heading: 'east' });
    const set = new Set();
    set.add('0,0');
    visitedCells.push(set);
  }

  let gameOver = false;
  let winnerSeat = null;

  function computeCanSee(row, col, heading) {
    const { dr, dc, wall } = DIRECTIONS[heading];
    const cells = [];
    let r = row;
    let c = col;

    for (let i = 0; i < MAX_CAN_SEE; i++) {
      // Check if there's a wall blocking forward from current position
      if (grid[r][c][wall]) break;
      r += dr;
      c += dc;
      cells.push([r, c]);
    }

    return cells;
  }

  function state() {
    // Convert grid to plain objects (walls are already plain)
    const gridData = grid.map(row =>
      row.map(cell => ({
        north: cell.north,
        south: cell.south,
        east: cell.east,
        west: cell.west,
      }))
    );

    return {
      gameType: 'tv-maze',
      grid: gridData,
      players: players.map(p => ({ row: p.row, col: p.col, heading: p.heading })),
      visited: visitedCells.map(set =>
        Array.from(set).map(key => {
          const [r, c] = key.split(',').map(Number);
          return [r, c];
        })
      ),
      goalRow,
      goalCol,
      isGameOver: gameOver,
      winnerSeat,
      playerCount,
    };
  }

  function playerState(seat) {
    if (seat < 0 || seat >= playerCount) return null;
    const p = players[seat];
    const cell = grid[p.row][p.col];

    return {
      seat,
      row: p.row,
      col: p.col,
      heading: p.heading,
      walls: {
        north: cell.north,
        south: cell.south,
        east: cell.east,
        west: cell.west,
      },
      canSee: computeCanSee(p.row, p.col, p.heading),
      isGameOver: gameOver,
      winnerSeat,
    };
  }

  function move(seat, direction) {
    if (gameOver) return { ok: false, reason: 'Game is over' };
    if (seat < 0 || seat >= playerCount) return { ok: false, reason: 'Invalid seat' };
    if (!DIRECTIONS[direction]) return { ok: false, reason: 'Invalid direction' };

    const p = players[seat];
    const { dr, dc, wall } = DIRECTIONS[direction];

    // Check wall
    if (grid[p.row][p.col][wall]) {
      return { ok: false, reason: 'Wall blocks movement' };
    }

    const newRow = p.row + dr;
    const newCol = p.col + dc;

    // Update position and heading
    p.row = newRow;
    p.col = newCol;
    p.heading = direction;

    // Track visited
    visitedCells[seat].add(`${newRow},${newCol}`);

    // Check win condition
    if (newRow === goalRow && newCol === goalCol) {
      gameOver = true;
      winnerSeat = seat;
    }

    return { ok: true };
  }

  function moveRelative(seat, relDir) {
    if (seat < 0 || seat >= playerCount) return { ok: false, reason: 'Invalid seat' };
    const p = players[seat];

    let absDir;
    if (relDir === 'forward') {
      absDir = p.heading;
    } else if (relDir === 'back') {
      // Back is the opposite of current heading
      absDir = DIRECTIONS[p.heading].opposite;
    } else {
      return { ok: false, reason: 'Invalid relative direction' };
    }

    return move(seat, absDir);
  }

  function turn(seat, turnDir) {
    if (gameOver) return { ok: false, reason: 'Game is over' };
    if (seat < 0 || seat >= playerCount) return { ok: false, reason: 'Invalid seat' };

    const p = players[seat];

    if (turnDir === 'turn_left') {
      p.heading = TURN_LEFT[p.heading];
    } else if (turnDir === 'turn_right') {
      p.heading = TURN_RIGHT[p.heading];
    } else {
      return { ok: false, reason: 'Invalid turn direction' };
    }

    return { ok: true };
  }

  function isGameOver() {
    return gameOver;
  }

  function winner() {
    return winnerSeat;
  }

  return { state, playerState, move, moveRelative, turn, isGameOver, winner };
}

module.exports = { createGame };
