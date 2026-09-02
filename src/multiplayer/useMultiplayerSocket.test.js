import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMultiplayerSocket } from './useMultiplayerSocket';

class FakeSocket {
  constructor() { this.handlers = {}; this.emitted = []; }
  on(event, cb) { (this.handlers[event] ??= []).push(cb); return this; }
  emit(event, payload) { this.emitted.push([event, payload]); }
  disconnect() {}
  _trigger(event, payload) { (this.handlers[event] || []).forEach(cb => cb(payload)); }
}

let fakeSocket;
vi.mock('socket.io-client', () => ({
  io: vi.fn(() => fakeSocket),
}));

beforeEach(() => { fakeSocket = new FakeSocket(); });

describe('useMultiplayerSocket', () => {
  it('starts in the connecting status', () => {
    const { result } = renderHook(() => useMultiplayerSocket('chess'));
    expect(result.current.status).toBe('connecting');
  });

  it('moves to connected status on the socket connect event', () => {
    const { result } = renderHook(() => useMultiplayerSocket('chess'));
    act(() => { fakeSocket._trigger('connect'); });
    expect(result.current.status).toBe('connected');
  });

  it('captures roomId and myColor from the joined event', () => {
    const { result } = renderHook(() => useMultiplayerSocket('chess'));
    act(() => { fakeSocket._trigger('joined', { roomId: 'ABC123', color: 'white' }); });
    expect(result.current.roomId).toBe('ABC123');
    expect(result.current.myColor).toBe('white');
  });

  it('updates players from room_update', () => {
    const { result } = renderHook(() => useMultiplayerSocket('chess'));
    const players = [{ name: 'A', color: 'white', connected: true }];
    act(() => { fakeSocket._trigger('room_update', { players }); });
    expect(result.current.players).toEqual(players);
  });

  it('sets gameState from game_started', () => {
    const { result } = renderHook(() => useMultiplayerSocket('chess'));
    const state = { fen: 'x', turn: 'w', isGameOver: false };
    act(() => { fakeSocket._trigger('game_started', state); });
    expect(result.current.gameState).toEqual(state);
  });

  it('sets gameState from game_state too', () => {
    const { result } = renderHook(() => useMultiplayerSocket('chess'));
    const state = { fen: 'y', turn: 'b', isGameOver: false };
    act(() => { fakeSocket._trigger('game_state', state); });
    expect(result.current.gameState).toEqual(state);
  });

  it('sets lastGameOver from game_over', () => {
    const { result } = renderHook(() => useMultiplayerSocket('chess'));
    act(() => { fakeSocket._trigger('game_over', { winner: 'white', reason: 'Checkmate' }); });
    expect(result.current.lastGameOver).toEqual({ winner: 'white', reason: 'Checkmate' });
  });

  it('moves to disconnected status on disconnect', () => {
    const { result } = renderHook(() => useMultiplayerSocket('chess'));
    act(() => { fakeSocket._trigger('connect'); });
    act(() => { fakeSocket._trigger('disconnect'); });
    expect(result.current.status).toBe('disconnected');
  });

  it('captures the error message from an error event', () => {
    const { result } = renderHook(() => useMultiplayerSocket('chess'));
    act(() => { fakeSocket._trigger('error', { message: 'Room not found' }); });
    expect(result.current.errorMessage).toBe('Room not found');
  });

  it('tracks reconnect attempts and resets to 0 on reconnecting connect', () => {
    const { result } = renderHook(() => useMultiplayerSocket('chess'));
    act(() => { fakeSocket._trigger('reconnect_attempt', 2); });
    expect(result.current.reconnectAttempt).toBe(2);
    act(() => { fakeSocket._trigger('connect'); });
    expect(result.current.reconnectAttempt).toBe(0);
  });

  it('captures the disconnected player name from player_disconnected', () => {
    const { result } = renderHook(() => useMultiplayerSocket('chess'));
    act(() => { fakeSocket._trigger('player_disconnected', { playerName: 'Opponent' }); });
    expect(result.current.disconnectedPlayerName).toBe('Opponent');
  });

  it('clears disconnectedPlayerName once a new game_state arrives', () => {
    const { result } = renderHook(() => useMultiplayerSocket('chess'));
    act(() => { fakeSocket._trigger('player_disconnected', { playerName: 'Opponent' }); });
    act(() => { fakeSocket._trigger('game_state', { fen: 'z', turn: 'w', isGameOver: false }); });
    expect(result.current.disconnectedPlayerName).toBe(null);
  });

  it('exposes the raw socket instance for game-specific emits', () => {
    const { result } = renderHook(() => useMultiplayerSocket('chess'));
    expect(result.current.socketInstance).toBe(fakeSocket);
  });

  it('createRoom emits join_game with no roomId and the given gameType', () => {
    const { result } = renderHook(() => useMultiplayerSocket('chess'));
    act(() => { result.current.createRoom('Tester'); });
    expect(fakeSocket.emitted).toContainEqual(
      ['join_game', { roomId: null, playerName: 'Tester', gameType: 'chess' }]
    );
  });

  it('joinRoom emits join_game with the given roomId', () => {
    const { result } = renderHook(() => useMultiplayerSocket('chess'));
    act(() => { result.current.joinRoom('Tester', 'ABC123'); });
    expect(fakeSocket.emitted).toContainEqual(
      ['join_game', { roomId: 'ABC123', playerName: 'Tester', gameType: 'chess' }]
    );
  });

  it('startGame emits start_game', () => {
    const { result } = renderHook(() => useMultiplayerSocket('chess'));
    act(() => { result.current.startGame(); });
    expect(fakeSocket.emitted).toContainEqual(['start_game', undefined]);
  });
});
