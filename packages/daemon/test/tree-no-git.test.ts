import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { listTree } from '../src/projects/workspace.ts';
import { tempDir } from './helpers.ts';

// git check-ignore exits at once outside a repo; writing the path list to it then hits EPIPE.
// That used to be an unhandled error that killed the daemon (it broke CI's e2e run).
describe('listTree outside a git repo', () => {
  it('lists a big folder without crashing', async () => {
    const dir = tempDir('apeiron-nogit-');
    mkdirSync(path.join(dir, 'many'));
    for (let i = 0; i < 4000; i++)
      writeFileSync(path.join(dir, 'many', `a-rather-long-file-name-number-${i}.txt`), '');
    for (let round = 0; round < 5; round++) {
      const tree = await listTree(dir, 'many');
      expect(tree.entries).toHaveLength(4000);
    }
  });
});
