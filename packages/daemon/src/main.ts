import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { DEFAULT_PORT, LOOPBACK_HOST } from '@apeiron/shared';
import { fakeRunnerFromFile } from './claude/fake-runner.ts';
import { createDaemon } from './daemon.ts';
import pkg from '../package.json' with { type: 'json' };
import { checkHealth } from './health.ts';
import { noGitHub } from './survey/service.ts';
import { writeFileAtomic } from './fsutil.ts';
import { apeironHome } from './paths.ts';

const home = apeironHome();
const port = Number(process.env.APEIRON_PORT ?? DEFAULT_PORT);
// In development the UI is served by Vite; links and allowed origins point there.
const webUrl = process.env.APEIRON_WEB_URL || `http://${LOOPBACK_HOST}:${port}`;

const fakeClaude = process.env.APEIRON_FAKE_CLAUDE;
const daemon = createDaemon({
  // The fake Claude (e2e) also turns GitHub off, so tests never create a real repo.
  // It also stands in for the claude CLI, so health says Claude is ready even where none is
  // installed (CI).
  ...(fakeClaude
    ? {
        runner: fakeRunnerFromFile(fakeClaude),
        github: noGitHub,
        healthCheck: async () => {
          const h = await checkHealth(pkg.version, 'claude');
          return { ...h, claude: { found: true, loggedIn: true, version: 'fake' } };
        },
      }
    : {}),
  home,
  port,
  extraOrigins: webUrl.endsWith(`:${port}`) ? [] : [webUrl],
  watch: true,
});

// Loopback only (ADR-0005). Never bind 0.0.0.0.
await daemon.app.listen({ host: LOOPBACK_HOST, port });

const runDir = path.join(home, 'run');
const runFile = path.join(runDir, 'daemon.json');
mkdirSync(runDir, { recursive: true, mode: 0o700 });
writeFileAtomic(
  runFile,
  JSON.stringify(
    { pid: process.pid, port, webUrl, startedAt: Date.now(), cliSecret: daemon.cliSecret },
    null,
    2,
  ),
  0o600,
);

void daemon.projects.list();
void daemon.health.get();

console.log(`apeiron daemon on http://${LOOPBACK_HOST}:${port}`);
if (process.env.APEIRON_PRINT_LOGIN) {
  console.log(`Open Apeiron: ${webUrl}/#login=${daemon.auth.issueLoginCode()}`);
}

let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  try {
    rmSync(runFile, { force: true });
    await daemon.close();
  } finally {
    process.exit(0);
  }
}
process.on('SIGTERM', () => void stop());
process.on('SIGINT', () => void stop());
