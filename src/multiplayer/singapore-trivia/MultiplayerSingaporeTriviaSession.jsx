import { useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { useMultiplayerSocket } from '../useMultiplayerSocket';
import { MultiplayerLobby } from '../MultiplayerLobby';
import { SingaporeTriviaGame } from './SingaporeTriviaGame';

const SINGAPORE_TRIVIA_META = {
  title: 'Singapore Trivia',
  subtitle: 'SG Quiz — 2 to 6 Players, 10 Questions',
  maxPlayers: 2,
  hostColors: ['p1'],
};

function reflectInUrl(params) {
  const url = new URL(window.location.href);
  Object.entries(params).forEach(([k, v]) => {
    if (v) url.searchParams.set(k, v);
  });
  window.history.replaceState({}, '', url);
}

export function MultiplayerSingaporeTriviaSession({ memberId, callbackUrl, accessToken }) {
  const socket = useMultiplayerSocket('singapore-trivia');
  const nameRef = useRef('');
  const initialParams = useRef(new URLSearchParams(window.location.search));
  const inviteRoomId = initialParams.current.get('room');

  useEffect(() => {
    reflectInUrl({ view: 'mp-singapore-trivia', game: 'singapore-trivia' });
  }, []);

  useEffect(() => {
    if (socket.roomId) reflectInUrl({ room: socket.roomId, color: socket.myColor, name: nameRef.current });
  }, [socket.roomId, socket.myColor]);

  const handleCreateRoom = (name) => { nameRef.current = name; socket.createRoom(name); };
  const handleJoinRoom   = (name) => { nameRef.current = name; socket.joinRoom(name, inviteRoomId); };

  const hasStarted = socket.gameState !== null;

  if (!hasStarted) {
    return (
      <MultiplayerLobby
        gameMeta={SINGAPORE_TRIVIA_META}
        status={socket.status}
        roomId={socket.roomId}
        myColor={socket.myColor}
        players={socket.players}
        errorMessage={socket.errorMessage}
        onCreateRoom={handleCreateRoom}
        onJoinRoom={handleJoinRoom}
        inviteRoomId={inviteRoomId}
        onStart={socket.startGame}
      />
    );
  }

  return (
    <SingaporeTriviaGame
      myColor={socket.myColor}
      myName={nameRef.current}
      gameState={socket.gameState}
      lastGameOver={socket.lastGameOver}
      socket={socket.socketInstance}
      status={socket.status}
      reconnectAttempt={socket.reconnectAttempt}
      disconnectedPlayerName={socket.disconnectedPlayerName}
      memberId={memberId}
      callbackUrl={callbackUrl}
      accessToken={accessToken}
    />
  );
}

MultiplayerSingaporeTriviaSession.propTypes = {
  memberId: PropTypes.string.isRequired,
  callbackUrl: PropTypes.string,
  accessToken: PropTypes.string,
};
