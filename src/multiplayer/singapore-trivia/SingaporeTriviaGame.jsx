import { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { saveScore } from '../../utils/scoreStore';
import { buildPayload } from '../../utils/buildPayload';
import styles from './SingaporeTriviaGame.module.css';

const TRIVIA_COLORS = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'];
const OPTION_LETTERS = ['A', 'B', 'C', 'D'];

export function SingaporeTriviaGame({
  myName, myColor, gameState, lastGameOver, socket, memberId, callbackUrl, accessToken,
  status = 'connected', reconnectAttempt = 0, disconnectedPlayerName = null,
}) {
  const mySeat = TRIVIA_COLORS.indexOf(myColor);
  const isHost = myColor === 'p1';

  const [myAnswer, setMyAnswer] = useState(null);
  const startedAtRef = useRef(null);
  const reportedRef = useRef(false);
  const lastQuestionIndexRef = useRef(null);

  useEffect(() => {
    if (!gameState) return;
    if (startedAtRef.current === null) startedAtRef.current = Date.now();
    if (gameState.questionIndex !== lastQuestionIndexRef.current) {
      lastQuestionIndexRef.current = gameState.questionIndex;
      setMyAnswer(null);
    }
  }, [gameState]);

  useEffect(() => {
    if (!lastGameOver || reportedRef.current || !gameState) return;
    reportedRef.current = true;

    const score = gameState.scores?.[mySeat] || 0;
    const maxScore = (gameState.totalQuestions || 0) * 3;
    const pct = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
    const durationSeconds = startedAtRef.current !== null
      ? Math.round((Date.now() - startedAtRef.current) / 1000) : 0;

    saveScore('mp-singapore-trivia', pct, durationSeconds, memberId, null);

    if (!callbackUrl) return;
    const payload = buildPayload({
      memberId, gameId: 'mp-singapore-trivia',
      score, maxScore,
      completed: true, durationSeconds,
    });
    const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
    if (accessToken) headers['Access-Token'] = accessToken;
    fetch(callbackUrl, { method: 'POST', headers, body: JSON.stringify(payload) })
      .catch(e => console.warn('[SingaporeTriviaGame] callback failed:', e));
  }, [lastGameOver, gameState, mySeat, memberId, callbackUrl, accessToken]);

  if (!gameState) return null;

  const { phase, currentQuestion, players = [], scores = [], answers = [] } = gameState;

  const submitAnswer = (idx) => {
    if (myAnswer !== null || phase !== 'question') return;
    setMyAnswer(idx);
    socket.emit('trivia_answer', { answerIndex: idx });
  };

  const ranked = [...players]
    .map((p, i) => ({ name: p.name, score: scores[i] || 0, seat: i }))
    .sort((a, b) => b.score - a.score);
  const isWinner = ranked[0]?.seat === mySeat;

  return (
    <div className={styles.game}>
      <div className={styles.panel}>{myName} ({myColor})</div>

      {status === 'disconnected' && (
        <div className={styles.banner}>Reconnecting… (attempt {reconnectAttempt})</div>
      )}
      {disconnectedPlayerName && (
        <div className={styles.banner}>{disconnectedPlayerName} disconnected. Waiting…</div>
      )}

      <div className={styles.players}>
        {players.map((p, i) => (
          <div key={i} className={styles.playerChip}>
            {p.name}{p.color === myColor ? ' (you)' : ''} — {scores[i] || 0} pt
          </div>
        ))}
      </div>

      <div className={styles.progress}>Q {gameState.questionIndex + 1} / {gameState.totalQuestions}</div>

      {phase === 'waiting' && (
        <p>{isHost ? 'Click "Next Question" when everyone is ready.' : 'Waiting for host to start the next question…'}</p>
      )}

      {(phase === 'question' || phase === 'reveal') && currentQuestion && (
        <div className={styles.question}>
          <p className={styles.questionText}>{currentQuestion.text}</p>
          {phase === 'question' && <p className={styles.timer}>⏱ {gameState.timeLeft}s</p>}
          <p className={styles.answeredCount}>{gameState.answeredCount} / {gameState.playerCount} answered</p>
          <div className={styles.options}>
            {currentQuestion.options.map((text, idx) => {
              const revealed = phase === 'reveal';
              const isCorrect = revealed && idx === currentQuestion.correctIndex;
              const iSelected = answers[mySeat] === idx;
              const isWrong = revealed && iSelected && idx !== currentQuestion.correctIndex;
              return (
                <button
                  key={idx}
                  type="button"
                  className={`${styles.optionBtn} ${isCorrect ? styles.correct : ''} ${isWrong ? styles.wrong : ''} ${!revealed && iSelected ? styles.selected : ''}`}
                  disabled={revealed || myAnswer !== null}
                  onClick={() => submitAnswer(idx)}
                >
                  <span className={styles.optionLetter}>{OPTION_LETTERS[idx]}</span> {text}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {phase === 'finished' && (
        <div className={styles.results}>
          <h3>{isWinner ? '🏆 You Win!' : `🏆 ${ranked[0]?.name || '?'} Wins!`}</h3>
          {ranked.map((p, i) => (
            <div key={p.seat} className={styles.resultRow}>
              {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`} {p.name} — {p.score} pt
            </div>
          ))}
          <button className={styles.actionBtn} onClick={() => socket.emit('play_again')}>Play Again</button>
        </div>
      )}

      {isHost && phase !== 'finished' && (
        <div className={styles.hostControls}>
          {phase === 'question' && (
            <button type="button" className={styles.actionBtn} onClick={() => socket.emit('trivia_reveal')}>Reveal</button>
          )}
          {phase === 'reveal' && gameState.questionIndex < gameState.totalQuestions - 1 && (
            <button type="button" className={styles.actionBtn} onClick={() => socket.emit('trivia_next')}>Next Question</button>
          )}
          {phase === 'reveal' && gameState.questionIndex >= gameState.totalQuestions - 1 && (
            <button type="button" className={styles.actionBtn} onClick={() => socket.emit('trivia_finish')}>Finish</button>
          )}
          {phase === 'waiting' && (
            <button type="button" className={styles.actionBtn} onClick={() => socket.emit('trivia_next')}>Next Question</button>
          )}
        </div>
      )}
    </div>
  );
}

SingaporeTriviaGame.propTypes = {
  myName: PropTypes.string.isRequired,
  myColor: PropTypes.oneOf(TRIVIA_COLORS).isRequired,
  gameState: PropTypes.object,
  lastGameOver: PropTypes.object,
  socket: PropTypes.shape({ emit: PropTypes.func.isRequired }).isRequired,
  memberId: PropTypes.string.isRequired,
  callbackUrl: PropTypes.string,
  accessToken: PropTypes.string,
  status: PropTypes.string,
  reconnectAttempt: PropTypes.number,
  disconnectedPlayerName: PropTypes.string,
};
