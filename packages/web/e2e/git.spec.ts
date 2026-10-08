import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { E2E_PROJECTS, E2E_REMOTES, loginCode } from './fixture.ts';

const head = (cwd: string, ref = 'HEAD') =>
  execFileSync('git', ['rev-parse', ref], { cwd, encoding: 'utf8' }).trim();

// M6: Push waits for an approval in the GitHub box; Deny sends nothing, Allow pushes.
test('push from the GitHub box only after Allow', async ({ page }) => {
  const dir = path.join(E2E_PROJECTS, 'atlas');
  const remote = path.join(E2E_REMOTES, 'atlas.git');
  const before = head(remote, 'main');
  await page.goto(`/#login=${await loginCode()}`);
  await expect(page.getByRole('heading', { name: 'What are we building?' })).toBeVisible();
  await page.getByRole('link', { name: 'atlas', exact: true }).first().click();
  const box = page.getByRole('region', { name: 'Repository' });
  await expect(box.getByLabel('1 ahead, 0 behind')).toBeVisible();
  // Only the latest commit shows; the chevron opens the last three.
  const commits = box.getByRole('list', { name: 'Recent commits' });
  await expect(commits.getByRole('listitem')).toHaveCount(1);
  await expect(commits).toContainText('feat: server skeleton');
  await box.getByRole('button', { name: 'Show recent commits' }).click();
  await expect(commits.getByRole('listitem')).toHaveCount(2);
  await box.getByRole('button', { name: 'Show only the latest commit' }).click();

  await box.getByRole('button', { name: 'Push' }).click();
  const card = box.getByRole('group', { name: 'Push 1 commit to origin/main' });
  await expect(card).toBeVisible();
  await expect(card).toContainText('feat: server skeleton');
  await expect(card.getByRole('button', { name: 'Allow for this session' })).toHaveCount(0);
  await card.getByRole('button', { name: 'Deny' }).click();
  await card.getByRole('button', { name: 'Deny' }).click();
  await expect(box.getByRole('status')).toHaveText('Push denied. Nothing was sent.');
  expect(head(remote, 'main')).toBe(before);

  await box.getByRole('button', { name: 'Push' }).click();
  await box
    .getByRole('group', { name: /Push 1 commit/ })
    .getByRole('button', { name: 'Allow' })
    .click();
  await expect(box.getByRole('status')).toHaveText('Pushed to origin/main.');
  expect(head(remote, 'main')).toBe(head(dir));
  await expect(box.getByLabel('0 ahead, 0 behind')).toBeVisible();

  await box.getByRole('button', { name: 'Pull' }).click();
  await expect(box.getByRole('status')).toHaveText('Already up to date.');
});
