import PropTypes from 'prop-types';
import appStyles from '../../App.module.css';
import styles from './MultiplayerGames.module.css';
import { multiplayerGameUrl } from '../../shared/multiplayerGames';

// Pre-generated square card covers (src/assets/games/mp-<slug>.jpg), same convention as
// the single-player game cards in App.jsx.
const coverImages = import.meta.glob('../../assets/games/mp-*.jpg', { eager: true, query: '?url', import: 'default' });
function getCoverImage(slug) {
  return coverImages[`../../assets/games/mp-${slug}.jpg`] ?? null;
}

export function MultiplayerGames({ t, games, memberId, callbackUrl, accessToken, inAppSlugs = [], onPlayInApp }) {
  // Anything unavailable sinks to the end so the grid opens with games you
  // can actually start. Derived rather than baked into MULTIPLAYER_GAMES so
  // that catalog keeps its natural order — clearing a comingSoon flag puts
  // that game straight back where it belongs instead of leaving it stranded
  // at the bottom. sort is stable, so each group keeps its catalog order.
  const ordered = [...games].sort((a, b) => Number(!!a.comingSoon) - Number(!!b.comingSoon));

  return (
    <div className={appStyles.lobby}>
      <div className={styles.header}>
        <h2 className={appStyles.sectionTitle}>
          <span aria-hidden="true">👥</span> {t.app.multiplayerTitle}
        </h2>
        <p className={styles.subtitle}>{t.app.multiplayerSubtitle}</p>
      </div>
      <div className={appStyles.gameGrid} role="list">
        {ordered.map(game => (
          <button
            key={game.id}
            className={`${appStyles.gameCard} ${game.comingSoon ? appStyles.gameCardDisabled : ''}`}
            disabled={game.comingSoon}
            onClick={game.comingSoon ? undefined : () => {
              if (inAppSlugs.includes(game.slug) && onPlayInApp) {
                onPlayInApp(game.slug);
              } else {
                window.location.href = multiplayerGameUrl(game.slug, { memberId, callbackUrl, accessToken });
              }
            }}
            aria-label={game.comingSoon ? `${game.title} — ${t.app.comingSoon}` : `Play ${game.title}`}
          >
            {/* Plain text in the corner chip, not a nested .comingSoonBadge:
                that badge is a 40px footer pill sized for the single-player
                card's play-button slot, and these cards have no footer. Put
                inside this chip it was a pill within a pill. */}
            <span className={appStyles.gameDomain}>
              {game.comingSoon ? t.app.comingSoon : t.app.multiplayerPlayers}
            </span>
            <div className={appStyles.gameIconBox} aria-hidden="true">
              {getCoverImage(game.slug)
                ? <img src={getCoverImage(game.slug)} alt="" className={appStyles.gameIconImg} />
                : game.icon}
            </div>
            <div className={appStyles.gameMeta}>
              <h3 className={appStyles.gameCardTitle}>{game.title}</h3>
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
    comingSoon: PropTypes.bool,
  })).isRequired,
  memberId: PropTypes.string,
  callbackUrl: PropTypes.string,
  accessToken: PropTypes.string,
  inAppSlugs: PropTypes.arrayOf(PropTypes.string),
  onPlayInApp: PropTypes.func,
};
