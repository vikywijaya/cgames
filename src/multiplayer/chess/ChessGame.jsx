import { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { ChessBoard } from './ChessBoardCanvas';
import { legalMovesFor, parseFenState } from './chessMoves';
import { useLocalChessMatch } from './useLocalChessMatch';
import { saveScore } from '../../utils/scoreStore';
import { buildPayload } from '../../utils/buildPayload';
import { useTranslation } from '../../i18n/useTranslation';
import styles from './ChessGame.module.css';

const RESULT_PCT = { win: 100, draw: 50, loss: 0 };

// Vertical space reserved for the two panel name labels and the middle
// status/resign/game-over strip, so both boards fit on one screen without
// scrolling — tuned to this layout's actual content, not a hard number.
const RESERVED_VERTICAL_SPACE = 260;

function computeMaxBoardSize() {
  const perPaneHeightBudget = (window.innerHeight - RESERVED_VERTICAL_SPACE) / 2;
  return Math.max(160, Math.min(560, perPaneHeightBudget));
}

function ChessPane({ color, name, gameState, dispatch, rotated, maxSize }) {
  const canvasRef = useRef(null);
  const boardRef = useRef(null);

  useEffect(() => {
    // Always draw upright ('white' orientation) — the CSS 180° rotation on the
    // black pane (via `rotated`) is the sole source of that pane's visual flip.
    // Passing the actual seat color here would double-flip: ChessBoard's own
    // internal `flipped` orientation plus the CSS transform would cancel out
    // rendering but NOT click coordinates, since click hit-testing reflects
    // the rotated element while ChessBoard's `_toBoard` assumes an unrotated,
    // unflipped canvas — making every click land on the mirrored square.
    const board = new ChessBoard(canvasRef.current, 'white', maxSize);
    board.onPieceSelect = ([r, c]) => {
      const parsed = boardRef.current?.fenState;
      const currentBoard = boardRef.current?.board;
      if (!currentBoard || !parsed) return [];
      const piece = currentBoard[r][c];
      if (!piece) return [];
      const pieceIsWhite = piece === piece.toUpperCase();
      if ((color === 'white') !== pieceIsWhite) return [];
      return legalMovesFor(currentBoard, parsed, r, c);
    };
    board.onMove = (from, to, promotion) => {
      dispatch('make_move', { from, to, promotion: promotion || null });
    };
    boardRef.current = board;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [color, dispatch]);

  useEffect(() => {
    boardRef.current?.setMaxSize(maxSize);
  }, [maxSize]);

  useEffect(() => {
    if (!gameState || !boardRef.current) return;
    const parsed = parseFenState(gameState.fen);
    boardRef.current.updateBoard(parsed.board, parsed, gameState.lastMove || null);
  }, [gameState]);

  return (
    <div className={`${styles.pane} ${rotated ? styles.paneRotated : ''}`}>
      <div className={styles.panel}>{name} ({color})</div>
      <canvas ref={canvasRef} className={styles.canvas} />
    </div>
  );
}
ChessPane.propTypes = {
  color: PropTypes.oneOf(['white', 'black']).isRequired,
  name: PropTypes.string.isRequired,
  gameState: PropTypes.object,
  dispatch: PropTypes.func.isRequired,
  rotated: PropTypes.bool,
  maxSize: PropTypes.number.isRequired,
};

export function ChessGame({ memberId, callbackUrl, accessToken }) {
  const t = useTranslation().multiplayer;
  const { gameState, lastGameOver, players, dispatch } = useLocalChessMatch();
  const startedAtRef = useRef(Date.now());
  const reportedRef = useRef(false);
  const [maxBoardSize, setMaxBoardSize] = useState(computeMaxBoardSize);

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

    const result = lastGameOver.winner === 'draw' ? 'draw'
      : lastGameOver.winner === 'white' ? 'win' : 'loss';
    const durationSeconds = Math.round((Date.now() - startedAtRef.current) / 1000);

    saveScore('mp-chess', RESULT_PCT[result], durationSeconds, memberId, null);

    const payload = buildPayload({
      memberId, gameId: 'mp-chess',
      score: RESULT_PCT[result], maxScore: 100,
      completed: true, durationSeconds,
    });
    window.parent.postMessage({ type: 'GAME_COMPLETE', payload }, '*');

    if (!callbackUrl) return;
    const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
    if (accessToken) headers['Access-Token'] = accessToken;
    fetch(callbackUrl, { method: 'POST', headers, body: JSON.stringify(payload) })
      .catch(e => console.warn('[ChessGame] callback failed:', e));
  }, [lastGameOver, memberId, callbackUrl, accessToken]);

  const white = players.find(p => p.color === 'white');
  const black = players.find(p => p.color === 'black');
  const turnLabel = gameState.turn === 'w' ? white.name : black.name;
  const turnStatus = gameState.inCheck
    ? t.namedInCheck.replace('{name}', turnLabel)
    : t.namedTurn.replace('{name}', turnLabel);

  return (
    <div className={styles.game}>
      <ChessPane color="black" name={black.name} gameState={gameState} dispatch={dispatch} maxSize={maxBoardSize} rotated />

      <div className={styles.center}>
        <div className={styles.status}>{turnStatus}</div>
        {lastGameOver && (
          <div className={styles.gameOver}>
            <h3>
              {lastGameOver.winner === 'draw' ? t.draw
                : `${lastGameOver.winner === 'white' ? white.name : black.name} ${t.youWinSimple}`}
            </h3>
            <p>{lastGameOver.reason}</p>
            <button className={styles.primaryBtn} onClick={() => dispatch('play_again')}>{t.playAgain}</button>
          </div>
        )}
        {!lastGameOver && (
          <button className={styles.resignBtn} onClick={() => dispatch('resign')}>{t.resign}</button>
        )}
      </div>

      <ChessPane color="white" name={white.name} gameState={gameState} dispatch={dispatch} maxSize={maxBoardSize} />
    </div>
  );
}

ChessGame.propTypes = {
  memberId: PropTypes.string.isRequired,
  callbackUrl: PropTypes.string,
  accessToken: PropTypes.string,
};
