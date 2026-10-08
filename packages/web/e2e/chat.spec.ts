import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { E2E_PROJECTS, loginCode } from './fixture.ts';

test.beforeEach(async ({ page, request }) => {
  await page.goto(`/#login=${await loginCode()}`);
  await expect(page.getByRole('heading', { name: 'What are we building?' })).toBeVisible();
  // Each test starts a fresh conversation.
  await page.evaluate(() => fetch('/api/projects/core/chat/new', { method: 'POST' }));
  void request;
});

test('chat: send, approve an edit, see it in the timeline and on disk', async ({ page }) => {
  await page.goto('/p/core');
  await page.getByLabel('Message Claude').fill('Please bump the streak');
  await page.getByLabel('Message Claude').press('Enter');
  await expect(page.getByText("I'll bump the streak value")).toBeVisible();
  const card = page.getByRole('group', { name: 'Claude wants to edit 1 file' });
  await expect(card).toBeVisible();
  await expect(card).toContainText('lib/streaks.ts');
  await expect(page.getByText('Approval needed')).toBeVisible();
  await expect(page.getByText('Claude is paused until you answer above.')).toBeVisible();
  await card.getByRole('button', { name: 'Allow', exact: true }).click();
  await expect(page.getByText('Done. The streak is now 3.')).toBeVisible();
  await expect(page.getByText('Edited')).toBeVisible();
  await expect(page.getByText('Allowed', { exact: true })).toBeVisible();
  expect(readFileSync(path.join(E2E_PROJECTS, 'core', 'lib', 'streaks.ts'), 'utf8')).toContain(
    'streaks = 3',
  );
});

test('chat: a decision card waits for the answer', async ({ page }) => {
  await page.goto('/p/core');
  await page.getByLabel('Message Claude').fill('Where should we store streaks?');
  await page.getByLabel('Message Claude').press('Enter');
  const card = page.getByRole('region', { name: 'How should streaks be stored?' });
  await expect(card).toBeVisible();
  await expect(card.getByText('Recommended')).toBeVisible();
  await expect(card.getByRole('button', { name: 'Confirm' })).toBeDisabled();
  await card.getByRole('radio', { name: /Compute from activity/ }).click();
  await card.getByRole('button', { name: 'Confirm' }).click();
  await expect(page.getByText("Good choice. I'll compute it at read time.")).toBeVisible();
  await expect(page.getByText('Data model:')).toBeVisible();
});

test('chat: a command approval can be denied with a reason', async ({ page }) => {
  await page.goto('/p/core');
  await page.getByLabel('Message Claude').fill('run the tests');
  await page.getByLabel('Message Claude').press('Enter');
  const card = page.getByRole('group', { name: 'Claude wants to run a command' });
  await expect(card).toContainText('npm test');
  await card.getByRole('button', { name: 'Deny' }).click();
  await page.getByLabel('Tell Claude why (optional)').fill('Not now');
  await card.getByRole('button', { name: 'Deny' }).click();
  await expect(page.getByText('Denied', { exact: true }).first()).toBeVisible();
});
