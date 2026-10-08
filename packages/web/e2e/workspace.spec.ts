import { expect, test } from '@playwright/test';
import { loginCode } from './fixture.ts';

test.beforeEach(async ({ page }) => {
  await page.goto(`/#login=${await loginCode()}`);
  await expect(page.getByRole('heading', { name: 'What are we building?' })).toBeVisible();
});

test('opens a project with status, phase bar and git box', async ({ page }) => {
  await page.getByRole('link', { name: 'core', exact: true }).first().click();
  await expect(page).toHaveURL(/\/p\/core$/);
  await expect(page.getByRole('list', { name: 'Project phase' })).toBeVisible();
  // Status lives in a notch: the next step at a glance, the rest in a popover.
  const notch = page.getByRole('button', { name: /^Project status/ });
  await expect(notch).toHaveText('Status');
  await expect(notch).toHaveAttribute('data-tone', 'ok');
  await expect(page.getByText('Finished the HUD.')).toHaveCount(0);
  await notch.click();
  const pop = page.getByRole('region', { name: 'Project status' });
  await expect(pop).toContainText('Finished the HUD.');
  await expect(pop.getByRole('button', { name: 'Update status' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(pop).toHaveCount(0);
  await expect(page.getByText('1 uncommitted')).toBeVisible();
});

test('browses the tree and shows changes in a file', async ({ page }) => {
  await page.goto('/p/core');
  await page.getByRole('treeitem', { name: /lib/ }).click();
  await page.getByRole('treeitem', { name: /streaks\.ts/ }).click();
  await expect(page).toHaveURL(/\/p\/core\/files\/lib\/streaks\.ts$/);
  await expect(page.getByText('Read-only')).toBeVisible();
  await expect(page.getByRole('switch', { name: 'Show changes' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  const code = page.getByRole('region', { name: 'Contents of lib/streaks.ts' });
  await expect(code).toContainText('streaks = 1');
  await expect(code).toContainText(/streaks = [23]/); // the chat e2e may have bumped it
  await page.getByRole('switch', { name: 'Show changes' }).click();
  await expect(code).not.toContainText('streaks = 1');
});

test('reads docs in the Docs tab', async ({ page }) => {
  await page.goto('/p/core/docs');
  await expect(page.getByRole('navigation', { name: 'Documents' })).toContainText('README.md');
  await page.getByRole('link', { name: /README\.md/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'core' })).toBeVisible();
});

test('saves notes to _project/notes.md', async ({ page }) => {
  await page.goto('/p/core/notes');
  await page.getByLabel('Notes for this project').fill('Remember the streaks bug.');
  await expect(page.getByText('· Saved', { exact: false })).toBeVisible();
  await expect(page.getByText('Unsaved')).toHaveCount(0);
  await page.reload();
  await expect(page.getByLabel('Notes for this project')).toHaveValue('Remember the streaks bug.');
});

test('a missing project says the folder is gone', async ({ page }) => {
  await page.goto('/p/nope');
  await expect(page.getByRole('heading', { name: 'This folder is gone' })).toBeVisible();
});
