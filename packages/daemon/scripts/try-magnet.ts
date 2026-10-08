// Manual check: asks the real Magnet about the real ~/Projects with a throwaway Apeiron home.
// Magnet is read-only, so nothing in the projects changes.
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { createDaemon } from '../src/daemon.ts';
import { noGitHub } from '../src/survey/service.ts';

const home = mkdtempSync(path.join(tmpdir(), 'apeiron-try-home-'));
const projects = process.argv[2] ?? path.join(homedir(), 'Projects');
writeFileSync(path.join(home, 'config.json'), JSON.stringify({ schema: 1, projectsDir: projects }));
const d = createDaemon({ home, port: 4397, memoryDb: true, github: noGitHub });
const t = Date.now();
await d.magnet.send({ text: "What's stuck this week?" });
while ((await d.magnet.state()).running) await new Promise((r) => setTimeout(r, 1000));
const s = await d.magnet.state();
console.log(((Date.now() - t) / 1000).toFixed(1) + 's');
for (const i of s.items) {
  if (i.kind === 'text') console.log('TEXT:', i.text);
  else if (i.kind === 'tool') console.log('TOOL:', i.tool, i.target, i.status);
  else if (i.kind === 'projects') console.log('CARDS:', i.ids.join(', '));
  else if (i.kind === 'action') console.log('ACTION:', i.action.title, '|', i.action.detail);
  else if (i.kind === 'turn-end') console.log('END:', i.ok, i.error);
}
console.log('\n--- projects.md\n' + readFileSync(path.join(home, 'magnet', 'projects.md'), 'utf8'));
await d.close();
