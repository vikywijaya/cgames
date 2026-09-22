import PropTypes from 'prop-types';
import { CongkakGame } from './CongkakGame';

export function MultiplayerCongkakSession({ memberId, callbackUrl, accessToken }) {
  return (
    <CongkakGame memberId={memberId} callbackUrl={callbackUrl} accessToken={accessToken} />
  );
}

MultiplayerCongkakSession.propTypes = {
  memberId: PropTypes.string.isRequired,
  callbackUrl: PropTypes.string,
  accessToken: PropTypes.string,
};
