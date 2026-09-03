import PropTypes from 'prop-types';
import { ChessGame } from './ChessGame';

export function MultiplayerChessSession({ memberId, callbackUrl, accessToken }) {
  return (
    <ChessGame memberId={memberId} callbackUrl={callbackUrl} accessToken={accessToken} />
  );
}

MultiplayerChessSession.propTypes = {
  memberId: PropTypes.string.isRequired,
  callbackUrl: PropTypes.string,
  accessToken: PropTypes.string,
};
