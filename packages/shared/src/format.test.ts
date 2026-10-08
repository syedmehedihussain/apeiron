import { describe, expect, it } from 'vitest';
import { gitChip, relativeTime } from './format.ts';

const now = Date.parse('2026-10-08T12:00:00Z');
const ago = (ms: number) => relativeTime(now - ms, now);

describe('relativeTime', () => {
  it.each([
    [10_000, 'just now'],
    [25 * 60_000, '25 min ago'],
    [2 * 3600_000, '2 h ago'],
    [26 * 3600_000, 'Yesterday'],
    [3 * 86400_000, '3 days ago'],
    [14 * 86400_000, '2 weeks ago'],
    [35 * 86400_000, '1 month ago'],
  ])('%i ms → %s', (ms, text) => {
    expect(ago(ms)).toBe(text);
  });
});

describe('gitChip', () => {
  const base = { branch: 'main', ahead: 0, behind: 0, changes: 0, remote: true };
  it('puts changes first', () => {
    expect(gitChip({ ...base, changes: 3, behind: 2 })).toEqual({
      label: '3 changes',
      tone: 'changes',
    });
  });
  it('shows behind before ahead', () => {
    expect(gitChip({ ...base, ahead: 1, behind: 2 }).label).toBe('2 behind');
  });
  it('says No remote for a local-only repo', () => {
    expect(gitChip({ ...base, remote: false }).label).toBe('No remote');
  });
  it('is clean when nothing is pending', () => {
    expect(gitChip(base)).toEqual({ label: 'clean', tone: 'clean' });
  });
});
