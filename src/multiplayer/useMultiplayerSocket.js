import { useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
import { MULTIPLAYER_BASE_URL } from '../shared/multiplayerGames';

/**
 * Owns one Socket.IO connection for a Play with a Friend session. Generic
 * across all 5 ready games — only the shape of `gameState` differs per game,
 * which is why it's returned opaquely rather than parsed here.
 */
export function useMultiplayerSocket(gameSlug) {
  const socketRef = useRef(null);
  const [status, setStatus] = useState('connecting');
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const [roomId, setRoomId] = useState(null);
  const [myColor, setMyColor] = useState(null);
  const [players, setPlayers] = useState([]);
  const [gameState, setGameState] = useState(null);
  const [lastGameOver, setLastGameOver] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);
  const [disconnectedPlayerName, setDisconnectedPlayerName] = useState(null);
  const [socketInstance, setSocketInstance] = useState(null);

  useEffect(() => {
    const socket = io(MULTIPLAYER_BASE_URL, { reconnectionAttempts: 5, reconnectionDelay: 1000 });
    socketRef.current = socket;
    setSocketInstance(socket);

    socket.on('connect', () => { setStatus('connected'); setReconnectAttempt(0); });
    socket.on('disconnect', () => setStatus('disconnected'));
    socket.on('connect_error', () => setStatus('error'));
    socket.on('reconnect_attempt', n => setReconnectAttempt(n));
    socket.on('joined', ({ roomId, color }) => { setRoomId(roomId); setMyColor(color); });
    socket.on('room_update', ({ players }) => setPlayers(players));
    socket.on('game_started', state => setGameState(state));
    socket.on('game_state',   state => { setGameState(state); setDisconnectedPlayerName(null); });
    socket.on('game_over', payload => setLastGameOver(payload));
    socket.on('error', ({ message }) => setErrorMessage(message));
    socket.on('player_disconnected', ({ playerName }) => setDisconnectedPlayerName(playerName));

    return () => socket.disconnect();
  }, [gameSlug]);

  const createRoom = useCallback((playerName) => {
    socketRef.current?.emit('join_game', { roomId: null, playerName, gameType: gameSlug });
  }, [gameSlug]);

  const joinRoom = useCallback((playerName, inviteRoomId) => {
    socketRef.current?.emit('join_game', { roomId: inviteRoomId, playerName, gameType: gameSlug });
  }, [gameSlug]);

  const startGame = useCallback(() => {
    socketRef.current?.emit('start_game');
  }, []);

  return {
    status, reconnectAttempt, roomId, myColor, players, gameState, lastGameOver,
    errorMessage, disconnectedPlayerName, socketInstance,
    createRoom, joinRoom, startGame,
  };
}
