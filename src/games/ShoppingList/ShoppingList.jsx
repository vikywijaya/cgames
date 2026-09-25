import { useState, useEffect, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import { GameShell } from '../../components/GameShell/GameShell';
import { useGameCallback } from '../../hooks/useGameCallback';
import styles from './ShoppingList.module.css';
import { useTranslation } from '../../i18n/useTranslation';

/*
 * ShoppingList — remember a shopping list, then pick the items off the
 * shop shelf into your basket.
 *
 * Tuned for seniors:
 * - Everyday local items (rice, noodles, fish…), with translated names.
 * - The player sets the pace: "I'm ready" ends the study time early.
 * - Partial credit: +1 per item picked correctly, -1 per item that wasn't
 *   on the list (never below 0 for a round), +2 for a perfect round. It
 *   used to be all-or-nothing per round.
 * - After each round the shelf shows what was got, forgotten and extra.
 * - The list grows by one item partway through the game.
 * - No overall clock.
 */
const DIFFICULTY_CONFIG = {
  easy:   { rounds: 6, listSize: [3, 4], extra: 4, studySec: 12 },
  medium: { rounds: 7, listSize: [4, 5], extra: 5, studySec: 14 },
  hard:   { rounds: 8, listSize: [5, 6], extra: 6, studySec: 16 },
};
const PERFECT_BONUS = 2;

// id → emoji; names come from i18n (games['shopping-list'].items).
const ITEMS = [
  ['rice', '🍚'], ['noodles', '🍜'], ['bread', '🍞'], ['eggs', '🥚'], ['milk', '🥛'],
  ['fish', '🐟'], ['chicken', '🍗'], ['salt', '🧂'], ['bananas', '🍌'], ['apples', '🍎'],
  ['oranges', '🍊'], ['mangoes', '🥭'], ['tomatoes', '🍅'], ['carrots', '🥕'], ['onions', '🧅'],
  ['cabbage', '🥬'], ['corn', '🌽'], ['coconut', '🥥'], ['tea', '🍵'], ['coffee', '☕'],
  ['sweets', '🍬'], ['chilli', '🌶️'], ['garlic', '🧄'], ['potatoes', '🥔'], ['juice', '🧃'],
  ['biscuits', '🍪'], ['cheese', '🧀'], ['grapes', '🍇'],
];

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function listSizeFor(config, round) {
  return round < Math.ceil(config.rounds / 2) ? config.listSize[0] : config.listSize[1];
}

export function buildRound(config, round) {
  const size = listSizeFor(config, round);
  const pool = shuffle(ITEMS).map(([id, emoji]) => ({ id, emoji }));
  const list = pool.slice(0, size);
  const shelf = shuffle(pool.slice(0, size + config.extra));
  return { list, shelf };
}

export function perfectScore(config) {
  let total = 0;
  for (let r = 0; r < config.rounds; r++) total += listSizeFor(config, r) + PERFECT_BONUS;
  return total;
}

function ShoppingListGame({ countingDown = false, difficulty, onComplete, reportScore, reportRound, playClick, playSuccess, playFail, playPop, playReveal }) {
  const t = useTranslation();
  const ts = t.games['shopping-list'];
  const name = (id) => ts.items[id];
  const config = DIFFICULTY_CONFIG[difficulty] ?? DIFFICULTY_CONFIG.easy;

  const [round, setRound]   = useState(0);
  const [data, setData]     = useState(() => buildRound(config, 0));
  const [phase, setPhase]   = useState('study'); // study | shop | review
  const [timer, setTimer]   = useState(config.studySec);
  const [basket, setBasket] = useState([]);      // item ids
  const [result, setResult] = useState(null);
  const [score, setScore]   = useState(0);

  const scoreRef = useRef(0);
  const doneRef  = useRef(false);
  const timersRef = useRef(new Set());
  const reportedRound = useRef(-1);

  const later = useCallback((fn, ms) => {
    const h = setTimeout(() => { timersRef.current.delete(h); fn(); }, ms);
    timersRef.current.add(h);
  }, []);
  useEffect(() => {
    const timers = timersRef.current;
    return () => { timers.forEach(clearTimeout); timers.clear(); };
  }, []);

  useEffect(() => {
    if (reportedRound.current === round) return;
    reportedRound.current = round;
    reportRound?.(round + 1, config.rounds);
  }, [round, config.rounds, reportRound]);

  // Study countdown, held during the shell's 3-2-1.
  useEffect(() => {
    if (countingDown || phase !== 'study') return undefined;
    if (timer <= 0) { setPhase('shop'); playReveal?.(); return undefined; }
    const id = setTimeout(() => setTimer(s => s - 1), 1000);
    return () => clearTimeout(id);
  }, [countingDown, phase, timer, playReveal]);

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    onComplete({ finalScore: scoreRef.current, maxScore: Math.max(perfectScore(config), scoreRef.current), completed: true });
  }, [onComplete, config]);

  const toggle = useCallback((id) => {
    if (phase !== 'shop') return;
    setBasket(b => {
      if (b.includes(id)) { playClick(); return b.filter(x => x !== id); }
      playPop?.();
      return [...b, id];
    });
  }, [phase, playClick, playPop]);

  const checkout = useCallback(() => {
    if (phase !== 'shop') return;
    const listIds = new Set(data.list.map(i => i.id));
    const got = basket.filter(id => listIds.has(id)).length;
    const extra = basket.filter(id => !listIds.has(id)).length;
    const missed = data.list.length - got;
    const perfect = missed === 0 && extra === 0;
    const gained = Math.max(0, got - extra) + (perfect ? PERFECT_BONUS : 0);
    scoreRef.current += gained;
    setScore(scoreRef.current);
    reportScore(scoreRef.current);
    setResult({ got, missed, extra, perfect, gained });
    setPhase('review');
    if (got > 0) playSuccess(); else playFail();
  }, [phase, data, basket, reportScore, playSuccess, playFail]);

  const nextRound = useCallback(() => {
    const nr = round + 1;
    if (nr >= config.rounds) { finish(); return; }
    setRound(nr);
    setData(buildRound(config, nr));
    setBasket([]);
    setResult(null);
    setTimer(config.studySec);
    setPhase('study');
  }, [round, config, finish]);

  const header = (
    <div className={styles.infoHeader}>
      <div className={styles.hudLeft}>
        <span className={styles.roundLabel}>{t.common.round} {round + 1}/{config.rounds}</span>
      </div>
      <div className={styles.infoBadge}>
        <span key={score} className={styles.infoBadgeNum}>{score}</span>
        <span className={styles.infoBadgeSub}>{ts.pts}</span>
      </div>
    </div>
  );

  if (phase === 'study') {
    return (
      <div className={styles.wrapper}>
        {header}
        <div className={styles.playArea}>
          <p className={styles.prompt}>📝 {ts.remember}</p>
          <div className={styles.paper}>
            <span className={styles.paperTitle}>{ts.listTitle}</span>
            <ul className={styles.paperList}>
              {data.list.map((item, i) => (
                <li key={item.id} className={styles.paperItem} style={{ '--idx': i }}>
                  <span className={styles.paperEmoji} aria-hidden="true">{item.emoji}</span>
                  {name(item.id)}
                </li>
              ))}
            </ul>
          </div>
          <div className={styles.studyBar} aria-hidden="true">
            <span className={styles.studyFill} style={{ transform: `scaleX(${timer / config.studySec})` }} />
          </div>
          <button type="button" className={styles.primaryBtn} onClick={() => { playClick(); setTimer(0); }} disabled={countingDown}>
            {ts.ready} <span className={styles.btnChip}>{timer}s</span>
          </button>
        </div>
      </div>
    );
  }

  const listIds = new Set(data.list.map(i => i.id));
  const reviewing = phase === 'review';

  return (
    <div className={styles.wrapper}>
      {header}
      <div className={styles.playArea}>
        <p className={styles.prompt}>🛒 {reviewing ? ts.howYouDid : ts.pick}</p>

        <div className={styles.shelf}>
          {data.shelf.map((item, i) => {
            const inBasket = basket.includes(item.id);
            const onList = listIds.has(item.id);
            const cls = [
              styles.item,
              inBasket && !reviewing ? styles.itemPicked : '',
              reviewing && inBasket && onList ? styles.itemGot : '',
              reviewing && inBasket && !onList ? styles.itemExtra : '',
              reviewing && !inBasket && onList ? styles.itemMissed : '',
              reviewing && !inBasket && !onList ? styles.itemIdle : '',
            ].join(' ');
            return (
              <button
                key={item.id}
                type="button"
                className={cls}
                style={{ '--idx': i }}
                onClick={() => toggle(item.id)}
                disabled={reviewing}
                aria-pressed={inBasket}
              >
                <span className={styles.itemEmoji} aria-hidden="true">{item.emoji}</span>
                <span className={styles.itemName}>{name(item.id)}</span>
                {inBasket && !reviewing && <span className={styles.badge} aria-hidden="true">✓</span>}
                {reviewing && inBasket && onList && <span className={`${styles.badge} ${styles.badgeGood}`} aria-hidden="true">✓</span>}
                {reviewing && inBasket && !onList && <span className={`${styles.badge} ${styles.badgeBad}`} aria-hidden="true">✕</span>}
                {reviewing && !inBasket && onList && <span className={styles.missTag}>{ts.forgot}</span>}
              </button>
            );
          })}
        </div>

        {!reviewing && (
          <>
            <p className={styles.basketCount}>🧺 {ts.inBasket.replace('{n}', basket.length).replace('{total}', data.list.length)}</p>
            <button type="button" className={styles.primaryBtn} onClick={() => { playClick(); checkout(); }}>
              {ts.checkout}
            </button>
          </>
        )}
        {reviewing && result && (
          <>
            <div className={`${styles.summary} ${result.perfect ? styles.summaryPerfect : ''}`} aria-live="polite">
              {result.perfect && <strong className={styles.perfect}>{ts.perfect}</strong>}
              <span>✓ {ts.got.replace('{n}', result.got)}</span>
              {result.missed > 0 && <span>• {ts.missed.replace('{n}', result.missed)}</span>}
              {result.extra > 0 && <span>• {ts.extra.replace('{n}', result.extra)}</span>}
              <span className={styles.gained}>+{result.gained}</span>
            </div>
            <button type="button" className={styles.primaryBtn} onClick={() => { playClick(); nextRound(); }}>
              {round + 1 >= config.rounds ? ts.finish : ts.next}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

ShoppingListGame.propTypes = {
  countingDown: PropTypes.bool,
  difficulty: PropTypes.string.isRequired,
  onComplete: PropTypes.func.isRequired,
  reportScore: PropTypes.func.isRequired,
  reportRound: PropTypes.func,
  playClick: PropTypes.func.isRequired,
  playSuccess: PropTypes.func.isRequired,
  playFail: PropTypes.func.isRequired,
  playPop: PropTypes.func,
  playReveal: PropTypes.func,
};

const TIME_LIMITS = { easy: null, medium: null, hard: null };

export function ShoppingList({ memberId, difficulty = 'easy', onComplete, callbackUrl, onBack, musicMuted, onToggleMusic }) {
  const t = useTranslation();
  const { fireComplete: fireCallback } = useGameCallback({ memberId, gameId: 'shopping-list', callbackUrl, onComplete });
  return (
    <GameShell
      startCountdown
      gameId="shopping-list"
      title={t.games['shopping-list'].title}
      instructions={t.games['shopping-list'].instructions}
      difficulty={difficulty}
      timeLimits={TIME_LIMITS}
      flushTop
      onGameComplete={fireCallback}
      onBack={onBack}
      musicMuted={musicMuted}
      onToggleMusic={onToggleMusic}
    >
      {({ onComplete: sc, reportScore, reportRound, difficulty: diff, playClick, playSuccess, playFail, playPop, playReveal, countingDown }) => (
        <ShoppingListGame
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

ShoppingList.propTypes = {
  memberId: PropTypes.string.isRequired,
  difficulty: PropTypes.oneOf(['easy', 'medium', 'hard']),
  onComplete: PropTypes.func.isRequired,
  callbackUrl: PropTypes.string,
  onBack: PropTypes.func,
  musicMuted: PropTypes.bool,
  onToggleMusic: PropTypes.func,
};
