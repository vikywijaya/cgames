import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../utils/scoreStore', () => ({ saveScore: vi.fn() }));
vi.mock('../../utils/buildPayload', () => ({ buildPayload: vi.fn(() => ({ mocked: true })) }));

import { MultiplayerCongkakSession } from './MultiplayerCongkakSession';

describe('MultiplayerCongkakSession', () => {
  it('renders a playable Congkak board', () => {
    render(<MultiplayerCongkakSession memberId="m-1" />);
    expect(screen.getByLabelText(/Your hole 1, 7 seeds/i)).toBeInTheDocument();
  });
});
