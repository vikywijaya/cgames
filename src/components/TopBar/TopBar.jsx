import styles from './TopBar.module.css';

function getInitials(name) {
  return String(name)
    .split(/[\s\-_]+/)
    .map(p => p[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || '?';
}

export function TopBar({ title, onBack, memberId, noBleed = false, home = false }) {
  return (
    <header className={`${styles.topBar} ${noBleed ? styles.topBarNoBleed : ''} ${home ? styles.topBarHome : ''}`}>
      <div className={styles.topBarLeft}>
        {onBack && (
          <button className={styles.topBarBack} onClick={onBack} aria-label="Go back">
            ‹
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>
            </svg>
          </button>
        )}
      </div>

      <div className={styles.topBarCenter}>
        <span className={styles.topBarTitle}>{title}</span>
      </div>

      <div className={styles.topBarRight} />
    </header>
  );
}
