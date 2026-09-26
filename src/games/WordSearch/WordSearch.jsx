import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import PropTypes from 'prop-types';
import { GameShell } from '../../components/GameShell/GameShell';
import { useGameCallback } from '../../hooks/useGameCallback';
import { GAME_IDS } from '../../utils/gameIds';
import { DIFFICULTY_CONFIG, generatePuzzle, cellsOnLine, matchSelection, starsFor } from './useWordSearch';
import styles from './WordSearch.module.css';
import { useTranslation } from '../../i18n/useTranslation';

const fill = (str, vars) => Object.entries(vars).reduce((s, [k, v]) => s.split(`{${k}}`).join(v), str);
const key = (r, c) => `${r},${c}`;

function WordSearchGame({ difficulty, onComplete, reportScore, reportRound, playClick, playSuccess, playFail }) {
  const t = useTranslation();
  const tx = t.games['word-search'];
  const config = DIFFICULTY_CONFIG[difficulty] ?? DIFFICULTY_CONFIG.easy;
  const maxScore = config.puzzles * 3;

  const [puzzleIdx, setPuzzleIdx] = useState(0);
  const [puzzle, setPuzzle] = useState(() => generatePuzzle(config, tx.words));
  const [found, setFound] = useState(() => new Map()); // word -> cells
  const [start, setStart] = useState(null);
  const [flash, setFlash] = useState(null); // { cells, kind: 'miss' | 'found' }
  const [hintCells, setHintCells] = useState(null);
  const [hints, setHints] = useState(0);
  const [hintLevel, setHintLevel] = useState({}); // word -> times hinted
  const [message, setMessage] = useState(null); // { text, tone }
  const [score, setScore] = useState(0);
  const [solved, setSolved] = useState(null); // stars for the solved puzzle

  // Timers cleared on unmount (StrictMode-safe).
  const timers = useRef([]);
  useEffect(() => () => { timers.current.forEach(clearTimeout); timers.current = []; }, []);
  const later = useCallback((fn, ms) => { timers.current.push(setTimeout(fn, ms)); }, []);

  // Shell callbacks are recreated each render; keep them in refs so effects run only on real changes.
  const reportScoreRef = useRef(reportScore);
  const reportRoundRef = useRef(reportRound);
  reportScoreRef.current = reportScore;
  reportRoundRef.current = reportRound;
  useEffect(() => { reportScoreRef.current?.(score); }, [score]);
  useEffect(() => { reportRoundRef.current?.(puzzleIdx + 1, config.puzzles); }, [puzzleIdx, config.puzzles]);

  const { grid, placed } = puzzle;
  const size = grid.length;

  const foundSet = useMemo(() => {
    const s = new Set();
    found.forEach((cells) => cells.forEach(({ row, col }) => s.add(key(row, col))));
    return s;
  }, [found]);
  const flashSet = useMemo(() => new Set((flash?.cells ?? []).map(({ row, col }) => key(row, col))), [flash]);
  const hintSet = useMemo(() => new Set((hintCells ?? []).map(({ row, col }) => key(row, col))), [hintCells]);

  const finishPuzzle = useCallback((hintsUsed) => {
    const stars = starsFor(hintsUsed);
    setScore((s) => s + stars);
    setSolved(stars);
    playSuccess();
  }, [playSuccess]);

  const handleCell = useCallback((row, col) => {
    if (solved !== null) return;
    playClick();
    if (!start) {
      setStart({ row, col });
      setMessage({ text: tx.tapLast, tone: 'info' });
      return;
    }
    if (start.row === row && start.col === col) {
      setStart(null);
      setMessage(null);
      return;
    }
    const cells = cellsOnLine(start, { row, col });
    if (!cells) {
      setStart({ row, col });
      setMessage({ text: tx.notLine, tone: 'miss' });
      return;
    }
    setStart(null);
    const word = matchSelection(cells, grid, placed, found);
    if (word) {
      const next = new Map(found);
      next.set(word, cells);
      setFound(next);
      setHintCells(null);
      setFlash(null);
      if (next.size === placed.length) {
        finishPuzzle(hints);
      } else {
        playSuccess();
        setMessage({ text: fill(tx.foundWord, { word }), tone: 'good' });
      }
    } else {
      playFail();
      setFlash({ cells, kind: 'miss' });
      setMessage({ text: tx.notWord, tone: 'miss' });
      later(() => setFlash(null), 1000);
    }
  }, [solved, start, grid, placed, found, hints, tx, playClick, playSuccess, playFail, finishPuzzle, later]);

  const handleHint = useCallback(() => {
    if (solved !== null) return;
    const target = placed.find((p) => !found.has(p.word));
    if (!target) return;
    playClick();
    const level = hintLevel[target.word] ?? 0;
    setHints((h) => h + 1);
    setHintLevel((m) => ({ ...m, [target.word]: level + 1 }));
    setStart(null);
    if (level === 0) {
      setHintCells([target.cells[0]]);
      setMessage({ text: fill(tx.hintStart, { word: target.word }), tone: 'info' });
    } else {
      setHintCells(target.cells);
      setMessage({ text: fill(tx.hintWhole, { word: target.word }), tone: 'info' });
    }
  }, [solved, placed, found, hintLevel, tx, playClick]);

  const handleNext = useCallback(() => {
    playClick();
    const next = puzzleIdx + 1;
    if (next >= config.puzzles) {
      onComplete({ finalScore: score, maxScore, completed: true });
      return;
    }
    setPuzzleIdx(next);
    setPuzzle(generatePuzzle(config, tx.words));
    setFound(new Map());
    setStart(null);
    setFlash(null);
    setHintCells(null);
    setHints(0);
    setHintLevel({});
    setMessage(null);
    setSolved(null);
  }, [puzzleIdx, config, score, maxScore, tx.words, onComplete, playClick]);

  const statusText = message?.text ?? (start ? tx.tapLast : tx.tapFirst);
  const toneClass = message?.tone === 'good' ? styles.statusGood : message?.tone === 'miss' ? styles.statusMiss : '';
  const fontScale = size >= 9 ? styles.gridSmall : size >= 8 ? styles.gridMid : '';

  return (
    <div className={styles.wrapper}>
      <div className={styles.infoHeader}>
        <div className={styles.hudLeft}>
          <span className={styles.roundLabel}>{fill(tx.puzzleOf, { n: puzzleIdx + 1, total: config.puzzles })}</span>
          <span className={styles.hudSub}>{fill(tx.wordsFound, { n: found.size, total: placed.length })}</span>
        </div>
        <div className={styles.infoBadge} aria-label={`${score} / ${maxScore}`}>
          <span key={score} className={styles.infoBadgeNum}>{score}</span>
          <span className={styles.infoBadgeSub}>★</span>
        </div>
      </div>

      <div className={styles.playArea}>
      <ul className={styles.wordChips} aria-label={tx.wordsToFind}>
        {placed.map(({ word }) => {
          const isFound = found.has(word);
          return (
            <li key={word} className={`${styles.wordChip} ${isFound ? styles.wordFound : ''}`}>
              <span aria-hidden="true" className={styles.chipMark}>{isFound ? '✓' : '○'}</span>
              <span className={isFound ? styles.chipTextFound : ''}>{word}</span>
              {isFound && <span className={styles.srOnly}>{tx.foundLabel}</span>}
            </li>
          );
        })}
      </ul>

      <div className={styles.boardBox}>
      <div
        className={`${styles.grid} ${fontScale}`}
        style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))` }}
        role="grid"
        aria-label={tx.gridLabel}
      >
        {grid.map((row, r) =>
          row.map((letter, c) => {
            const k = key(r, c);
            const isStart = start && start.row === r && start.col === c;
            const cls = [
              styles.cell,
              foundSet.has(k) ? styles.found : '',
              flashSet.has(k) ? styles.miss : '',
              hintSet.has(k) ? styles.hinted : '',
              isStart ? styles.start : '',
            ].filter(Boolean).join(' ');
            return (
              <button
                key={`${puzzleIdx}-${k}`}
                type="button"
                className={cls}
                style={{ '--idx': r * size + c }}
                onClick={() => handleCell(r, c)}
                aria-label={`${letter} (${r + 1}, ${c + 1})`}
                aria-pressed={!!isStart}
              >
                {letter}
              </button>
            );
          })
        )}
      </div>
      </div>

      <p className={`${styles.statusText} ${toneClass}`} aria-live="polite" aria-atomic="true">
        {statusText}
      </p>

      {solved === null ? (
        <div className={styles.controls}>
          <button type="button" className={styles.hintBtn} onClick={handleHint}>
            💡 {tx.hint}
          </button>
          {start && (
            <button type="button" className={styles.ghostBtn} onClick={() => { setStart(null); setMessage(null); }}>
              {tx.clearSelection}
            </button>
          )}
        </div>
      ) : (
        <div className={styles.banner} role="status">
          <p className={styles.bannerTitle}>{solved === 3 ? tx.perfect : tx.solved}</p>
          <p className={styles.bannerStars} aria-label={fill(tx.starsLabel, { n: solved })}>
            {'★'.repeat(solved)}<span className={styles.starOff}>{'☆'.repeat(3 - solved)}</span>
          </p>
          <button type="button" className={styles.nextBtn} onClick={handleNext}>
            {puzzleIdx + 1 >= config.puzzles ? tx.seeResults : tx.nextPuzzle}
          </button>
        </div>
      )}
      </div>
    </div>
  );
}

WordSearchGame.propTypes = {
  difficulty:  PropTypes.string.isRequired,
  onComplete:  PropTypes.func.isRequired,
  reportScore: PropTypes.func,
  reportRound: PropTypes.func,
  playClick:   PropTypes.func.isRequired,
  playSuccess: PropTypes.func.isRequired,
  playFail:    PropTypes.func.isRequired,
};

export function WordSearch({ memberId, difficulty = 'easy', onComplete, callbackUrl, onBack, musicMuted, onToggleMusic }) {
  const t = useTranslation();
  const { fireComplete } = useGameCallback({
    memberId,
    gameId: GAME_IDS.WORD_SEARCH,
    callbackUrl,
    onComplete,
  });

  return (
    <GameShell
      gameId={GAME_IDS.WORD_SEARCH}
      title={t.games['word-search'].title}
      instructions={t.games['word-search'].instructions}
      difficulty={difficulty}
      timeLimits={{ easy: null, medium: null, hard: null }}
      flushTop
      onGameComplete={fireComplete}
      onBack={onBack}
      musicMuted={musicMuted}
      onToggleMusic={onToggleMusic}
    >
      {({ onComplete: shellComplete, reportScore, reportRound, difficulty: diff, playClick, playSuccess, playFail }) => (
        <WordSearchGame
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

WordSearch.propTypes = {
  memberId: PropTypes.string.isRequired,
  difficulty: PropTypes.oneOf(['easy', 'medium', 'hard']),
  onComplete: PropTypes.func.isRequired,
  callbackUrl: PropTypes.string,
  onBack: PropTypes.func,
  musicMuted: PropTypes.bool,
  onToggleMusic: PropTypes.func,
};
