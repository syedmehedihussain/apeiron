import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import type { Health } from '@apeiron/shared';
import { SESSION_COOKIE } from '../src/auth.ts';
import { createDaemon, type Daemon } from '../src/daemon.ts';
import { fakeRunner } from '../src/claude/fake-runner.ts';

export const PORT = 4317;
export const ORIGIN = `http://127.0.0.1:${PORT}`;
export const HOST = `127.0.0.1:${PORT}`;

export const fakeHealth: Health = {
  ok: true,
  name: 'apeiron',
  version: '0.0.0',
  claude: { found: true, loggedIn: true, version: '2.1.288' },
  git: { found: true, version: '2.55.0' },
  gh: { found: true, loggedIn: true },
};

export function tempDir(prefix = 'apeiron-test-'): string {
  return mkdtempSync(path.join(tmpdir(), prefix));
}

export function write(file: string, content: string): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content);
}

export function gitInit(dir: string): void {
  const run = (...args: string[]) =>
    execFileSync('git', args, {
      cwd: dir,
      stdio: 'ignore',
      env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null' },
    });
  mkdirSync(dir, { recursive: true });
  run('init', '-q', '-b', 'main');
  run('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', 'init');
}

export interface TestDaemon extends Daemon {
  home: string;
  projectsDir: string;
  /** Logs in through the real login-code flow and returns a cookie header. */
  login(): Promise<string>;
  cleanup(): Promise<void>;
}

export async function testDaemon(
  opts: {
    runner?: import('../src/claude/runner.ts').Runner;
    github?: import('../src/survey/service.ts').SurveyGitHub;
    prList?: import('../src/projects/git-actions.ts').PrLister;
  } = {},
): Promise<TestDaemon> {
  const home = tempDir('apeiron-home-');
  const projectsDir = tempDir('apeiron-projects-');
  write(path.join(home, 'config.json'), JSON.stringify({ schema: 1, projectsDir }));
  const daemon = createDaemon({
    home,
    port: PORT,
    memoryDb: true,
    healthCheck: async () => fakeHealth,
    // Never fall back to the real Claude in tests.
    runner: opts.runner ?? fakeRunner([{ text: 'No script given.' }]),
    // Never fall back to the real gh either.
    github: opts.github ?? {
      owner: async () => null,
      createRepo: async () => ({ ok: false, error: 'no gh in tests' }),
    },
    prList: opts.prList ?? (async () => ({ prs: [], error: 'no gh in tests' })),
  });
  await daemon.app.ready();
  return {
    ...daemon,
    home,
    projectsDir,
    async login() {
      const code = daemon.auth.issueLoginCode();
      const res = await daemon.app.inject({
        method: 'POST',
        url: '/api/session',
        headers: { host: HOST, origin: ORIGIN },
        payload: { code },
      });
      const cookie = res.cookies.find((c) => c.name === SESSION_COOKIE);
      if (!cookie) throw new Error(`login failed: ${res.statusCode} ${res.body}`);
      return `${SESSION_COOKIE}=${cookie.value}`;
    },
    async cleanup() {
      await daemon.close();
      rmSync(home, { recursive: true, force: true });
      rmSync(projectsDir, { recursive: true, force: true });
    },
  };
}
