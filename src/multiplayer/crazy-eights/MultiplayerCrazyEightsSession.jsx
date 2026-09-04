import PropTypes from 'prop-types';
import { CrazyEightsGame } from './CrazyEightsGame';

export function MultiplayerCrazyEightsSession({ memberId, callbackUrl, accessToken }) {
  return (
    <CrazyEightsGame memberId={memberId} callbackUrl={callbackUrl} accessToken={accessToken} />
  );
}

MultiplayerCrazyEightsSession.propTypes = {
  memberId: PropTypes.string.isRequired,
  callbackUrl: PropTypes.string,
  accessToken: PropTypes.string,
};
