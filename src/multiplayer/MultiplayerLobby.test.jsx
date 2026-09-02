import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MultiplayerLobby } from './MultiplayerLobby';

const gameMeta = { title: 'CaritaHub Chess', subtitle: 'Western Chess — Multiplayer', maxPlayers: 2, hostColors: ['white'] };

describe('MultiplayerLobby', () => {
  it('shows a room-not-found error when the socket reports one', () => {
    render(
      <MultiplayerLobby gameMeta={gameMeta} status="connected" roomId={null} myColor={null}
        players={[]} errorMessage="Room not found" onCreateRoom={vi.fn()} onJoinRoom={vi.fn()}
        inviteRoomId={null} onStart={vi.fn()} />
    );
    expect(screen.getByText('Room not found')).toBeInTheDocument();
  });

  it('disables the create button until a name is entered', () => {
    render(
      <MultiplayerLobby gameMeta={gameMeta} status="connected" roomId={null} myColor={null}
        players={[]} errorMessage={null} onCreateRoom={vi.fn()} onJoinRoom={vi.fn()}
        inviteRoomId={null} onStart={vi.fn()} />
    );
    expect(screen.getByRole('button', { name: 'Create Game' })).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText('Enter your name'), { target: { value: 'Tester' } });
    expect(screen.getByRole('button', { name: 'Create Game' })).not.toBeDisabled();
  });

  it('calls onCreateRoom with the entered name when there is no invite room', () => {
    const onCreateRoom = vi.fn();
    render(
      <MultiplayerLobby gameMeta={gameMeta} status="connected" roomId={null} myColor={null}
        players={[]} errorMessage={null} onCreateRoom={onCreateRoom} onJoinRoom={vi.fn()}
        inviteRoomId={null} onStart={vi.fn()} />
    );
    fireEvent.change(screen.getByPlaceholderText('Enter your name'), { target: { value: 'Tester' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Game' }));
    expect(onCreateRoom).toHaveBeenCalledWith('Tester');
  });

  it('shows "Join Game" and calls onJoinRoom when an inviteRoomId is present', () => {
    const onJoinRoom = vi.fn();
    render(
      <MultiplayerLobby gameMeta={gameMeta} status="connected" roomId={null} myColor={null}
        players={[]} errorMessage={null} onCreateRoom={vi.fn()} onJoinRoom={onJoinRoom}
        inviteRoomId="ABC123" onStart={vi.fn()} />
    );
    fireEvent.change(screen.getByPlaceholderText('Enter your name'), { target: { value: 'Opponent' } });
    fireEvent.click(screen.getByRole('button', { name: 'Join Game' }));
    expect(onJoinRoom).toHaveBeenCalledWith('Opponent');
  });

  it('shows the Start Game button only once enough players have connected', () => {
    const players = [
      { name: 'Tester', color: 'white', connected: true },
      { name: 'Opponent', color: 'black', connected: true },
    ];
    render(
      <MultiplayerLobby gameMeta={gameMeta} status="connected" roomId="ABC123" myColor="white"
        players={players} errorMessage={null} onCreateRoom={vi.fn()} onJoinRoom={vi.fn()}
        inviteRoomId={null} onStart={vi.fn()} />
    );
    expect(screen.getByRole('button', { name: 'Start Game' })).toBeInTheDocument();
  });

  it('does not show Start Game while waiting for the opponent', () => {
    const players = [{ name: 'Tester', color: 'white', connected: true }];
    render(
      <MultiplayerLobby gameMeta={gameMeta} status="connected" roomId="ABC123" myColor="white"
        players={players} errorMessage={null} onCreateRoom={vi.fn()} onJoinRoom={vi.fn()}
        inviteRoomId={null} onStart={vi.fn()} />
    );
    expect(screen.queryByRole('button', { name: 'Start Game' })).not.toBeInTheDocument();
    expect(screen.getByText(/waiting for 1 more player/i)).toBeInTheDocument();
  });
});
