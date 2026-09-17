import { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { XiangqiBoardCH, legalMovesFor } from './XiangqiBoardCH';
import { parseFenBoard } from './xiangqiMoves';
import { useLocalXiangqiMatch } from './useLocalXiangqiMatch';
import { saveScore } from '../../utils/scoreStore';
import { buildPayload } from '../../utils/buildPayload';
import { useTranslation } from '../../i18n/useTranslation';
import styles from './XiangqiGame.module.css';

const RESULT_PCT = { win: 100, draw: 50, loss: 0 };
const FILES = 'abcdefghi';
const GLYPH = {
  K: '帥', R: '車', N: '馬', B: '相', A: '仕', C: '炮', P: '兵',
  k: '將', r: '車', n: '馬', b: '象', a: '士', c: '炮', p: '卒',
};
const CLOCK_SECONDS = 10 * 60; // 10 min per side, matching Chess Pass and Play's default

// Vertical space reserved for the two player cards, the (occasional) status
// banner, and the move-history strip, so the single shared board fits on
// one screen without scrolling. Xiangqi's board is taller than it is wide
// (10 rows x 9 cols) so this budget feeds a width-from-height computation
// below rather than being used directly as a board size cap.
const RESERVED_VERTICAL_SPACE = 490;

function computeMaxBoardSize() {
  const availableHeight = Math.max(160, window.innerHeight - RESERVED_VERTICAL_SPACE);
  const widthFromHeight = availableHeight * 9 / 10;
  return Math.max(200, Math.min(420, widthFromHeight));
}

function sq(r, c) { return FILES[c] + r; }
function mmss(totalSeconds) {
  const s = Math.max(0, totalSeconds);
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

// The engine/hook report game-over reasons as fixed English tokens
// ('Checkmate', 'Resignation', 'Timeout', 'Agreed') rather than translated
// text — map them to the current language here so the banner/modal copy
// stays translated without changing the hook's API. Mirrors ChessGame.jsx.
function reasonLabel(reason, t) {
  switch (reason) {
    case 'Checkmate': return t.reasonCheckmate;
    case 'Resignation': return t.reasonResignation;
    case 'Timeout': return t.reasonTimeout;
    case 'Agreed': return t.reasonDrawAgreed;
    default: return reason;
  }
}

// A pill-shaped button showing both the icon and a short visible label,
// rather than an icon-only circle relying solely on aria-label/title —
// easier to scan and tap correctly for the senior-mobile audience this
// design targets. Identical pattern to ChessGame's PillButton.
function PillButton({ label, ariaLabel, tone, disabled, onClick, children }) {
  const toneClass = tone === 'teal' ? styles.pillBtnTeal : tone === 'danger' ? styles.pillBtnDanger : '';
  return (
    <button
      type="button"
      className={`${styles.pillBtn} ${toneClass}`}
      aria-label={ariaLabel}
      title={ariaLabel}
      disabled={disabled}
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
  tone: PropTypes.oneOf(['neutral', 'teal', 'danger']),
  disabled: PropTypes.bool,
  onClick: PropTypes.func.isRequired,
  children: PropTypes.node.isRequired,
};

function PlayerCard({ isBlack, name, badgeLabel, active, clockText, clockLow, actionsDisabled, onUndo, onOfferDraw, onResign, onReset, t }) {
  return (
    <div className={`${styles.card} ${active ? styles.cardActive : ''}`}>
      <div className={styles.cardHeader}>
        {/* The P1/P2 chip IS the player label now — the spelled-out name that
            used to sit beside it only repeated what this already says, in a
            row where width is scarce. It carries the accessible name for
            the same reason: with the text gone it can't stay decorative. */}
        <div className={`${styles.avatar} ${isBlack ? styles.avatarBlack : ''}`} role="img" aria-label={name}>
          {isBlack ? 'P2' : 'P1'}
        </div>
        <div className={styles.nameCol}>
          <div className={styles.badgeRow}>
            <span className={styles.badge}>{badgeLabel}</span>
            {active && <span className={`${styles.badge} ${styles.badgeActive}`}>{t.yourTurnBadge}</span>}
          </div>
        </div>
        <div className={`${styles.clockChip} ${clockLow ? styles.clockLow : ''}`}>
          <span className={styles.clockIcon} aria-hidden="true">⏱</span>
          <span className={`${styles.clockText} ${active && !clockLow ? styles.clockActive : ''}`}>{clockText}</span>
        </div>
      </div>
      <div className={styles.actionsRow}>
        <div className={styles.actionsGroup} style={{ opacity: actionsDisabled ? 0.45 : 1 }}>
          <PillButton label={t.undoShort} ariaLabel={t.undo} disabled={actionsDisabled} onClick={onUndo}>↩</PillButton>
          <PillButton label={t.offerDrawShort} ariaLabel={t.offerDraw} tone="teal" disabled={actionsDisabled} onClick={onOfferDraw}>🤝</PillButton>
          <PillButton label={t.resign} ariaLabel={t.resign} tone="danger" disabled={actionsDisabled} onClick={onResign}>⚑</PillButton>
        </div>
        <PillButton label={t.resetGame} ariaLabel={t.resetGame} onClick={onReset}>↻</PillButton>
      </div>
    </div>
  );
}
PlayerCard.propTypes = {
  isBlack: PropTypes.bool,
  name: PropTypes.string.isRequired,
  badgeLabel: PropTypes.string.isRequired,
  active: PropTypes.bool.isRequired,
  clockText: PropTypes.string.isRequired,
  clockLow: PropTypes.bool.isRequired,
  actionsDisabled: PropTypes.bool.isRequired,
  onUndo: PropTypes.func.isRequired,
  onOfferDraw: PropTypes.func.isRequired,
  onResign: PropTypes.func.isRequired,
  onReset: PropTypes.func.isRequired,
  t: PropTypes.object.isRequired,
};

export function XiangqiGame({ memberId, callbackUrl, accessToken }) {
  const t = useTranslation().multiplayer;
  const { gameState, lastGameOver, players, dispatch } = useLocalXiangqiMatch();
  const startedAtRef = useRef(Date.now());
  const reportedRef = useRef(false);

  // The match only begins once both seats have confirmed ready — see the
  // ready overlay in the render below. Resetting re-arms both flags so a
  // fresh game needs a fresh ready-up too.
  const [readyRed, setReadyRed] = useState(false);
  const [readyBlack, setReadyBlack] = useState(false);
  const started = readyRed && readyBlack;
  const [maxBoardSize, setMaxBoardSize] = useState(computeMaxBoardSize);
  const [modal, setModal] = useState(null); // null | 'resign' | 'reset' | 'draw' | 'over'
  const [moves, setMoves] = useState([]);
  const [clocks, setClocks] = useState({ w: CLOCK_SECONDS, b: CLOCK_SECONDS });

  const canvasRef = useRef(null);
  const boardRef = useRef(null);
  const histRef = useRef(null);
  const pendingMoveRef = useRef(null);

  // Refs mirroring the latest render's values so the once-registered clock
  // interval (below) always reads fresh state without needing to tear down
  // and re-create a new setInterval every second.
  const gameStateRef = useRef(gameState); gameStateRef.current = gameState;
  const lastGameOverRef = useRef(lastGameOver); lastGameOverRef.current = lastGameOver;
  const modalRef = useRef(modal); modalRef.current = modal;
  const clocksRef = useRef(clocks); clocksRef.current = clocks;
  const startedRef = useRef(started); startedRef.current = started;

  const red = players.find(p => p.color === 'red');
  const black = players.find(p => p.color === 'black');

  // Mark the actual start of play once both seats are ready, so the
  // reported play duration measures real game time rather than however
  // long the ready screen sat open. Re-fires after a reset re-arms both
  // ready flags for the next match.
  useEffect(() => {
    if (started) startedAtRef.current = Date.now();
  }, [started]);

  // Board setup — mounts once on load so the starting position is visible
  // right away, under the ready covers (see the render below). Piece
  // selection is blocked until `started` (and while a modal or the match
  // itself is over) so the covers aren't just cosmetic. onPieceSelect/onMove
  // close over refs so they always see current state without re-creating
  // the board.
  useEffect(() => {
    const board = new XiangqiBoardCH(canvasRef.current, maxBoardSize);
    board.onPieceSelect = ([r, c]) => {
      const cur = board.board;
      if (!cur || !startedRef.current || lastGameOverRef.current || modalRef.current) return [];
      const piece = cur[r][c];
      if (!piece) return [];
      const pieceIsRed = piece === piece.toUpperCase();
      if ((gameStateRef.current.turn === 'w') !== pieceIsRed) return [];
      return legalMovesFor(cur, r, c);
    };
    board.onMove = (from, to) => handleMove(from, to);
    boardRef.current = board;
    board.updateBoard(parseFenBoard(gameState.fen), null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    boardRef.current?.setMaxSize(maxBoardSize);
  }, [maxBoardSize]);

  useEffect(() => {
    const onResize = () => setMaxBoardSize(computeMaxBoardSize());
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);

  // Repaint on every game state change. The board keeps a fixed
  // Red-on-bottom orientation throughout — it does not flip for whoever's
  // turn it is, so the physical device orientation stays put for both
  // players (only Black's card, and its pieces' glyphs, rotate).
  useEffect(() => {
    const board = boardRef.current;
    if (!board) return;
    board.updateBoard(parseFenBoard(gameState.fen), gameState.lastMove || null);
  }, [gameState, lastGameOver]);

  function handleMove(from, to) {
    const board = parseFenBoard(gameState.fen);
    const piece = board[from[0]][from[1]];
    const captured = !!board[to[0]][to[1]];
    pendingMoveRef.current = { piece, captured, from, to };
    dispatch('make_move', { from, to });
  }

  // Finalize the pending move's notation once gameState reflects it — see
  // handleMove above. Runs in the same render pass as a resulting
  // game-over, since the hook batches both state updates.
  useEffect(() => {
    const pending = pendingMoveRef.current;
    if (!pending || !gameState.lastMove) return;
    const { from, to } = gameState.lastMove;
    if (pending.from[0] !== from[0] || pending.from[1] !== from[1] || pending.to[0] !== to[0] || pending.to[1] !== to[1]) return;
    pendingMoveRef.current = null;

    const { piece, captured } = pending;
    const byRed = piece === piece.toUpperCase();
    const mateSuffix = lastGameOver && lastGameOver.winner !== 'draw' ? '#' : (gameState.inCheck ? '+' : '');
    const entry = {
      byRed,
      text: `${GLYPH[piece]} ${sq(from[0], from[1])}${captured ? '×' : '→'}${sq(to[0], to[1])}${mateSuffix}`,
    };
    setMoves(m => {
      const next = [...m, { ...entry, n: m.length + 1 }];
      return next;
    });

    const h = histRef.current;
    if (h) requestAnimationFrame(() => { h.scrollLeft = h.scrollWidth; });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState, lastGameOver]);

  // Switch straight to the "game over" modal whenever the match ends,
  // regardless of cause — checkmate/stalemate (via the move effect above),
  // resignation, an agreed draw, or a clock timeout. Resign/draw/timeout
  // never touch pendingMoveRef, so this can't be folded into that effect.
  useEffect(() => {
    if (lastGameOver) setModal('over');
  }, [lastGameOver]);

  // Per-second clock tick, paused during game over or any open modal.
  useEffect(() => {
    const id = setInterval(() => {
      if (!startedRef.current || lastGameOverRef.current || modalRef.current) return;
      const side = gameStateRef.current.turn;
      const current = clocksRef.current[side];
      if (current <= 0) return;
      const left = current - 1;
      clocksRef.current = { ...clocksRef.current, [side]: left };
      setClocks(clocksRef.current);
      if (left === 0) dispatch('timeout', { winner: side === 'w' ? 'black' : 'red' });
    }, 1000);
    return () => clearInterval(id);
  }, [dispatch]);

  useEffect(() => {
    if (!lastGameOver || reportedRef.current) return;
    reportedRef.current = true;

    const result = lastGameOver.winner === 'draw' ? 'draw'
      : lastGameOver.winner === 'red' ? 'win' : 'loss';
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

  const turn = gameState.turn;
  const redActive = !lastGameOver && turn === 'w';
  const blackActive = !lastGameOver && turn === 'b';
  const turnName = turn === 'w' ? red.name : black.name;
  const lowW = clocks.w <= 60, lowB = clocks.b <= 60;

  let bannerText = t.bannerYourMove.replace('{name}', turnName);
  let calloutTone = 'info', calloutIcon = '👉';
  if (lastGameOver) {
    bannerText = lastGameOver.winner === 'draw'
      ? t.bannerDrawResult.replace('{reason}', reasonLabel(lastGameOver.reason, t).toLowerCase())
      : t.bannerWinResult
        .replace('{name}', lastGameOver.winner === 'red' ? red.name : black.name)
        .replace('{reason}', reasonLabel(lastGameOver.reason, t).toLowerCase());
    calloutTone = 'success'; calloutIcon = '🏆';
  } else if (gameState.inCheck) {
    bannerText = t.bannerInCheck.replace('{name}', turnName);
    calloutTone = 'danger'; calloutIcon = '⚠️';
  }
  const showBanner = !!lastGameOver || gameState.inCheck;
  const calloutClass = calloutTone === 'danger' ? styles.calloutDanger : calloutTone === 'success' ? styles.calloutSuccess : styles.calloutInfo;

  const resetClocks = () => {
    clocksRef.current = { w: CLOCK_SECONDS, b: CLOCK_SECONDS };
    setClocks(clocksRef.current);
  };

  const handleReady = (color) => {
    if (color === 'red') setReadyRed(true);
    else setReadyBlack(true);
  };

  const handleReset = () => {
    reportedRef.current = false;
    dispatch('play_again');
    setMoves([]);
    resetClocks();
    setModal(null);
    setReadyRed(false);
    setReadyBlack(false);
  };

  const handleUndo = () => {
    dispatch('undo');
    setMoves(m => m.slice(0, -1));
  };

  const modals = {
    resign: {
      title: t.resignModalTitle.replace('{name}', turnName),
      body: t.resignModalBody,
      confirm: t.resignModalConfirm,
      accent: 'var(--color-error, #E84B3D)',
      iconBg: 'var(--color-error-bg, #FEF0EF)',
      icon: '⚑',
      cancellable: true,
      run: () => dispatch('resign'),
    },
    reset: {
      title: t.resetConfirmTitle,
      body: t.resetConfirmBody,
      confirm: t.resetConfirmYes,
      accent: 'var(--color-text-muted, #6B7A99)',
      iconBg: 'var(--color-bg, #F4F6FB)',
      icon: '↻',
      cancellable: true,
      run: handleReset,
    },
    draw: {
      title: t.drawModalTitle,
      body: t.drawModalBody.replace('{name}', turn === 'w' ? black.name : red.name),
      confirm: t.drawModalConfirm,
      accent: 'var(--color-teal, #1A9FAF)',
      iconBg: 'var(--color-teal-bg, #E5F6F8)',
      icon: '🤝',
      cancellable: true,
      run: () => dispatch('draw_agreed'),
    },
    over: lastGameOver ? {
      title: lastGameOver.winner === 'draw' ? t.gameOverDrawTitle : t.gameOverWinTitle.replace('{name}', lastGameOver.winner === 'red' ? red.name : black.name),
      body: t.gameOverBody.replace('{reason}', reasonLabel(lastGameOver.reason, t)).replace('{n}', String(moves.length)),
      confirm: t.playAgain,
      accent: 'var(--color-success, #2DAF7B)',
      iconBg: 'var(--color-success-bg, #E6F9F2)',
      icon: lastGameOver.winner === 'draw' ? '⚖️' : '🏆',
      cancellable: false,
      run: handleReset,
    } : null,
  };
  const activeModal = modal ? modals[modal] : null;

  return (
    <div className={styles.game}>
      {/* Played on a phone lying between two people facing each other, so
          Black's whole card — name, badge, clock, action buttons, and its
          ready cover — is rotated 180° to read right-side up for whoever
          is sitting across, same as Chess Pass and Play and the other
          pass-and-play games. Only this card rotates; the shared board
          itself does not (see the "don't flip the board" note on the
          board-paint effect above). */}
      <div className={`${styles.cardSlot} ${styles.cardSlotRotated}`}>
        <PlayerCard
          isBlack name={black.name} badgeLabel={t.blackLabel}
          active={blackActive} clockText={mmss(clocks.b)} clockLow={lowB}
          actionsDisabled={!blackActive}
          onUndo={handleUndo} onOfferDraw={() => setModal('draw')} onResign={() => setModal('resign')} onReset={() => setModal('reset')}
          t={t}
        />
        {/* Covers this card until BOTH players are ready, not just this one
            — tapping only reveals this side's own confirmation, so a solo
            "I'm ready" doesn't peek at the other side's card underneath. */}
        {!started && (
          <div className={styles.readyCover}>
            <button
              type="button"
              className={`${styles.readyBtn} ${readyBlack ? styles.readyBtnConfirmed : ''}`}
              disabled={readyBlack}
              onClick={() => handleReady('black')}
            >
              {readyBlack ? `✓ ${t.readyConfirmed.replace('{name}', black.name)}` : t.readyButton.replace('{name}', black.name)}
            </button>
          </div>
        )}
      </div>

      {showBanner && (
        <div className={styles.bannerRow}>
          <div className={`${styles.callout} ${calloutClass}`}>
            <span className={styles.calloutIcon} aria-hidden="true">{calloutIcon}</span>
            <span>{bannerText}</span>
          </div>
        </div>
      )}

      <canvas ref={canvasRef} className={styles.boardCanvas} />

      <div className={styles.historySection}>
        <div className={styles.historyLabel}>{t.movesLabel}</div>
        <div className={styles.historyScroll} ref={histRef}>
          {moves.map(m => (
            <div key={m.n} className={`${styles.historyChip} ${!m.byRed ? styles.historyChipBlack : ''}`}>
              <span className={styles.historyMoveNum}>{m.n}</span>
              <span className={styles.historyMoveText}>{m.text}</span>
            </div>
          ))}
          {moves.length === 0 && <div className={styles.noMovesHint}>{t.noMovesHintXiangqi}</div>}
        </div>
      </div>

      <div className={styles.cardSlot}>
        <PlayerCard
          name={red.name} badgeLabel={t.redLabel}
          active={redActive} clockText={mmss(clocks.w)} clockLow={lowW}
          actionsDisabled={!redActive}
          onUndo={handleUndo} onOfferDraw={() => setModal('draw')} onResign={() => setModal('resign')} onReset={() => setModal('reset')}
          t={t}
        />
        {!started && (
          <div className={styles.readyCover}>
            <button
              type="button"
              className={`${styles.readyBtn} ${readyRed ? styles.readyBtnConfirmed : ''}`}
              disabled={readyRed}
              onClick={() => handleReady('red')}
            >
              {readyRed ? `✓ ${t.readyConfirmed.replace('{name}', red.name)}` : t.readyButton.replace('{name}', red.name)}
            </button>
          </div>
        )}
      </div>

      {activeModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalSheet}>
            <div className={styles.modalCard}>
              <div className={styles.modalHeader}>
                <div className={styles.modalIconWrap} style={{ background: activeModal.iconBg }} aria-hidden="true">
                  <span style={{ color: activeModal.accent }}>{activeModal.icon}</span>
                </div>
                <div className={styles.modalTitle}>{activeModal.title}</div>
              </div>
              <div className={styles.modalBody}>{activeModal.body}</div>
              <div className={styles.modalActions}>
                <button type="button" className={styles.primaryBtn} onClick={activeModal.run}>{activeModal.confirm}</button>
                {activeModal.cancellable && (
                  <button type="button" className={styles.outlineBtn} onClick={() => setModal(null)}>{t.resetConfirmCancel}</button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

XiangqiGame.propTypes = {
  memberId: PropTypes.string.isRequired,
  callbackUrl: PropTypes.string,
  accessToken: PropTypes.string,
};
