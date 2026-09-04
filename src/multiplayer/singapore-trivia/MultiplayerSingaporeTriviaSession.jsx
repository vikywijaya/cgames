import PropTypes from 'prop-types';
import { SingaporeTriviaGame } from './SingaporeTriviaGame';

export function MultiplayerSingaporeTriviaSession({ memberId, callbackUrl, accessToken }) {
  return (
    <SingaporeTriviaGame memberId={memberId} callbackUrl={callbackUrl} accessToken={accessToken} />
  );
}

MultiplayerSingaporeTriviaSession.propTypes = {
  memberId: PropTypes.string.isRequired,
  callbackUrl: PropTypes.string,
  accessToken: PropTypes.string,
};
