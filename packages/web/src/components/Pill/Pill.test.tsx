import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { GitChip, StatePill } from './Pill.tsx';

describe('StatePill', () => {
  it.each([
    ['ready', 'Ready', 'success'],
    ['cctop', 'cctop', 'accent'],
    ['uncalibrated', 'Not calibrated', 'warning'],
  ] as const)('%s says %s', (state, label, tone) => {
    render(<StatePill state={state} />);
    expect(screen.getByText(label)).toHaveAttribute('data-tone', tone);
  });
});

describe('GitChip', () => {
  it('shows changes in amber', () => {
    render(<GitChip git={{ branch: 'main', ahead: 0, behind: 0, changes: 3, remote: true }} />);
    expect(screen.getByText('3 changes')).toHaveAttribute('data-tone', 'changes');
  });
  it('shows No git outside a repository', () => {
    render(<GitChip git={null} />);
    expect(screen.getByText('No git')).toBeInTheDocument();
  });
});
