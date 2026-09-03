import PropTypes from 'prop-types';
import { XiangqiGame } from './XiangqiGame';

export function MultiplayerXiangqiSession({ memberId, callbackUrl, accessToken }) {
  return (
    <XiangqiGame memberId={memberId} callbackUrl={callbackUrl} accessToken={accessToken} />
  );
}

MultiplayerXiangqiSession.propTypes = {
  memberId: PropTypes.string.isRequired,
  callbackUrl: PropTypes.string,
  accessToken: PropTypes.string,
};
