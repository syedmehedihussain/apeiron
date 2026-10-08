import type { Health } from '@apeiron/shared';
import { run } from './exec.ts';

export async function checkHealth(version: string, claudeBin: string): Promise<Health> {
  const [claudeVersion, claudeAuth, gitVersion, gh] = await Promise.all([
    run(claudeBin, ['--version'], { timeoutMs: 10_000 }),
    run(claudeBin, ['auth', 'status', '--json'], { timeoutMs: 15_000 }),
    run('git', ['--version'], { timeoutMs: 5_000 }),
    run('gh', ['auth', 'status'], { timeoutMs: 10_000 }),
  ]);

  let loggedIn = false;
  if (claudeAuth.ok) {
    try {
      loggedIn = (JSON.parse(claudeAuth.stdout) as { loggedIn?: unknown }).loggedIn === true;
    } catch {
      loggedIn = false;
    }
  }
  const ghFound = gh.ok || (gh.code !== null && gh.code !== 127 && gh.stderr.length > 0);

  return {
    ok: true,
    name: 'apeiron',
    version,
    claude: {
      found: claudeVersion.ok,
      loggedIn: claudeVersion.ok && loggedIn,
      version: claudeVersion.ok ? (claudeVersion.stdout.trim().split(' ')[0] ?? null) : null,
    },
    git: {
      found: gitVersion.ok,
      version: gitVersion.ok ? (gitVersion.stdout.trim().split(' ').pop() ?? null) : null,
    },
    gh: { found: ghFound, loggedIn: gh.ok },
  };
}
