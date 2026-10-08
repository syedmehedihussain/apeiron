import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { scanProjects } from '../src/projects/scanner.ts';
import { HOST, gitInit, testDaemon, write, type TestDaemon } from './helpers.ts';

const projectJson = (name: string) =>
  JSON.stringify({
    schema: 1,
    name,
    summary: 'A ready one',
    phase: 'development',
    stack: ['Node 22'],
  });

describe('project scanner', () => {
  let d: TestDaemon;
  beforeAll(async () => {
    d = await testDaemon();
    const p = (name: string) => path.join(d.projectsDir, name);
    write(path.join(p('ready'), '_project', 'project.json'), projectJson('ready'));
    write(path.join(p('ready'), '_project', 'STATUS.md'), '## Next steps\n- [ ] Ship it\n');
    write(
      path.join(p('notes'), '_project', 'STATUS.md'),
      '---\nsummary: cctop style\n---\n## Where we left off\nHalf way.\n',
    );
    write(path.join(p('plain'), 'README.md'), '# plain');
    write(path.join(p('broken'), '_project', 'project.json'), '{ not json');
    write(path.join(p('.hidden'), 'x'), 'x');
    write(path.join(p('ignored-one'), 'x'), 'x');
    gitInit(p('repo'));
    write(path.join(p('repo'), 'new.txt'), 'x');
    d.config.update({ scan: { ignore: ['ignored-one'] } });
  });
  afterAll(() => d.cleanup());

  it('sorts every folder into a state', async () => {
    const cards = await scanProjects(d.projectsDir, ['ignored-one']);
    const byId = Object.fromEntries(cards.map((c) => [c.id, c]));
    expect(Object.keys(byId).sort()).toEqual(['broken', 'notes', 'plain', 'ready', 'repo']);
    expect(byId.ready?.state).toBe('ready');
    expect(byId.ready?.phase).toBe('development');
    expect(byId.ready?.nextStep).toBe('Ship it');
    expect(byId.notes?.state).toBe('cctop');
    expect(byId.notes?.summary).toBe('cctop style');
    expect(byId.notes?.leftOff).toBe('Half way.');
    expect(byId.plain?.state).toBe('uncalibrated');
    expect(byId.broken?.state).toBe('uncalibrated');
    expect(byId.broken?.projectJsonError).toBe(true);
  });

  it('reads git state', async () => {
    const cards = await scanProjects(d.projectsDir, []);
    const repo = cards.find((c) => c.id === 'repo');
    expect(repo?.git).toEqual({ branch: 'main', ahead: 0, behind: 0, changes: 1, remote: false });
    expect(cards.find((c) => c.id === 'plain')?.git).toBeNull();
  });

  it('serves cards over the API and writes projects.md for Magnet', async () => {
    const cookie = await d.login();
    const res = await d.app.inject({
      method: 'GET',
      url: '/api/projects',
      headers: { host: HOST, cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().cards).toHaveLength(5);
    const { readFileSync } = await import('node:fs');
    const md = readFileSync(path.join(d.home, 'magnet', 'projects.md'), 'utf8');
    expect(md).toContain('- ready · Ready · development · Node 22 · git: No git');
  });
});
