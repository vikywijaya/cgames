import PropTypes from 'prop-types';
import appStyles from '../../App.module.css';
import styles from './MultiplayerGames.module.css';
import { multiplayerGameUrl } from '../../shared/multiplayerGames';

export function MultiplayerGames({ t, games }) {
  return (
    <div className={appStyles.lobby}>
      <div className={styles.header}>
        <h2 className={appStyles.sectionTitle}>
          <span aria-hidden="true">👥</span> {t.app.multiplayerTitle}
        </h2>
        <p className={styles.subtitle}>{t.app.multiplayerSubtitle}</p>
      </div>
      <div className={appStyles.gameGrid} role="list">
        {games.map(game => (
          <button
            key={game.id}
            className={appStyles.gameCard}
            onClick={() => window.open(multiplayerGameUrl(game.slug), '_blank', 'noopener,noreferrer')}
            aria-label={`Play ${game.title}`}
          >
            <span className={appStyles.gameDomain}>{t.app.multiplayerPlayers}</span>
            <div className={appStyles.gameIconBox} aria-hidden="true">{game.icon}</div>
            <div className={appStyles.gameMeta}>
              <h3 className={appStyles.gameCardTitle}>{game.title}</h3>
              <p className={styles.cardDescription}>{game.description}</p>
              <div className={appStyles.gameCardFooter}>
                <span className={styles.externalBadge}>{t.app.multiplayerExternalBadge}</span>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

MultiplayerGames.propTypes = {
  t: PropTypes.object.isRequired,
  games: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.string.isRequired,
    slug: PropTypes.string.isRequired,
    icon: PropTypes.string.isRequired,
    title: PropTypes.string.isRequired,
    description: PropTypes.string.isRequired,
  })).isRequired,
};
