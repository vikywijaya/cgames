import { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { ChessBoard } from './ChessBoardCanvas';
import { legalMovesFor, parseFenState } from './chessMoves';
import { saveScore } from '../../utils/scoreStore';
import { buildPayload } from '../../utils/buildPayload';
import styles from './ChessGame.module.css';

const RESULT_PCT = { win: 100, draw: 50, loss: 0 };

export function ChessGame({
  myColor, myName, gameState, lastGameOver, socket, memberId, callbackUrl, accessToken,
  status = 'connected', reconnectAttempt = 0, disconnectedPlayerName = null,
}) {
  const canvasRef = useRef(null);
  const boardRef = useRef(null);
  const startedAtRef = useRef(null);
  const reportedRef = useRef(false);
  const [turnStatus, setTurnStatus] = useState('Your turn');

  // Mount the canvas board once.
  useEffect(() => {
    const board = new ChessBoard(canvasRef.current, myColor);
    board.onPieceSelect = ([r, c]) => {
      const parsed = boardRef.current?.fenState;
      const currentBoard = boardRef.current?.board;
      if (!currentBoard || !parsed) return [];
      const piece = currentBoard[r][c];
      if (!piece) return [];
      const pieceIsWhite = piece === piece.toUpperCase();
      if ((myColor === 'white') !== pieceIsWhite) return [];
      return legalMovesFor(currentBoard, parsed, r, c);
    };
    board.onMove = (from, to, promotion) => {
      socket.emit('make_move', { from, to, promotion: promotion || null });
    };
    boardRef.current = board;
    const onResize = () => board.resize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [myColor, socket]);

  // Apply each new game_started/game_state payload to the board.
  useEffect(() => {
    if (!gameState || !boardRef.current) return;
    if (startedAtRef.current === null) startedAtRef.current = Date.now();

    const parsed = parseFenState(gameState.fen);
    boardRef.current.updateBoard(parsed.board, parsed, gameState.lastMove || null);

    const myTurn = (gameState.turn === 'w' && myColor === 'white') ||
                   (gameState.turn === 'b' && myColor === 'black');
    if (gameState.inCheck) setTurnStatus(myTurn ? 'You are in CHECK!' : 'Opponent is in CHECK!');
    else setTurnStatus(myTurn ? 'Your turn' : "Opponent's turn");
  }, [gameState, myColor]);

  // Report the result exactly once when the match ends.
  useEffect(() => {
    if (!lastGameOver || reportedRef.current) return;
    reportedRef.current = true;

    const result = lastGameOver.winner === 'draw' ? 'draw'
      : lastGameOver.winner === myColor ? 'win' : 'loss';
    const durationSeconds = startedAtRef.current !== null
      ? Math.round((Date.now() - startedAtRef.current) / 1000) : 0;

    saveScore('mp-chess', RESULT_PCT[result], durationSeconds, memberId, null);

    if (!callbackUrl) return;
    const payload = buildPayload({
      memberId, gameId: 'mp-chess',
      score: RESULT_PCT[result], maxScore: 100,
      completed: true, durationSeconds,
    });
    const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
    if (accessToken) headers['Access-Token'] = accessToken;
    fetch(callbackUrl, { method: 'POST', headers, body: JSON.stringify(payload) })
      .catch(e => console.warn('[ChessGame] callback failed:', e));
  }, [lastGameOver, myColor, memberId, callbackUrl, accessToken]);

  return (
    <div className={styles.game}>
      <div className={styles.panel}>{myName} ({myColor})</div>

      {status === 'disconnected' && (
        <div className={styles.banner}>Reconnecting… (attempt {reconnectAttempt})</div>
      )}
      {disconnectedPlayerName && (
        <div className={styles.banner}>{disconnectedPlayerName} disconnected. Waiting for reconnection…</div>
      )}

      <div className={styles.status}>{turnStatus}</div>
      <canvas ref={canvasRef} className={styles.canvas} />
      {lastGameOver && (
        <div className={styles.gameOver}>
          <h3>
            {lastGameOver.winner === 'draw' ? 'Draw!'
              : lastGameOver.winner === myColor ? 'You Win!' : 'You Lose'}
          </h3>
          <p>{lastGameOver.reason}</p>
          <button className={styles.primaryBtn} onClick={() => socket.emit('play_again')}>Play Again</button>
        </div>
      )}
      {!lastGameOver && (
        <button className={styles.resignBtn} onClick={() => socket.emit('resign')}>Resign</button>
      )}
    </div>
  );
}

ChessGame.propTypes = {
  myColor: PropTypes.oneOf(['white', 'black']).isRequired,
  myName: PropTypes.string.isRequired,
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
