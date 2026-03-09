import { useState, useEffect, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import { GameShell } from '../../components/GameShell/GameShell';
import { useGameCallback } from '../../hooks/useGameCallback';
import styles from './FlappyNumbers.module.css';

/* ══════════════════════════════════════════════════════════════
   Constants
   ══════════════════════════════════════════════════════════════ */
const POWERS = [2, 4, 8, 16, 32, 64, 128, 256, 512, 1024];

const TILE_BG = {
  2: '#eee4da', 4: '#ede0c8', 8: '#f2b179', 16: '#f59563',
  32: '#f67c5f', 64: '#f65e3b', 128: '#edcf72', 256: '#edcc61',
  512: '#edc850', 1024: '#edc53f',
};
const DARK_TEXT = new Set([2, 4]);

// Random colors for the matching tile on each wall
const MATCH_COLORS = [
  '#a8d8ea', '#f9c0c0', '#b5eaaa', '#d4a5f5',
  '#ffd59e', '#f5a8c8', '#a5d6f7', '#c8e6c9',
  '#ffe082', '#b3e5fc', '#f8bbd0', '#c5cae9',
];

const GW = 360;       // game area width
const GH = 560;       // game area height
const PSZ = 48;       // player tile size
const TH = 70;        // tile height (GH / 8)
const WW = 78;        // wall column width
const PX = 65;        // player fixed X position
const GRAV = 0.35;    // gravity — gentler for seniors
const FLAP_V = -6.5;  // flap — gentler upward push
const TILES_N = 8;    // tiles per wall column
const WALL_GAP = 340;  // pixels between walls — more breathing room

const DIFF_CFG = {
  easy:   { spd: 1.6, goal: 8 },
  medium: { spd: 2.2, goal: 12 },
  hard:   { spd: 3.0, goal: 16 },
};
const TIME_LIMITS = { easy: null, medium: 150, hard: 100 };

/* ══════════════════════════════════════════════════════════════
   Helpers
   ══════════════════════════════════════════════════════════════ */
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const TILE_BG_VALUES = Object.values(TILE_BG);

/** Build a wall column — one tile matches `num`, rest are random other powers. */
function mkWall(num) {
  // Place match away from top/bottom edges for fairness
  const mi = 1 + Math.floor(Math.random() * (TILES_N - 2));
  const tiles = Array.from({ length: TILES_N }, (_, i) => {
    if (i === mi) return num;
    let n;
    do { n = pick(POWERS); } while (n === num);
    return n;
  });
  // Each non-matching tile gets a random color from the TILE_BG palette
  const tileColors = tiles.map((_, i) => i === mi ? null : pick(TILE_BG_VALUES));
  const matchColor = pick(MATCH_COLORS);
  return { tiles, mi, matchColor, tileColors };
}

/** Pick the next player number (different from current). */
function nextNum(cur, score) {
  const pool = score < 4 ? POWERS.slice(0, 5) : POWERS;
  let n;
  do { n = pick(pool); } while (n === cur);
  return n;
}

/* ══════════════════════════════════════════════════════════════
   Inner game component
   ══════════════════════════════════════════════════════════════ */
function FlappyNumbersGame({
  difficulty, onComplete, reportScore, secondsLeft,
  playClick, playSuccess, playFail,
}) {
  const cfg = DIFF_CFG[difficulty] || DIFF_CFG.easy;
  const gRef = useRef(null);
  const rafRef = useRef(0);
  const tRef = useRef(0);
  const doneRef = useRef(false);
  const [, bump] = useState(0);

  // Initialize game state — 'waiting' phase: bird hovers, no gravity until first tap
  if (!gRef.current) {
    gRef.current = {
      ph: 'waiting',
      py: GH / 2 - PSZ / 2,
      pv: 0,
      pr: 0,
      pn: pick(POWERS.slice(0, 4)),
      walls: [],
      sc: 0,
      floatT: 0,
      tunnel: null,  // { wall, targetY } — active tunnel pass-through
    };
  }

  const re = useCallback(() => bump(n => n + 1), []);

  /* ── Time-up ── */
  useEffect(() => {
    if (secondsLeft === 0 && !doneRef.current) {
      doneRef.current = true;
      gRef.current.ph = 'dead';
      onComplete({ finalScore: gRef.current.sc, maxScore: cfg.goal, completed: false });
      re();
    }
  }, [secondsLeft, onComplete, cfg.goal, re]);

  /* ── Actions ── */
  const die = useCallback(() => {
    const g = gRef.current;
    g.ph = 'dead';
    playFail();
    if (!doneRef.current) {
      doneRef.current = true;
      onComplete({ finalScore: g.sc, maxScore: cfg.goal, completed: g.sc >= cfg.goal });
    }
    re();
  }, [playFail, onComplete, cfg.goal, re]);

  const pass = useCallback(() => {
    const g = gRef.current;
    g.sc++;
    reportScore(g.sc);
    playSuccess();
    g.pn = nextNum(g.pn, g.sc);
    // Update any already-spawned unpassed walls to match the new player number
    for (const w of g.walls) {
      if (!w.passed) {
        const updated = mkWall(g.pn);
        w.tiles = updated.tiles;
        w.mi = updated.mi;
      }
    }
    if (g.sc >= cfg.goal) {
      g.ph = 'dead';
      if (!doneRef.current) {
        doneRef.current = true;
        onComplete({ finalScore: g.sc, maxScore: cfg.goal, completed: true });
      }
    }
    re();
  }, [reportScore, playSuccess, onComplete, cfg.goal, re]);

  const flap = useCallback(() => {
    const g = gRef.current;
    if (g.ph === 'dead') return;
    if (g.ph === 'waiting') {
      g.ph = 'playing';
      // First wall spawns far right — plenty of time to react
      g.walls = [{ x: GW + 80, passed: false, ...mkWall(g.pn) }];
    }
    g.pv = FLAP_V;
    playClick();
    re();
  }, [playClick, re]);

  /* ── Game loop (requestAnimationFrame) ── */
  const loop = useCallback((ts) => {
    if (!tRef.current) tRef.current = ts;
    const dt = Math.min((ts - tRef.current) / 16.67, 3);
    tRef.current = ts;

    const g = gRef.current;

    // Waiting phase: bird gently bobs in place, no walls
    if (g.ph === 'waiting') {
      g.floatT = (g.floatT || 0) + dt * 0.08;
      g.py = GH / 2 - PSZ / 2 + Math.sin(g.floatT) * 8;
      re();
      rafRef.current = requestAnimationFrame(loop);
      return;
    }

    if (g.ph === 'playing') {
      // Move walls leftward (always, even during tunnel)
      const spd = cfg.spd * dt;
      for (const w of g.walls) w.x -= spd;
      g.walls = g.walls.filter(w => w.x > -WW - 20);

      // Spawn new wall when needed
      const lastX = g.walls.length ? g.walls[g.walls.length - 1].x : -999;
      if (lastX < GW - WALL_GAP) {
        g.walls.push({ x: GW + 10, passed: false, ...mkWall(g.pn) });
      }

      const pL = PX + 4;
      const pR = PX + PSZ - 4;

      // ── Tunnel mode: bird is passing through the wall ──
      if (g.tunnel) {
        // Smoothly guide bird to target Y (matching tile center)
        const dy = g.tunnel.targetY - g.py;
        g.py += dy * 0.25;
        g.pv = 0;
        g.pr = 0; // level while tunneling

        // Check if bird has exited the wall
        const tw = g.tunnel.wall;
        if (pL >= tw.x + WW) {
          // Exited tunnel — score and resume normal flight
          g.tunnel = null;
          if (!tw.passed) {
            tw.passed = true;
            pass();
            if (g.ph !== 'playing') {
              rafRef.current = requestAnimationFrame(loop);
              return;
            }
          }
        }
        re();
      } else {
        // ── Normal flight: gravity + collision ──
        g.pv += GRAV * dt;
        g.py += g.pv * dt;
        g.pr = Math.min(40, Math.max(-30, g.pv * 3.5));

        // Ceiling
        if (g.py < 0) { g.py = 0; g.pv = 0; }
        // Floor
        if (g.py > GH - PSZ) {
          die();
          rafRef.current = requestAnimationFrame(loop);
          return;
        }

        // ── Check walls for tunnel entry or collision ──
        const pCenter = g.py + PSZ / 2;

        for (let wi = 0; wi < g.walls.length; wi++) {
          const w = g.walls[wi];
          if (w.passed) continue;

          // Bird is approaching or overlapping the wall?
          if (pR > w.x - 20 && pL < w.x + WW) {
            const matchCenterY = w.mi * TH + TH / 2;
            const dist = Math.abs(pCenter - matchCenterY);

            // Generous capture zone: if within 1.5 tiles of the match, enter tunnel
            if (dist < TH * 1.5) {
              g.tunnel = {
                wall: w,
                targetY: matchCenterY - PSZ / 2,
              };
              g.pv = 0;
              playClick();
              break;
            } else if (pR > w.x && pL < w.x + WW) {
              // Actually overlapping but too far from match — die
              die();
              rafRef.current = requestAnimationFrame(loop);
              return;
            }
          }

          // Passed wall without entering? (shouldn't happen with generous zone)
          if (!w.passed && w.x + WW < PX) {
            w.passed = true;
            pass();
            if (g.ph !== 'playing') {
              rafRef.current = requestAnimationFrame(loop);
              return;
            }
          }
        }
        re();
      }
    }

    rafRef.current = requestAnimationFrame(loop);
  }, [cfg.spd, die, pass, playClick, re]);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [loop]);

  /* ── Input ── */
  useEffect(() => {
    const onK = (e) => {
      if (e.code === 'Space' || e.key === 'ArrowUp' || e.key === 'w') {
        e.preventDefault();
        flap();
      }
    };
    window.addEventListener('keydown', onK);
    return () => window.removeEventListener('keydown', onK);
  }, [flap]);

  const tap = useCallback((e) => { e.preventDefault(); flap(); }, [flap]);

  /* ── Render ── */
  const g = gRef.current;

  return (
    <div className={styles.wrapper}>
      <div className={styles.meta}>
        <span className={styles.tip}>Tap or Space to flap</span>
        <span className={styles.scoreLabel}>🔢 <strong>{g.sc}</strong> / {cfg.goal}</span>
      </div>

      <div
        className={styles.area}
        style={{ width: GW, height: GH }}
        onMouseDown={tap}
        onTouchStart={tap}
      >
        {/* Player bird-tile */}
        <div
          className={`${styles.bird}${g.tunnel ? ` ${styles.birdTunnel}` : ''}`}
          style={{
            left: PX, top: g.py,
            width: PSZ, height: PSZ,
            transform: `rotate(${g.pr}deg)`,
          }}
        >
          <svg className={styles.wing} viewBox="0 0 30 24" width="24" height="18">
            <path
              d="M28 9Q20 1,13 7Q9 3,3 5Q7 11,13 11Q19 15,28 9Z"
              fill="#c8c8c8" stroke="#aaa" strokeWidth=".5"
            />
          </svg>
          <div className={styles.bTile}>
            <span className={styles.bNum}>{g.pn}</span>
          </div>
        </div>

        {/* Wall columns */}
        {g.walls.map((w, i) => {
          const isTunneling = g.tunnel && g.tunnel.wall === w;
          return (
            <div key={i} className={styles.wCol} style={{ left: w.x, width: WW }}>
              {w.tiles.map((n, ti) => {
                const isMatch = ti === w.mi;
                const isOpen = isMatch && isTunneling;
                return (
                  <div
                    key={ti}
                    className={`${styles.wTile}${isMatch ? ` ${styles.wMatch}` : ''}${isOpen ? ` ${styles.wOpen}` : ''}`}
                    style={{
                      height: TH,
                      background: isOpen ? 'transparent' : isMatch ? (w.matchColor || '#f5f5f0') : (w.tileColors?.[ti] || TILE_BG[n] || '#cdc1b4'),
                      color: isMatch ? '#333' : (DARK_TEXT.has(n) ? '#776e65' : '#f9f6f2'),
                      fontSize: n >= 1024 ? '0.85rem' : n >= 100 ? '1.05rem' : '1.3rem',
                    }}
                  >
                    {isOpen ? '' : n}
                  </div>
                );
              })}
            </div>
          );
        })}

        {/* Tap to start */}
        {g.ph === 'waiting' && (
          <div className={styles.tapPrompt}>Tap to start!</div>
        )}

        {/* Game over overlay */}
        {g.ph === 'dead' && (
          <div className={styles.ov}>
            <div className={styles.ovBox}>
              <h2 className={styles.ovT}>
                {g.sc >= cfg.goal ? 'Complete!' : 'Game Over'}
              </h2>
              <p className={styles.ovSc}>{g.sc} / {cfg.goal}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

FlappyNumbersGame.propTypes = {
  difficulty: PropTypes.string.isRequired,
  onComplete: PropTypes.func.isRequired,
  reportScore: PropTypes.func.isRequired,
  secondsLeft: PropTypes.number,
  playClick: PropTypes.func.isRequired,
  playSuccess: PropTypes.func.isRequired,
  playFail: PropTypes.func.isRequired,
};

/* ══════════════════════════════════════════════════════════════
   Outer wrapper with GameShell
   ══════════════════════════════════════════════════════════════ */
export function FlappyNumbers({
  memberId, difficulty = 'easy', onComplete, callbackUrl,
  onBack, musicMuted, onToggleMusic,
}) {
  const { fireComplete } = useGameCallback({
    memberId, gameId: 'flappy-numbers', callbackUrl, onComplete,
  });
  return (
    <GameShell
      gameId="flappy-numbers"
      title="Flappy Numbers"
      instructions="Tap or press Space to flap upward. Fly through the tile that matches your number — it's the light-coloured one! Avoid all other tiles."
      difficulty={difficulty}
      timeLimits={TIME_LIMITS}
      onGameComplete={fireComplete}
      onBack={onBack}
      musicMuted={musicMuted}
      onToggleMusic={onToggleMusic}
    >
      {({ difficulty: d, onComplete: oc, reportScore, secondsLeft,
          playClick, playSuccess, playFail }) => (
        <FlappyNumbersGame
          difficulty={d} onComplete={oc} reportScore={reportScore}
          secondsLeft={secondsLeft} playClick={playClick}
          playSuccess={playSuccess} playFail={playFail}
        />
      )}
    </GameShell>
  );
}

FlappyNumbers.propTypes = {
  memberId: PropTypes.string.isRequired,
  difficulty: PropTypes.oneOf(['easy', 'medium', 'hard']),
  onComplete: PropTypes.func.isRequired,
  callbackUrl: PropTypes.string,
  onBack: PropTypes.func,
  musicMuted: PropTypes.bool,
  onToggleMusic: PropTypes.func,
};
