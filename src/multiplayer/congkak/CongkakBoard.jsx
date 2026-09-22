import PropTypes from 'prop-types';
import styles from './CongkakGame.module.css';

// Seeds are drawn as dots only up to this count; past it the numeral carries
// the value alone. Counting fifteen overlapping dots is a failure mode for
// the senior audience this targets, not a feature.
const MAX_DOTS = 8;

const P1_HOUSES = [0, 1, 2, 3, 4, 5, 6];
const P2_HOUSES = [14, 13, 12, 11, 10, 9, 8]; // left-to-right on screen

function Seeds({ count }) {
  if (count === 0 || count > MAX_DOTS) return null;
  return (
    <span className={styles.seedDots} aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <span key={i} className={styles.seedDot} />
      ))}
    </span>
  );
}
Seeds.propTypes = { count: PropTypes.number.isRequired };

function Hole({ index, seeds, legal, highlight, onTap, label }) {
  return (
    <button
      type="button"
      className={`${styles.hole} ${legal ? styles.holeLegal : ''}`}
      data-highlight={highlight ? 'true' : 'false'}
      disabled={!legal}
      aria-label={label}
      onClick={() => onTap(index)}
    >
      <Seeds count={seeds} />
      <span className={styles.holeCount}>{seeds}</span>
    </button>
  );
}
Hole.propTypes = {
  index: PropTypes.number.isRequired,
  seeds: PropTypes.number.isRequired,
  legal: PropTypes.bool.isRequired,
  highlight: PropTypes.bool.isRequired,
  onTap: PropTypes.func.isRequired,
  label: PropTypes.string.isRequired,
};

function Store({ seat, seeds, highlight, label }) {
  return (
    <div
      className={`${styles.store} ${seat === 1 ? styles.storeP2 : styles.storeP1}`}
      data-highlight={highlight ? 'true' : 'false'}
      role="img"
      aria-label={label}
    >
      <span className={styles.storeCount}>{seeds}</span>
    </div>
  );
}
Store.propTypes = {
  seat: PropTypes.number.isRequired,
  seeds: PropTypes.number.isRequired,
  highlight: PropTypes.bool.isRequired,
  label: PropTypes.string.isRequired,
};

/**
 * The shared board. Purely presentational: it knows nothing about turns,
 * rules or language — the parent decides which holes are legal and supplies
 * every label. DOM rather than canvas, because each hole has to be a real
 * focusable, labelled button.
 */
export function CongkakBoard({ board, legalHoles, onHoleTap, highlightHole, labels }) {
  const isLegal = hole => legalHoles.includes(hole);

  return (
    <div className={styles.board}>
      {/* P2's store sits on the left, P1's on the right. */}
      <Store seat={1} seeds={board[15]} highlight={highlightHole === 15}
             label={labels.storeLabel(1, board[15])} />

      <div className={styles.houseRows}>
        <div className={styles.houseRow}>
          {P2_HOUSES.map(i => (
            <Hole key={i} index={i} seeds={board[i]} legal={isLegal(i)}
                  highlight={highlightHole === i} onTap={onHoleTap}
                  label={labels.houseLabel(i, board[i])} />
          ))}
        </div>
        <div className={styles.houseRow}>
          {P1_HOUSES.map(i => (
            <Hole key={i} index={i} seeds={board[i]} legal={isLegal(i)}
                  highlight={highlightHole === i} onTap={onHoleTap}
                  label={labels.houseLabel(i, board[i])} />
          ))}
        </div>
      </div>

      <Store seat={0} seeds={board[7]} highlight={highlightHole === 7}
             label={labels.storeLabel(0, board[7])} />
    </div>
  );
}

CongkakBoard.propTypes = {
  board: PropTypes.arrayOf(PropTypes.number).isRequired,
  legalHoles: PropTypes.arrayOf(PropTypes.number).isRequired,
  onHoleTap: PropTypes.func.isRequired,
  highlightHole: PropTypes.number,
  labels: PropTypes.shape({
    houseLabel: PropTypes.func.isRequired,
    storeLabel: PropTypes.func.isRequired,
  }).isRequired,
};
