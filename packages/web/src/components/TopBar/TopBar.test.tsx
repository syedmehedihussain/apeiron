import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TopBar } from './TopBar.tsx';

describe('TopBar', () => {
  it('shows the app name, settings and Magnet', () => {
    render(<TopBar crumbs={[]} claude="ok" />);
    expect(screen.getByRole('link', { name: 'Apeiron home' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open Magnet' })).toBeInTheDocument();
  });

  it('has no breadcrumb on Home', () => {
    render(<TopBar crumbs={[]} claude="ok" />);
    expect(screen.queryByRole('navigation', { name: 'Breadcrumb' })).not.toBeInTheDocument();
  });

  it('links earlier crumbs and marks the last one current', () => {
    render(
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
});
