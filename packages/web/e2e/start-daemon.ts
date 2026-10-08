// Playwright webServer: builds the fixture projects folder, then runs the daemon against it.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { E2E_DAEMON_PORT, E2E_HOME, E2E_WEB_PORT, createFixture } from './fixture.ts';

createFixture();
const daemonDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../daemon');
const child = spawn(process.execPath, ['--import', 'tsx', 'src/main.ts'], {
  cwd: daemonDir,
  stdio: 'inherit',
  env: {
    ...process.env,
    APEIRON_HOME: E2E_HOME,
    APEIRON_PORT: String(E2E_DAEMON_PORT),
    APEIRON_WEB_URL: `http://127.0.0.1:${E2E_WEB_PORT}`,
  },
});
const stop = () => child.kill('SIGTERM');
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
child.on('exit', (code) => process.exit(code ?? 0));
