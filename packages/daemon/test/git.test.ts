import { describe, expect, it } from 'vitest';
import { parseStatus } from '../src/git.ts';

describe('parseStatus', () => {
  it('reads branch, ahead/behind and entries', () => {
    const out = [
      '# branch.oid abc',
      '# branch.head main',
      '# branch.upstream origin/main',
      '# branch.ab +2 -1',
      '1 .M N... 100644 100644 100644 a b src/a.ts',
      '1 A. N... 000000 100644 100644 a b src/new file.ts',
      '1 .D N... 100644 100644 000000 a b old.ts',
      '2 R. N... 100644 100644 100644 a b R100 renamed.ts',
      'orig.ts',
      '? notes.md',
      '',
    ].join('\0');
    const s = parseStatus(out);
    expect(s).toMatchObject({ branch: 'main', ahead: 2, behind: 1, remote: true, changes: 5 });
    expect(s.entries).toEqual([
      { path: 'src/a.ts', letter: 'M' },
      { path: 'src/new file.ts', letter: 'A' },
      { path: 'old.ts', letter: 'D' },
      { path: 'renamed.ts', letter: 'R' },
      { path: 'notes.md', letter: 'U' },
    ]);
  });
});
