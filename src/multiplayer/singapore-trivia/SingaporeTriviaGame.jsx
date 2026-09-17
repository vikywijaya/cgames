import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { useLocalSingaporeTriviaMatch } from './useLocalSingaporeTriviaMatch';
import { QUESTION_TIME } from './singaporeTriviaEngine';
import { saveScore } from '../../utils/scoreStore';
import { buildPayload } from '../../utils/buildPayload';
import { useTranslation } from '../../i18n/useTranslation';
import styles from './SingaporeTriviaGame.module.css';

const OPTION_LETTERS = ['A', 'B', 'C', 'D'];

// Same idea as Chess's computeMaxBoardSize: grow the UI to fill the
// available viewport height instead of sitting small in a mostly-empty
// page. There's no "board" or "cards" here — just 4 stacked option rows
// per pane — so scale font-size/padding by a factor derived from how much
// vertical room the two panes + shared progress/controls strip actually
// need. Constants below are measured from a real render at scale=1 (both
// panes always show all 4 options, so unlike the card games there's no
// active/inactive asymmetry to model), including the host page's
// back-button chrome above the game container. The question text/image/
// countdown now render inside each pane (not the shared center strip — see
// AnswerPane) so PANE_HEIGHT accounts for that and CENTER_HEIGHT is back
// down to just the progress counter, answered-count line, and host
// controls.
const PAGE_CHROME_ABOVE_GAME = 60;
const PANE_HEIGHT = 250; // player card + question + 4 option rows, unscaled (measured + margin)
const CENTER_HEIGHT = 100; // progress/timer-bar/answered-count/controls strip, unscaled (measured + margin)
const BOTTOM_MARGIN = 15;
// Below 1 so the layout can actually compress, not just grow. The CSS is
// authored to fit a 375x812 phone at roughly scale 1, but a long question
// wrapping to three or four lines on a short phone (375x667) needs ~0.85 to
// stay on screen — and no amount of base-size tuning can guarantee a fit for
// every question on every device, since question length varies per round.
// Overflow matters more here than in a normal page: the two players sit on
// opposite sides of one device and share a single scroll position, so
// neither can scroll their own half into view.
const MIN_SCALE = 0.8;
const MAX_SCALE = 2;

function computeCardScale() {
  const availableHeight = Math.max(120, window.innerHeight - PAGE_CHROME_ABOVE_GAME - BOTTOM_MARGIN);

  let best = MIN_SCALE;
  for (let scale = MIN_SCALE; scale <= 3; scale += 0.02) {
    const totalHeight = PANE_HEIGHT * scale * 2 + CENTER_HEIGHT * scale;
    if (totalHeight <= availableHeight) best = scale;
    else break;
  }
  return clampScale(best);
}

function clampScale(scale) {
  return Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale));
}

// Same pill button as Chess/Xiangqi's: icon plus a short visible label
// rather than an icon-only circle, easier to scan and tap correctly for the
// senior-mobile audience. `ariaLabel` carries the fuller description while
// `label` is the short text actually shown.
function PillButton({ label, ariaLabel, tone, onClick, children }) {
  return (
    <button
      type="button"
      className={`${styles.pillBtn} ${tone === 'danger' ? styles.pillBtnDanger : ''}`}
      aria-label={ariaLabel}
      title={ariaLabel}
      onClick={onClick}
    >
      <span aria-hidden="true">{children}</span>
      <span>{label}</span>
    </button>
  );
}
PillButton.propTypes = {
  label: PropTypes.string.isRequired,
  ariaLabel: PropTypes.string.isRequired,
  tone: PropTypes.oneOf(['neutral', 'danger']),
  onClick: PropTypes.func.isRequired,
  children: PropTypes.node.isRequired,
};

// Mirrors Chess/Xiangqi's PlayerCard: avatar, name, status badge, a chip on
// the right, and the per-player action row. Chess puts the player's clock in
// that chip; trivia has no per-player clock (its countdown is the one shared
// progress bar in the center), so the chip carries the running score
// instead. `active` means "still has to answer this question" — the trivia
// equivalent of Chess's "your turn", since both seats answer at once.
function PlayerCard({ seat, name, score, statusLabel, active, onResign, onReset, t }) {
  return (
    <div className={`${styles.card} ${active ? styles.cardActive : ''}`}>
      <div className={styles.cardHeader}>
        <div className={`${styles.avatar} ${seat === 1 ? styles.avatarP2 : ''}`} aria-hidden="true">
          {seat === 0 ? 'P1' : 'P2'}
        </div>
        <div className={styles.nameCol}>
          <div className={styles.nameText}>{name}</div>
          {statusLabel && (
            <div className={styles.badgeRow}>
              <span className={`${styles.badge} ${active ? styles.badgeActive : ''}`}>{statusLabel}</span>
            </div>
          )}
        </div>
        <div className={styles.scoreChip}>
          <span className={styles.scoreIcon} aria-hidden="true">⭐</span>
          <span className={styles.scoreText}>{t.pointsChip.replace('{n}', String(score))}</span>
        </div>
      </div>
      <div className={styles.actionsRow}>
        <PillButton label={t.resign} ariaLabel={t.resign} tone="danger" onClick={onResign}>⚑</PillButton>
        <PillButton label={t.resetGame} ariaLabel={t.resetGame} onClick={onReset}>↻</PillButton>
      </div>
    </div>
  );
}
PlayerCard.propTypes = {
  seat: PropTypes.oneOf([0, 1]).isRequired,
  name: PropTypes.string.isRequired,
  score: PropTypes.number.isRequired,
  statusLabel: PropTypes.string,
  active: PropTypes.bool.isRequired,
  onResign: PropTypes.func.isRequired,
  onReset: PropTypes.func.isRequired,
  t: PropTypes.object.isRequired,
};

function AnswerPane({ seat, name, gameState, dispatch, t, rotated, started, ready, onReady, onResignRequest, onResetRequest }) {
  const myAnswer = gameState.answers[seat];
  const phase = gameState.phase;
  const canAnswer = started && phase === 'question' && myAnswer === null;
  const revealed = phase === 'reveal' || phase === 'finished';
  const question = gameState.currentQuestion;

  // The status badge under the name replaces the old free-floating
  // "Pick an answer!" / "Answered" notes below the options. On reveal it
  // shows what this player just earned, so each card carries its own
  // outcome rather than only the running total.
  const pointsThisQuestion = gameState.pointsGained?.[seat] || 0;
  let statusLabel = null;
  // answeredShort, not answeredWaiting — the full "✓ Answered — waiting…"
  // wraps to a second line inside the badge, which grows both cards enough
  // to push the last answer option off a 375x812 viewport. Same reason
  // Chess carries undoShort/offerDrawShort alongside its full labels.
  if (phase === 'question') statusLabel = myAnswer === null ? t.tapToAnswer : t.answeredShort;
  else if (revealed && pointsThisQuestion > 0) statusLabel = `+${pointsThisQuestion}`;

  return (
    <div className={`${styles.paneSlot} ${rotated ? styles.paneRotated : ''}`}>
      <div className={styles.pane}>
        {/* The question is duplicated into each pane rather than shown once
            in the shared center strip, because only this pane's own wrapper
            carries the 180deg rotation for whichever player is sitting on
            the "flipped" side — a single shared center copy would always
            read upside-down to that player. The countdown itself is a
            progress bar (not text), so it doesn't have the same
            upside-down-reading problem — it lives once in the center strip
            instead of being duplicated here. */}
        {question && (phase === 'question' || revealed) && (
          <div className={styles.question}>
            <p className={styles.questionText}>{question.text}</p>
            {question.imageUrl && (
              <img className={styles.questionImage} src={question.imageUrl} alt="" />
            )}
          </div>
        )}
        {question && (phase === 'question' || revealed) && (
          <div className={styles.options}>
            {question.options.map((text, idx) => {
              const isCorrect = revealed && idx === question.correctIndex;
              const iSelected = myAnswer === idx;
              const isWrong = revealed && iSelected && idx !== question.correctIndex;
              return (
                <button
                  key={idx}
                  type="button"
                  className={`${styles.optionBtn} ${isCorrect ? styles.correct : ''} ${isWrong ? styles.wrong : ''} ${!revealed && iSelected ? styles.selected : ''}`}
                  disabled={!canAnswer}
                  onClick={() => dispatch('submit_answer', { seat, answerIndex: idx })}
                >
                  {OPTION_LETTERS[idx]}) {text}
                </button>
              );
            })}
          </div>
        )}
        {/* The card sits after the options so it reads as the footer of this
            player's own half — and because .paneSlot carries the 180deg
            rotation for the flipped side, DOM-last lands visually below the
            options for BOTH players from where each of them is sitting.
            Resign/Reset live on both cards whenever the match isn't over —
            unlike Chess/Xiangqi/Gin Rummy/Crazy Eights, trivia has no strict
            turn order (both seats can answer the same question at once), so
            gating them to "whoever is on turn" doesn't apply here. Do not
            change this to an isActive-style gate without re-checking this.
            Both open a confirmation modal (owned by the parent) rather than
            dispatching immediately, matching chess/xiangqi's flow. */}
        <PlayerCard
          seat={seat}
          name={name}
          score={gameState.scores[seat] || 0}
          statusLabel={statusLabel}
          active={canAnswer}
          onResign={() => onResignRequest(seat)}
          onReset={onResetRequest}
          t={t}
        />
      </div>
      {/* Covers this pane until BOTH players are ready, not just this one —
          tapping only reveals this side's own confirmation, so a solo
          "I'm ready" doesn't peek at the other side's pane underneath. Same
          convention as the Chess/Xiangqi ready cover. */}
      {!started && (
        <div className={styles.readyCover}>
          <button
            type="button"
            className={`${styles.readyBtn} ${ready ? styles.readyBtnConfirmed : ''}`}
            disabled={ready}
            onClick={onReady}
          >
            {ready ? `✓ ${t.readyConfirmed.replace('{name}', name)}` : t.readyButton.replace('{name}', name)}
          </button>
        </div>
      )}
    </div>
  );
}
AnswerPane.propTypes = {
  seat: PropTypes.oneOf([0, 1]).isRequired,
  name: PropTypes.string.isRequired,
  gameState: PropTypes.object.isRequired,
  dispatch: PropTypes.func.isRequired,
  t: PropTypes.object.isRequired,
  rotated: PropTypes.bool,
  started: PropTypes.bool.isRequired,
  ready: PropTypes.bool.isRequired,
  onReady: PropTypes.func.isRequired,
  onResignRequest: PropTypes.func.isRequired,
  onResetRequest: PropTypes.func.isRequired,
};

export function SingaporeTriviaGame({ memberId, callbackUrl, accessToken }) {
  const t = useTranslation().multiplayer;
  const { gameState, lastGameOver, players, dispatch } = useLocalSingaporeTriviaMatch();
  const startedAtRef = useRef(Date.now());
  const reportedRef = useRef(false);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [resignSeat, setResignSeat] = useState(null); // null | 0 | 1
  const [cardScale, setCardScale] = useState(computeCardScale);
  const gameRef = useRef(null);
  const rescaleAttemptsRef = useRef(0);

  // The quiz only begins once both seats have confirmed ready — see the
  // ready covers in AnswerPane. Resetting re-arms both flags so a fresh
  // match needs a fresh ready-up too, same as Chess/Xiangqi.
  const [readyP1, setReadyP1] = useState(false);
  const [readyP2, setReadyP2] = useState(false);
  const started = readyP1 && readyP2;

  useEffect(() => {
    const onResize = () => setCardScale(computeCardScale());
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);

  // Mark the actual start of play once both seats are ready, so the
  // reported play duration measures real game time rather than however
  // long the ready screen sat open. Re-fires after a reset re-arms both
  // ready flags for the next match.
  useEffect(() => {
    if (started) startedAtRef.current = Date.now();
  }, [started]);

  useEffect(() => {
    if (!lastGameOver || reportedRef.current) return;
    reportedRef.current = true;

    const score = gameState.scores[0] || 0;
    const maxScore = (gameState.totalQuestions || 0) * 3;
    const pct = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
    const durationSeconds = Math.round((Date.now() - startedAtRef.current) / 1000);

    saveScore('mp-singapore-trivia', pct, durationSeconds, memberId, null);

    const payload = buildPayload({
      memberId, gameId: 'mp-singapore-trivia',
      score, maxScore,
      completed: true, durationSeconds,
    });
    window.parent.postMessage({ type: 'GAME_COMPLETE', payload }, '*');

    if (!callbackUrl) return;
    const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
    if (accessToken) headers['Access-Token'] = accessToken;
    fetch(callbackUrl, { method: 'POST', headers, body: JSON.stringify(payload) })
      .catch(e => console.warn('[SingaporeTriviaGame] callback failed:', e));
  }, [lastGameOver, gameState, memberId, callbackUrl, accessToken]);

  const p1 = players[0];
  const p2 = players[1];
  const { phase, currentQuestion, scores = [0, 0] } = gameState;

  // computeCardScale() above is only an opening estimate: its constants are
  // measured from the question phase, so every other phase (waiting, reveal,
  // game over) renders shorter content at that same scale and leaves a band
  // of dead space at the bottom. Question text also wraps to a different
  // number of lines per question, which no fixed constant can model. So after
  // each layout, measure what actually rendered and re-solve for the scale
  // that fills the viewport. The 2% epsilon is what stops this from
  // oscillating when a rescale re-wraps the question by a line.
  //
  // confirmingReset/resignSeat are deliberately NOT in the dependency array:
  // both render via .modalOverlay, which is position: fixed (see the CSS),
  // so opening/closing them never changes gameRef's actual flow height and
  // never needs a rescale. Including them previously meant every modal
  // open/close re-ran this effect; combined with `cardScale` also being a
  // dependency (so every correction re-triggers itself), a rescale that
  // didn't fully converge within the 2% epsilon could re-fire forever and
  // hit React's "Maximum update depth exceeded" limit. The rescaleAttempts
  // cap below is a second, independent safety net: even if some future
  // change reintroduces a non-converging measurement (e.g. a scale that
  // flips text wrapping back and forth), this guarantees the effect gives up
  // after a bounded number of corrections per layout-affecting change
  // instead of looping indefinitely.
  //
  // That cap is deliberately asymmetric — it limits growth only. Growth is
  // the direction that oscillates: a bigger scale can re-wrap the question
  // onto another line, which grows the height, which asks to shrink again.
  // Shrinking is what resolves an actual overflow, is monotonic, and is
  // bounded below by MIN_SCALE (once clamped there, ideal === cardScale and
  // the epsilon check stops it), so it always terminates on its own.
  // Capping it too would let the effect give up mid-overshoot and leave the
  // game overflowing the viewport, which is exactly what this whole
  // mechanism exists to prevent.
  useLayoutEffect(() => {
    rescaleAttemptsRef.current = 0;
  }, [phase, currentQuestion, lastGameOver, started]);

  useLayoutEffect(() => {
    const el = gameRef.current;
    if (!el) return;
    const height = el.getBoundingClientRect().height;
    if (height <= 0) return;
    const available = Math.max(120, window.innerHeight - PAGE_CHROME_ABOVE_GAME - BOTTOM_MARGIN);
    const ideal = clampScale(cardScale * (available / height));
    if (Math.abs(ideal - cardScale) / cardScale <= 0.02) return;

    const growing = ideal > cardScale;
    if (growing) {
      if (rescaleAttemptsRef.current >= 5) return;
      rescaleAttemptsRef.current += 1;
    }
    setCardScale(ideal);
  }, [cardScale, phase, currentQuestion, lastGameOver, started]);

  const ranked = players
    .map((p, i) => ({ name: p.name, score: scores[i] || 0, seat: i }))
    .sort((a, b) => {
      // On a genuine score tie (e.g. a resign before any points were
      // scored), fall back to whichever seat lastGameOver names as the
      // winner, so the medal list never contradicts the trophy header.
      if (b.score !== a.score) return b.score - a.score;
      if (lastGameOver && a.seat === lastGameOver.winner) return -1;
      if (lastGameOver && b.seat === lastGameOver.winner) return 1;
      return 0;
    });

  const handleReady = (seat) => {
    if (seat === 0) setReadyP1(true);
    else setReadyP2(true);
  };

  // Shared by both the Reset-confirm modal and the game-over "Play Again"
  // button — same convention as Chess/Xiangqi's handleReset, which both
  // paths funnel through so a fresh match always re-arms the ready gate
  // too (dispatching 'play_again' alone, without re-arming readyP1/readyP2,
  // would leave `started` true and skip straight past the ready cover).
  const handlePlayAgain = () => {
    startedAtRef.current = Date.now();
    reportedRef.current = false;
    dispatch('play_again', {});
    setConfirmingReset(false);
    setReadyP1(false);
    setReadyP2(false);
  };

  const handleConfirmResign = () => {
    if (resignSeat === null) return;
    dispatch('resign', { seat: resignSeat });
    setResignSeat(null);
  };

  const resignName = resignSeat !== null ? players[resignSeat].name : '';

  return (
    <div ref={gameRef} className={styles.game} style={{ '--card-scale': cardScale }}>
      <AnswerPane
        seat={1} name={p2.name} gameState={gameState} dispatch={dispatch} t={t} rotated
        started={started} ready={readyP2} onReady={() => handleReady(1)}
        onResignRequest={setResignSeat} onResetRequest={() => setConfirmingReset(true)}
      />

      <div className={styles.center}>
        <div className={styles.progress}>
          {t.questionProgress.replace('{current}', String(gameState.questionIndex + 1)).replace('{total}', String(gameState.totalQuestions))}
        </div>

        {/* The question text/image itself is rendered inside each AnswerPane
            (see there for why) so it's never upside-down for whichever
            player sits on the rotated side. The countdown is a bar, not
            text, so it has no "upside-down" reading problem — one shared
            copy lives here instead of being duplicated per pane. */}
        {phase === 'question' && (
          <div className={styles.timerBar} role="progressbar" aria-label={t.timeRemaining} aria-valuemin={0} aria-valuemax={QUESTION_TIME} aria-valuenow={gameState.timeLeft}>
            <div
              className={`${styles.timerBarFill} ${gameState.timeLeft <= 5 ? styles.timerBarFillLow : ''}`}
              style={{ transform: `scaleX(${Math.max(0, gameState.timeLeft / QUESTION_TIME)})` }}
            />
          </div>
        )}

        {phase === 'question' && currentQuestion && (
          // Live "who still has to answer" indicator. Only meaningful while
          // the question is open — once we're in reveal the count is frozen
          // at whatever it was when the timer ran out, which reads as a
          // stale "1 / 2 answered" next to the revealed answer.
          <p className={styles.answeredCount}>
            {t.answeredCount
              .replace('{n}', String(gameState.answeredCount))
              .replace('{total}', String(gameState.playerCount))}
          </p>
        )}

        {!lastGameOver && started && (
          <div className={styles.hostControls}>
            {phase === 'waiting' && (
              <button type="button" className={styles.pillBtnPrimary} onClick={() => dispatch('start_question', {})}>{t.nextQuestion}</button>
            )}
            {phase === 'question' && (
              <button type="button" className={styles.pillBtnPrimary} onClick={() => dispatch('reveal', {})}>{t.reveal}</button>
            )}
            {phase === 'reveal' && gameState.questionIndex < gameState.totalQuestions - 1 && (
              <button type="button" className={styles.pillBtnPrimary} onClick={() => dispatch('start_question', {})}>{t.nextQuestion}</button>
            )}
            {phase === 'reveal' && gameState.questionIndex >= gameState.totalQuestions - 1 && (
              <button type="button" className={styles.pillBtnPrimary} onClick={() => dispatch('next_question', {})}>{t.finish}</button>
            )}
          </div>
        )}

        {!lastGameOver && !started && (
          <p className={styles.waitingNote}>{t.passAndPlayIntro}</p>
        )}

        {lastGameOver && (
          <div className={styles.modalOverlay}>
            <div className={styles.modalSheet}>
              <div className={styles.modalCard}>
                <div className={styles.modalTitle}>{t.trophyNamedWins.replace('{name}', players[lastGameOver.winner].name)}</div>
                {ranked.map((p, i) => (
                  <div key={p.seat} className={styles.resultRow}>
                    {i === 0 ? '🥇' : '🥈'} {p.name}{t.pointsSuffix.replace('{n}', p.score)}
                  </div>
                ))}
                <p className={styles.modalBody}>{lastGameOver.reason}</p>
                <div className={styles.modalActions}>
                  <button className={styles.primaryBtn} onClick={handlePlayAgain}>{t.playAgain}</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {!lastGameOver && confirmingReset && (
          <div className={styles.modalOverlay}>
            <div className={styles.modalSheet}>
              <div className={styles.modalCard}>
                <div className={styles.modalTitle}>{t.resetConfirmTitle}</div>
                <p className={styles.modalBody}>{t.resetConfirmBody}</p>
                <div className={styles.modalActions}>
                  <button className={styles.primaryBtn} onClick={handlePlayAgain}>{t.resetConfirmYes}</button>
                  <button className={styles.outlineBtn} onClick={() => setConfirmingReset(false)}>{t.resetConfirmCancel}</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {!lastGameOver && resignSeat !== null && (
          <div className={styles.modalOverlay}>
            <div className={styles.modalSheet}>
              <div className={styles.modalCard}>
                <div className={styles.modalTitle}>{t.resignModalTitle.replace('{name}', resignName)}</div>
                <p className={styles.modalBody}>{t.resignModalBody}</p>
                <div className={styles.modalActions}>
                  <button className={styles.primaryBtn} onClick={handleConfirmResign}>{t.resignModalConfirm}</button>
                  <button className={styles.outlineBtn} onClick={() => setResignSeat(null)}>{t.resetConfirmCancel}</button>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>

      <AnswerPane
        seat={0} name={p1.name} gameState={gameState} dispatch={dispatch} t={t}
        started={started} ready={readyP1} onReady={() => handleReady(0)}
        onResignRequest={setResignSeat} onResetRequest={() => setConfirmingReset(true)}
      />
    </div>
  );
}

SingaporeTriviaGame.propTypes = {
  memberId: PropTypes.string.isRequired,
  callbackUrl: PropTypes.string,
  accessToken: PropTypes.string,
};
