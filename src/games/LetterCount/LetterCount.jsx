import { useState, useEffect, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import { GameShell } from '../../components/GameShell/GameShell';
import { useGameCallback } from '../../hooks/useGameCallback';
import styles from './LetterCount.module.css';
import { useTranslation } from '../../i18n/useTranslation';

/*
 * LetterCount — find every copy of a letter in a word by tapping it.
 * (It used to be a guess of how many; tapping each one is active scanning
 * and needs no counting in your head.)
 *
 * Tuned for seniors:
 * - Big letter tiles. A found letter lights up and the counter ticks up.
 * - Tap "Done" when you think you've found them all; any you missed are
 *   then shown. A wrong letter just shakes.
 * - Target letters are ones that appear at least twice where possible.
 * - Hard asks for two letters at once, each in its own colour.
 * - +1 per letter found, -1 per wrong tap (never below 0), +2 for a
 *   perfect word. No overall clock.
 */
const DIFFICULTY_CONFIG = {
  easy:   { rounds: 8,  wordLen: [5, 7],  targets: 1 },
  medium: { rounds: 10, wordLen: [7, 10], targets: 1 },
  hard:   { rounds: 10, wordLen: [8, 11], targets: 2 },
};
const PERFECT_BONUS = 2;

const WORDS = [
  'BUTTERFLY', 'ELEPHANT', 'STRAWBERRY', 'PINEAPPLE', 'ADVENTURE', 'CHOCOLATE',
  'UMBRELLA', 'REMEMBER', 'YESTERDAY', 'MOUNTAIN', 'CALENDAR', 'BEAUTIFUL',
  'TREASURE', 'HOSPITAL', 'SURPRISE', 'TOGETHER', 'FESTIVAL', 'BANANA',
  'BLOSSOM', 'COCONUT', 'DOLPHIN', 'KITCHEN', 'LIBRARY', 'MORNING',
  'PATTERN', 'THUNDER', 'BALLOON', 'COFFEE', 'GARDEN', 'MANGOES',
  'HARVEST', 'MUSICAL', 'PENGUIN', 'VILLAGE', 'TEAPOT', 'PEPPER',
  'APPLE', 'CHEESE', 'LETTER', 'SUMMER', 'COOKIE', 'MIRROR',
  'GRANDMOTHER', 'NEWSPAPER', 'BIRTHDAY', 'SUNFLOWER', 'PAPAYA', 'TOMATO',
  'CINNAMON', 'HAPPINESS', 'TELEPHONE', 'SEPTEMBER', 'BOOKSHELF', 'ASSISTANT',
];

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function buildPuzzle(config, usedWords) {
  const [minLen, maxLen] = config.wordLen;
  const eligible = WORDS.filter(w => w.length >= minLen && w.length <= maxLen);
  const fresh = eligible.filter(w => !usedWords.has(w));
  const list = fresh.length ? fresh : eligible;
  const word = list[Math.floor(Math.random() * list.length)];
  const counts = {};
  for (const c of word) counts[c] = (counts[c] || 0) + 1;
  // Prefer letters that repeat, so there's something to hunt for.
  const letters = shuffle(Object.keys(counts)).sort((a, b) => (counts[b] > 1) - (counts[a] > 1));
  const targets = letters.slice(0, config.targets);
  const total = targets.reduce((n, l) => n + counts[l], 0);
  return { word, targets, total };
}


function LetterCountGame({ countingDown = false, difficulty, onComplete, reportScore, reportRound, playClick, playSuccess, playFail, playPop }) {
  const t = useTranslation();
  const tl = t.games['letter-count'];
  const config = DIFFICULTY_CONFIG[difficulty] ?? DIFFICULTY_CONFIG.easy;

  const usedRef = useRef(new Set());
  const [round, setRound]   = useState(0);
  const [puzzle, setPuzzle] = useState(() => buildPuzzle(config, usedRef.current));
  const [found, setFound]   = useState(new Set());   // letter indexes
  const [wrongIdx, setWrongIdx] = useState(null);
  const [wrongs, setWrongs] = useState(0);
  const [result, setResult] = useState(null);
  const [score, setScore]   = useState(0);
  const [perfectMax, setPerfectMax] = useState(0);

  const scoreRef = useRef(0);
  const maxRef = useRef(0);
  const doneRef = useRef(false);
  const foundRef = useRef(new Set());
  const reported = useRef(-1);

  useEffect(() => {
    usedRef.current.add(puzzle.word);
  }, [puzzle]);
  useEffect(() => {
    if (countingDown || reported.current === round) return;
    reported.current = round;
    reportRound?.(round + 1, config.rounds);
  }, [countingDown, round, config.rounds, reportRound]);

  const tap = useCallback((i) => {
    if (countingDown || result || doneRef.current || foundRef.current.has(i)) return;
    const ch = puzzle.word[i];
    if (puzzle.targets.includes(ch)) {
      const nf = new Set(foundRef.current);
      nf.add(i);
      foundRef.current = nf;
      setFound(nf);
      playPop?.();
      return;
    }
    playClick();
    playFail();
    setWrongs(w => w + 1);
    setWrongIdx(i);
    setTimeout(() => setWrongIdx(w => (w === i ? null : w)), 400);
  }, [countingDown, result, puzzle, playClick, playFail, playPop]);

  const done = useCallback(() => {
    if (result) return;
    playClick();
    const got = foundRef.current.size;
    const missed = puzzle.total - got;
    const perfect = missed === 0 && wrongs === 0;
    const gained = Math.max(0, got - wrongs) + (perfect ? PERFECT_BONUS : 0);
    scoreRef.current += gained;
    maxRef.current += puzzle.total + PERFECT_BONUS;
    setScore(scoreRef.current);
    setPerfectMax(maxRef.current);
    reportScore(scoreRef.current);
    setResult({ got, missed, perfect, gained });
    if (missed === 0) playSuccess(); else playFail();
  }, [result, puzzle, wrongs, reportScore, playClick, playSuccess, playFail]);

  const next = useCallback(() => {
    playClick();
    const n = round + 1;
    if (n >= config.rounds) {
      doneRef.current = true;
      onComplete({ finalScore: scoreRef.current, maxScore: Math.max(maxRef.current, scoreRef.current, 1), completed: true });
      return;
    }
    foundRef.current = new Set();
    setRound(n);
    setPuzzle(buildPuzzle(config, usedRef.current));
    setFound(new Set());
    setWrongs(0);
    setResult(null);
  }, [round, config, onComplete, playClick]);

  const colourFor = (ch) => (puzzle.targets[0] === ch ? 'a' : 'b');
  const letters = puzzle.word.split('');
  const perRow = letters.length > 8 ? Math.ceil(letters.length / 2) : letters.length;

  return (
    <div className={styles.wrapper}>
      <div className={styles.infoHeader}>
        <div className={styles.hudLeft}>
          <span className={styles.roundLabel}>{t.common.round} {round + 1}/{config.rounds}</span>
        </div>
        <div className={styles.infoBadge} title={perfectMax ? `${score}/${perfectMax}` : undefined}>
          <span key={score} className={styles.infoBadgeNum}>{score}</span>
          <span className={styles.infoBadgeSub}>{tl.pts}</span>
        </div>
      </div>

      <div className={styles.playArea}>
        <p className={styles.prompt}>
          {tl.findEvery}{' '}
          {puzzle.targets.map((l, i) => (
            <span key={l}>
              {i > 0 && <span className={styles.and}> {tl.andWord} </span>}
              <strong className={`${styles.target} ${styles[`target_${colourFor(l)}`]}`}>{l}</strong>
            </span>
          ))}
        </p>

        <div key={`w${round}`} className={styles.word} style={{ '--per-row': perRow }}>
          {letters.map((ch, i) => {
            const isTarget = puzzle.targets.includes(ch);
            const isFound = found.has(i);
            const missed = result && isTarget && !isFound;
            return (
              <button
                key={i}
                type="button"
                style={{ '--idx': i }}
                className={[
                  styles.tile,
                  isFound ? `${styles.tileFound} ${styles[`found_${colourFor(ch)}`]}` : '',
                  wrongIdx === i ? styles.tileWrong : '',
                  missed ? styles.tileMissed : '',
                  result && !isTarget ? styles.tileDim : '',
                ].join(' ')}
                onPointerDown={() => tap(i)}
                disabled={!!result}
                aria-label={ch}
                aria-pressed={isFound}
              >
                {ch}
              </button>
            );
          })}
        </div>

        <p className={styles.counter} aria-live="polite">
          {result
            ? (result.perfect
              ? <span className={styles.good}>🎉 {tl.perfect} +{result.gained}</span>
              : <span>{tl.summary.replace('{got}', result.got).replace('{total}', puzzle.total)} <span className={styles.gained}>+{result.gained}</span></span>)
            : <>{tl.foundSoFar.replace('{n}', found.size)}</>}
        </p>

        {result ? (
          <button type="button" className={styles.primaryBtn} onClick={next}>
            {round + 1 >= config.rounds ? tl.finish : tl.next} ›
          </button>
        ) : (
          <button type="button" className={styles.primaryBtn} onClick={done} disabled={countingDown}>
            {tl.done}
          </button>
        )}
      </div>
    </div>
  );
}

LetterCountGame.propTypes = {
  countingDown: PropTypes.bool,
  difficulty:  PropTypes.string.isRequired,
  onComplete:  PropTypes.func.isRequired,
  reportScore: PropTypes.func.isRequired,
  reportRound: PropTypes.func,
  playClick:   PropTypes.func.isRequired,
  playSuccess: PropTypes.func.isRequired,
  playFail:    PropTypes.func.isRequired,
  playPop:     PropTypes.func,
};

const TIME_LIMITS = { easy: null, medium: null, hard: null };

export function LetterCount({ memberId, difficulty = 'easy', onComplete, callbackUrl, onBack, musicMuted, onToggleMusic }) {
  const t = useTranslation();
  const tl = t.games['letter-count'];
  const { fireComplete: fireCallback } = useGameCallback({ memberId, gameId: 'letter-count', callbackUrl, onComplete });
  return (
    <GameShell
      startCountdown
      gameId="letter-count"
      title={tl.title}
      instructions={difficulty === 'hard' ? `${tl.instructions} ${tl.instructionsHard}` : tl.instructions}
      difficulty={difficulty}
      timeLimits={TIME_LIMITS}
      flushTop
      onGameComplete={fireCallback}
      onBack={onBack}
      musicMuted={musicMuted}
      onToggleMusic={onToggleMusic}
    >
      {({ onComplete: sc, reportScore, reportRound, difficulty: diff, playClick, playSuccess, playFail, playPop, countingDown }) => (
        <LetterCountGame
          countingDown={countingDown}
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

LetterCount.propTypes = {
  memberId:      PropTypes.string.isRequired,
  difficulty:    PropTypes.oneOf(['easy', 'medium', 'hard']),
  onComplete:    PropTypes.func.isRequired,
  callbackUrl:   PropTypes.string,
  onBack:        PropTypes.func,
  musicMuted:    PropTypes.bool,
  onToggleMusic: PropTypes.func,
};
