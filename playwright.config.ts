import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';
import { E2E_DAEMON_PORT, E2E_WEB_PORT } from './packages/web/e2e/fixture.ts';

// Locally we use the system Chromium; CI installs Playwright's own build.
const systemChromium = '/usr/bin/chromium';
const executablePath =
  process.env.CHERRY_CHROMIUM ??
  (!process.env.CI && existsSync(systemChromium) ? systemChromium : undefined);

export default defineConfig({
  testDir: 'packages/web/e2e',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: `http://127.0.0.1:${E2E_WEB_PORT}`,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        launchOptions: { executablePath },
      },
    },
  ],
  webServer: [
    {
      command: 'node --import tsx packages/web/e2e/start-daemon.ts',
      url: `http://127.0.0.1:${E2E_DAEMON_PORT}/api/health`,
      ignoreHTTPSErrors: true,
      reuseExistingServer: false,
    },
    {
      command: 'pnpm --filter @cherry/web dev',
      url: `http://127.0.0.1:${E2E_WEB_PORT}`,
      reuseExistingServer: false,
      env: { CHERRY_PORT: String(E2E_DAEMON_PORT), CHERRY_WEB_PORT: String(E2E_WEB_PORT) },
    },
  ],
  workers: 1,
});
