import { useState } from 'react';
import PropTypes from 'prop-types';
import styles from './MultiplayerLobby.module.css';

export function MultiplayerLobby({
  gameMeta, status, roomId, myColor, players, errorMessage,
  onCreateRoom, onJoinRoom, inviteRoomId, onStart,
}) {
  const [name, setName] = useState('');

  const connectedCount = players.filter(p => p.connected).length;
  const isHost = myColor !== null && gameMeta.hostColors.includes(myColor);
  const allReady = connectedCount >= gameMeta.maxPlayers;
  const hasJoined = roomId !== null;

  const handleSubmit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (inviteRoomId) onJoinRoom(trimmed);
    else onCreateRoom(trimmed);
  };

  return (
    <div className={styles.lobby}>
      <h2 className={styles.title}>{gameMeta.title}</h2>
      <p className={styles.subtitle}>{gameMeta.subtitle}</p>

      {errorMessage && <p className={styles.error}>{errorMessage}</p>}

      {!hasJoined && (
        <div className={styles.joinForm}>
          <label htmlFor="mp-name">Your Name</label>
          <input
            id="mp-name"
            type="text"
            placeholder="Enter your name"
            value={name}
            onChange={e => setName(e.target.value)}
          />
          <button
            className={styles.primaryBtn}
            disabled={name.trim().length === 0 || status !== 'connected'}
            onClick={handleSubmit}
          >
            {inviteRoomId ? 'Join Game' : 'Create Game'}
          </button>
        </div>
      )}

      {hasJoined && (
        <div className={styles.waitingRoom}>
          {players.map(p => (
            <div key={p.color} className={styles.playerRow}>
              {p.name} ({p.color}){!p.connected && ' — disconnected'}
            </div>
          ))}
          {isHost && allReady && (
            <button className={styles.primaryBtn} onClick={onStart}>Start Game</button>
          )}
          {isHost && !allReady && (
            <p>Waiting for {gameMeta.maxPlayers - connectedCount} more player{gameMeta.maxPlayers - connectedCount > 1 ? 's' : ''}…</p>
          )}
        </div>
      )}
    </div>
  );
}

MultiplayerLobby.propTypes = {
  gameMeta: PropTypes.shape({
    title: PropTypes.string.isRequired,
    subtitle: PropTypes.string.isRequired,
    maxPlayers: PropTypes.number.isRequired,
    hostColors: PropTypes.arrayOf(PropTypes.string).isRequired,
  }).isRequired,
  status: PropTypes.string.isRequired,
  roomId: PropTypes.string,
  myColor: PropTypes.string,
  players: PropTypes.array.isRequired,
  errorMessage: PropTypes.string,
  onCreateRoom: PropTypes.func.isRequired,
  onJoinRoom: PropTypes.func.isRequired,
  inviteRoomId: PropTypes.string,
  onStart: PropTypes.func.isRequired,
};
