/* Shared client-side helpers for Frog Drop: constants + frog drawing + renderer.
 * Used by both /tv-frog-drop.html and /tv-frog-drop-play.html. */

const COLS = 5;
const ROWS = 8;
const MAX_TIER = 8;

const FROG_TIERS = [
  null,
  { color: '#4CAF50', name: 'Green',  number: 1 },
  { color: '#2196F3', name: 'Blue',   number: 2 },
  { color: '#F44336', name: 'Red',    number: 3 },
  { color: '#FF9800', name: 'Orange', number: 4 },
  { color: '#9C27B0', name: 'Purple', number: 5 },
  { color: '#E91E63', name: 'Pink',   number: 6 },
  { color: '#00BCD4', name: 'Cyan',   number: 7 },
  { color: '#FFD700', name: 'Gold',   number: 8 },
];

function darkenColor(hex, amount) {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.max(0, (num >> 16) - Math.floor(255 * amount));
  const g = Math.max(0, ((num >> 8) & 0xFF) - Math.floor(255 * amount));
  const b = Math.max(0, (num & 0xFF) - Math.floor(255 * amount));
  return `rgb(${r},${g},${b})`;
}

function lightenColor(hex, amount) {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, (num >> 16) + Math.floor(255 * amount));
  const g = Math.min(255, ((num >> 8) & 0xFF) + Math.floor(255 * amount));
  const b = Math.min(255, (num & 0xFF) + Math.floor(255 * amount));
  return `rgb(${r},${g},${b})`;
}

/**
 * Draw a chibi/clay-style frog centered at (x, y).
 *
 * Visual goals:
 *   - bold, friendly silhouette that reads at small sizes
 *   - glossy gradient body, soft contact shadow
 *   - the tier number is the hero — sits on a white badge with a colored
 *     ring so it has guaranteed contrast on every body color, including
 *     gold (tier 8) where white-on-yellow used to be unreadable
 */
function drawFrogShape(ctx, x, y, tier, size) {
  const tierInfo = FROG_TIERS[tier] || FROG_TIERS[1];
  const color = tierInfo.color;
  const dark  = darkenColor(color, 0.28);
  const deep  = darkenColor(color, 0.45);
  const light = lightenColor(color, 0.18);
  const hi    = lightenColor(color, 0.34);
  const s     = size * 0.46;
  const stroke = Math.max(1.2, size * 0.025);

  ctx.save();
  ctx.translate(x, y);

  // ── Soft contact shadow under the frog ────────────────────────────────
  ctx.save();
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(0, s * 0.86, s * 0.78, s * 0.12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // ── Hind legs (drawn behind the body) ─────────────────────────────────
  ctx.fillStyle = dark;
  ctx.strokeStyle = deep;
  ctx.lineWidth = stroke;
  // Left thigh
  ctx.beginPath(); ctx.ellipse(-s * 0.78, s * 0.5, s * 0.36, s * 0.24, -0.25, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  // Left foot
  ctx.beginPath(); ctx.ellipse(-s * 1.02, s * 0.7, s * 0.30, s * 0.13, -0.3, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  // Right thigh
  ctx.beginPath(); ctx.ellipse(s * 0.78, s * 0.5, s * 0.36, s * 0.24, 0.25, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  // Right foot
  ctx.beginPath(); ctx.ellipse(s * 1.02, s * 0.7, s * 0.30, s * 0.13, 0.3, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

  // ── Body (rounder, with a glossy gradient) ────────────────────────────
  const bodyGrad = ctx.createLinearGradient(0, -s * 0.4, 0, s * 0.7);
  bodyGrad.addColorStop(0, hi);
  bodyGrad.addColorStop(0.55, color);
  bodyGrad.addColorStop(1, dark);
  ctx.fillStyle = bodyGrad;
  ctx.strokeStyle = deep;
  ctx.lineWidth = stroke;
  ctx.beginPath(); ctx.ellipse(0, s * 0.05, s * 0.78, s * 0.7, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

  // Top highlight crescent (glossy clay feel)
  ctx.save();
  ctx.globalAlpha = 0.45;
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.ellipse(-s * 0.18, -s * 0.32, s * 0.42, s * 0.16, -0.25, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // ── Front arms peeking out ────────────────────────────────────────────
  ctx.fillStyle = dark;
  ctx.strokeStyle = deep;
  ctx.beginPath(); ctx.ellipse(-s * 0.62, s * 0.14, s * 0.16, s * 0.26, 0.55, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(s * 0.62,  s * 0.14, s * 0.16, s * 0.26, -0.55, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

  // ── Number badge (the new hero element) ───────────────────────────────
  // A white disc with a colored ring keeps contrast high on every body
  // color and reads clearly even at ~28px cell size.
  const badgeR = s * 0.5;
  const badgeY = s * 0.18;

  // Outer colored ring
  ctx.fillStyle = deep;
  ctx.beginPath(); ctx.arc(0, badgeY, badgeR + stroke * 1.2, 0, Math.PI * 2); ctx.fill();

  // White face
  const badgeGrad = ctx.createLinearGradient(0, badgeY - badgeR, 0, badgeY + badgeR);
  badgeGrad.addColorStop(0, '#FFFFFF');
  badgeGrad.addColorStop(1, '#F1F5F9');
  ctx.fillStyle = badgeGrad;
  ctx.beginPath(); ctx.arc(0, badgeY, badgeR, 0, Math.PI * 2); ctx.fill();

  // Soft inner shading on the badge
  ctx.save();
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = deep;
  ctx.beginPath(); ctx.arc(0, badgeY + badgeR * 0.25, badgeR * 0.85, 0, Math.PI * 2); ctx.fill();
  ctx.restore();

  // The number — rounded font (Fredoka if available), centered, big
  const numSize = Math.max(11, badgeR * 1.55);
  ctx.font = `700 ${numSize}px "Fredoka", "Nunito", system-ui, Arial, sans-serif`;
  ctx.fillStyle = deep;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(tierInfo.number.toString(), 0, badgeY);

  // ── Head ──────────────────────────────────────────────────────────────
  const headGrad = ctx.createLinearGradient(0, -s * 0.7, 0, -s * 0.05);
  headGrad.addColorStop(0, hi);
  headGrad.addColorStop(1, color);
  ctx.fillStyle = headGrad;
  ctx.strokeStyle = deep;
  ctx.lineWidth = stroke;
  ctx.beginPath(); ctx.ellipse(0, -s * 0.4, s * 0.58, s * 0.34, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

  // ── Eye bumps + eyes ──────────────────────────────────────────────────
  const eyeSpacing = s * 0.36;
  const eyeBumpY   = -s * 0.66;
  const eyeBumpR   = s * 0.24;

  // Bumps (same color as head, with a soft top highlight)
  ctx.fillStyle = color;
  ctx.strokeStyle = deep;
  ctx.lineWidth = stroke;
  ctx.beginPath(); ctx.arc(-eyeSpacing, eyeBumpY, eyeBumpR, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.arc( eyeSpacing, eyeBumpY, eyeBumpR, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath(); ctx.ellipse(-eyeSpacing - eyeBumpR * 0.25, eyeBumpY - eyeBumpR * 0.4, eyeBumpR * 0.55, eyeBumpR * 0.22, -0.3, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse( eyeSpacing - eyeBumpR * 0.25, eyeBumpY - eyeBumpR * 0.4, eyeBumpR * 0.55, eyeBumpR * 0.22, -0.3, 0, Math.PI * 2); ctx.fill();
  ctx.restore();

  // Whites of the eyes
  const eyeR = eyeBumpR * 0.78;
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath(); ctx.arc(-eyeSpacing, eyeBumpY, eyeR, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc( eyeSpacing, eyeBumpY, eyeR, 0, Math.PI * 2); ctx.fill();

  // Pupils — bigger, slightly cross-eyed for cuteness
  const pupilR = eyeR * 0.55;
  ctx.fillStyle = '#101218';
  ctx.beginPath(); ctx.arc(-eyeSpacing + pupilR * 0.25, eyeBumpY + pupilR * 0.12, pupilR, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc( eyeSpacing - pupilR * 0.25, eyeBumpY + pupilR * 0.12, pupilR, 0, Math.PI * 2); ctx.fill();

  // Sparkle highlight in each eye
  const shineR = pupilR * 0.42;
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath(); ctx.arc(-eyeSpacing - shineR * 0.4, eyeBumpY - shineR * 0.6, shineR, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc( eyeSpacing + shineR * 0.4, eyeBumpY - shineR * 0.6, shineR, 0, Math.PI * 2); ctx.fill();

  // ── Smile + cheek blush ───────────────────────────────────────────────
  ctx.beginPath();
  ctx.arc(0, -s * 0.28, s * 0.3, 0.12 * Math.PI, 0.88 * Math.PI);
  ctx.strokeStyle = deep;
  ctx.lineWidth = Math.max(1.6, size * 0.028);
  ctx.lineCap = 'round';
  ctx.stroke();

  // Cheek blush (subtle pink dots; warmer feel)
  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = '#F472B6';
  ctx.beginPath(); ctx.arc(-s * 0.42, -s * 0.22, s * 0.10, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc( s * 0.42, -s * 0.22, s * 0.10, 0, Math.PI * 2); ctx.fill();
  ctx.restore();

  // Nostrils
  const nostrilR = Math.max(1, s * 0.045);
  ctx.fillStyle = deep;
  ctx.beginPath(); ctx.arc(-s * 0.10, -s * 0.42, nostrilR, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc( s * 0.10, -s * 0.42, nostrilR, 0, Math.PI * 2); ctx.fill();

  ctx.restore();
}

class FrogRenderer {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.particles = [];
    this.scorePopups = [];
    this.offsetX = options.offsetX || 0;
    this.offsetY = options.offsetY || 0;
    this.cellSize = options.cellSize || 60;
    this.headerHeight = options.headerHeight || 70;
  }

  cellPos(col, row) {
    return {
      x: this.offsetX + col * this.cellSize + this.cellSize / 2,
      y: this.offsetY + this.headerHeight + row * this.cellSize + this.cellSize / 2,
    };
  }

  drawBoard(state, playerName, timeLeft) {
    const ctx = this.ctx;
    const cs = this.cellSize;
    const boardW = COLS * cs;
    const boardH = ROWS * cs + this.headerHeight;

    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(this.offsetX, this.offsetY, boardW, boardH);

    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    for (let c = 0; c <= COLS; c++) {
      ctx.beginPath();
      ctx.moveTo(this.offsetX + c * cs, this.offsetY + this.headerHeight);
      ctx.lineTo(this.offsetX + c * cs, this.offsetY + boardH);
      ctx.stroke();
    }
    for (let r = 0; r <= ROWS; r++) {
      ctx.beginPath();
      ctx.moveTo(this.offsetX, this.offsetY + this.headerHeight + r * cs);
      ctx.lineTo(this.offsetX + boardW, this.offsetY + this.headerHeight + r * cs);
      ctx.stroke();
    }

    ctx.fillStyle = '#16213e';
    ctx.fillRect(this.offsetX, this.offsetY, boardW, this.headerHeight);

    const fontSize = Math.max(12, cs * 0.28);
    ctx.font = `bold ${fontSize}px Arial, sans-serif`;
    ctx.fillStyle = '#e0e0e0';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(playerName || 'Player', this.offsetX + 8, this.offsetY + this.headerHeight * 0.3, boardW * 0.55);

    ctx.font = `${fontSize * 0.85}px Arial, sans-serif`;
    ctx.fillStyle = '#FFD700';
    ctx.fillText(`Score: ${state.score}`, this.offsetX + 8, this.offsetY + this.headerHeight * 0.65);

    if (timeLeft !== undefined && timeLeft >= 0) {
      ctx.textAlign = 'right';
      ctx.font = `bold ${fontSize}px Arial, sans-serif`;
      ctx.fillStyle = timeLeft <= 10 ? '#FF5555' : '#6dd3f5';
      ctx.fillText(`${timeLeft}s`, this.offsetX + boardW - 8, this.offsetY + this.headerHeight * 0.5);
    }

    for (let c = 0; c < COLS; c++) {
      for (let r = 0; r < ROWS; r++) {
        const tier = state.grid[c][r];
        if (tier > 0) {
          const pos = this.cellPos(c, r);
          drawFrogShape(ctx, pos.x, pos.y, tier, cs);
        }
      }
    }

    if (state.boardFull || (timeLeft !== undefined && timeLeft <= 0)) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(this.offsetX, this.offsetY + this.headerHeight, boardW, ROWS * cs);
      ctx.font = `bold ${cs * 0.45}px Arial, sans-serif`;
      ctx.fillStyle = (timeLeft !== undefined && timeLeft <= 0) ? '#FFD700' : '#FF5555';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const label = (timeLeft !== undefined && timeLeft <= 0) ? "TIME'S UP!" : 'BOARD FULL';
      ctx.fillText(label, this.offsetX + boardW / 2, this.offsetY + this.headerHeight + ROWS * cs / 2);
    }
  }

  spawnParticles(col, row, tier, count) {
    const pos = this.cellPos(col, row);
    const tierInfo = FROG_TIERS[tier] || FROG_TIERS[1];
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.5 + Math.random() * 3.5;
      this.particles.push({
        x: pos.x, y: pos.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1.0,
        decay: 0.015 + Math.random() * 0.02,
        radius: 2 + Math.random() * 5,
        color: tierInfo.color,
      });
    }
  }

  spawnScorePopup(col, row, score, chain) {
    const pos = this.cellPos(col, row);
    this.scorePopups.push({ x: pos.x, y: pos.y, score, chain, life: 1.0, decay: 0.016 });
  }

  drawParticles() {
    const ctx = this.ctx;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx; p.y += p.vy; p.vy += 0.06;
      p.life -= p.decay;
      if (p.life <= 0) { this.particles.splice(i, 1); continue; }
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius * p.life, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  drawScorePopups() {
    const ctx = this.ctx;
    for (let i = this.scorePopups.length - 1; i >= 0; i--) {
      const p = this.scorePopups[i];
      p.y -= 1.3;
      p.life -= p.decay;
      if (p.life <= 0) { this.scorePopups.splice(i, 1); continue; }
      ctx.globalAlpha = p.life;
      const size = Math.max(13, this.cellSize * 0.32);
      ctx.font = `bold ${size}px Arial, sans-serif`;
      ctx.fillStyle = p.chain > 0 ? '#FFD700' : '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const text = p.chain > 0 ? `+${p.score} x${p.chain + 1}` : `+${p.score}`;
      ctx.fillText(text, p.x, p.y);
    }
    ctx.globalAlpha = 1;
  }
}
