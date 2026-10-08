import { describe, expect, it } from 'vitest';
import { run } from './run.ts';

describe('apeiron cli', () => {
  it('prints the version', () => {
    expect(run(['--version'])).toEqual({ code: 0, out: '0.0.0' });
  });

  it('treats a bare call as up', () => {
    expect(run([]).out).toContain('apeiron up');
  });

  it('rejects unknown commands with help', () => {
    const res = run(['nope']);
    expect(res.code).toBe(2);
    expect(res.out).toContain('Usage: apeiron');
  });
});
