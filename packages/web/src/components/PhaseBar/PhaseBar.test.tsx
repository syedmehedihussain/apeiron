import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PhaseBarCompact, PhaseBarFull } from './PhaseBar.tsx';

describe('PhaseBar', () => {
  it('compact: marks done, current and future segments', () => {
    const { container } = render(<PhaseBarCompact phase="preparation" />);
    const states = [...container.querySelectorAll('[data-state]')].map((el) =>
      el.getAttribute('data-state'),
    );
    expect(states).toEqual(['done', 'done', 'current', 'future', 'future']);
    expect(screen.getByRole('img', { name: 'Phase 3 of 5: Preparation' })).toBeInTheDocument();
  });

  it('compact: shows Unknown without a phase', () => {
    render(<PhaseBarCompact phase={null} />);
    expect(screen.getByText('Unknown')).toBeInTheDocument();
  });

  it('full: marks the current phase as the current step', () => {
    render(<PhaseBarFull phase="plan" />);
    expect(screen.getByText('Plan').closest('li')).toHaveAttribute('aria-current', 'step');
    expect(screen.getByText('Deployment').closest('li')).toHaveAttribute('data-state', 'future');
  });
});
