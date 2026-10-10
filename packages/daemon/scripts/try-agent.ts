// Manual check: one background agent against the real Claude in a temp repo (not part of tests).
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createDaemon } from '../src/daemon.ts';
import { noGitHub } from '../src/survey/service.ts';

const home = mkdtempSync(path.join(tmpdir(), 'cherry-try-home-'));
const projects = mkdtempSync(path.join(tmpdir(), 'cherry-try-projects-'));
writeFileSync(path.join(home, 'config.json'), JSON.stringify({ schema: 1, projectsDir: projects }));
const dir = path.join(projects, 'demo');
mkdirSync(dir);
const git = (...a: string[]) => execFileSync('git', a, { cwd: dir, encoding: 'utf8' });
git('init', '-q', '-b', 'main');
writeFileSync(path.join(dir, 'add.js'), 'export const add = (a, b) => a + b;\n');
git('add', '-A');
git('commit', '-q', '-m', 'init');
const d = createDaemon({ home, port: 4398, memoryDb: true, github: noGitHub });
d.hub.listen((_t, e) => {
  if (e.type === 'approval.requested') {
    console.log('approval:', e.approval.kind, e.approval.command ?? e.approval.title);
    d.approvals.answer(e.approval.id, { answer: 'deny', reason: 'No commands in this check.' });
  }
});
const t = Date.now();
const a = await d.agents.start('demo', {
  task: 'Add a subtract function to add.js next to add. Do not run any commands.',
  model: 'haiku',
});
for (;;) {
  const x = d.agents.get(a.id);
  if (x.status === 'done' || x.status === 'failed') break;
  await new Promise((r) => setTimeout(r, 1000));
}
const x = d.agents.get(a.id);
console.log(((Date.now() - t) / 1000).toFixed(1) + 's', x.status, x.summary, x.error, x.changes);
console.log(
  x.activity.map((i) => (i.kind === 'tool' ? `${i.tool} ${i.target} ${i.status}` : i.kind)),
);
console.log((await d.agents.diff(a.id)).files.map((f) => `${f.path} +${f.added} -${f.removed}`));
await d.agents.accept(a.id);
console.log(readFileSync(path.join(dir, 'add.js'), 'utf8'));
console.log(git('log', '--oneline'));
await d.close();
