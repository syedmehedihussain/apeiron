import { describe, expect, it } from 'vitest';
import { run } from './run.ts';

describe('cherry cli', () => {
  it('prints the version', async () => {
    expect(await run(['--version'])).toEqual({ code: 0, out: '0.0.0' });
  });

  it('prints help that lists the bare command as up', async () => {
    expect((await run(['--help'])).out).toContain('(none), up');
  });

  it('rejects unknown commands with help', async () => {
    const res = await run(['nope']);
    expect(res.code).toBe(2);
    expect(res.out).toContain('Usage: cherry');
  });

  it('asks for a project name with open', async () => {
    expect((await run(['open'])).code).toBe(2);
  });

  it('says so when the daemon is not running', async () => {
    process.env.CHERRY_HOME = '/nonexistent-cherry-home';
    expect(await run(['status'])).toEqual({
      code: 1,
      out: 'Cherry is not running. Start it with `cherry`.',
    });
    expect((await run(['down'])).out).toBe('Cherry is not running.');
    delete process.env.CHERRY_HOME;
  });
});
