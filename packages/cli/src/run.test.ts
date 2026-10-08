import { describe, expect, it } from 'vitest';
import { run } from './run.ts';

describe('apeiron cli', () => {
  it('prints the version', async () => {
    expect(await run(['--version'])).toEqual({ code: 0, out: '0.0.0' });
  });

  it('prints help that lists the bare command as up', async () => {
    expect((await run(['--help'])).out).toContain('(none), up');
  });

  it('rejects unknown commands with help', async () => {
    const res = await run(['nope']);
    expect(res.code).toBe(2);
    expect(res.out).toContain('Usage: apeiron');
  });

  it('asks for a project name with open', async () => {
    expect((await run(['open'])).code).toBe(2);
  });

  it('says so when the daemon is not running', async () => {
    process.env.APEIRON_HOME = '/nonexistent-apeiron-home';
    expect(await run(['status'])).toEqual({
      code: 1,
      out: 'Apeiron is not running. Start it with `apeiron`.',
    });
    expect((await run(['down'])).out).toBe('Apeiron is not running.');
    delete process.env.APEIRON_HOME;
  });
});
