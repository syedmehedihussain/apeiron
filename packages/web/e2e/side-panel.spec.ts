import { expect, test } from '@playwright/test';
import { loginCode } from './fixture.ts';

// The right column shows one view at a time, picked from the row at its top.
test('side panel switches between views and remembers the choice', async ({ page }) => {
  await page.goto(`/#login=${await loginCode()}`);
  await page.getByRole('link', { name: 'core', exact: true }).first().click();
  const aside = page.getByRole('complementary', { name: 'Repository and agents' });
  const views = aside.getByRole('tablist', { name: 'Side panel' });

  await expect(aside.getByRole('tabpanel', { name: 'Overview' })).toBeVisible();
  await expect(aside.getByRole('region', { name: 'Agents' })).toBeVisible();

  await views.getByRole('tab', { name: 'GitHub' }).click();
  await expect(aside.getByRole('list', { name: 'Recent commits' })).toBeVisible();
  await expect(aside.getByRole('region', { name: 'Agents' })).toHaveCount(0);

  await views.getByRole('tab', { name: 'Agents' }).click();
  await expect(aside.getByRole('tabpanel', { name: 'Agents' })).toBeVisible();
  await expect(aside.getByLabel('Task')).toBeVisible();

  await views.getByRole('tab', { name: 'Magnet' }).click();
  await expect(aside.getByRole('tabpanel', { name: 'Magnet' })).toBeVisible();
  await expect(aside.getByPlaceholder(/Magnet/)).toBeVisible();

  await views.getByRole('tab', { name: 'Notes' }).click();
  await expect(aside.getByRole('heading', { name: 'Notes' })).toBeVisible();
  await expect(aside.getByRole('heading', { name: 'Tasks' })).toBeVisible();

  await page.reload();
  await expect(views.getByRole('tab', { name: 'Notes' })).toHaveAttribute('aria-selected', 'true');
});
