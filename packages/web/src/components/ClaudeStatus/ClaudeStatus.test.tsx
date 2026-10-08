import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ClaudeStatus, type ClaudeState } from './ClaudeStatus.tsx';

describe('ClaudeStatus', () => {
  it.each<[ClaudeState, string]>([
    ['checking', 'Checking for Claude Code'],
    ['ok', 'Claude Code is ready'],
    ['working', 'Claude Code is working'],
    ['missing', 'Claude Code is not installed or not logged in'],
  ])('%s state says it in words, not only colour', (state, text) => {
    render(<ClaudeStatus state={state} />);
    expect(screen.getByText(`: ${text}`)).toBeInTheDocument();
  });

  it('names the problem when Claude is missing', () => {
    render(<ClaudeStatus state="missing" />);
    expect(screen.getByText('Claude Code not found')).toBeInTheDocument();
  });
});
