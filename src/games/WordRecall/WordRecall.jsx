import { useState, useEffect, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import { GameShell } from '../../components/GameShell/GameShell';
import { useGameCallback } from '../../hooks/useGameCallback';
import { GAME_IDS } from '../../utils/gameIds';
import styles from './WordRecall.module.css';
import { useTranslation } from '../../i18n/useTranslation';

/*
 * WordRecall — words are shown one at a time; then pick the ones you saw.
 *
 * Tuned for seniors:
 * - One word at a time, big, with a picture — like a real memory test.
 * - "Watch again" replays the list once per round.
 * - Recall is by tapping, not typing (it used to be typing against a
 *   60-second clock, which is hard on a phone).
 * - Words are translated (they were English in every language).
 * - Three rounds, the list growing each round. Hard adds "lookalike"
 *   words from the same group (a table when the list had a chair).
 * - +1 per word picked right, -1 per word that wasn't shown (never below
 *   0 for a round), +2 for a perfect round. No clock.
 */
const DIFFICULTY_CONFIG = {
  easy:   { lists: [4, 5, 6], extra: 4, flashMs: 2400, sameGroupLures: false },
  medium: { lists: [5, 6, 7], extra: 5, flashMs: 2100, sameGroupLures: false },
  hard:   { lists: [6, 7, 8], extra: 6, flashMs: 1800, sameGroupLures: true },
};
const PERFECT_BONUS = 2;
const GAP_MS = 350;

// id, emoji, group — names come from i18n (games['word-recall'].words).
const WORDS = [
  ['chair', '🪑', 'home'], ['bed', '🛏️', 'home'], ['door', '🚪', 'home'], ['lamp', '💡', 'home'],
  ['clock', '⏰', 'home'], ['key', '🔑', 'home'], ['mirror', '🪞', 'home'], ['window', '🪟', 'home'],
  ['cup', '☕', 'kitchen'], ['spoon', '🥄', 'kitchen'], ['plate', '🍽️', 'kitchen'], ['kettle', '🫖', 'kitchen'],
  ['bottle', '🍼', 'kitchen'], ['knife', '🔪', 'kitchen'],
  ['shirt', '👕', 'clothes'], ['hat', '👒', 'clothes'], ['shoe', '👟', 'clothes'], ['sock', '🧦', 'clothes'],
  ['glasses', '👓', 'clothes'], ['umbrella', '☂️', 'clothes'],
  ['dog', '🐶', 'animals'], ['cat', '🐱', 'animals'], ['bird', '🐦', 'animals'], ['fish', '🐟', 'animals'],
  ['horse', '🐴', 'animals'], ['cow', '🐮', 'animals'],
  ['tree', '🌳', 'nature'], ['flower', '🌸', 'nature'], ['sun', '☀️', 'nature'], ['moon', '🌙', 'nature'],
  ['rain', '🌧️', 'nature'], ['mountain', '⛰️', 'nature'],
  ['car', '🚗', 'travel'], ['bus', '🚌', 'travel'], ['bicycle', '🚲', 'travel'], ['boat', '⛵', 'travel'],
  ['train', '🚆', 'travel'], ['plane', '✈️', 'travel'],
  ['book', '📖', 'things'], ['phone', '📱', 'things'], ['letter', '✉️', 'things'], ['radio', '📻', 'things'],
  ['camera', '📷', 'things'], ['guitar', '🎸', 'things'],
].map(([id, emoji, group]) => ({ id, emoji, group }));

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function buildRound(config, round, used) {
  const size = config.lists[Math.min(round, config.lists.length - 1)];
  const fresh = shuffle(WORDS.filter(w => !used.has(w.id)));
  const list = (fresh.length >= size ? fresh : shuffle(WORDS)).slice(0, size);
  const listIds = new Set(list.map(w => w.id));
  const others = shuffle(WORDS.filter(w => !listIds.has(w.id)));
  let lures;
  if (config.sameGroupLures) {
    const groups = new Set(list.map(w => w.group));
    const same = others.filter(w => groups.has(w.group));
    const rest = others.filter(w => !groups.has(w.group));
    lures = [...same, ...rest].slice(0, config.extra);
  } else {
    lures = others.slice(0, config.extra);
  }
  return { list, choices: shuffle([...list, ...lures]) };
}

export function perfectScore(config) {
  return config.lists.reduce((s, n) => s + n + PERFECT_BONUS, 0);
}

function WordRecallGame({ countingDown = false, difficulty, onComplete, reportScore, reportRound, playClick, playSuccess, playFail, playPop, playReveal }) {
  const t = useTranslation();
  const tw = t.games['word-recall'];
  const name = (id) => tw.words[id];
  const config = DIFFICULTY_CONFIG[difficulty] ?? DIFFICULTY_CONFIG.easy;

  const usedRef = useRef(new Set());
  const [round, setRound] = useState(0);
  const [data, setData] = useState(() => buildRound(config, 0, usedRef.current));
  const [phase, setPhase] = useState('ready'); // ready | watch | pick | review
  const [shown, setShown] = useState(-1);       // index being flashed
  const [replays, setReplays] = useState(1);
  const [picked, setPicked] = useState([]);
  const [result, setResult] = useState(null);
  const [score, setScore] = useState(0);

  const scoreRef = useRef(0);
  const doneRef = useRef(false);
  const timersRef = useRef(new Set());
  const watchKey = useRef(null);

  const later = useCallback((fn, ms) => {
    const h = setTimeout(() => { timersRef.current.delete(h); fn(); }, ms);
    timersRef.current.add(h);
  }, []);
  useEffect(() => {
    const timers = timersRef.current;
    return () => { timers.forEach(clearTimeout); timers.clear(); };
  }, []);

  // Flash the list one word at a time.
  const watch = useCallback(() => {
    setPhase('watch');
    let at = 400;
    data.list.forEach((_, i) => {
      later(() => { setShown(i); playReveal?.(); }, at);
      at += config.flashMs;
      later(() => setShown(-1), at - GAP_MS);
    });
    later(() => setPhase('pick'), at);
  }, [data, config.flashMs, later, playReveal]);

  useEffect(() => {
    if (countingDown || phase !== 'ready' || doneRef.current) return;
    const key = `${round}`;
    if (watchKey.current === key) return;
    watchKey.current = key;
    reportRound?.(round + 1, config.lists.length);
    data.list.forEach(w => usedRef.current.add(w.id));
    watch();
  }, [countingDown, phase, round, data, config.lists.length, reportRound, watch]);

  const toggle = useCallback((id) => {
    if (phase !== 'pick') return;
    setPicked(p => {
      if (p.includes(id)) { playClick(); return p.filter(x => x !== id); }
      playPop?.();
      return [...p, id];
    });
  }, [phase, playClick, playPop]);

  const check = useCallback(() => {
    if (phase !== 'pick') return;
    playClick();
    const listIds = new Set(data.list.map(w => w.id));
    const got = picked.filter(id => listIds.has(id)).length;
    const extra = picked.length - got;
    const missed = data.list.length - got;
    const perfect = missed === 0 && extra === 0;
    const gained = Math.max(0, got - extra) + (perfect ? PERFECT_BONUS : 0);
    scoreRef.current += gained;
    setScore(scoreRef.current);
    reportScore(scoreRef.current);
    setResult({ got, extra, missed, perfect, gained });
    setPhase('review');
    if (got > 0) playSuccess(); else playFail();
  }, [phase, data, picked, reportScore, playClick, playSuccess, playFail]);

  const next = useCallback(() => {
    playClick();
    const n = round + 1;
    if (n >= config.lists.length) {
      doneRef.current = true;
      onComplete({ finalScore: scoreRef.current, maxScore: Math.max(perfectScore(config), scoreRef.current), completed: true });
      return;
    }
    setRound(n);
    setData(buildRound(config, n, usedRef.current));
    setPicked([]);
    setResult(null);
    setReplays(1);
    setPhase('ready');
  }, [round, config, onComplete, playClick]);

  const header = (
    <div className={styles.infoHeader}>
      <div className={styles.hudLeft}>
        <span className={styles.roundLabel}>{t.common.round} {round + 1}/{config.lists.length}</span>
      </div>
      <div className={styles.infoBadge}>
        <span key={score} className={styles.infoBadgeNum}>{score}</span>
        <span className={styles.infoBadgeSub}>{tw.pts}</span>
      </div>
    </div>
  );

  if (phase === 'ready' || phase === 'watch') {
    const word = shown >= 0 ? data.list[shown] : null;
    return (
      <div className={styles.wrapper}>
        {header}
        <div className={styles.playArea}>
          <p className={styles.prompt}>👀 {tw.watch.replace('{n}', data.list.length)}</p>
          <div className={styles.flashStage} aria-live="polite">
            {word && (
              <div key={`${round}-${shown}-${replays}`} className={styles.flashCard}>
                <span className={styles.flashEmoji} aria-hidden="true">{word.emoji}</span>
                <span className={styles.flashWord}>{name(word.id)}</span>
              </div>
            )}
          </div>
          <div className={styles.dots} aria-hidden="true">
            {data.list.map((_, i) => <span key={i} className={i <= shown ? styles.dotOn : styles.dot} />)}
          </div>
        </div>
      </div>
    );
  }

  const listIds = new Set(data.list.map(w => w.id));
  const reviewing = phase === 'review';
  return (
    <div className={styles.wrapper}>
      {header}
      <div className={styles.playArea}>
        <p className={styles.prompt}>{reviewing ? tw.howYouDid : `🧠 ${tw.pick}`}</p>
        <div className={styles.grid}>
          {data.choices.map((w, i) => {
            const on = picked.includes(w.id);
            const inList = listIds.has(w.id);
            return (
              <button
                key={w.id}
                type="button"
                style={{ '--idx': i }}
                className={[
                  styles.choice,
                  on && !reviewing ? styles.choiceOn : '',
                  reviewing && on && inList ? styles.choiceGot : '',
                  reviewing && on && !inList ? styles.choiceExtra : '',
                  reviewing && !on && inList ? styles.choiceMissed : '',
                  reviewing && !on && !inList ? styles.choiceIdle : '',
                ].join(' ')}
                onClick={() => toggle(w.id)}
                disabled={reviewing}
                aria-pressed={on}
              >
                <span className={styles.choiceEmoji} aria-hidden="true">{w.emoji}</span>
                <span className={styles.choiceWord}>{name(w.id)}</span>
                {reviewing && !on && inList && <span className={styles.missTag}>{tw.forgot}</span>}
              </button>
            );
          })}
        </div>

        {!reviewing ? (
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.secondaryBtn}
              onClick={() => { setReplays(r => r - 1); setPicked([]); watch(); }}
              disabled={replays <= 0}
            >
              🔁 {tw.watchAgain}
            </button>
            <button type="button" className={styles.primaryBtn} onClick={check}>
              {tw.check} ({picked.length})
            </button>
          </div>
        ) : (
          <>
            <div className={`${styles.summary} ${result.perfect ? styles.summaryPerfect : ''}`} aria-live="polite">
              {result.perfect && <strong className={styles.perfect}>{tw.perfect}</strong>}
              <span>✓ {tw.got.replace('{n}', result.got).replace('{total}', data.list.length)}</span>
              {result.extra > 0 && <span>• {tw.extra.replace('{n}', result.extra)}</span>}
              <span className={styles.gained}>+{result.gained}</span>
            </div>
            <button type="button" className={styles.primaryBtn} onClick={next}>
              {round + 1 >= config.lists.length ? tw.finish : tw.next} ›
            </button>
          </>
        )}
      </div>
    </div>
  );
}

WordRecallGame.propTypes = {
  countingDown: PropTypes.bool,
  difficulty:  PropTypes.string.isRequired,
  onComplete:  PropTypes.func.isRequired,
  reportScore: PropTypes.func,
  reportRound: PropTypes.func,
  playClick:   PropTypes.func.isRequired,
  playSuccess: PropTypes.func.isRequired,
  playFail:    PropTypes.func.isRequired,
  playPop:     PropTypes.func,
  playReveal:  PropTypes.func,
};

export function WordRecall({ memberId, difficulty = 'easy', onComplete, callbackUrl, onBack, musicMuted, onToggleMusic }) {
  const t = useTranslation();
  const { fireComplete } = useGameCallback({ memberId, gameId: GAME_IDS.WORD_RECALL, callbackUrl, onComplete });
  return (
    <GameShell
      startCountdown
      gameId={GAME_IDS.WORD_RECALL}
      title={t.games['word-recall'].title}
      instructions={difficulty === 'hard' ? `${t.games['word-recall'].instructions} ${t.games['word-recall'].instructionsHard}` : t.games['word-recall'].instructions}
      difficulty={difficulty}
      timeLimits={{ easy: null, medium: null, hard: null }}
      flushTop
      onGameComplete={fireComplete}
      onBack={onBack}
      musicMuted={musicMuted}
      onToggleMusic={onToggleMusic}
    >
      {({ onComplete: sc, reportScore, reportRound, difficulty: diff, playClick, playSuccess, playFail, playPop, playReveal, countingDown }) => (
        <WordRecallGame
          countingDown={countingDown}
          difficulty={diff}
          onComplete={sc}
          reportScore={reportScore}
          reportRound={reportRound}
          playClick={playClick}
          playSuccess={playSuccess}
          playFail={playFail}
          playPop={playPop}
          playReveal={playReveal}
        />
      )}
    </GameShell>
  );
}

WordRecall.propTypes = {
  memberId: PropTypes.string.isRequired,
  difficulty: PropTypes.oneOf(['easy', 'medium', 'hard']),
  onComplete: PropTypes.func.isRequired,
  callbackUrl: PropTypes.string,
  onBack: PropTypes.func,
  musicMuted: PropTypes.bool,
  onToggleMusic: PropTypes.func,
};
