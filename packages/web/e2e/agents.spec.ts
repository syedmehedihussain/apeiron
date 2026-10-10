import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { E2E_PROJECTS, loginCode } from './fixture.ts';

// E2E flow 5: an agent runs on the side, asks to run a command, and Accept lands it on main.
test('agent: start → approve → review diff → accept → commit on main', async ({ page }) => {
  await page.goto(`/#login=${await loginCode()}`);
  await expect(page.getByRole('heading', { name: 'What are we building?' })).toBeVisible();
  await page.getByRole('link', { name: 'core', exact: true }).first().click();

  const panel = page.getByRole('region', { name: 'Agents' });
  await panel.getByLabel('Task').fill('Write tests for the streak service');
  await panel.getByRole('button', { name: 'Start' }).click();

  const card = panel.getByRole('article', { name: 'Write tests for the streak service' });
  await expect(card).toContainText('agent/tests-streak-service');
  await expect(card).toContainText('Wants to run npm test');
  await card.getByRole('button', { name: 'Review' }).click();
  await card.getByRole('button', { name: 'Allow', exact: true }).click();

  await expect(card).toContainText('Added a test for the streak counter.');
  await card.getByRole('button', { name: 'Review diff' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('tests/streaks.test.ts');
  await dialog.getByRole('button', { name: 'Close' }).click();

  const dir = path.join(E2E_PROJECTS, 'core');
  expect(existsSync(path.join(dir, 'tests', 'streaks.test.ts'))).toBe(false);
  await card.getByRole('button', { name: 'Accept' }).click();
  await expect(card).toHaveCount(0);
  expect(existsSync(path.join(dir, 'tests', 'streaks.test.ts'))).toBe(true);
  const log = execFileSync('git', ['log', '--format=%s', '-1', 'main'], {
    cwd: dir,
    encoding: 'utf8',
  });
  expect(log).toMatch(/^agent: Write tests for the streak service/);
});
