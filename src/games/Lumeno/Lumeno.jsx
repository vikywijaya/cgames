import { useState, useRef, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import { GameShell } from '../../components/GameShell/GameShell';
import { useGameCallback } from '../../hooks/useGameCallback';
import styles from './Lumeno.module.css';
import { useTranslation } from '../../i18n/useTranslation';
import {
  MIN_CHAIN, COLORS, COLOR_MAP, isAdj, buildPlayableGrid, dropAndFill,
  findBestChain, hasMove, starsFor,
} from './lumenoLogic';

// Each puzzle: collect a number of orbs of one or two goal colours. No clock,
// no move limit. The board is reshuffled automatically if no chain is left.
const DIFFICULTY_CONFIG = {
  easy:   { size: 5, numColors: 3, puzzles: 3, goalColors: 1, goalCount: 9 },
  medium: { size: 6, numColors: 4, puzzles: 4, goalColors: 2, goalCount: 9 },
  hard:   { size: 6, numColors: 5, puzzles: 5, goalColors: 2, goalCount: 13 },
};

const HINT_MS = 2200;
const CLEAR_MS = 320;
const SOLVED_MS = 1600;

function pickGoals(cfg) {
  const ids = COLORS.slice(0, cfg.numColors).map(c => c.id);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids.slice(0, cfg.goalColors).map(id => ({ color: id, need: cfg.goalCount, got: 0 }));
}

const key = (p) => `${p.row}-${p.col}`;

/* ── Inner game component ─────────────────────────────── */
function LumenoGame({ difficulty, onComplete, reportScore, reportRound, playClick, playSuccess, playFail }) {
  const t = useTranslation();
  const tx = t.games['lumeno'];
  const cfg = DIFFICULTY_CONFIG[difficulty] ?? DIFFICULTY_CONFIG.easy;
  const maxScore = cfg.puzzles * 3;

  const [puzzle,   setPuzzle]   = useState(0);
  const [grid,     setGrid]     = useState(() => buildPlayableGrid(cfg.size, cfg.numColors));
  const [goals,    setGoals]    = useState(() => pickGoals(cfg));
  const [path,     setPath]     = useState([]);
  const [clearing, setClearing] = useState(null);
  const [hintPath, setHintPath] = useState(null);
  const [score,    setScore]    = useState(0);
  const [message,  setMessage]  = useState(null); // { kind, text }
  const [solved,   setSolved]   = useState(null); // stars earned, while banner shows

  // Ref mirrors so pointer handlers always see fresh state.
  const pathRef   = useRef(path);   pathRef.current = path;
  const gridRef   = useRef(grid);   gridRef.current = grid;
  const goalsRef  = useRef(goals);  goalsRef.current = goals;
  const busyRef   = useRef(false);
  const hintsRef  = useRef(0);
  const scoreRef  = useRef(0);
  const puzzleRef = useRef(puzzle); puzzleRef.current = puzzle;
  const doneRef   = useRef(false);
  const dragRef   = useRef({ active: false, moved: false });
  const boardRef  = useRef(null);

  // Timers, cleared on unmount.
  const timers = useRef(new Set());
  const later = useCallback((fn, ms) => {
    const id = setTimeout(() => { timers.current.delete(id); fn(); }, ms);
    timers.current.add(id);
    return id;
  }, []);
  useEffect(() => {
    const set = timers.current;
    return () => { set.forEach(clearTimeout); set.clear(); };
  }, []);

  useEffect(() => { reportRound?.(puzzle + 1, cfg.puzzles); }, [puzzle, cfg.puzzles, reportRound]);
  useEffect(() => { reportScore(score); }, [score, reportScore]);

  const say = useCallback((kind, text) => setMessage({ kind, text }), []);

  /* ── Committing a chain ─────────────────────────────── */
  const commit = useCallback(() => {
    const p = pathRef.current;
    if (busyRef.current || doneRef.current) return;
    if (p.length < MIN_CHAIN) {
      if (p.length > 0) { playFail(); say('tip', tx.tipShort); }
      return;
    }
    busyRef.current = true;
    const color = gridRef.current[p[0].row][p[0].col];
    playSuccess();
    setHintPath(null);
    setClearing(new Set(p.map(key)));
    setPath([]);

    const newGoals = goalsRef.current.map(g =>
      g.color === color ? { ...g, got: Math.min(g.need, g.got + p.length) } : g);
    const isGoal = goalsRef.current.some(g => g.color === color && g.got < g.need);
    say(isGoal ? 'good' : 'info', isGoal
      ? tx.nice.replace('{n}', p.length)
      : tx.notGoal);

    later(() => {
      let next = dropAndFill(gridRef.current, p, cfg.numColors);
      let reshuffled = false;
      if (!hasMove(next)) { next = buildPlayableGrid(cfg.size, cfg.numColors); reshuffled = true; }
      setGrid(next);
      setClearing(null);
      setGoals(newGoals);
      if (reshuffled) say('info', tx.shuffled);

      if (newGoals.every(g => g.got >= g.need)) {
        const stars = starsFor(hintsRef.current);
        const total = scoreRef.current + stars;
        scoreRef.current = total;
        setScore(total);
        setSolved(stars);
        later(() => {
          if (puzzleRef.current + 1 >= cfg.puzzles) {
            if (!doneRef.current) {
              doneRef.current = true;
              onComplete({ finalScore: total, maxScore, completed: true });
            }
            return;
          }
          setPuzzle(n => n + 1);
          setGrid(buildPlayableGrid(cfg.size, cfg.numColors));
          setGoals(pickGoals(cfg));
          hintsRef.current = 0;
          setSolved(null);
          setMessage(null);
          busyRef.current = false;
        }, SOLVED_MS);
      } else {
        busyRef.current = false;
      }
    }, CLEAR_MS);
  }, [cfg, maxScore, later, onComplete, playFail, playSuccess, say, tx]);

  /* ── Building a chain (drag or tap) ─────────────────── */
  function tryExtend(cell) {
    const p = pathRef.current;
    const g = gridRef.current;
    const idx = p.findIndex(q => q.row === cell.row && q.col === cell.col);
    if (idx !== -1) {
      if (idx < p.length - 1) { setPath(p.slice(0, idx + 1)); pathRef.current = p.slice(0, idx + 1); }
      return 'same';
    }
    const head = p[p.length - 1];
    if (head && isAdj(head, cell) && g[cell.row][cell.col] === g[head.row][head.col]) {
      const np = [...p, cell];
      setPath(np); pathRef.current = np;
      playClick?.();
      return 'added';
    }
    return 'no';
  }

  function handleDown(e, cell) {
    if (busyRef.current || doneRef.current) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const p = pathRef.current;
    const head = p[p.length - 1];
    dragRef.current = { active: true, moved: false };
    setMessage(null);

    // Tap the last orb of a long-enough chain to clear it.
    if (head && head.row === cell.row && head.col === cell.col && p.length >= MIN_CHAIN) {
      dragRef.current.active = false;
      commit();
      return;
    }
    const res = p.length ? tryExtend(cell) : 'no';
    if (res === 'no') {
      if (p.length >= 2) say('tip', tx.tipMatch);
      const np = [cell];
      setPath(np); pathRef.current = np;
      playClick?.();
    }
  }

  function cellFromPointer(e) {
    const el = boardRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const col = Math.floor(((e.clientX - rect.left) / rect.width) * cfg.size);
    const row = Math.floor(((e.clientY - rect.top) / rect.height) * cfg.size);
    if (row < 0 || row >= cfg.size || col < 0 || col >= cfg.size) return null;
    // Ignore the outer corners of a cell so diagonal drags don't catch neighbours.
    const cw = rect.width / cfg.size, ch = rect.height / cfg.size;
    const dx = (e.clientX - rect.left) - (col + 0.5) * cw;
    const dy = (e.clientY - rect.top) - (row + 0.5) * ch;
    if (dx * dx + dy * dy > (0.42 * cw) * (0.42 * ch)) return null;
    return { row, col };
  }

  function handleMove(e) {
    if (!dragRef.current.active) return;
    const cell = cellFromPointer(e);
    if (!cell) return;
    if (tryExtend(cell) === 'added') dragRef.current.moved = true;
  }

  function handleUp() {
    const d = dragRef.current;
    if (!d.active) return;
    dragRef.current = { active: false, moved: false };
    // A drag of 3+ clears on release; short drags and taps stay selected.
    if (d.moved && pathRef.current.length >= MIN_CHAIN) commit();
  }

  function showHint() {
    if (busyRef.current || doneRef.current) return;
    const best = findBestChain(gridRef.current, goalsRef.current.filter(g => g.got < g.need).map(g => g.color));
    if (!best) return;
    hintsRef.current += 1;
    setPath([]); pathRef.current = [];
    setHintPath(new Set(best.map(key)));
    say('info', tx.hintShown);
    later(() => setHintPath(null), HINT_MS);
  }

  const pathColor = path.length ? COLOR_MAP[grid[path[0].row][path[0].col]] : null;
  const pathKeys = new Set(path.map(key));
  const head = path[path.length - 1];

  return (
    <div className={styles.wrap}>
      <div className={styles.infoHeader}>
        <div className={styles.hudLeft}>
          <span className={styles.roundLabel}>
            {tx.puzzleOf.replace('{n}', puzzle + 1).replace('{total}', cfg.puzzles)}
          </span>
        </div>
        <div className={styles.infoBadge} aria-label={`${score} / ${maxScore} ★`}>
          <span key={score} className={styles.infoBadgeNum}>{score}</span>
          <span className={styles.infoBadgeSub}>★</span>
        </div>
      </div>

      <div className={styles.playArea}>
      <div className={styles.goals} aria-label={tx.goal}>
        <span className={styles.goalLabel}>{tx.goal}</span>
        {goals.map(g => {
          const c = COLOR_MAP[g.color];
          const done = g.got >= g.need;
          return (
            <div key={g.color} className={`${styles.goalItem} ${done ? styles.goalDone : ''}`}>
              <span className={styles.goalOrb} style={{ background: c.bg, color: c.fg }} aria-hidden="true">{c.symbol}</span>
              <span className={styles.goalText}>
                {done ? '✓' : `${g.got} / ${g.need}`}
              </span>
              <span className={styles.srOnly}>{tx.colors[g.color]}</span>
            </div>
          );
        })}
      </div>

      <div className={styles.status} aria-live="polite">
        {solved !== null ? (
          <div className={styles.banner}>
            <span>{tx.solved}</span>
            <span className={styles.bannerStars}>{'★'.repeat(solved)}{'☆'.repeat(3 - solved)}</span>
          </div>
        ) : path.length > 0 ? (
          <div className={styles.chainPill}>
            {pathColor && <span className={styles.chainDot} style={{ background: pathColor.bg, color: pathColor.fg }}>{pathColor.symbol}</span>}
            {path.length >= MIN_CHAIN
              ? tx.chainReady.replace('{n}', path.length)
              : tx.chainMore.replace('{n}', MIN_CHAIN - path.length)}
          </div>
        ) : message ? (
          <p className={`${styles.msg} ${styles['msg_' + message.kind] ?? ''}`}>{message.text}</p>
        ) : (
          <p className={styles.msg}>{tx.howTo}</p>
        )}
      </div>

      <div
        ref={boardRef}
        className={styles.grid}
        style={{ '--size': cfg.size, touchAction: 'none', userSelect: 'none' }}
        onPointerMove={handleMove}
        onPointerUp={handleUp}
        onPointerCancel={handleUp}
      >
        {grid.map((row, r) =>
          row.map((colorId, c) => {
            const color = COLOR_MAP[colorId] ?? COLORS[0];
            const k = `${r}-${c}`;
            const inPath = pathKeys.has(k);
            const isHead = inPath && head.row === r && head.col === c;
            return (
              <button
                type="button"
                key={k}
                data-testid={`orb-${k}`}
                aria-label={tx.colors[colorId]}
                aria-pressed={inPath}
                className={[
                  styles.orb,
                  inPath ? styles.orbActive : '',
                  isHead ? styles.orbHead : '',
                  hintPath?.has(k) ? styles.orbHint : '',
                  clearing?.has(k) ? styles.orbOut : '',
                ].join(' ')}
                style={{ '--c': color.bg, '--fg': color.fg }}
                onPointerDown={(e) => handleDown(e, { row: r, col: c })}
              >
                <span className={styles.orbSymbol} aria-hidden="true">{color.symbol}</span>
              </button>
            );
          })
        )}
      </div>

      <div className={styles.actions}>
        <button type="button" className={styles.btnSecondary} onClick={showHint} disabled={solved !== null}>
          💡 {tx.hint}
        </button>
        <button
          type="button"
          className={styles.btnPrimary}
          onClick={commit}
          disabled={path.length < MIN_CHAIN || solved !== null}
        >
          {tx.clear}
        </button>
      </div>
      </div>
    </div>
  );
}

LumenoGame.propTypes = {
  difficulty:  PropTypes.string.isRequired,
  onComplete:  PropTypes.func.isRequired,
  reportScore: PropTypes.func.isRequired,
  reportRound: PropTypes.func,
  playClick:   PropTypes.func,
  playSuccess: PropTypes.func.isRequired,
  playFail:    PropTypes.func.isRequired,
};

/* ── Public export ───────────────────────────────────── */
const TIME_LIMITS = { easy: null, medium: null, hard: null };

export function Lumeno({ memberId, difficulty = 'easy', callbackUrl, onComplete, onBack }) {
  const t = useTranslation();
  const { fireComplete } = useGameCallback({ memberId, gameId: 'lumeno', callbackUrl, onComplete });

  return (
    <GameShell
      gameId="lumeno"
      title={t.games['lumeno'].title}
      instructions={t.games['lumeno'].instructions}
      difficulty={difficulty}
      timeLimits={TIME_LIMITS}
      flushTop
      onGameComplete={fireComplete}
      onBack={onBack}
    >
      {({ difficulty: diff, onComplete: shellComplete, reportScore, reportRound, playClick, playSuccess, playFail }) => (
        <LumenoGame
          key={diff}
          difficulty={diff}
          onComplete={shellComplete}
          reportScore={reportScore}
          reportRound={reportRound}
          playClick={playClick}
          playSuccess={playSuccess}
          playFail={playFail}
        />
      )}
    </GameShell>
  );
}

Lumeno.propTypes = {
  memberId:    PropTypes.string.isRequired,
  difficulty:  PropTypes.oneOf(['easy', 'medium', 'hard']),
  callbackUrl: PropTypes.string,
  onComplete:  PropTypes.func,
  onBack:      PropTypes.func,
};
