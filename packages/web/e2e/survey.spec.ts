import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { E2E_PROJECTS, loginCode } from './fixture.ts';

// E2E flow 3: survey a new project to the end → files exist → git repo initialised.
test('a new project from Home gets its docs, a first commit and opens at Design', async ({
  page,
}) => {
  await page.goto(`/#login=${await loginCode()}`);
  await page.getByRole('link', { name: 'Start project' }).first().click();
  await expect(page.getByRole('heading', { name: 'What are we building?' })).toBeVisible();
  await page.getByLabel('Idea').fill("A printable QR code that opens a business's review page.");
  await page.getByLabel('Folder name').fill('review-qr');
  await page.getByRole('button', { name: 'Confirm' }).click();
  await expect(page).toHaveURL(/\/new\/review-qr$/);

  const confirm = async (question: string, option: RegExp) => {
    const card = page.getByRole('region', { name: question });
    await expect(card).toBeVisible();
    await card.getByRole('radio', { name: option }).click();
    await card.getByRole('button', { name: 'Confirm' }).click();
  };
  await confirm('Who is review-qr for?', /Small shop owners/);
  // Saved as soon as it is confirmed.
  const survey = () =>
    JSON.parse(
      readFileSync(path.join(E2E_PROJECTS, 'review-qr', '_project', 'survey.json'), 'utf8'),
    );
  expect(survey().answers).toHaveLength(2);
  await expect(page.getByRole('complementary', { name: 'What we know so far' })).toContainText(
    'Small shop owners in the UK',
  );
  await confirm('What must v1 do?', /QR generator/);
  await confirm('Where should review-qr run?', /Static site/);

  // Change step 2 to another answer: Scope and Stack are marked for a re-check.
  await page.getByRole('button', { name: 'Change' }).first().click();
  await confirm('Who is review-qr for?', /Marketing agencies/);
  await expect(page.getByText('An earlier answer changed. Check this again.')).toBeVisible();
  expect(survey().stale).toEqual([3, 4]);
  await confirm('What must v1 do?', /QR generator/);
  await confirm('Where should review-qr run?', /Static site/);
  await confirm('What does review-qr store?', /Business, ReviewLink/);
  await confirm('What is the quality bar for v1?', /Tests for links/);

  await expect(page.getByRole('heading', { name: 'Ready to create review-qr' })).toBeVisible();
  await expect(page.getByText('CLAUDE.md', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Preview docs/prd.md' }).click();
  await expect(page.getByRole('complementary', { name: 'Preview' })).toContainText('Shops want');
  await page.getByRole('button', { name: 'Create project' }).click();

  await expect(page).toHaveURL(/\/p\/review-qr$/);
  const dir = path.join(E2E_PROJECTS, 'review-qr');
  for (const f of ['CLAUDE.md', 'docs/prd.md', 'docs/adr/0001-host-on-home-server.md'])
    expect(existsSync(path.join(dir, f))).toBe(true);
  const pj = JSON.parse(readFileSync(path.join(dir, '_project', 'project.json'), 'utf8'));
  expect(pj.phase).toBe('design');
  const log = execFileSync('git', ['log', '--oneline'], { cwd: dir, encoding: 'utf8' });
  expect(log).toContain('docs: project plan');
  await expect(page.getByRole('list', { name: 'Project phase' })).toBeVisible();
});
