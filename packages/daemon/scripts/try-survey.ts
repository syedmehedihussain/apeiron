// Manual check: runs the survey against the real Claude in a temp folder (not part of tests).
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createDaemon } from '../src/daemon.ts';
import { noGitHub } from '../src/survey/service.ts';

const home = mkdtempSync(path.join(tmpdir(), 'cherry-try-home-'));
const projects = mkdtempSync(path.join(tmpdir(), 'cherry-try-projects-'));
writeFileSync(path.join(home, 'config.json'), JSON.stringify({ schema: 1, projectsDir: projects }));
const d = createDaemon({ home, port: 4399, memoryDb: true, github: noGitHub });
const wait = async (pred: () => Promise<boolean>) => {
  const t = Date.now();
  while (!(await pred())) {
    if (Date.now() - t > 240_000) throw new Error('timeout');
    await new Promise((r) => setTimeout(r, 500));
  }
};
const id = 'review-qr';
let t = Date.now();
await d.survey.start({
  name: id,
  idea: "A printable QR code that opens a small business's Google review page.",
  quick: true,
});
for (const step of [2, 3, 4]) {
  await wait(async () => {
    const s = await d.survey.state(id);
    return !!s.card || !!s.error;
  });
  const s = await d.survey.state(id);
  console.log(`\n--- step ${step} (${((Date.now() - t) / 1000).toFixed(1)}s)`, s.error ?? '');
  console.log(JSON.stringify(s.card, null, 1));
  t = Date.now();
  await d.survey.answer(id, { step, optionId: s.card!.options.find((o) => o.recommended)!.id });
}
await wait(async () => {
  const s = await d.survey.state(id);
  return !!s.proposal || !!s.error;
});
const s = await d.survey.state(id);
console.log(`\n--- proposal (${((Date.now() - t) / 1000).toFixed(1)}s)`, s.error ?? '');
for (const f of s.proposal?.files ?? []) console.log(f.path, f.size, f.warning ?? '');
console.log(s.proposal?.files.find((f) => f.path === 'CLAUDE.md')?.content);
const r = await d.survey.create(id, { createRepo: false });
console.log('create', r.create);
console.log(readFileSync(path.join(projects, id, '_project', 'STATUS.md'), 'utf8'));
await d.close();
