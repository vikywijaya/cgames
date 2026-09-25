import { useState, useEffect, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import { GameShell } from '../../components/GameShell/GameShell';
import { useGameCallback } from '../../hooks/useGameCallback';
import styles from './Tangram.module.css';
import { useTranslation } from '../../i18n/useTranslation';
import { PUZZLES, piecePoints, fitsSlot, turnForSlot, starsFor, bounds, makePieces } from './tangramData';

/*
 * Tangram — tap a piece, then tap the space where it belongs.
 *
 * Tuned for seniors:
 * - No clock. Tap to pick and tap to place instead of dragging.
 * - Easy: the spaces are outlined and every piece already faces the right
 *   way. Medium: outlined, but pieces must be turned. Hard: only the
 *   silhouette is shown and pieces must be turned.
 * - Tap a placed piece to take it back. "Start again" clears the puzzle.
 * - Hint picks a piece, turns it the right way and makes its space glow.
 * - 3 stars per puzzle without hints, 2 with one hint, 1 with more.
 */
const CONFIG = {
  easy:   { preTurned: true,  outlines: true,  autoTurn: true  },
  medium: { preTurned: false, outlines: true,  autoTurn: false },
  hard:   { preTurned: false, outlines: false, autoTurn: false },
};

const toPts = (points, dx = 0, dy = 0) => points.map(([x, y]) => `${x + dx},${y + dy}`).join(' ');

function PieceIcon({ kind, turn, color }) {
  const pts = piecePoints(kind, turn);
  const w = Math.max(...pts.map(p => p[0]));
  const h = Math.max(...pts.map(p => p[1]));
  const size = Math.max(3.2, w + 0.4, h + 0.4);
  return (
    <svg viewBox={`${-(size - w) / 2} ${-(size - h) / 2} ${size} ${size}`} className={styles.pieceSvg} aria-hidden="true">
      <polygon points={toPts(pts)} fill={color} stroke="#111827" strokeWidth="0.1" strokeLinejoin="round" />
    </svg>
  );
}
PieceIcon.propTypes = { kind: PropTypes.string.isRequired, turn: PropTypes.number.isRequired, color: PropTypes.string.isRequired };

function TangramGame({ difficulty, onComplete, reportScore, reportRound, playClick, playSuccess, playFail }) {
  const t = useTranslation();
  const tt = t.games['tangram'];
  const config = CONFIG[difficulty] ?? CONFIG.easy;
  const puzzles = PUZZLES[difficulty] ?? PUZZLES.easy;
  const maxScore = puzzles.length * 3;

  const [idx, setIdx] = useState(0);
  const [pieces, setPieces] = useState(() => makePieces(puzzles[0], config.preTurned));
  const [placed, setPlaced] = useState({}); // slotIndex -> pieceId
  const [selected, setSelected] = useState(null);
  const [hints, setHints] = useState(0);
  const [hintSlot, setHintSlot] = useState(null);
  const [message, setMessage] = useState(null); // { id, text, tone }
  const [solved, setSolved] = useState(false);
  const [banner, setBanner] = useState(null);
  const [score, setScore] = useState(0);

  const scoreRef = useRef(0);
  const hintsRef = useRef(0);
  const solvedRef = useRef(false);
  const doneRef = useRef(false);
  const idRef = useRef(0);
  const timersRef = useRef(new Set());

  const later = useCallback((fn, ms) => {
    const h = setTimeout(() => { timersRef.current.delete(h); fn(); }, ms);
    timersRef.current.add(h);
  }, []);
  useEffect(() => {
    const timers = timersRef.current;
    return () => { timers.forEach(clearTimeout); timers.clear(); };
  }, []);

  const puzzle = puzzles[idx];

  useEffect(() => { reportRound?.(idx + 1, puzzles.length); }, [idx, puzzles.length, reportRound]);

  const say = useCallback((text, tone = 'info', ms = 2600) => {
    const id = ++idRef.current;
    setMessage({ id, text, tone });
    later(() => setMessage(m => (m?.id === id ? null : m)), ms);
  }, [later]);

  const placedIds = new Set(Object.values(placed));
  const trayPieces = pieces.filter(p => !placedIds.has(p.id));
  const selectedPiece = pieces.find(p => p.id === selected) ?? null;

  const selectPiece = useCallback((id) => {
    if (solvedRef.current) return;
    playClick();
    setSelected(cur => (cur === id ? null : id));
  }, [playClick]);

  const turnSelected = useCallback(() => {
    if (solvedRef.current || !selected) return;
    playClick();
    setPieces(prev => prev.map(p => (p.id === selected ? { ...p, turn: (p.turn + 1) % 4 } : p)));
  }, [selected, playClick]);

  const finishPuzzle = useCallback(() => {
    solvedRef.current = true;
    setSolved(true);
    setSelected(null);
    setHintSlot(null);
    const stars = starsFor(hintsRef.current);
    scoreRef.current += stars;
    setScore(scoreRef.current);
    reportScore?.(scoreRef.current);
    setBanner({ stars });
    later(() => playSuccess(), 200);
    later(() => {
      if (doneRef.current) return;
      const next = idx + 1;
      if (next >= puzzles.length) {
        doneRef.current = true;
        onComplete({ finalScore: scoreRef.current, maxScore, completed: true });
        return;
      }
      hintsRef.current = 0;
      solvedRef.current = false;
      setHints(0);
      setBanner(null);
      setSolved(false);
      setPlaced({});
      setMessage(null);
      setPieces(makePieces(puzzles[next], config.preTurned));
      setIdx(next);
    }, 2000);
  }, [idx, puzzles, maxScore, config.preTurned, later, onComplete, playSuccess, reportScore]);

  const tapSlot = useCallback((slotIdx) => {
    if (solvedRef.current) return;
    const slot = puzzle.slots[slotIdx];
    const occupant = placed[slotIdx];
    if (occupant) {
      // Take a placed piece back to the tray.
      playClick();
      const next = { ...placed };
      delete next[slotIdx];
      setPlaced(next);
      setSelected(occupant);
      return;
    }
    if (!selectedPiece) {
      say(tt.pickFirst);
      return;
    }
    let turn = selectedPiece.turn;
    if (selectedPiece.kind === slot.kind && config.autoTurn) turn = turnForSlot(slot);
    if (!fitsSlot(selectedPiece.kind, turn, slot)) {
      playFail();
      say(selectedPiece.kind === slot.kind ? tt.needTurn : tt.wrongShape, 'warn');
      return;
    }
    playClick();
    if (turn !== selectedPiece.turn) {
      setPieces(prev => prev.map(p => (p.id === selectedPiece.id ? { ...p, turn } : p)));
    }
    const next = { ...placed, [slotIdx]: selectedPiece.id };
    setPlaced(next);
    setSelected(null);
    setMessage(null);
    if (hintSlot === slotIdx) setHintSlot(null);
    if (Object.keys(next).length === puzzle.slots.length) finishPuzzle();
  }, [puzzle, placed, selectedPiece, config.autoTurn, hintSlot, say, tt, playClick, playFail, finishPuzzle]);

  const giveHint = useCallback(() => {
    if (solvedRef.current) return;
    const slotIdx = puzzle.slots.findIndex((_, i) => !placed[i]);
    if (slotIdx < 0) return;
    const slot = puzzle.slots[slotIdx];
    const candidates = trayPieces.filter(p => p.kind === slot.kind);
    const piece = candidates.find(p => p.id === selected) ?? candidates[0];
    if (!piece) return;
    playClick();
    hintsRef.current += 1;
    setHints(hintsRef.current);
    const turn = turnForSlot(slot);
    setPieces(prev => prev.map(p => (p.id === piece.id ? { ...p, turn } : p)));
    setSelected(piece.id);
    setHintSlot(slotIdx);
    say(tt.hintMsg, 'info', 3200);
  }, [puzzle, placed, trayPieces, selected, say, tt, playClick]);

  const resetPuzzle = useCallback(() => {
    if (solvedRef.current) return;
    playClick();
    setPlaced({});
    setSelected(null);
    setHintSlot(null);
    setMessage(null);
  }, [playClick]);

  const b = bounds(puzzle.slots);
  const pad = 0.4;
  const viewBox = `${b.minX - pad} ${b.minY - pad} ${b.maxX - b.minX + pad * 2} ${b.maxY - b.minY + pad * 2}`;
  const placedCount = Object.keys(placed).length;
  const puzzleName = tt.names?.[puzzle.name] ?? puzzle.name;
  const stars = starsFor(hints);

  return (
    <div className={styles.wrapper}>
      <div className={styles.header}>
        <div className={styles.headerText}>
          <span className={styles.headerLabel}>
            {tt.progress.replace('{n}', idx + 1).replace('{total}', puzzles.length)}
          </span>
          <span className={styles.headerName}>{tt.makeThe.replace('{name}', puzzleName)}</span>
        </div>
        <div className={styles.headerBadge} aria-label={tt.placedCount.replace('{n}', placedCount).replace('{total}', puzzle.slots.length)}>
          <span className={styles.badgeNum}>{placedCount}/{puzzle.slots.length}</span>
          <span className={styles.badgeSub}>{tt.pieces}</span>
        </div>
      </div>

      <div className={styles.boardWrap}>
        <svg
          className={styles.board}
          viewBox={viewBox}
          role="group"
          aria-label={tt.boardLabel}
        >
          {puzzle.slots.map((slot, i) => {
            const occupant = pieces.find(p => p.id === placed[i]);
            const isHint = hintSlot === i;
            const outline = config.outlines || isHint;
            return (
              <polygon
                key={`slot-${i}`}
                points={toPts(slot.points)}
                className={`${styles.slot} ${isHint ? styles.slotHint : ''}`}
                fill={occupant ? occupant.color : config.outlines ? '#e5e7eb' : '#374151'}
                stroke={occupant ? '#111827' : isHint ? '#f59e0b' : outline ? '#4b5563' : '#374151'}
                strokeWidth={isHint ? 0.14 : occupant ? 0.08 : outline ? 0.07 : 0.03}
                strokeDasharray={!occupant && config.outlines && !isHint ? '0.25 0.15' : undefined}
                strokeLinejoin="round"
                onClick={() => tapSlot(i)}
                role="button"
                aria-label={occupant ? tt.takeBack : tt.space}
              />
            );
          })}
        </svg>
        {solved && banner && (
          <div className={styles.banner} role="status">
            <span className={styles.bannerTitle}>{tt.solved}</span>
            <span className={styles.bannerStars} aria-label={tt.starsLabel.replace('{n}', banner.stars)}>
              {'★'.repeat(banner.stars)}<span className={styles.starOff}>{'★'.repeat(3 - banner.stars)}</span>
            </span>
          </div>
        )}
      </div>

      <div className={`${styles.message} ${message?.tone === 'warn' ? styles.messageWarn : ''}`} aria-live="polite">
        {message?.text ?? (selectedPiece ? tt.tapSpace : trayPieces.length ? tt.tapPiece : '')}
      </div>

      <div className={styles.tray} role="group" aria-label={tt.trayLabel}>
        {trayPieces.map(p => (
          <button
            key={p.id}
            type="button"
            className={`${styles.pieceBtn} ${selected === p.id ? styles.pieceSelected : ''}`}
            onClick={() => selectPiece(p.id)}
            aria-pressed={selected === p.id}
            aria-label={tt.shapes[p.kind]}
            disabled={solved}
          >
            <PieceIcon kind={p.kind} turn={p.turn} color={p.color} />
          </button>
        ))}
      </div>

      <div className={styles.controls}>
        <button type="button" className={styles.ctrlBtn} onClick={turnSelected} disabled={!selectedPiece || solved}>
          ↻ {tt.turn}
        </button>
        <button type="button" className={styles.ctrlBtn} onClick={giveHint} disabled={solved}>
          💡 {tt.hint}
        </button>
        <button type="button" className={styles.ctrlBtn} onClick={resetPuzzle} disabled={solved || placedCount === 0}>
          ↺ {tt.reset}
        </button>
      </div>

      <div className={styles.footer}>
        <span>{tt.starsNow.replace('{n}', stars)}</span>
        <span>{tt.total.replace('{n}', score).replace('{total}', maxScore)}</span>
      </div>
    </div>
  );
}

TangramGame.propTypes = {
  difficulty:  PropTypes.string.isRequired,
  onComplete:  PropTypes.func.isRequired,
  reportScore: PropTypes.func,
  reportRound: PropTypes.func,
  playClick:   PropTypes.func.isRequired,
  playSuccess: PropTypes.func.isRequired,
  playFail:    PropTypes.func.isRequired,
};

export function Tangram({ memberId, difficulty = 'easy', onComplete, callbackUrl, onBack, musicMuted, onToggleMusic }) {
  const t = useTranslation();
  const { fireComplete: fireCallback } = useGameCallback({ memberId, gameId: 'tangram', callbackUrl, onComplete });
  return (
    <GameShell
      gameId="tangram"
      title={t.games['tangram'].title}
      instructions={t.games['tangram'].instructions}
      difficulty={difficulty}
      timeLimits={{ easy: null, medium: null, hard: null }}
      flushTop
      onGameComplete={fireCallback}
      onBack={onBack}
      musicMuted={musicMuted}
      onToggleMusic={onToggleMusic}
    >
      {({ difficulty: diff, onComplete: sc, reportScore, reportRound, playClick, playSuccess, playFail }) => (
        <TangramGame
          key={diff}
          difficulty={diff}
          onComplete={sc}
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

Tangram.propTypes = {
  memberId: PropTypes.string.isRequired,
  difficulty: PropTypes.oneOf(['easy', 'medium', 'hard']),
  onComplete: PropTypes.func.isRequired,
  callbackUrl: PropTypes.string,
  onBack: PropTypes.func,
  musicMuted: PropTypes.bool,
  onToggleMusic: PropTypes.func,
};
