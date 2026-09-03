import { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { XiangqiBoard } from './XiangqiBoardCanvas';
import { legalMovesFor, parseFenBoard } from './xiangqiMoves';
import { useLocalXiangqiMatch } from './useLocalXiangqiMatch';
import { saveScore } from '../../utils/scoreStore';
import { buildPayload } from '../../utils/buildPayload';
import { useTranslation } from '../../i18n/useTranslation';
import styles from './XiangqiGame.module.css';

const RESULT_PCT = { win: 100, loss: 0 };

// Vertical space reserved for the two panel name labels and the middle
// status/resign/reset/game-over strip, so both boards fit on one screen
// without scrolling. Same value as the Chess pilot (similar control strip).
const RESERVED_VERTICAL_SPACE = 260;

function computeMaxBoardSize() {
  // Xiangqi's board is 10 rows x 9 cols (height = width * 10/9), so the
  // width cap must leave room for the taller aspect ratio within the
  // per-pane height budget.
  const perPaneHeightBudget = (window.innerHeight - RESERVED_VERTICAL_SPACE) / 2;
  const widthFromHeightBudget = perPaneHeightBudget * 9 / 10;
  return Math.max(140, Math.min(560, widthFromHeightBudget));
}

function XiangqiPane({ color, name, gameState, dispatch, rotated, maxSize }) {
  const canvasRef = useRef(null);
  const boardRef = useRef(null);

  useEffect(() => {
    // Always draw upright ('red' orientation) — the CSS 180° rotation on the
    // black pane (via `rotated`) is the sole source of that pane's visual
    // flip. See the Chess pilot's ChessGame.jsx for the full rationale:
    // passing the actual seat color here would double-flip rendering
    // (harmlessly) but NOT click coordinates, since hit-testing reflects the
    // rotated element while `_toBoard` assumes an unrotated, unflipped canvas.
    const board = new XiangqiBoard(canvasRef.current, 'red', maxSize);
    board.onPieceSelect = ([r, c]) => {
      const currentBoard = boardRef.current?.board;
      if (!currentBoard) return [];
      const piece = currentBoard[r][c];
      if (!piece) return [];
      const pieceIsRed = piece === piece.toUpperCase();
      if ((color === 'red') !== pieceIsRed) return [];
      return legalMovesFor(currentBoard, r, c);
    };
    board.onMove = (from, to) => {
      dispatch('make_move', { from, to });
    };
    boardRef.current = board;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [color, dispatch]);

  useEffect(() => {
    boardRef.current?.setMaxSize(maxSize);
  }, [maxSize]);

  useEffect(() => {
    if (!gameState || !boardRef.current) return;
    const board = parseFenBoard(gameState.fen);
    boardRef.current.updateBoard(board, gameState.lastMove || null);
  }, [gameState]);

  return (
    <div className={`${styles.pane} ${rotated ? styles.paneRotated : ''}`}>
      <div className={styles.panel}>{name} ({color})</div>
      <canvas ref={canvasRef} className={styles.canvas} />
    </div>
  );
}
XiangqiPane.propTypes = {
  color: PropTypes.oneOf(['red', 'black']).isRequired,
  name: PropTypes.string.isRequired,
  gameState: PropTypes.object,
  dispatch: PropTypes.func.isRequired,
  rotated: PropTypes.bool,
  maxSize: PropTypes.number.isRequired,
};

export function XiangqiGame({ memberId, callbackUrl, accessToken }) {
  const t = useTranslation().multiplayer;
  const { gameState, lastGameOver, players, dispatch } = useLocalXiangqiMatch();
  const startedAtRef = useRef(Date.now());
  const reportedRef = useRef(false);
  const [maxBoardSize, setMaxBoardSize] = useState(computeMaxBoardSize);
  const [confirmingReset, setConfirmingReset] = useState(false);

  useEffect(() => {
    const onResize = () => setMaxBoardSize(computeMaxBoardSize());
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);

  useEffect(() => {
    if (!lastGameOver || reportedRef.current) return;
    reportedRef.current = true;

    const result = lastGameOver.winner === 'red' ? 'win' : 'loss';
    const durationSeconds = Math.round((Date.now() - startedAtRef.current) / 1000);

    saveScore('mp-xiangqi', RESULT_PCT[result], durationSeconds, memberId, null);

    const payload = buildPayload({
      memberId, gameId: 'mp-xiangqi',
      score: RESULT_PCT[result], maxScore: 100,
      completed: true, durationSeconds,
    });
    window.parent.postMessage({ type: 'GAME_COMPLETE', payload }, '*');

    if (!callbackUrl) return;
    const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
    if (accessToken) headers['Access-Token'] = accessToken;
    fetch(callbackUrl, { method: 'POST', headers, body: JSON.stringify(payload) })
      .catch(e => console.warn('[XiangqiGame] callback failed:', e));
  }, [lastGameOver, memberId, callbackUrl, accessToken]);

  const red = players.find(p => p.color === 'red');
  const black = players.find(p => p.color === 'black');
  const turnLabel = gameState.turn === 'w' ? red.name : black.name;
  const turnStatus = gameState.inCheck
    ? t.namedInCheck.replace('{name}', turnLabel)
    : t.namedTurn.replace('{name}', turnLabel);

  const handleConfirmReset = () => {
    startedAtRef.current = Date.now();
    reportedRef.current = false;
    dispatch('play_again');
    setConfirmingReset(false);
  };

  return (
    <div className={styles.game}>
      <XiangqiPane color="black" name={black.name} gameState={gameState} dispatch={dispatch} maxSize={maxBoardSize} rotated />

      <div className={styles.center}>
        <div className={styles.status}>{turnStatus}</div>
        {lastGameOver && (
          <div className={styles.gameOver}>
            <h3>{(lastGameOver.winner === 'red' ? red.name : black.name)} {t.youWinSimple}</h3>
            <p>{lastGameOver.reason}</p>
            <button className={styles.primaryBtn} onClick={() => dispatch('play_again')}>{t.playAgain}</button>
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
          <div className={styles.controls}>
            <button className={styles.resignBtn} onClick={() => dispatch('resign')}>{t.resign}</button>
            <button className={styles.resignBtn} onClick={() => setConfirmingReset(true)}>{t.resetGame}</button>
          </div>
        )}
      </div>

      <XiangqiPane color="red" name={red.name} gameState={gameState} dispatch={dispatch} maxSize={maxBoardSize} />
    </div>
  );
}

XiangqiGame.propTypes = {
  memberId: PropTypes.string.isRequired,
  callbackUrl: PropTypes.string,
  accessToken: PropTypes.string,
};
