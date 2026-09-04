import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('./CrazyEightsGame', () => ({
  CrazyEightsGame: ({ memberId }) => <div>crazy eights match for {memberId}</div>,
}));

import { MultiplayerCrazyEightsSession } from './MultiplayerCrazyEightsSession';

describe('MultiplayerCrazyEightsSession', () => {
  it('renders the match immediately, with no lobby step', () => {
    render(<MultiplayerCrazyEightsSession memberId="m-1" />);
    expect(screen.getByText('crazy eights match for m-1')).toBeInTheDocument();
    expect(screen.queryByText(/join game/i)).not.toBeInTheDocument();
  });
});
