import { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { useLocalSingaporeTriviaMatch } from './useLocalSingaporeTriviaMatch';
import { saveScore } from '../../utils/scoreStore';
import { buildPayload } from '../../utils/buildPayload';
import { useTranslation } from '../../i18n/useTranslation';
import styles from './SingaporeTriviaGame.module.css';

const OPTION_LETTERS = ['A', 'B', 'C', 'D'];

function AnswerPane({ seat, name, gameState, dispatch, t }) {
  const myAnswer = gameState.answers[seat];
  const phase = gameState.phase;
  const canAnswer = phase === 'question' && myAnswer === null;
  const revealed = phase === 'reveal' || phase === 'finished';
  const question = gameState.currentQuestion;

  return (
    <div className={styles.pane}>
      <div className={styles.panel}>
        {name} ({seat === 0 ? 'p1' : 'p2'}){t.pointsSuffix.replace('{n}', gameState.scores[seat] || 0)}
      </div>
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
      {phase === 'question' && myAnswer !== null && (
        <p className={styles.waitingNote}>{t.answeredWaiting}</p>
      )}
      {phase === 'question' && myAnswer === null && (
        <p className={styles.waitingNote}>{t.tapToAnswer}</p>
      )}
      {/* Resign is available on both panes whenever the match isn't over —
          unlike Chess/Xiangqi/Gin Rummy/Crazy Eights, trivia has no strict
          turn order (both seats can answer the same question at once), so
          gating Resign to "whoever is on turn" doesn't apply here. Do not
          change this to an isActive-style gate without re-checking this. */}
      {!gameState.isGameOver && (
        <button type="button" className={styles.resignBtn} onClick={() => dispatch('resign', { seat })}>
          {t.resign}
        </button>
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
};

export function SingaporeTriviaGame({ memberId, callbackUrl, accessToken }) {
  const t = useTranslation().multiplayer;
  const { gameState, lastGameOver, players, dispatch } = useLocalSingaporeTriviaMatch();
  const startedAtRef = useRef(Date.now());
  const reportedRef = useRef(false);
  const [confirmingReset, setConfirmingReset] = useState(false);

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

  const ranked = players
    .map((p, i) => ({ name: p.name, score: scores[i] || 0, seat: i }))
    .sort((a, b) => b.score - a.score);

  const handleConfirmReset = () => {
    startedAtRef.current = Date.now();
    reportedRef.current = false;
    dispatch('play_again', {});
    setConfirmingReset(false);
  };

  return (
    <div className={styles.game}>
      <div className={styles.progress}>
        {t.questionProgress.replace('{current}', String(gameState.questionIndex + 1)).replace('{total}', String(gameState.totalQuestions))}
      </div>

      {phase === 'question' && <p className={styles.timer}>⏱ {gameState.timeLeft}s</p>}

      {(phase === 'question' || phase === 'reveal') && currentQuestion && (
        <div className={styles.question}>
          <p className={styles.questionText}>{currentQuestion.text}</p>
          {currentQuestion.imageUrl && (
            <img className={styles.questionImage} src={currentQuestion.imageUrl} alt="" />
          )}
          <p className={styles.answeredCount}>{gameState.answeredCount} / {gameState.playerCount} answered</p>
        </div>
      )}

      {!lastGameOver && (
        <div className={styles.hostControls}>
          {phase === 'waiting' && (
            <button type="button" className={styles.actionBtn} onClick={() => dispatch('start_question', {})}>{t.nextQuestion}</button>
          )}
          {phase === 'question' && (
            <button type="button" className={styles.actionBtn} onClick={() => dispatch('reveal', {})}>{t.reveal}</button>
          )}
          {phase === 'reveal' && gameState.questionIndex < gameState.totalQuestions - 1 && (
            <button type="button" className={styles.actionBtn} onClick={() => dispatch('start_question', {})}>{t.nextQuestion}</button>
          )}
          {phase === 'reveal' && gameState.questionIndex >= gameState.totalQuestions - 1 && (
            <button type="button" className={styles.actionBtn} onClick={() => dispatch('next_question', {})}>{t.finish}</button>
          )}
        </div>
      )}

      <div className={styles.panes}>
        <AnswerPane seat={0} name={p1.name} gameState={gameState} dispatch={dispatch} t={t} />
        <AnswerPane seat={1} name={p2.name} gameState={gameState} dispatch={dispatch} t={t} />
      </div>

      {lastGameOver && (
        <div className={styles.gameOver}>
          <h3>{t.trophyNamedWins.replace('{name}', players[lastGameOver.winner].name)}</h3>
          {ranked.map((p, i) => (
            <div key={p.seat} className={styles.resultRow}>
              {i === 0 ? '🥇' : '🥈'} {p.name}{t.pointsSuffix.replace('{n}', p.score)}
            </div>
          ))}
          <p>{lastGameOver.reason}</p>
          <button className={styles.primaryBtn} onClick={() => dispatch('play_again', {})}>{t.playAgain}</button>
        </div>
      )}
      {!lastGameOver && confirmingReset && (
        <div className={styles.gameOver}>
          <h3>{t.resetConfirmTitle}</h3>
          <p>{t.resetConfirmBody}</p>
          <div className={styles.confirmActions}>
            <button className={styles.primaryBtn} onClick={handleConfirmReset}>{t.resetConfirmYes}</button>
            <button className={styles.resignBtn} onClick={() => setConfirmingReset(false)}>{t.resetConfirmCancel}</button>
          </div>
        </div>
      )}
      {!lastGameOver && !confirmingReset && (
        <button type="button" className={styles.resignBtn} onClick={() => setConfirmingReset(true)}>{t.resetGame}</button>
      )}
    </div>
  );
}

SingaporeTriviaGame.propTypes = {
  memberId: PropTypes.string.isRequired,
  callbackUrl: PropTypes.string,
  accessToken: PropTypes.string,
};
