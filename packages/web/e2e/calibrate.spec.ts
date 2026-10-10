import { existsSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { E2E_PROJECTS, loginCode } from './fixture.ts';

// E2E flow 2: calibrate the not-calibrated fixture, write some files, it becomes Ready.
test('calibrates torongo and writes only the ticked files', async ({ page }) => {
  await page.goto(`/#login=${await loginCode()}`);
  await page.getByRole('table').getByRole('link', { name: 'Calibrate' }).click();
  await expect(
    page.getByRole('heading', { name: "torongo isn't set up for Cherry yet." }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Calibrate' }).click();
  const card = page.getByRole('region', { name: 'Which phase is torongo in?' });
  await expect(card).toBeVisible();
  await expect(page.getByText('no tests')).toBeVisible();
  await card.getByRole('radio', { name: /Development/ }).click();
  await card.getByRole('button', { name: 'Confirm' }).click();
  await expect(page.getByRole('heading', { name: 'Review proposed files' })).toBeVisible();
  await page.getByLabel('Include docs/architecture.md').uncheck();
  await page.getByRole('button', { name: /Write \d+ selected files/ }).click();
  await expect(page).toHaveURL(/\/p\/torongo$/);
  const dir = path.join(E2E_PROJECTS, 'torongo');
  expect(existsSync(path.join(dir, 'CLAUDE.md'))).toBe(true);
  expect(existsSync(path.join(dir, 'docs', 'architecture.md'))).toBe(false);
  expect(existsSync(path.join(dir, '_project', 'project.json'))).toBe(true);
  await page.goto('/');
  const row = page
    .getByRole('table')
    .getByRole('row')
    .filter({ has: page.getByRole('link', { name: 'torongo', exact: true }) });
  await expect(row).toContainText('Ready');
});
