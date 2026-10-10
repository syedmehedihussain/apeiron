import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { E2E_HOME, loginCode } from './fixture.ts';

test.beforeEach(async ({ page }) => {
  await page.goto(`/#login=${await loginCode()}`);
  await expect(page.getByRole('heading', { name: 'What are we building?' })).toBeVisible();
});

// M8: "What's stuck this week?" answers with project cards and a proposed action.
test('Magnet answers, shows project cards, and an approved action opens the survey', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Open Magnet' }).click();
  const panel = page.getByRole('complementary', { name: 'Magnet' });
  await expect(panel).toContainText(/Read-only · knows \d+ projects/);
  await panel.getByRole('button', { name: "What's stuck this week?" }).click();
  await expect(panel).toContainText('has notes but no Cherry setup yet');
  await expect(panel.getByRole('link', { name: /cctop/ })).toBeVisible();
  const action = panel.getByRole('region', { name: 'Magnet wants to start a new project' });
  await expect(action).toContainText('A habit tracker for the family');
  await action.getByRole('button', { name: 'Approve' }).click();
  await expect(page).toHaveURL(/\/new\?idea=A(\+|%20)habit/);
  await expect(page.getByLabel('Idea')).toHaveValue('A habit tracker for the family');
});

test('Settings → Magnet saves the knowledge files', async ({ page }) => {
  await page.goto('/settings/magnet');
  await expect(page.getByRole('heading', { name: 'Magnet', level: 1 })).toBeVisible();
  const me = page.getByLabel('me.md');
  await me.fill('Meddy. Computer science student.\n');
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  expect(readFileSync(path.join(E2E_HOME, 'magnet', 'me.md'), 'utf8')).toBe(
    'Meddy. Computer science student.\n',
  );
  await expect(page.getByRole('img', { name: /Sessions per day/ })).toBeVisible();
  await page.getByRole('link', { name: 'Claude Code' }).click();
  await expect(page.getByRole('heading', { name: 'Claude Code' })).toBeVisible();
});
