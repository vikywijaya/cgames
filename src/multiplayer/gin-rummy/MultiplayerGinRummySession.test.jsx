import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('./GinRummyGame', () => ({
  GinRummyGame: ({ memberId }) => <div>gin rummy match for {memberId}</div>,
}));

import { MultiplayerGinRummySession } from './MultiplayerGinRummySession';

describe('MultiplayerGinRummySession', () => {
  it('renders the match immediately, with no lobby step', () => {
    render(<MultiplayerGinRummySession memberId="m-1" />);
    expect(screen.getByText('gin rummy match for m-1')).toBeInTheDocument();
    expect(screen.queryByText(/join game/i)).not.toBeInTheDocument();
  });
});
