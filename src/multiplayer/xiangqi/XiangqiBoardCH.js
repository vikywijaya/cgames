// CaritaHub-styled Xiangqi board renderer — single shared board, fixed
// ('red' on bottom) orientation, mirroring the Chess Pass and Play
// treatment in ChessBoardCH.js. No SVG piece set exists for Xiangqi (see
// XiangqiGame.jsx notes), so pieces stay canvas-drawn Hanzi glyphs on a
// disc, just recolored/rescaled to match the redesigned board and with
// Black's glyphs rotated 180° in place instead of the whole board flipping.

import { legalMovesFor } from './xiangqiMoves';

const PIECE_LABELS = {
  // Red (uppercase)
  K: '帥', R: '車', N: '馬', B: '相', A: '仕', C: '炮', P: '兵',
  // Black (lowercase)
  k: '將', r: '車', n: '馬', b: '象', a: '士', c: '炮', p: '卒'
};

const COLS = 9, ROWS = 10;
const BOARD_BG = '#F4E3B8';
const LINE = '#8A6633';
const RED_INK = '#C0392B';
const BLACK_INK = '#1A2233';
const DISC_BG = '#FBF3DF';

export class XiangqiBoardCH {
  constructor(canvas, maxSize = 480) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    // The board itself never flips — same convention as ChessBoardCH: a
    // real board on a table isn't rotated for either seat, only each
    // player's own card (and, per-piece here, Black's glyphs) is.
    this.maxSize = maxSize;

    this.selected = null;
    this.legalDots = [];
    this.lastMove = null;
    this.board = null;

    this.onMove = null;
    this.onPieceSelect = null;

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
    const width = Math.min(window.innerWidth - 40, this.maxSize);
    const height = Math.round(width * ROWS / COLS);
    const dpr = window.devicePixelRatio || 1;
    this.width = width;
    this.height = height;
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.canvas.style.width = width + 'px';
    this.canvas.style.height = height + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this._calcMetrics();
  }

  _calcMetrics() {
    this.padding = Math.round(this.width * 0.065);
    this.cellW = (this.width - 2 * this.padding) / (COLS - 1);
    this.cellH = (this.height - 2 * this.padding) / (ROWS - 1);
    this.pieceR = Math.round(Math.min(this.cellW, this.cellH) * 0.42);
  }

  setMaxSize(maxSize) { this.maxSize = maxSize; this.resize(); }
  resize() { this._setupCanvas(); this.draw(); }

  _toCanvas(r, c) {
    return { x: this.padding + c * this.cellW, y: this.padding + r * this.cellH };
  }

  _toBoard(x, y) {
    const c = Math.round((x - this.padding) / this.cellW);
    const r = Math.round((y - this.padding) / this.cellH);
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return null;
    return [r, c];
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
        if (this.onMove) this.onMove(from, [r, c]);
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

  _drawPalaceDiagonals(topRow, leftCol) {
    const { ctx } = this;
    const corners = [
      this._toCanvas(topRow, leftCol),
      this._toCanvas(topRow, leftCol + 2),
      this._toCanvas(topRow + 2, leftCol),
      this._toCanvas(topRow + 2, leftCol + 2),
    ];
    ctx.beginPath();
    ctx.moveTo(corners[0].x, corners[0].y);
    ctx.lineTo(corners[3].x, corners[3].y);
    ctx.moveTo(corners[1].x, corners[1].y);
    ctx.lineTo(corners[2].x, corners[2].y);
    ctx.stroke();
  }

  draw() {
    if (!this.board) return;
    const ctx = this.ctx;
    const { padding, cellW, cellH, pieceR, width, height } = this;

    ctx.fillStyle = BOARD_BG;
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = LINE;
    ctx.lineWidth = 1.5;
    for (let r = 0; r < ROWS; r++) {
      const { y } = this._toCanvas(r, 0);
      const { x: x1 } = this._toCanvas(r, COLS - 1);
      ctx.beginPath();
      ctx.moveTo(padding, y);
      ctx.lineTo(x1, y);
      ctx.stroke();
    }
    for (let c = 0; c < COLS; c++) {
      for (const seg of [[0, 4], [5, 9]]) {
        const { y: y0 } = this._toCanvas(seg[0], c);
        const { y: y1 } = this._toCanvas(seg[1], c);
        const { x } = this._toCanvas(0, c);
        ctx.beginPath();
        ctx.moveTo(x, y0);
        ctx.lineTo(x, y1);
        ctx.stroke();
      }
    }

    const { y: riverY } = this._toCanvas(4, 0);
    const riverMidY = riverY + cellH / 2;
    ctx.fillStyle = LINE;
    ctx.font = `bold ${Math.round(cellH * 0.34)}px Lexend, system-ui, serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('楚河', padding + cellW * 1.5, riverMidY);
    ctx.fillText('漢界', padding + cellW * 5.5, riverMidY);

    ctx.strokeStyle = LINE;
    ctx.lineWidth = 1.5;
    this._drawPalaceDiagonals(0, 3);
    this._drawPalaceDiagonals(7, 3);

    if (this.lastMove) {
      for (const sq of [this.lastMove.from, this.lastMove.to]) {
        if (!sq) continue;
        const { x, y } = this._toCanvas(sq[0], sq[1]);
        ctx.fillStyle = 'rgba(224, 120, 32, 0.30)';
        ctx.beginPath();
        ctx.arc(x, y, pieceR + 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#E07820';
        ctx.lineWidth = Math.max(2, pieceR * 0.12);
        ctx.stroke();
      }
    }

    for (const [r, c] of this.legalDots) {
      const { x, y } = this._toCanvas(r, c);
      if (this.board[r][c]) {
        ctx.strokeStyle = 'rgba(61, 114, 232, 0.85)';
        ctx.lineWidth = Math.max(3, pieceR * 0.16);
        ctx.beginPath();
        ctx.arc(x, y, pieceR + 5, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.fillStyle = 'rgba(61, 114, 232, 0.55)';
        ctx.beginPath();
        ctx.arc(x, y, pieceR * 0.32, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const piece = this.board[r][c];
        if (!piece) continue;

        const { x, y } = this._toCanvas(r, c);
        const isRed = piece === piece.toUpperCase();
        const isSelected = this.selected && this.selected[0] === r && this.selected[1] === c;

        if (isSelected) {
          ctx.strokeStyle = '#2DAF7B';
          ctx.lineWidth = Math.max(2.5, pieceR * 0.14);
          ctx.beginPath();
          ctx.arc(x, y, pieceR + 5, 0, Math.PI * 2);
          ctx.stroke();
        }

        ctx.fillStyle = DISC_BG;
        ctx.strokeStyle = isRed ? RED_INK : BLACK_INK;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(x, y, pieceR, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.strokeStyle = isRed ? RED_INK : BLACK_INK;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(x, y, pieceR * 0.82, 0, Math.PI * 2);
        ctx.stroke();

        // Black's glyphs are rotated 180° in place so they face the player
        // sitting across the phone from Player 1 (Red) — same idea as
        // Black's card being CSS-rotated in XiangqiGame.jsx, applied
        // per-piece here since the board itself never flips.
        ctx.font = `bold ${Math.round(pieceR * 1.15)}px "Noto Sans SC", "Microsoft YaHei", serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = isRed ? RED_INK : BLACK_INK;
        if (isRed) {
          ctx.fillText(PIECE_LABELS[piece] || piece, x, y);
        } else {
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(Math.PI);
          ctx.fillText(PIECE_LABELS[piece] || piece, 0, 0);
          ctx.restore();
        }
      }
    }
  }

  updateBoard(board, lastMove) {
    this.board = board;
    this.lastMove = lastMove || null;
    this.selected = null;
    this.legalDots = [];
    this.draw();
  }
}

// Re-exported for convenience so callers only need to import from this
// module (board + move-legality lookup) the same way ChessGame imports
// legalMovesFor from chessMoves alongside ChessBoardCH.
export { legalMovesFor };
