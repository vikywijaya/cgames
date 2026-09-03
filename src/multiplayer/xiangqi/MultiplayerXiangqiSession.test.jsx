import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('./XiangqiGame', () => ({
  XiangqiGame: ({ memberId }) => <div>xiangqi match for {memberId}</div>,
}));

import { MultiplayerXiangqiSession } from './MultiplayerXiangqiSession';

describe('MultiplayerXiangqiSession', () => {
  it('renders the match immediately, with no lobby step', () => {
    render(<MultiplayerXiangqiSession memberId="m-1" />);
    expect(screen.getByText('xiangqi match for m-1')).toBeInTheDocument();
    expect(screen.queryByText('CaritaHub 象棋')).not.toBeInTheDocument();
  });
});
