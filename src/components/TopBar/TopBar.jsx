import styles from './TopBar.module.css';

function getInitials(name) {
  return String(name)
    .split(/[\s\-_]+/)
    .map(p => p[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || '?';
}

export function TopBar({ title, onBack, memberId, muted, onToggleMusic, noBleed = false }) {
  return (
    <header className={`${styles.topBar} ${noBleed ? styles.topBarNoBleed : ''}`}>
      <div className={styles.topBarLeft}>
        {onBack && (
          <button className={styles.topBarBack} onClick={onBack} aria-label="Go back">
            ‹ Back
          </button>
        )}
      </div>

      <div className={styles.topBarCenter}>
        <span className={styles.topBarTitle}>{title}</span>
      </div>

      <div className={styles.topBarRight}>
        <div className={styles.topBarProfile} aria-label={`Profile: ${memberId}`}>
          <span className={styles.topBarName}>{memberId}</span>
          <div className={styles.topBarAvatar} aria-hidden="true">
            {getInitials(memberId)}
          </div>
        </div>
      </div>
    </header>
  );
}
