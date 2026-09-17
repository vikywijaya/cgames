// CaritaHub-styled chess board renderer.
// Same geometry/interaction logic as ChessBoardCanvas.js (copied from
// src/multiplayer/chess/ChessBoardCanvas.js); only the palette, the piece
// artwork, and the letter label differ.

import { isPawnPromotion } from './chessMoves';

// Fallback glyphs, used only until a piece's SVG image (below) has loaded.
const PIECE_UNICODE = {
  K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙',
  k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟'
};

// Piece artwork: the "meridian" SVG set from
// https://github.com/kmar/chess_svg_piece_sets (public domain / CC0 — see
// public/chess-pieces/meridian/LICENSE.txt). Files live in public/ (not
// imported as modules) so they can be loaded here via a plain <img> src,
// the same way a canvas-drawn piece image normally works.
const PIECE_FILE = {
  K: 'wk', Q: 'wq', R: 'wr', B: 'wb', N: 'wn', P: 'wp',
  k: 'bk', q: 'bq', r: 'br', b: 'bb', n: 'bn', p: 'bp',
};
const PIECE_IMAGE_DIR = '/chess-pieces/meridian/';

// Shared across every board instance — the same 12 files are the same
// bytes regardless of which board (or how many) is showing them, so there's
// no reason to fetch and decode them more than once per page load.
const pieceImageCache = {};
const pieceLoadCallbacks = new Set();

function getPieceImage(pieceChar) {
  const file = PIECE_FILE[pieceChar];
  if (!file) return null;
  let entry = pieceImageCache[file];
  if (!entry) {
    const img = new Image();
    entry = { img, loaded: false };
    img.onload = () => {
      entry.loaded = true;
      pieceLoadCallbacks.forEach(cb => cb());
    };
    img.src = `${PIECE_IMAGE_DIR}${file}.svg`;
    pieceImageCache[file] = entry;
  }
  return entry.loaded ? entry.img : null;
}

const LIGHT_SQ = '#EBF2FF';
const DARK_SQ  = '#9DB8ED';
const INK      = '#1A2233';
const MUTED    = '#5C6E92';
const COLS = 8, ROWS = 8;

export class ChessBoardCH {
  constructor(canvas, playerColor, maxSize = 560, opts = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.playerColor = playerColor;
    this.flipped = playerColor === 'black';
    this.maxSize = maxSize;
    this.showLabels = opts.showLabels === true;

    this.selected = null;
    this.legalDots = [];
    this.lastMove = null;
    this.board = null;
    this.fenState = null;

    this.onMove = null;
    this.onPieceSelect = null;
    this.onPromotionNeeded = null;

    // Piece artwork loads asynchronously (see getPieceImage above); redraw
    // whenever another one finishes so pieces pop in as they arrive instead
    // of staying blank until every image happens to load before the first
    // draw() call.
    this._onPieceImageLoad = () => this.draw();
    pieceLoadCallbacks.add(this._onPieceImageLoad);

    this._setupCanvas();
    canvas.addEventListener('click', e => this._onClick(e));
    canvas.addEventListener('touchstart', e => {
      e.preventDefault();
      const touch = e.touches[0];
      const rect = canvas.getBoundingClientRect();
      this._handleClick(touch.clientX - rect.left, touch.clientY - rect.top);
    }, { passive: false });
  }

  _setupCanvas() {
    const size = Math.min(window.innerWidth - 40, this.maxSize);
    const dpr = window.devicePixelRatio || 1;
    this.size = size;
    this.canvas.width = Math.round(size * dpr);
    this.canvas.height = Math.round(size * dpr);
    this.canvas.style.width = size + 'px';
    this.canvas.style.height = size + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this._calcMetrics();
  }

  _calcMetrics() {
    this.cellSize = this.size / COLS;
    this.pieceFont = Math.round(this.cellSize * 0.70);
  }

  setMaxSize(maxSize) { this.maxSize = maxSize; this.resize(); }
  setShowLabels(v) { this.showLabels = v; this.draw(); }
  resize() { this._setupCanvas(); this.draw(); }

  _toCanvas(r, c) {
    const dr = this.flipped ? (ROWS - 1 - r) : r;
    const dc = this.flipped ? (COLS - 1 - c) : c;
    return { x: dc * this.cellSize, y: dr * this.cellSize };
  }

  _toBoard(x, y) {
    const dc = Math.floor(x / this.cellSize);
    const dr = Math.floor(y / this.cellSize);
    if (dr < 0 || dr >= ROWS || dc < 0 || dc >= COLS) return null;
    const br = this.flipped ? (ROWS - 1 - dr) : dr;
    const bc = this.flipped ? (COLS - 1 - dc) : dc;
    return [br, bc];
  }

  _onClick(e) {
    const rect = this.canvas.getBoundingClientRect();
    this._handleClick(e.clientX - rect.left, e.clientY - rect.top);
  }

  _handleClick(x, y) {
    const sq = this._toBoard(x, y);
    if (!sq || !this.board) return;
    const [r, c] = sq;

    if (this.selected) {
      const isLegal = this.legalDots.some(([lr, lc]) => lr === r && lc === c);
      if (isLegal) {
        const from = this.selected;
        this.selected = null;
        this.legalDots = [];
        this.draw();
        if (this.onPromotionNeeded && isPawnPromotion(this.board, from[0], from[1], r)) {
          this.onPromotionNeeded(from, [r, c]);
        } else if (this.onMove) {
          this.onMove(from, [r, c], null);
        }
        return;
      }
      this.selected = null;
      this.legalDots = [];
    }

    const piece = this.board[r][c];
    if (piece && this.onPieceSelect) {
      this.selected = [r, c];
      this.legalDots = this.onPieceSelect([r, c]);
      this.draw();
    }
  }

  _roundRectPath(x, y, w, h, r) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  draw() {
    if (!this.board) return;
    const ctx = this.ctx;
    const { cellSize } = this;

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const { x, y } = this._toCanvas(r, c);
        ctx.fillStyle = (r + c) % 2 === 0 ? LIGHT_SQ : DARK_SQ;
        ctx.fillRect(x, y, cellSize, cellSize);
      }
    }

    if (this.lastMove) {
      for (const sq of [this.lastMove.from, this.lastMove.to]) {
        if (!sq) continue;
        const { x, y } = this._toCanvas(sq[0], sq[1]);
        ctx.fillStyle = 'rgba(224, 120, 32, 0.30)';
        ctx.fillRect(x, y, cellSize, cellSize);
        ctx.strokeStyle = '#E07820';
        ctx.lineWidth = Math.max(2, cellSize * 0.05);
        ctx.strokeRect(x + ctx.lineWidth / 2, y + ctx.lineWidth / 2, cellSize - ctx.lineWidth, cellSize - ctx.lineWidth);
      }
    }

    if (this.selected) {
      const { x, y } = this._toCanvas(this.selected[0], this.selected[1]);
      ctx.fillStyle = 'rgba(45, 175, 123, 0.38)';
      this._roundRectPath(x + 1, y + 1, cellSize - 2, cellSize - 2, cellSize * 0.18);
      ctx.fill();
      ctx.strokeStyle = '#2DAF7B';
      ctx.lineWidth = Math.max(2.5, cellSize * 0.06);
      ctx.stroke();
    }

    for (const [r, c] of this.legalDots) {
      const { x, y } = this._toCanvas(r, c);
      const cx = x + cellSize / 2;
      const cy = y + cellSize / 2;
      if (this.board[r][c]) {
        ctx.strokeStyle = 'rgba(61, 114, 232, 0.85)';
        ctx.lineWidth = Math.max(3, cellSize * 0.07);
        ctx.beginPath();
        ctx.arc(cx, cy, cellSize * 0.42, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.fillStyle = 'rgba(61, 114, 232, 0.55)';
        ctx.beginPath();
        ctx.arc(cx, cy, cellSize * 0.17, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Rank / file coordinates
    const labelSize = Math.max(9, Math.round(cellSize * 0.19));
    ctx.font = `700 ${labelSize}px Lexend, system-ui, sans-serif`;
    for (let i = 0; i < 8; i++) {
      const boardRow = this.flipped ? (ROWS - 1 - i) : i;
      const boardCol = this.flipped ? (COLS - 1 - i) : i;
      const rank = 8 - boardRow;
      const file = 'abcdefgh'[boardCol];
      ctx.fillStyle = (boardRow % 2 === 0) ? MUTED : '#F4F8FF';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(String(rank), 3, i * cellSize + 3);
      const fileSquareDark = (7 + boardCol) % 2 !== 0;
      ctx.fillStyle = fileSquareDark ? '#F4F8FF' : MUTED;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillText(file, (i + 1) * cellSize - 3, 8 * cellSize - 3);
    }

    // Pieces — meridian SVG artwork, falling back to the old glyph until
    // that piece's image has finished loading (see getPieceImage above) —
    // with a letter label beneath either one.
    ctx.textAlign = 'center';
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const piece = this.board[r][c];
        if (!piece) continue;
        const { x, y } = this._toCanvas(r, c);
        const cx = x + cellSize / 2;
        const white = piece === piece.toUpperCase();
        const cy = y + cellSize * (this.showLabels ? 0.44 : 0.52);

        const img = getPieceImage(piece);
        if (img) {
          const size = cellSize * 0.78;
          if (white) {
            ctx.drawImage(img, cx - size / 2, cy - size / 2, size, size);
          } else {
            // Black's pieces are rotated 180° in place so they face the
            // player sitting across the phone from Player 1 — same idea as
            // Black's card being CSS-rotated in ChessGame.jsx, just applied
            // per-piece here since the board itself doesn't flip.
            ctx.save();
            ctx.translate(cx, cy);
            ctx.rotate(Math.PI);
            ctx.drawImage(img, -size / 2, -size / 2, size, size);
            ctx.restore();
          }
        } else {
          const glyph = PIECE_UNICODE[piece] || piece;
          ctx.textBaseline = 'middle';
          ctx.font = `${this.pieceFont}px "Segoe UI Symbol", serif`;
          ctx.lineJoin = 'round';
          ctx.lineWidth = Math.max(2, cellSize * 0.055);
          ctx.strokeStyle = white ? INK : '#FFFFFF';
          ctx.strokeText(glyph, cx, cy);
          ctx.fillStyle = white ? '#FFFFFF' : INK;
          ctx.fillText(glyph, cx, cy);
        }

        if (this.showLabels) {
          const lSize = Math.max(8, Math.round(cellSize * 0.24));
          ctx.font = `700 ${lSize}px Lexend, system-ui, sans-serif`;
          ctx.textBaseline = 'bottom';
          const ly = y + cellSize - cellSize * 0.06;
          ctx.lineWidth = Math.max(2, cellSize * 0.05);
          ctx.strokeStyle = white ? INK : '#FFFFFF';
          ctx.strokeText(piece.toUpperCase(), cx, ly);
          ctx.fillStyle = white ? '#FFFFFF' : INK;
          ctx.fillText(piece.toUpperCase(), cx, ly);
        }
      }
    }
  }

  updateBoard(board, fenState, lastMove) {
    this.board = board;
    this.fenState = fenState;
    this.lastMove = lastMove || null;
    this.selected = null;
    this.legalDots = [];
    this.draw();
  }
}
