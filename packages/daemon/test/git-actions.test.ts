import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { GitResult } from '@cherry/shared';
import { HOST, tempDir, testDaemon, write, type TestDaemon } from './helpers.ts';

const env = {
  ...process.env,
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_AUTHOR_NAME: 't',
  GIT_AUTHOR_EMAIL: 't@t',
  GIT_COMMITTER_NAME: 't',
  GIT_COMMITTER_EMAIL: 't@t',
};
const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', args, { cwd, env, encoding: 'utf8' }).trim();

describe('Pull and Push', () => {
  let d: TestDaemon;
  let cookie: string;
  let remote: string;
  let dir: string;
  let other: string;
  let results: GitResult[];

  const api = async (method: 'GET' | 'POST', url: string, payload?: unknown) => {
    const res = await d.app.inject({
      method,
      url,
      headers: { host: HOST, cookie },
      ...(payload !== undefined ? { payload: payload as object } : {}),
    });
    return { status: res.statusCode, body: res.json() };
  };
  const commit = (cwd: string, file: string, text: string) => {
    write(path.join(cwd, file), text);
    git(cwd, 'add', '-A');
    git(cwd, 'commit', '-q', '-m', `edit ${file}`);
  };
  const nextResult = async () => {
    const start = Date.now();
    while (results.length === 0) {
      if (Date.now() - start > 5000) throw new Error('no git.result');
      await new Promise((r) => setTimeout(r, 10));
    }
    return results.shift()!;
  };

  beforeEach(async () => {
    d = await testDaemon({
      prList: async () => ({
        prs: [
          {
            number: 7,
            title: 'Add streaks',
            url: 'https://github.com/x/y/pull/7',
            author: 'meddy',
            branch: 'streaks',
            draft: false,
            updatedAt: 1,
          },
        ],
        error: null,
      }),
    });
    cookie = await d.login();
    results = [];
    d.hub.listen((_t, e) => {
      if (e.type === 'git.result') results.push(e);
    });
    remote = path.join(tempDir('cherry-remote-'), 'r.git');
    execFileSync('git', ['init', '-q', '--bare', '-b', 'main', remote], { env });
    const seed = tempDir('cherry-seed-');
    git(seed, 'init', '-q', '-b', 'main');
    commit(seed, 'a.txt', 'one\n');
    git(seed, 'remote', 'add', 'origin', remote);
    git(seed, 'push', '-q', '-u', 'origin', 'main');
    dir = path.join(d.projectsDir, 'proj');
    execFileSync('git', ['clone', '-q', remote, dir], { env });
    other = path.join(tempDir('cherry-other-'), 'o');
    execFileSync('git', ['clone', '-q', remote, other], { env });
  });
  afterEach(() => d.cleanup());

  it('pulls fast-forward only', async () => {
    commit(other, 'b.txt', 'two\n');
    git(other, 'push', '-q');
    const r = await api('POST', '/api/projects/proj/git/pull');
    expect(r.body).toMatchObject({ action: 'pull', ok: true });
    expect(git(dir, 'log', '--format=%s', '-1')).toBe('edit b.txt');

    // Both sides changed: no merge, a plain message.
    commit(other, 'c.txt', 'x\n');
    git(other, 'push', '-q');
    commit(dir, 'd.txt', 'y\n');
    const before = git(dir, 'rev-parse', 'HEAD');
    const r2 = await api('POST', '/api/projects/proj/git/pull');
    expect(r2.body.ok).toBe(false);
    expect(r2.body.message).toMatch(/both changed/);
    expect(git(dir, 'rev-parse', 'HEAD')).toBe(before);
  });

  it('pushes only after Allow, and a Deny sends nothing', async () => {
    commit(dir, 'b.txt', 'two\n');
    const remoteHead = git(remote, 'rev-parse', 'main');

    const r = await api('POST', '/api/projects/proj/git/push');
    expect(r.status).toBe(200);
    const pending = d.approvals.list('pending');
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({
      kind: 'push',
      title: 'Push 1 commit to origin/main',
      command: 'git push origin HEAD:main',
    });
    expect(pending[0]!.detail).toContain('edit b.txt');
    // Nothing is sent while the approval waits.
    expect(git(remote, 'rev-parse', 'main')).toBe(remoteHead);
    expect((await api('POST', '/api/projects/proj/git/push')).status).toBe(409);

    await api('POST', `/api/approvals/${r.body.approvalId}`, { answer: 'deny' });
    expect(await nextResult()).toMatchObject({ action: 'push', ok: false });
    expect(git(remote, 'rev-parse', 'main')).toBe(remoteHead);

    const r2 = await api('POST', '/api/projects/proj/git/push');
    await api('POST', `/api/approvals/${r2.body.approvalId}`, { answer: 'allow' });
    expect(await nextResult()).toMatchObject({ action: 'push', ok: true });
    expect(git(remote, 'rev-parse', 'main')).toBe(git(dir, 'rev-parse', 'HEAD'));
    expect((await api('POST', '/api/projects/proj/git/push')).status).toBe(409);
  });

  it('a rejected push says to pull first', async () => {
    commit(other, 'b.txt', 'two\n');
    git(other, 'push', '-q');
    commit(dir, 'c.txt', 'x\n');
    git(dir, 'fetch', '-q');
    const r = await api('POST', '/api/projects/proj/git/push');
    await api('POST', `/api/approvals/${r.body.approvalId}`, { answer: 'allow' });
    const res = await nextResult();
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/Pull first/);
  });

  it('lists open pull requests through gh', async () => {
    const r = await api('GET', '/api/projects/proj/git/prs');
    expect(r.body.prs[0]).toMatchObject({ number: 7, title: 'Add streaks' });
  });
});
