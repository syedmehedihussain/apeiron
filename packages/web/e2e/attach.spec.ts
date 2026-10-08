import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { E2E_PROJECTS, loginCode } from './fixture.ts';

// A 1×1 PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

test('attach a picture and a file to a chat message', async ({ page }) => {
  await page.goto(`/#login=${await loginCode()}`);
  await expect(page.getByRole('heading', { name: 'What are we building?' })).toBeVisible();
  await page.getByRole('link', { name: 'cctop', exact: true }).first().click();

  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Attach files' }).click();
  await (
    await chooser
  ).setFiles([
    { name: 'Screen Shot.png', mimeType: 'image/png', buffer: PNG },
    { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') },
  ]);
  const chips = page.getByRole('list', { name: 'Attachments' });
  await expect(chips.getByRole('listitem')).toHaveCount(2);
  await expect(chips.getByLabel('Uploading')).toHaveCount(0);
  await chips.getByRole('button', { name: 'Remove notes.txt' }).click();
  await expect(chips.getByRole('listitem')).toHaveCount(1);
  // The removed file is deleted from the project, not left behind.
  const uploads = path.join(E2E_PROJECTS, 'cctop', 'apeiron', 'uploads');
  await expect.poll(() => readdirSync(uploads).some((f) => f.endsWith('-notes.txt'))).toBe(false);

  await page.getByLabel('Message Claude').fill('What is in this picture?');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByRole('img', { name: 'screen-shot.png' })).toBeVisible();
  await expect(chips).toHaveCount(0);

  const dir = path.join(E2E_PROJECTS, 'cctop');
  const stored = readdirSync(path.join(dir, 'apeiron', 'uploads'));
  expect(stored.some((f) => f.endsWith('-screen-shot.png'))).toBe(true);
  expect(readFileSync(path.join(dir, '.gitignore'), 'utf8')).toContain('apeiron/');
});
