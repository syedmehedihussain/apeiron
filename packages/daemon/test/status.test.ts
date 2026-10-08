import { describe, expect, it } from 'vitest';
import { firstOpenStep, parseStatusMd } from '../src/projects/status.ts';

const withFrontMatter = `---
name: cctop
status: active          # active | paused | done | idea
summary: Terminal dashboard for Claude Code
updated: 2026-10-07
---

## What we are building

Something.

## Where we left off

cctop now estimates cost at Claude API prices.
It shows cost per project.

Second paragraph.

## Next steps

- [x] Done thing
- [ ] Tag release 1.1
- [ ] Write docs
`;

const oldFormat = `# STATUS — core

## Where we left off
Finished the Living Room floor and the HUD.

## Next steps
- [ ] Save streaks in the database

## Done recently
- 2026-10-07 — Finished the HUD.

_Updated: 2026-10-08 14:10_
`;

describe('parseStatusMd', () => {
  it('reads the front-matter format', () => {
    const s = parseStatusMd(withFrontMatter);
    expect(s.summary).toBe('Terminal dashboard for Claude Code');
    expect(s.updated).toBe('2026-10-07');
    expect(s.leftOff).toBe(
      'cctop now estimates cost at Claude API prices. It shows cost per project.',
    );
    expect(s.nextSteps).toHaveLength(3);
    expect(firstOpenStep(s)).toBe('Tag release 1.1');
  });

  it('reads the older format with an _Updated_ footer', () => {
    const s = parseStatusMd(oldFormat);
    expect(s.summary).toBeNull();
    expect(s.leftOff).toBe('Finished the Living Room floor and the HUD.');
    expect(s.doneRecently).toEqual(['2026-10-07 — Finished the HUD.']);
    expect(s.updated).toBe('2026-10-08 14:10');
  });

  it('copes with an empty file', () => {
    expect(parseStatusMd('')).toEqual({
      summary: null,
      leftOff: null,
      nextSteps: [],
      doneRecently: [],
      updated: null,
    });
  });
});
