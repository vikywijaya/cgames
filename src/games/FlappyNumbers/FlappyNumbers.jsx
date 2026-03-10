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

// Distinct player/tile colors for color-matching mode (medium/hard)
const COLOR_PALETTE = [
  { bg: '#a8d8ea', label: 'Blue' },
  { bg: '#f9c0c0', label: 'Red' },
  { bg: '#b5eaaa', label: 'Green' },
  { bg: '#d4a5f5', label: 'Purple' },
  { bg: '#ffd59e', label: 'Orange' },
  { bg: '#f5a8c8', label: 'Pink' },
];

const GW = 360;       // game area width
const GH = 560;       // game area height
const PSZ = 48;       // player tile size
const TH = 70;        // tile height (GH / 8)
const WW = 78;        // wall column width
const PX = 65;        // player fixed X position
const GRAV = 0.35;    // gravity
const FLAP_V = -6.5;  // flap upward push
const TILES_N = 8;    // tiles per wall column

const DIFF_CFG = {
  easy:   { baseSpd: 1.3, colorMatch: false },
  medium: { baseSpd: 1.6, colorMatch: true },
  hard:   { baseSpd: 2.2, colorMatch: true },
};
const TIME_LIMITS = { easy: null, medium: null, hard: null };

/* ══════════════════════════════════════════════════════════════
   Helpers
   ══════════════════════════════════════════════════════════════ */
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const pickExcept = (a, exclude) => {
  let v;
  do { v = pick(a); } while (v === exclude);
  return v;
};
const TILE_BG_VALUES = Object.values(TILE_BG);

/** Get progressive difficulty scaling based on score. */
function getScaling(score, difficulty) {
  const cfg = DIFF_CFG[difficulty] || DIFF_CFG.easy;
  // Speed increases gently, capped at ~1.6x base speed
  const spdMult = 1 + Math.min(score * 0.03, 0.6);
  const spd = cfg.baseSpd * spdMult;
  // Wall gap starts wide and shrinks slowly — stays comfortable
  const gap = Math.max(300, 440 - score * 6);
  // Number pool grows with score — more numbers to scan
  const poolSize = Math.min(POWERS.length, 3 + Math.floor(score / 2));
  return { spd, gap, poolSize };
}

/** Build a wall column — one tile matches `num`, rest are random other powers.
 *  If colorMatch is true, a second decoy tile with same number but wrong color is added. */
function mkWall(num, score, colorMatch, playerColor) {
  const { poolSize } = getScaling(score, 'easy'); // poolSize only depends on score
  const pool = POWERS.slice(0, poolSize);

  // Place match away from top/bottom edges
  const mi = 1 + Math.floor(Math.random() * (TILES_N - 2));

  // For color matching, pick a decoy position (different from match)
  let decoyIdx = -1;
  if (colorMatch && playerColor) {
    do {
      decoyIdx = 1 + Math.floor(Math.random() * (TILES_N - 2));
    } while (decoyIdx === mi);
  }

  const tiles = Array.from({ length: TILES_N }, (_, i) => {
    if (i === mi) return num;
    if (i === decoyIdx) return num; // decoy has same number
    let n;
    do { n = pick(pool); } while (n === num);
    return n;
  });

  // Assign colors to each tile
  const tileColors = tiles.map((_, i) => {
    if (i === mi) return null; // match color set separately
    if (i === decoyIdx) return null; // decoy color set separately
    return pick(TILE_BG_VALUES);
  });

  // Match tile gets the player's color (correct match)
  const matchColor = colorMatch && playerColor ? playerColor.bg : pick(TILE_BG_VALUES);

  // Decoy gets a different color from the palette
  let decoyColor = null;
  if (decoyIdx >= 0 && playerColor) {
    const wrongColor = pickExcept(COLOR_PALETTE, playerColor);
    decoyColor = wrongColor.bg;
  }

  return { tiles, mi, matchColor, tileColors, decoyIdx, decoyColor };
}

/** Pick the next player number (different from current). */
function nextNum(cur, score) {
  const poolSize = Math.min(POWERS.length, 3 + Math.floor(score / 2));
  const pool = POWERS.slice(0, poolSize);
  let n;
  do { n = pick(pool); } while (n === cur);
  return n;
}

/** Pick a new player color (different from current). */
function nextColor(cur) {
  return pickExcept(COLOR_PALETTE, cur);
}

/* ══════════════════════════════════════════════════════════════
   Inner game component
   ══════════════════════════════════════════════════════════════ */
function FlappyNumbersGame({
  difficulty, onComplete, reportScore,
  playClick, playSuccess, playFail,
}) {
  const cfg = DIFF_CFG[difficulty] || DIFF_CFG.easy;
  const gRef = useRef(null);
  const rafRef = useRef(0);
  const tRef = useRef(0);
  const doneRef = useRef(false);
  const [, bump] = useState(0);

  // Initialize game state
  if (!gRef.current) {
    const initColor = cfg.colorMatch ? pick(COLOR_PALETTE) : null;
    gRef.current = {
      ph: 'waiting',
      py: GH / 2 - PSZ / 2,
      pv: 0,
      pr: 0,
      pn: pick(POWERS.slice(0, 3)),
      pc: initColor,       // player color (medium/hard only)
      walls: [],
      sc: 0,
      floatT: 0,
      tunnel: null,
    };
  }

  const re = useCallback(() => bump(n => n + 1), []);

  /* ── Actions ── */
  const die = useCallback(() => {
    const g = gRef.current;
    g.ph = 'dead';
    playFail();
    if (!doneRef.current) {
      doneRef.current = true;
      onComplete({ finalScore: g.sc, maxScore: g.sc, completed: false });
    }
    re();
  }, [playFail, onComplete, re]);

  const pass = useCallback(() => {
    const g = gRef.current;
    g.sc++;
    reportScore(g.sc);
    playSuccess();
    g.pn = nextNum(g.pn, g.sc);
    if (cfg.colorMatch) {
      g.pc = nextColor(g.pc);
    }
    // Update any already-spawned unpassed walls to match the new player number/color
    for (const w of g.walls) {
      if (!w.passed) {
        const updated = mkWall(g.pn, g.sc, cfg.colorMatch, g.pc);
        w.tiles = updated.tiles;
        w.mi = updated.mi;
        w.matchColor = updated.matchColor;
        w.tileColors = updated.tileColors;
        w.decoyIdx = updated.decoyIdx;
        w.decoyColor = updated.decoyColor;
      }
    }
    re();
  }, [reportScore, playSuccess, cfg.colorMatch, re]);

  const flap = useCallback(() => {
    const g = gRef.current;
    if (g.ph === 'dead') return;
    if (g.ph === 'waiting') {
      g.ph = 'playing';
      g.walls = [{ x: GW + 80, passed: false, ...mkWall(g.pn, 0, cfg.colorMatch, g.pc) }];
    }
    g.pv = FLAP_V;
    playClick();
    re();
  }, [playClick, cfg.colorMatch, re]);

  /* ── Game loop ── */
  const loop = useCallback((ts) => {
    if (!tRef.current) tRef.current = ts;
    const dt = Math.min((ts - tRef.current) / 16.67, 3);
    tRef.current = ts;

    const g = gRef.current;

    if (g.ph === 'waiting') {
      g.floatT = (g.floatT || 0) + dt * 0.08;
      g.py = GH / 2 - PSZ / 2 + Math.sin(g.floatT) * 8;
      re();
      rafRef.current = requestAnimationFrame(loop);
      return;
    }

    if (g.ph === 'playing') {
      const { spd, gap } = getScaling(g.sc, difficulty);

      // Move walls
      const s = spd * dt;
      for (const w of g.walls) w.x -= s;
      g.walls = g.walls.filter(w => w.x > -WW - 20);

      // Spawn new wall
      const lastX = g.walls.length ? g.walls[g.walls.length - 1].x : -999;
      if (lastX < GW - gap) {
        g.walls.push({ x: GW + 10, passed: false, ...mkWall(g.pn, g.sc, cfg.colorMatch, g.pc) });
      }

      const pL = PX + 4;
      const pR = PX + PSZ - 4;

      // ── Tunnel mode ──
      if (g.tunnel) {
        const dy = g.tunnel.targetY - g.py;
        g.py += dy * 0.25;
        g.pv = 0;
        g.pr = 0;

        const tw = g.tunnel.wall;
        if (pL >= tw.x + WW) {
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
        // ── Normal flight ──
        g.pv += GRAV * dt;
        g.py += g.pv * dt;
        g.pr = Math.min(40, Math.max(-30, g.pv * 3.5));

        if (g.py < 0) { g.py = 0; g.pv = 0; }
        if (g.py > GH - PSZ) {
          die();
          rafRef.current = requestAnimationFrame(loop);
          return;
        }

        // ── Check walls ──
        const pCenter = g.py + PSZ / 2;

        for (let wi = 0; wi < g.walls.length; wi++) {
          const w = g.walls[wi];
          if (w.passed) continue;

          if (pR > w.x - 20 && pL < w.x + WW) {
            const matchCenterY = w.mi * TH + TH / 2;
            const dist = Math.abs(pCenter - matchCenterY);

            // Also check if player is near the decoy (wrong color) — that's a death
            let nearDecoy = false;
            if (w.decoyIdx >= 0) {
              const decoyCenterY = w.decoyIdx * TH + TH / 2;
              const decoyDist = Math.abs(pCenter - decoyCenterY);
              nearDecoy = decoyDist < TH * 1.5 && decoyDist < dist;
            }

            if (!nearDecoy && dist < TH * 1.5) {
              g.tunnel = {
                wall: w,
                targetY: matchCenterY - PSZ / 2,
              };
              g.pv = 0;
              playClick();
              break;
            } else if (pR > w.x && pL < w.x + WW) {
              die();
              rafRef.current = requestAnimationFrame(loop);
              return;
            }
          }

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
  }, [difficulty, cfg.colorMatch, die, pass, playClick, re]);

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
  const hasColor = cfg.colorMatch && g.pc;

  return (
    <div className={styles.wrapper}>
      <div className={styles.meta}>
        <span className={styles.tip}>
          {hasColor ? 'Match number + color' : 'Tap or Space to flap'}
        </span>
        <span className={styles.scoreLabel}>Score: <strong>{g.sc}</strong></span>
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
          {/* Left wing */}
          <svg className={styles.wingLeft} viewBox="0 0 22 28" width="18" height="24">
            <defs>
              <linearGradient id="wgL" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#e0dcd4" />
                <stop offset="100%" stopColor="#c4bfb3" />
              </linearGradient>
            </defs>
            {/* Main wing shape */}
            <path d="M20 14Q14 2,6 4Q1 6,0 12Q1 18,6 20Q14 22,20 14Z" fill="url(#wgL)" stroke="#b0a898" strokeWidth="0.8" />
            {/* Feather details */}
            <path d="M16 10Q12 6,8 7" fill="none" stroke="#b0a898" strokeWidth="0.6" opacity="0.6" />
            <path d="M17 13Q12 10,7 12" fill="none" stroke="#b0a898" strokeWidth="0.6" opacity="0.5" />
            <path d="M16 16Q12 18,8 17" fill="none" stroke="#b0a898" strokeWidth="0.6" opacity="0.4" />
          </svg>
          {/* Right wing */}
          <svg className={styles.wingRight} viewBox="0 0 22 28" width="18" height="24">
            <defs>
              <linearGradient id="wgR" x1="1" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#e0dcd4" />
                <stop offset="100%" stopColor="#c4bfb3" />
              </linearGradient>
            </defs>
            <path d="M2 14Q8 2,16 4Q21 6,22 12Q21 18,16 20Q8 22,2 14Z" fill="url(#wgR)" stroke="#b0a898" strokeWidth="0.8" />
            <path d="M6 10Q10 6,14 7" fill="none" stroke="#b0a898" strokeWidth="0.6" opacity="0.6" />
            <path d="M5 13Q10 10,15 12" fill="none" stroke="#b0a898" strokeWidth="0.6" opacity="0.5" />
            <path d="M6 16Q10 18,14 17" fill="none" stroke="#b0a898" strokeWidth="0.6" opacity="0.4" />
          </svg>
          <div
            className={styles.bTile}
            style={hasColor ? { background: g.pc.bg, borderColor: g.pc.bg } : undefined}
          >
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
                const isDecoy = ti === w.decoyIdx;
                const isOpen = isMatch && isTunneling;
                let bg;
                if (isOpen) bg = 'transparent';
                else if (isMatch) bg = w.matchColor || '#f5f5f0';
                else if (isDecoy) bg = w.decoyColor || '#f5f5f0';
                else bg = w.tileColors?.[ti] || TILE_BG[n] || '#cdc1b4';
                return (
                  <div
                    key={ti}
                    className={`${styles.wTile}${isOpen ? ` ${styles.wOpen}` : ''}`}
                    style={{
                      height: TH,
                      background: bg,
                      color: DARK_TEXT.has(n) ? '#776e65' : '#f9f6f2',
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
              <h2 className={styles.ovT}>Game Over</h2>
              <p className={styles.ovSc}>Score: {g.sc}</p>
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
      instructions={
        difficulty === 'easy'
          ? 'Tap or press Space to flap upward. Fly through the tile that matches your number. Avoid all other tiles. It gets faster the longer you survive!'
          : 'Tap or press Space to flap. Match BOTH your number AND your color! Watch out — there are two tiles with your number, but only one has the right color.'
      }
      difficulty={difficulty}
      timeLimits={TIME_LIMITS}
      onGameComplete={fireComplete}
      onBack={onBack}
      musicMuted={musicMuted}
      onToggleMusic={onToggleMusic}
    >
      {({ difficulty: d, onComplete: oc, reportScore,
          playClick, playSuccess, playFail }) => (
        <FlappyNumbersGame
          difficulty={d} onComplete={oc} reportScore={reportScore}
          playClick={playClick}
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
