import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('./SingaporeTriviaGame', () => ({
  SingaporeTriviaGame: ({ memberId }) => <div>singapore trivia match for {memberId}</div>,
}));

import { MultiplayerSingaporeTriviaSession } from './MultiplayerSingaporeTriviaSession';

describe('MultiplayerSingaporeTriviaSession', () => {
  it('renders the match immediately, with no lobby step', () => {
    render(<MultiplayerSingaporeTriviaSession memberId="m-1" />);
    expect(screen.getByText('singapore trivia match for m-1')).toBeInTheDocument();
    expect(screen.queryByText(/join game/i)).not.toBeInTheDocument();
  });
});
