import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

// Locally we use the system Chromium; CI installs Playwright's own build.
const systemChromium = '/usr/bin/chromium';
const executablePath =
  process.env.APEIRON_CHROMIUM ??
  (!process.env.CI && existsSync(systemChromium) ? systemChromium : undefined);

export default defineConfig({
  testDir: 'packages/web/e2e',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: 'http://127.0.0.1:5173',
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
  webServer: {
    command: 'pnpm --filter @apeiron/web dev',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI,
  },
});
