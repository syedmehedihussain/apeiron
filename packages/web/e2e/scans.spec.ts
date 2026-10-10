import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { E2E_PROJECTS, loginCode } from './fixture.ts';

// The scan adds apeiron/ to core's .gitignore and writes a report; undo both for later specs.
const core = path.join(E2E_PROJECTS, 'core');
const ignore = path.join(core, '.gitignore');
let ignoreBefore: string | null = null;
test.beforeAll(() => {
  ignoreBefore = existsSync(ignore) ? readFileSync(ignore, 'utf8') : null;
});
test.afterAll(() => {
  rmSync(path.join(core, 'apeiron', 'reports'), { recursive: true, force: true });
  if (ignoreBefore === null) rmSync(ignore, { force: true });
  else writeFileSync(ignore, ignoreBefore);
});

// One-click scan agents: Run in the Agents view, then the report opens in the centre.
test('scan agent: run → report in the centre, with history', async ({ page }) => {
  await page.goto(`/#login=${await loginCode()}`);
  await page.getByRole('link', { name: 'core', exact: true }).first().click();
  const aside = page.getByRole('complementary', { name: 'Repository and agents' });
  await aside
    .getByRole('tablist', { name: 'Side panel' })
    .getByRole('tab', { name: 'Agents' })
    .click();

  const scans = aside.getByRole('region', { name: 'Scan agents' });
  for (const name of ['Security review', 'Test runner', 'Code health', 'Dependency audit'])
    await expect(scans).toContainText(name);

  await scans.getByRole('button', { name: 'Run Security review' }).click();
  await expect(scans.getByRole('button', { name: 'Stop Security review' })).toBeVisible();
  await page.screenshot({ path: 'test-results/scans-running.png' });

  await scans.getByRole('button', { name: 'Open the Security review report' }).click();
  await expect(page.getByRole('heading', { name: 'Security review', level: 1 })).toBeVisible();
  await expect(page.getByText('Needs work').first()).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'High · Session token in the log' }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Security review report' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Report history' })).toContainText(
    '1 high, 1 medium',
  );
  await page.screenshot({ path: 'test-results/scans-report.png' });
});
