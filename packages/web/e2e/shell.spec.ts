import { expect, test } from '@playwright/test';

test('the app opens on a dark page with the top bar', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Apeiron');
  await expect(page.getByRole('link', { name: 'Apeiron home' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open Magnet' })).toBeVisible();

  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).toBe('rgb(11, 11, 12)');

  const font = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
  expect(font).toContain('Geist');
});
