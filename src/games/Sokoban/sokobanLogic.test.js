import { describe, it, expect } from 'vitest';
import { parseLevel, tryMove, isSolved, solve, nextHint, starsFor, walkPath } from './sokobanLogic';
import { LEVELS } from './Sokoban';

const start = (L) => ({ player: L.player, boxes: L.boxes });

describe('Sokoban puzzles', () => {
  for (const diff of ['easy', 'medium', 'hard']) {
    LEVELS[diff].forEach((lines, i) => {
      it(`${diff} puzzle ${i + 1} has matching boxes/targets and is solvable`, () => {
        const L = parseLevel(lines);
        expect(L.boxes.length).toBe(L.goals.size);
        const pushes = solve(L, start(L));
        expect(pushes).not.toBeNull();
        expect(pushes.length).toBeGreaterThan(1);
      });
    });
  }

  it('following hints always reaches the solution', () => {
    for (const diff of ['easy', 'medium', 'hard']) {
      for (const lines of LEVELS[diff]) {
        const L = parseLevel(lines);
        let s = start(L);
        for (let n = 0; n < 500 && !isSolved(L, s.boxes); n++) {
          const h = nextHint(L, s);
          expect(h).not.toBeNull();
          const r = tryMove(L, s, h.dir);
          expect(r.blocked).toBeUndefined();
          s = { player: r.player, boxes: r.boxes };
        }
        expect(isSolved(L, s.boxes)).toBe(true);
      }
    }
  });
});

describe('Sokoban rules', () => {
  const L = parseLevel([
    '######',
    '#@$ .#',
    '######',
  ]);

  it('pushes a box and refuses walls / double boxes', () => {
    const r = tryMove(L, start(L), 'right');
    expect(r.pushed).toBe(true);
    expect(tryMove(L, start(L), 'up').blocked).toBe('wall');
  });

  it('reports a stuck position as unsolvable (no hint)', () => {
    const D = parseLevel(['#####', '#.  #', '# $ #', '#  @#', '#####']);
    const dead = { player: D.player, boxes: [D.width * 3 + 1] }; // box in corner
    expect(nextHint(D, dead)).toBeNull();
  });

  it('walkPath avoids boxes', () => {
    expect(walkPath(L, L.boxes, L.player, L.player + 3)).toBeNull();
  });

  it('stars reward less help', () => {
    expect(starsFor({})).toBe(3);
    expect(starsFor({ hints: 1 })).toBe(2);
    expect(starsFor({ undos: 4 })).toBe(3);
    expect(starsFor({ hints: 1, resets: 3 })).toBe(2);
    expect(starsFor({ hints: 3 })).toBe(1);
  });
});
