import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import type { ProjectCard as Card } from '@cherry/shared';
import { ProjectCard } from './ProjectCard.tsx';

const now = Date.parse('2026-10-08T12:00:00Z');
const card: Card = {
  id: 'core',
  name: 'core',
  path: '/home/x/Projects/core',
  state: 'ready',
  phase: 'development',
  summary: 'Local personal dashboard',
  stack: ['Next.js'],
  nextStep: 'Build the Study Room floor',
  leftOff: null,
  git: { branch: 'main', ahead: 0, behind: 0, changes: 3, remote: true },
  lastWorked: now - 2 * 3600_000,
  projectJsonError: false,
  draft: false,
};

const renderCard = (c: Card) =>
  render(
    <MemoryRouter>
      <ProjectCard card={c} now={now} />
    </MemoryRouter>,
  );

describe('ProjectCard', () => {
  it('shows the next step, git chip and last worked time', () => {
    renderCard(card);
    expect(screen.getByText('Build the Study Room floor')).toBeInTheDocument();
    expect(screen.getByText('3 changes')).toBeInTheDocument();
    expect(screen.getByText('Last worked 2 h ago')).toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveAttribute('href', '/p/core');
  });

  it('sends a not-calibrated folder to calibration', () => {
    renderCard({ ...card, state: 'uncalibrated', phase: null, nextStep: null });
    expect(screen.getByRole('link')).toHaveAttribute('href', '/p/core/calibrate');
    expect(screen.getByText('Calibrate this folder')).toBeInTheDocument();
  });
});
