import PropTypes from 'prop-types';
import { GinRummyGame } from './GinRummyGame';

export function MultiplayerGinRummySession({ memberId, callbackUrl, accessToken }) {
  return (
    <GinRummyGame memberId={memberId} callbackUrl={callbackUrl} accessToken={accessToken} />
  );
}

MultiplayerGinRummySession.propTypes = {
  memberId: PropTypes.string.isRequired,
  callbackUrl: PropTypes.string,
  accessToken: PropTypes.string,
};
