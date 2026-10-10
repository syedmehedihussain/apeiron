import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { queryClient } from '../../api/queries.ts';
import { TopBar } from './TopBar.tsx';

const wrap = (ui: ReactNode) =>
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );

describe('TopBar', () => {
  it('shows the app name, settings and Magnet', () => {
    wrap(<TopBar crumbs={[]} claude="ok" />);
    expect(screen.getByRole('link', { name: 'Cherry home' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open Magnet' })).toBeInTheDocument();
  });

  it('has no breadcrumb on Home', () => {
    wrap(<TopBar crumbs={[]} claude="ok" />);
    expect(screen.queryByRole('navigation', { name: 'Breadcrumb' })).not.toBeInTheDocument();
  });

  it('links earlier crumbs and marks the last one current', () => {
    wrap(
      <TopBar
        crumbs={[
          { label: 'Projects', href: '/' },
          { label: 'core', href: '/p/core' },
        ]}
        claude="ok"
      />,
    );
    expect(screen.getByRole('link', { name: 'Projects' })).toHaveAttribute('href', '/');
    expect(screen.getByText('core')).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByRole('link', { name: 'core' })).not.toBeInTheDocument();
  });

  it('shows the phase bar in the workspace', () => {
    wrap(<TopBar crumbs={[]} claude="ok" phase="development" />);
    expect(screen.getByRole('list', { name: 'Project phase' })).toBeInTheDocument();
    expect(screen.getByText('Development').closest('li')).toHaveAttribute('aria-current', 'step');
  });
});
