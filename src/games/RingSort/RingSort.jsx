import { useState, useEffect, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import { GameShell } from '../../components/GameShell/GameShell';
import { useGameCallback } from '../../hooks/useGameCallback';
import styles from './RingSort.module.css';
import { useTranslation } from '../../i18n/useTranslation';
import { generatePuzzle, canMove, applyMove, isSolved, isRodDone, hintMove, starsFor } from './ringLogic';

/*
 * Ring Sort — move rings between rods until every rod holds one colour.
 *
 * Tuned for seniors:
 * - No clock. Tap a rod to lift its top ring, tap another rod to drop it.
 * - Every colour also has its own symbol, so colour is never the only cue.
 * - Hint shows the next good move; Undo and Start again are always there.
 *   Puzzles are made by scrambling a sorted board, so they can always be
 *   solved and following hints always finishes them.
 * - Scoring: 3 stars per puzzle with no help, 2 with a little (1–2 hints/
 *   undos), 1 with more. maxScore = 3 × puzzles.
 */
export const DIFFICULTY_CONFIG = {
  easy:   { numColors: 2, ringsPerColor: 3, rodCapacity: 4, extraRods: 1, rounds: 3 },
  medium: { numColors: 3, ringsPerColor: 3, rodCapacity: 4, extraRods: 1, rounds: 4 },
  hard:   { numColors: 4, ringsPerColor: 4, rodCapacity: 4, extraRods: 1, rounds: 4 },
};

// High-contrast colours, each paired with a symbol and a text colour.
const PALETTE = [
  { key: 'red',    bg: '#dc2626', fg: '#ffffff', symbol: '●' },
  { key: 'blue',   bg: '#1d4ed8', fg: '#ffffff', symbol: '■' },
  { key: 'yellow', bg: '#facc15', fg: '#422006', symbol: '▲' },
  { key: 'green',  bg: '#15803d', fg: '#ffffff', symbol: '◆' },
  { key: 'purple', bg: '#7e22ce', fg: '#ffffff', symbol: '★' },
];

const TIME_LIMITS = { easy: null, medium: null, hard: null };

function shuffled(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function newPuzzle(config) {
  return { start: generatePuzzle(config), colors: shuffled(PALETTE).slice(0, config.numColors) };
}

function RingSortGame({ difficulty, onComplete, reportScore, reportRound, playClick, playSuccess, playFail, playPop }) {
  const t = useTranslation();
  const tr = t.games['ring-sort'];
  const config = DIFFICULTY_CONFIG[difficulty] ?? DIFFICULTY_CONFIG.easy;
  const { ringsPerColor, rodCapacity, rounds } = config;
  const maxScore = rounds * 3;

  const [roundIdx, setRoundIdx] = useState(0);
  const [puzzle, setPuzzle]     = useState(() => newPuzzle(config));
  const [rods, setRods]         = useState(() => puzzle.start);
  const [history, setHistory]   = useState([]);
  const [selected, setSelected] = useState(null);
  const [hint, setHint]         = useState(null);    // [from, to]
  const [help, setHelp]         = useState(0);
  const [score, setScore]       = useState(0);
  const [msg, setMsg]           = useState(null);    // { key, tone }
  const [shakeRod, setShakeRod] = useState(null);
  const [dropRod, setDropRod]   = useState(null);
  const [banner, setBanner]     = useState(null);
  const [solved, setSolved]     = useState(false);

  // Ref mirrors so rapid taps never read stale state.
  const rodsRef     = useRef(rods);
  const historyRef  = useRef(history);
  const selectedRef = useRef(null);
  const helpRef     = useRef(0);
  const scoreRef    = useRef(0);
  const solvedRef   = useRef(false);
  const doneRef     = useRef(false);
  const reportedRef = useRef(-1);
  const timersRef   = useRef(new Set());
  const idRef       = useRef(0);

  const later = useCallback((fn, ms) => {
    const h = setTimeout(() => { timersRef.current.delete(h); fn(); }, ms);
    timersRef.current.add(h);
  }, []);
  useEffect(() => {
    const timers = timersRef.current;
    return () => { timers.forEach(clearTimeout); timers.clear(); };
  }, []);

  useEffect(() => {
    if (reportedRef.current === roundIdx) return;
    reportedRef.current = roundIdx;
    reportRound?.(roundIdx + 1, rounds);
  }, [roundIdx, rounds, reportRound]);

  const say = useCallback((key, tone = 'info') => setMsg({ key, tone, id: ++idRef.current }), []);

  const setBoard = useCallback((next, nextHistory) => {
    rodsRef.current = next;
    historyRef.current = nextHistory;
    setRods(next);
    setHistory(nextHistory);
  }, []);

  const select = useCallback((v) => { selectedRef.current = v; setSelected(v); }, []);

  const addHelp = useCallback(() => { helpRef.current += 1; setHelp(helpRef.current); }, []);

  const finishPuzzle = useCallback(() => {
    solvedRef.current = true;
    setSolved(true);
    const stars = starsFor(helpRef.current);
    scoreRef.current += stars;
    setScore(scoreRef.current);
    reportScore(scoreRef.current);
    later(() => playSuccess(), 250);
    setBanner({ id: ++idRef.current, stars });
    setMsg(null);
    later(() => {
      if (doneRef.current) return;
      const n = roundIdx + 1;
      if (n >= rounds) {
        doneRef.current = true;
        onComplete({ finalScore: scoreRef.current, maxScore, completed: true });
        return;
      }
      const p = newPuzzle(config);
      helpRef.current = 0;
      solvedRef.current = false;
      selectedRef.current = null;
      setPuzzle(p);
      setBoard(p.start, []);
      setSelected(null);
      setHint(null);
      setHelp(0);
      setBanner(null);
      setSolved(false);
      setRoundIdx(n);
    }, 1900);
  }, [config, roundIdx, rounds, maxScore, later, onComplete, playSuccess, reportScore, setBoard]);

  const handleRod = useCallback((idx) => {
    if (solvedRef.current || doneRef.current) return;
    const board = rodsRef.current;
    const from = selectedRef.current;

    if (from === null) {
      if (!board[idx].length) { playFail(); say('emptyRod', 'warn'); setShakeRod(idx); later(() => setShakeRod(s => (s === idx ? null : s)), 350); return; }
      playClick();
      select(idx);
      say('placeRing');
      return;
    }
    if (from === idx) { playClick(); select(null); say('pickRing'); return; }

    if (!canMove(board, from, idx, rodCapacity)) {
      playFail();
      say('fullRod', 'warn');
      setShakeRod(idx);
      later(() => setShakeRod(s => (s === idx ? null : s)), 350);
      return; // keep the ring lifted so they can pick another rod
    }

    playPop?.();
    const next = applyMove(board, from, idx);
    setBoard(next, [...historyRef.current, board]);
    select(null);
    setHint(null);
    setDropRod(idx);
    later(() => setDropRod(d => (d === idx ? null : d)), 300);
    if (isSolved(next, ringsPerColor)) finishPuzzle();
    else say(isRodDone(next[idx], ringsPerColor) ? 'rodDone' : 'pickRing', isRodDone(next[idx], ringsPerColor) ? 'good' : 'info');
  }, [rodCapacity, ringsPerColor, finishPuzzle, later, playClick, playFail, playPop, say, select, setBoard]);

  const handleHint = useCallback(() => {
    if (solvedRef.current || doneRef.current) return;
    const move = hintMove(rodsRef.current, config);
    if (!move) return;
    playClick();
    addHelp();
    select(null);
    const id = ++idRef.current;
    setHint({ id, move });
    say('hintMsg', 'hint');
    later(() => setHint(h => (h?.id === id ? null : h)), 3500);
  }, [config, addHelp, later, playClick, say, select]);

  const handleUndo = useCallback(() => {
    if (solvedRef.current || !historyRef.current.length) return;
    playClick();
    const h = historyRef.current;
    setBoard(h[h.length - 1], h.slice(0, -1));
    select(null);
    setHint(null);
    say('undone');
  }, [playClick, say, select, setBoard]);

  const handleReset = useCallback(() => {
    if (solvedRef.current || !historyRef.current.length) return;
    playClick();
    setBoard(puzzle.start, []);
    select(null);
    setHint(null);
    say('resetDone');
  }, [puzzle.start, playClick, say, select, setBoard]);

  const colorName = (c) => tr.colors[puzzle.colors[c].key];
  const msgText = msg ? tr[msg.key] : tr.pickRing;
  const hintFrom = hint?.move[0];
  const hintTo = hint?.move[1];

  return (
    <div className={styles.wrapper}>
      <div className={styles.infoHeader}>
        <div className={styles.hudLeft}>
          <span className={styles.roundLabel}>{t.common.puzzle} {roundIdx + 1}/{rounds}</span>
          <span className={styles.helpStars} aria-label={`${starsFor(help)} ${tr.stars}`}>
            {[0, 1, 2].map(i => (
              <span key={i} className={i < starsFor(help) ? styles.starOn : styles.starOff} aria-hidden="true">★</span>
            ))}
          </span>
        </div>
        <div className={styles.infoBadge}>
          <span key={score} className={styles.infoBadgeNum}>{score}</span>
          <span className={styles.infoBadgeSub} aria-label={tr.stars}>★</span>
        </div>
      </div>

      <div className={styles.playArea}>
        <p key={msg?.id ?? 'm'} className={`${styles.message} ${styles[`msg_${msg?.tone ?? 'info'}`] ?? ''}`} aria-live="polite">
          {msgText}
        </p>

        <div className={styles.board}>
          {banner && (
            <div key={banner.id} className={styles.banner} role="status">
              <span>{tr.solvedBanner}</span>
              <span className={styles.bannerStars} aria-label={`${banner.stars} ${tr.stars}`}>
                {'★'.repeat(banner.stars)}<span className={styles.bannerStarsOff}>{'★'.repeat(3 - banner.stars)}</span>
              </span>
            </div>
          )}
          <div key={`r${roundIdx}`} className={`${styles.rodsArea} ${solved ? styles.areaSolved : ''}`}>
            {rods.map((rod, rodIdx) => {
              const isSel = selected === rodIdx;
              const done = isRodDone(rod, ringsPerColor);
              const cls = [
                styles.rod,
                isSel ? styles.rodSelected : '',
                done ? styles.rodDone : '',
                shakeRod === rodIdx ? styles.rodShake : '',
                hintFrom === rodIdx ? styles.rodHintFrom : '',
                hintTo === rodIdx ? styles.rodHintTo : '',
              ].join(' ');
              const label = [
                `${tr.rod} ${rodIdx + 1}`,
                rod.length ? rod.map(colorName).join(', ') : tr.empty,
                done ? tr.done : '',
                isSel ? tr.selected : '',
              ].filter(Boolean).join('. ');
              return (
                <button key={rodIdx} type="button" className={cls} onClick={() => handleRod(rodIdx)} disabled={solved} aria-label={label} aria-pressed={isSel}>
                  {hintFrom === rodIdx && <span className={styles.hintTag} aria-hidden="true">⬆</span>}
                  {hintTo === rodIdx && <span className={styles.hintTag} aria-hidden="true">⬇</span>}
                  <span className={styles.rodBody} style={{ '--cap': rodCapacity }}>
                    <span className={styles.peg} />
                    <span className={styles.stack}>
                      {rod.map((c, i) => {
                        const top = i === rod.length - 1;
                        const col = puzzle.colors[c];
                        return (
                          <span
                            key={i}
                            className={[
                              styles.ring,
                              top && isSel ? styles.ringLifted : '',
                              top && dropRod === rodIdx ? styles.ringDrop : '',
                              top && hintFrom === rodIdx ? styles.ringHint : '',
                            ].join(' ')}
                            style={{ background: col.bg, color: col.fg }}
                          >
                            {col.symbol}
                          </span>
                        );
                      })}
                    </span>
                  </span>
                  <span className={styles.base}>{done ? '✓' : ''}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className={styles.tools}>
          <button type="button" className={styles.toolBtn} onClick={handleHint} disabled={solved}>
            <span aria-hidden="true">💡</span> {tr.hint}
          </button>
          <button type="button" className={styles.toolBtn} onClick={handleUndo} disabled={solved || !history.length}>
            <span aria-hidden="true">↩</span> {tr.undo}
          </button>
          <button type="button" className={styles.toolBtn} onClick={handleReset} disabled={solved || !history.length}>
            <span aria-hidden="true">🔄</span> {tr.reset}
          </button>
        </div>
        <p className={styles.helpNote}>{tr.helpNote}</p>
      </div>
    </div>
  );
}

RingSortGame.propTypes = {
  difficulty:  PropTypes.string.isRequired,
  onComplete:  PropTypes.func.isRequired,
  reportScore: PropTypes.func.isRequired,
  reportRound: PropTypes.func,
  playClick:   PropTypes.func.isRequired,
  playSuccess: PropTypes.func.isRequired,
  playFail:    PropTypes.func.isRequired,
  playPop:     PropTypes.func,
};

export function RingSort({ memberId, difficulty = 'easy', onComplete, callbackUrl, onBack, musicMuted, onToggleMusic }) {
  const t = useTranslation();
  const tr = t.games['ring-sort'];
  const { fireComplete: fireCallback } = useGameCallback({ memberId, gameId: 'ring-sort', callbackUrl, onComplete });
  return (
    <GameShell
      gameId="ring-sort"
      title={tr.title}
      instructions={tr.instructions}
      difficulty={difficulty}
      timeLimits={TIME_LIMITS}
      flushTop
      onGameComplete={fireCallback}
      onBack={onBack}
      musicMuted={musicMuted}
      onToggleMusic={onToggleMusic}
    >
      {({ difficulty: diff, onComplete: sc, reportScore, reportRound, playClick, playSuccess, playFail, playPop }) => (
        <RingSortGame
          difficulty={diff}
          onComplete={sc}
          reportScore={reportScore}
          reportRound={reportRound}
          playClick={playClick}
          playSuccess={playSuccess}
          playFail={playFail}
          playPop={playPop}
        />
      )}
    </GameShell>
  );
}

RingSort.propTypes = {
  memberId: PropTypes.string.isRequired,
  difficulty: PropTypes.oneOf(['easy', 'medium', 'hard']),
  onComplete: PropTypes.func.isRequired,
  callbackUrl: PropTypes.string,
  onBack: PropTypes.func,
  musicMuted: PropTypes.bool,
  onToggleMusic: PropTypes.func,
};
