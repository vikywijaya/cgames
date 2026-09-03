import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('./ChessGame', () => ({
  ChessGame: ({ memberId }) => <div>chess match for {memberId}</div>,
}));

import { MultiplayerChessSession } from './MultiplayerChessSession';

describe('MultiplayerChessSession', () => {
  it('renders the match immediately, with no lobby step', () => {
    render(<MultiplayerChessSession memberId="m-1" />);
    expect(screen.getByText('chess match for m-1')).toBeInTheDocument();
    expect(screen.queryByText('CaritaHub Chess')).not.toBeInTheDocument();
  });
});
