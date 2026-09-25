import { useState, useEffect, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import { GameShell } from '../../components/GameShell/GameShell';
import { useGameCallback } from '../../hooks/useGameCallback';
import { GAME_IDS } from '../../utils/gameIds';
import styles from './DailyArithmetic.module.css';
import { useTranslation } from '../../i18n/useTranslation';

/*
 * DailyArithmetic — everyday money maths at the shop.
 * (Plain sums now live in Quick Maths; this game is about real-life use.)
 *
 * Question kinds:
 *   total  — two items: how much altogether?        (every level)
 *   each   — one item costs X each: how much for N? (medium, hard)
 *   change — you pay with a note: how much change?  (medium, hard)
 *   total3 — three items altogether                 (hard)
 *   half   — half price today: how much now?        (hard)
 *
 * Tuned for seniors:
 * - Prices use the player's money (RM, $, Rp — via i18n `money`).
 * - Items and names are shared with Shopping List's translated items.
 * - No clock. A wrong answer shows the working ("RM3 + RM2 = RM5").
 * - Combo: correct answers in a row, x2 at 5, x3 at 10.
 */
const DIFFICULTY_CONFIG = {
  easy:   { questions: 8,  kinds: ['total'],                              price: [1, 9] },
  medium: { questions: 10, kinds: ['total', 'each', 'change'],            price: [2, 15] },
  hard:   { questions: 12, kinds: ['total', 'each', 'change', 'total3', 'half'], price: [3, 25] },
};
const NOTES = [10, 20, 50, 100];
const ITEMS = [
  ['rice', '🍚'], ['noodles', '🍜'], ['bread', '🍞'], ['eggs', '🥚'], ['milk', '🥛'],
  ['fish', '🐟'], ['chicken', '🍗'], ['bananas', '🍌'], ['apples', '🍎'], ['oranges', '🍊'],
  ['mangoes', '🥭'], ['tomatoes', '🍅'], ['carrots', '🥕'], ['cabbage', '🥬'], ['coconut', '🥥'],
  ['tea', '🍵'], ['coffee', '☕'], ['biscuits', '🍪'], ['cheese', '🧀'], ['juice', '🧃'],
];

export function comboMultiplier(streak) {
  if (streak >= 10) return 3;
  if (streak >= 5) return 2;
  return 1;
}

const rand = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
function pickItems(n) {
  const a = [...ITEMS];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n).map(([id, emoji]) => ({ id, emoji }));
}

export function makeQuestion(config) {
  const kind = pick(config.kinds);
  const [lo, hi] = config.price;
  if (kind === 'total' || kind === 'total3') {
    const items = pickItems(kind === 'total' ? 2 : 3).map(it => ({ ...it, price: rand(lo, hi) }));
    const answer = items.reduce((s, it) => s + it.price, 0);
    return { kind, items, answer, work: (m) => `${items.map(i => m(i.price)).join(' + ')} = ${m(answer)}` };
  }
  if (kind === 'each') {
    const [item] = pickItems(1);
    const price = rand(lo, Math.min(hi, 12));
    const count = rand(2, 5);
    return { kind, items: [{ ...item, price }], count, answer: price * count, work: (m) => `${count} × ${m(price)} = ${m(price * count)}` };
  }
  if (kind === 'change') {
    const items = pickItems(2).map(it => ({ ...it, price: rand(lo, hi) }));
    const cost = items[0].price + items[1].price;
    const paid = NOTES.find(n => n > cost) ?? cost + 10;
    return { kind, items, paid, answer: paid - cost, work: (m) => `${m(paid)} − ${m(cost)} = ${m(paid - cost)}` };
  }
  // half price: an even price so the answer is whole
  const [item] = pickItems(1);
  const price = rand(Math.ceil(lo / 2), Math.floor(hi / 2)) * 2;
  return { kind, items: [{ ...item, price }], answer: price / 2, work: (m) => `${m(price)} ÷ 2 = ${m(price / 2)}` };
}

// Believable wrong answers: off by one or two, and classic slips.
export function makeOptions(q) {
  const a = q.answer;
  const cands = [a + 1, a - 1, a + 2, a - 2, a + 10, a - 10, a + 5];
  if (q.kind === 'change') cands.unshift(q.paid - q.items[0].price, q.items[0].price + q.items[1].price);
  if (q.kind === 'each') cands.unshift(q.items[0].price + q.count);
  if (q.kind === 'half') cands.unshift(q.items[0].price * 2);
  const wrong = [];
  for (const c of cands) {
    if (c !== a && c > 0 && !wrong.includes(c)) wrong.push(c);
    if (wrong.length === 3) break;
  }
  const opts = [a, ...wrong];
  for (let i = opts.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [opts[i], opts[j]] = [opts[j], opts[i]];
  }
  return opts;
}

export function perfectScore(config) {
  let total = 0;
  for (let i = 1; i <= config.questions; i++) total += comboMultiplier(i);
  return total;
}

function ArithmeticGame({ countingDown = false, difficulty, onComplete, reportScore, reportRound, playClick, playSuccess, playFail }) {
  const t = useTranslation();
  const td = t.games['daily-arithmetic'];
  const items = t.games['shopping-list'].items;
  const money = (n) => td.money.replace('{n}', n);
  const config = DIFFICULTY_CONFIG[difficulty] ?? DIFFICULTY_CONFIG.easy;

  const [index, setIndex] = useState(0);
  const [q, setQ] = useState(() => { const x = makeQuestion(config); return { ...x, options: makeOptions(x) }; });
  const [picked, setPicked] = useState(null);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [popup, setPopup] = useState(null);

  const scoreRef = useRef(0);
  const streakRef = useRef(0);
  const doneRef = useRef(false);
  const timersRef = useRef(new Set());
  const reported = useRef(-1);

  useEffect(() => {
    const timers = timersRef.current;
    return () => { timers.forEach(clearTimeout); timers.clear(); };
  }, []);
  useEffect(() => {
    if (countingDown || reported.current === index) return;
    reported.current = index;
    reportRound?.(index + 1, config.questions);
  }, [countingDown, index, config.questions, reportRound]);

  const choose = useCallback((val) => {
    if (countingDown || picked !== null || doneRef.current) return;
    playClick();
    setPicked(val);
    const correct = val === q.answer;
    if (correct) {
      streakRef.current += 1;
      const m = comboMultiplier(streakRef.current);
      scoreRef.current += m;
      setScore(scoreRef.current);
      reportScore(scoreRef.current);
      setPopup({ id: Date.now(), text: `+${m}` });
      playSuccess();
    } else {
      streakRef.current = 0;
      playFail();
    }
    setStreak(streakRef.current);
    const h = setTimeout(() => {
      timersRef.current.delete(h);
      if (doneRef.current) return;
      const n = index + 1;
      if (n >= config.questions) {
        doneRef.current = true;
        onComplete({ finalScore: scoreRef.current, maxScore: Math.max(perfectScore(config), scoreRef.current), completed: true });
        return;
      }
      const x = makeQuestion(config);
      setIndex(n);
      setQ({ ...x, options: makeOptions(x) });
      setPicked(null);
      setPopup(null);
    }, correct ? 1000 : 2600);
    timersRef.current.add(h);
  }, [countingDown, picked, q, index, config, onComplete, reportScore, playClick, playSuccess, playFail]);

  const answered = picked !== null;
  const correct = answered && picked === q.answer;
  const mult = comboMultiplier(streak);
  const nextAt = streak >= 10 ? null : streak >= 5 ? 10 : 5;
  const prevAt = streak >= 10 ? 10 : streak >= 5 ? 5 : 0;
  const comboFill = nextAt ? (streak - prevAt) / (nextAt - prevAt) : 1;

  const question = {
    total: td.qTotal,
    total3: td.qTotal,
    each: td.qEach.replace('{n}', q.count).replace('{item}', items[q.items[0].id]),
    change: td.qChange.replace('{paid}', money(q.paid ?? 0)),
    half: td.qHalf,
  }[q.kind];

  return (
    <div className={styles.wrapper}>
      <div className={styles.infoHeader}>
        <div className={styles.hudLeft}>
          <span className={styles.roundLabel}>{t.common.question} {index + 1}/{config.questions}</span>
          <div className={`${styles.combo} ${mult > 1 ? styles[`combo${mult}`] : ''}`} aria-label={`${td.combo} ${streak}`}>
            <span className={styles.comboMult}>x{mult}</span>
            <span className={styles.comboTrack} aria-hidden="true">
              <span className={styles.comboFill} style={{ transform: `scaleX(${comboFill})` }} />
            </span>
          </div>
        </div>
        <div className={styles.infoBadge}>
          <span key={score} className={styles.infoBadgeNum}>{score}</span>
          <span className={styles.infoBadgeSub}>{td.pts}</span>
        </div>
      </div>

      <div className={styles.playArea}>
        <div key={`r${index}`} className={`${styles.receipt} ${answered ? (correct ? styles.receiptGood : styles.receiptSoft) : ''}`}>
          <span className={styles.shopName}>🛒 {td.shop}</span>
          <ul className={styles.lines}>
            {q.items.map(it => (
              <li key={it.id} className={styles.line}>
                <span className={styles.lineEmoji} aria-hidden="true">{it.emoji}</span>
                <span className={styles.lineName}>{items[it.id]}</span>
                <span className={styles.price}>
                  {q.kind === 'half' && <span className={styles.halfTag}>{td.halfTag}</span>}
                  {money(it.price)}{q.kind === 'each' ? <small className={styles.eachTag}> {td.each}</small> : null}
                </span>
              </li>
            ))}
          </ul>
          {q.kind === 'change' && <p className={styles.paid}>💵 {td.youPay.replace('{paid}', money(q.paid))}</p>}
          <p className={styles.question}>{question}</p>
          {popup && <span key={popup.id} className={styles.floatText} aria-hidden="true">{popup.text}</span>}
        </div>

        <div key={`o${index}`} className={styles.options}>
          {q.options.map((opt, i) => (
            <button
              key={opt}
              type="button"
              style={{ '--idx': i }}
              className={[
                styles.opt,
                answered && opt === q.answer ? styles.optCorrect : '',
                answered && opt === picked && opt !== q.answer ? styles.optWrong : '',
                answered && opt !== q.answer && opt !== picked ? styles.optDim : '',
              ].join(' ')}
              onClick={() => choose(opt)}
              disabled={answered}
            >
              {money(opt)}
            </button>
          ))}
        </div>

        <p className={styles.feedback} aria-live="polite">
          {answered && correct && <span className={styles.fbGood}>{t.common.correct}</span>}
          {answered && !correct && <span className={styles.fbSoft}>{td.working.replace('{sum}', q.work(money))}</span>}
          {!answered && ' '}
        </p>
      </div>
    </div>
  );
}

ArithmeticGame.propTypes = {
  countingDown: PropTypes.bool,
  difficulty:  PropTypes.string.isRequired,
  onComplete:  PropTypes.func.isRequired,
  reportScore: PropTypes.func,
  reportRound: PropTypes.func,
  playClick:   PropTypes.func.isRequired,
  playSuccess: PropTypes.func.isRequired,
  playFail:    PropTypes.func.isRequired,
};

export function DailyArithmetic({ memberId, difficulty = 'easy', onComplete, callbackUrl, onBack, musicMuted, onToggleMusic }) {
  const t = useTranslation();
  const { fireComplete } = useGameCallback({ memberId, gameId: GAME_IDS.DAILY_ARITHMETIC, callbackUrl, onComplete });

  return (
    <GameShell
      startCountdown
      gameId={GAME_IDS.DAILY_ARITHMETIC}
      title={t.games['daily-arithmetic'].title}
      instructions={t.games['daily-arithmetic'].instructions}
      difficulty={difficulty}
      timeLimits={{ easy: null, medium: null, hard: null }}
      flushTop
      onGameComplete={fireComplete}
      onBack={onBack}
      musicMuted={musicMuted}
      onToggleMusic={onToggleMusic}
    >
      {({ onComplete: shellComplete, reportScore, reportRound, difficulty: diff, playClick, playSuccess, playFail, countingDown }) => (
        <ArithmeticGame
          countingDown={countingDown}
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

DailyArithmetic.propTypes = {
  memberId: PropTypes.string.isRequired,
  difficulty: PropTypes.oneOf(['easy', 'medium', 'hard']),
  onComplete: PropTypes.func.isRequired,
  callbackUrl: PropTypes.string,
  onBack: PropTypes.func,
  musicMuted: PropTypes.bool,
  onToggleMusic: PropTypes.func,
};
