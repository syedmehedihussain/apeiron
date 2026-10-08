import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseFullDiff } from '../src/projects/workspace.ts';
import { HOST, gitInit, testDaemon, write, type TestDaemon } from './helpers.ts';

describe('workspace routes', () => {
  let d: TestDaemon;
  let cookie: string;
  let core: string;
  const get = (url: string) =>
    d.app.inject({ method: 'GET', url, headers: { host: HOST, cookie } });

  beforeAll(async () => {
    d = await testDaemon();
    cookie = await d.login();
    core = path.join(d.projectsDir, 'core');
    gitInit(core);
    write(path.join(core, 'lib', 'streaks.ts'), 'a\nb\nc\n');
    write(path.join(core, 'README.md'), '# core\n');
    write(path.join(core, 'docs', 'prd.md'), '# PRD\n');
    write(
      path.join(core, 'docs', 'adr', '0001-use-sqlite.md'),
      '# 0001 — Use SQLite with Drizzle\n',
    );
    write(path.join(core, 'docs', 'adr', 'template.md'), '# NNNN — Title\n');
    write(path.join(core, 'node_modules', 'x', 'index.js'), '');
    write(path.join(core, '.env'), 'SECRET=1\n');
    write(path.join(core, 'logo.bin'), '\0\0\0');
    execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'add', '-A'], { cwd: core });
    execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'files'], {
      cwd: core,
    });
    write(path.join(core, 'lib', 'streaks.ts'), 'a\nB\nc\nd\n');
    write(path.join(core, 'lib', 'new.ts'), 'x\ny\n');
  });
  afterAll(() => d.cleanup());

  it('lists one folder level, folders first, with git letters', async () => {
    const res = await get('/api/projects/core/tree');
    expect(res.statusCode).toBe(200);
    const names = res.json().entries.map((e: { name: string }) => e.name);
    expect(names.slice(0, 3)).toEqual(['docs', 'lib', 'node_modules']);
    expect(names).not.toContain('.git');
    const lib = res.json().entries.find((e: { name: string }) => e.name === 'lib');
    expect(lib.changedInside).toBe(2);
    const nm = res.json().entries.find((e: { name: string }) => e.name === 'node_modules');
    expect(nm.ignored).toBe(true);
    const inner = (await get('/api/projects/core/tree?path=lib')).json().entries;
    expect(inner.map((e: { name: string; git: string }) => [e.name, e.git])).toEqual([
      ['new.ts', 'U'],
      ['streaks.ts', 'M'],
    ]);
  });

  it('reads a file read-only with its language', async () => {
    const res = await get('/api/projects/core/file?path=lib/streaks.ts');
    expect(res.json()).toMatchObject({
      path: 'lib/streaks.ts',
      language: 'typescript',
      lines: 4,
      git: 'M',
      hidden: false,
    });
  });

  it('never sends secret files', async () => {
    const res = await get('/api/projects/core/file?path=.env');
    expect(res.json()).toMatchObject({ hidden: true, content: '' });
  });

  it('does not send binary content', async () => {
    expect((await get('/api/projects/core/file?path=logo.bin')).json()).toMatchObject({
      binary: true,
      content: '',
    });
  });

  it('refuses paths outside the project', async () => {
    expect((await get('/api/projects/core/file?path=../../etc/passwd')).statusCode).toBe(400);
    expect((await get('/api/projects/..%2F..%2Fetc/tree')).statusCode).toBe(404);
    expect((await get('/api/projects/nope/tree')).statusCode).toBe(404);
  });

  it('diffs a modified file against HEAD with removed lines inline', async () => {
    const diff = (await get('/api/projects/core/diff?path=lib/streaks.ts')).json();
    expect(diff.added).toBe(2);
    expect(diff.removed).toBe(1);
    expect(diff.lines.map((l: { kind: string; text: string }) => l.kind + l.text)).toEqual([
      ' a',
      '-b',
      '+B',
      ' c',
      '+d',
    ]);
  });

  it('shows an untracked file as all added', async () => {
    const diff = (await get('/api/projects/core/diff?path=lib/new.ts')).json();
    expect(diff).toMatchObject({ added: 2, removed: 0 });
  });

  it('groups docs into project, engineering and decisions', async () => {
    const docs = (await get('/api/projects/core/docs')).json();
    expect(docs.project.map((x: { path: string }) => x.path)).toEqual(['README.md']);
    expect(docs.engineering).toEqual([
      expect.objectContaining({ path: 'docs/prd.md', tag: 'PRD', title: 'Requirements' }),
    ]);
    expect(docs.decisions).toEqual([
      expect.objectContaining({ tag: '0001', title: 'Use SQLite with Drizzle' }),
    ]);
  });

  it('returns git info without GitHub when there is no remote', async () => {
    const git = (await get('/api/projects/core/git')).json();
    expect(git).toMatchObject({
      isRepo: true,
      branch: 'main',
      remote: false,
      repo: null,
      changes: 2,
    });
    expect(git.commits[0].subject).toBe('files');
  });
});

describe('parseFullDiff', () => {
  it('keeps line numbers for both sides', () => {
    const out =
      'diff --git a/x b/x\n--- a/x\n+++ b/x\n@@ -1,2 +1,2 @@\n a\n-b\n+c\n\\ No newline at end of file\n';
    expect(parseFullDiff(out).lines).toEqual([
      { kind: ' ', a: 1, b: 1, text: 'a' },
      { kind: '-', a: 2, b: null, text: 'b' },
      { kind: '+', a: null, b: 2, text: 'c' },
    ]);
  });
});
