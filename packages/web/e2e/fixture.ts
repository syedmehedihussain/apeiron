import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

export const E2E_ROOT = path.join(tmpdir(), 'apeiron-e2e');
export const E2E_HOME = path.join(E2E_ROOT, 'home');
export const E2E_PROJECTS = path.join(E2E_ROOT, 'projects');
export const E2E_DAEMON_PORT = 4318;
export const E2E_WEB_PORT = 5174;

function write(file: string, content: string) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content);
}

function git(dir: string, ...args: string[]) {
  execFileSync('git', ['-c', 'user.name=e2e', '-c', 'user.email=e2e@example.com', ...args], {
    cwd: dir,
    stdio: 'ignore',
    env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null' },
  });
}

/** A projects folder with one project in each state (docs/testing.md E2E flow 1). */
export function createFixture(): void {
  rmSync(E2E_ROOT, { recursive: true, force: true });
  write(
    path.join(E2E_HOME, 'config.json'),
    JSON.stringify({ schema: 1, projectsDir: E2E_PROJECTS }),
  );

  const core = path.join(E2E_PROJECTS, 'core');
  write(
    path.join(core, '_project', 'project.json'),
    JSON.stringify({
      schema: 1,
      name: 'core',
      summary: 'Local personal dashboard',
      phase: 'development',
      stack: ['Next.js', 'SQLite'],
    }),
  );
  write(
    path.join(core, '_project', 'STATUS.md'),
    '## Where we left off\nFinished the HUD.\n\n## Next steps\n- [ ] Build the Study Room floor\n',
  );
  write(path.join(core, 'README.md'), '# core\n');
  write(path.join(core, 'lib', 'streaks.ts'), 'export const streaks = 1;\n');
  mkdirSync(core, { recursive: true });
  git(core, 'init', '-q', '-b', 'main');
  writeFileSync(path.join(core, '.git', 'info', 'exclude'), '_project/\n');
  git(core, 'add', '-A');
  git(core, 'commit', '-q', '-m', 'init');
  write(path.join(core, 'lib', 'streaks.ts'), 'export const streaks = 2;\n');

  write(
    path.join(E2E_PROJECTS, 'cctop', '_project', 'STATUS.md'),
    '---\nsummary: Terminal dashboard\n---\n## Next steps\n- [ ] Tag release 1.1\n',
  );
  write(path.join(E2E_PROJECTS, 'torongo', 'README.md'), '# torongo\nReal-time translation.\n');
}

export async function loginCode(): Promise<string> {
  const info = JSON.parse(readFileSync(path.join(E2E_HOME, 'run', 'daemon.json'), 'utf8')) as {
    cliSecret: string;
  };
  const res = await fetch(`http://127.0.0.1:${E2E_DAEMON_PORT}/api/cli/login-code`, {
    method: 'POST',
    headers: { 'x-apeiron-cli': info.cliSecret },
  });
  return ((await res.json()) as { code: string }).code;
}
