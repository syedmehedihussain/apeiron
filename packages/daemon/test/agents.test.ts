import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Agent } from '@cherry/shared';
import { slugify } from '../src/agents/manager.ts';
import { fakeRunner, type FakeLog, type Step } from '../src/claude/fake-runner.ts';
import { HOST, gitInit, testDaemon, write, type TestDaemon } from './helpers.ts';

const env = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null' };
const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
    cwd,
    env,
    encoding: 'utf8',
  }).trim();

describe('background agents', () => {
  let d: TestDaemon;
  let cookie: string;
  let log: FakeLog;
  let script: (prompt: string) => Step[];
  let dir: string;

  const api = async (method: 'GET' | 'POST', url: string, payload?: unknown) => {
    const res = await d.app.inject({
      method,
      url,
      headers: { host: HOST, cookie },
      ...(payload !== undefined ? { payload: payload as object } : {}),
    });
    return { status: res.statusCode, body: res.json() };
  };
  const agent = (id: string): Agent => d.agents.get(id);
  const until = async (id: string, pred: (a: Agent) => boolean, ms = 5000) => {
    const start = Date.now();
    while (!pred(agent(id))) {
      if (Date.now() - start > ms) throw new Error(`timed out: ${JSON.stringify(agent(id))}`);
      await new Promise((r) => setTimeout(r, 10));
    }
    return agent(id);
  };
  const startAgent = async (task = 'Write tests for the streak service') => {
    const r = await api('POST', '/api/projects/core/agents', { task });
    expect(r.status).toBe(200);
    return r.body as Agent;
  };

  beforeEach(async () => {
    log = { requests: [], permissions: [], decisions: [], calls: [] };
    script = () => [
      { tool: { name: 'Read', input: { file_path: 'lib/streaks.ts' } } },
      { tool: { name: 'Write', input: { file_path: 'tests/streaks.test.ts', content: 'test\n' } } },
      { text: 'Added tests for the streak service.' },
    ];
    d = await testDaemon({ runner: fakeRunner((req) => script(req.prompt), log) });
    cookie = await d.login();
    dir = path.join(d.projectsDir, 'core');
    gitInit(dir);
    write(path.join(dir, 'lib', 'streaks.ts'), 'export const s = 1;\n');
    git(dir, 'add', '-A');
    git(dir, 'commit', '-q', '-m', 'streaks');
  });
  afterEach(() => d.cleanup());

  it('makes a slug from the task', () => {
    expect(slugify('Write tests for the streak service')).toBe('tests-streak-service');
    expect(slugify('!!!')).toBe('task');
  });

  it('runs in its own worktree, edits without asking, commits on agent/<slug>', async () => {
    const a = await startAgent();
    expect(a.branch).toBe('agent/tests-streak-service');
    const done = await until(a.id, (x) => x.status === 'done');
    expect(done.summary).toBe('Added tests for the streak service.');
    expect(done.changes).toEqual({ files: 1, added: 1, removed: 0 });
    // The worktree lives outside the project, under the projects folder's dot-folder.
    const wt = path.join(d.projectsDir, '.cherry-worktrees', 'core', 'tests-streak-service');
    expect(log.requests[0]!.cwd).toBe(wt);
    expect(log.permissions).toEqual([{ tool: 'Write', allowed: true }]);
    expect(d.approvals.list()).toEqual([]);
    expect(git(dir, 'log', '--format=%s', '-1', a.branch)).toMatch(/^agent: Write tests/);
    // The main checkout is untouched until Accept.
    expect(existsSync(path.join(dir, 'tests', 'streaks.test.ts'))).toBe(false);
    expect(git(dir, 'status', '--porcelain')).toBe('');

    const diff = await api('GET', `/api/agents/${a.id}/diff`);
    expect(diff.body.files[0]).toMatchObject({ path: 'tests/streaks.test.ts', isNew: true });

    const acc = await api('POST', `/api/agents/${a.id}/accept`);
    expect(acc.body.status).toBe('accepted');
    expect(readFileSync(path.join(dir, 'tests', 'streaks.test.ts'), 'utf8')).toBe('test\n');
    expect(existsSync(wt)).toBe(false);
    expect(git(dir, 'branch', '--list', 'agent/*')).toBe('');
    expect((await api('GET', '/api/projects/core/agents')).body.agents).toEqual([]);
  });

  // Must-pass safety test 8.
  it('Discard removes the worktree and branch and leaves the main checkout unchanged', async () => {
    const head = git(dir, 'rev-parse', 'HEAD');
    const a = await startAgent();
    await until(a.id, (x) => x.status === 'done');
    const r = await api('POST', `/api/agents/${a.id}/discard`);
    expect(r.body.status).toBe('discarded');
    expect(
      existsSync(path.join(d.projectsDir, '.cherry-worktrees', 'core', 'tests-streak-service')),
    ).toBe(false);
    expect(git(dir, 'branch', '--list', 'agent/*')).toBe('');
    expect(git(dir, 'rev-parse', 'HEAD')).toBe(head);
    expect(git(dir, 'status', '--porcelain')).toBe('');
    expect(git(dir, 'worktree', 'list').split('\n')).toHaveLength(1);
  });

  it('commands wait for an approval and the card shows waiting', async () => {
    script = () => [
      { tool: { name: 'Bash', input: { command: 'npm install -D vitest' } } },
      { text: 'Done.' },
    ];
    const a = await startAgent('Add vitest');
    const w = await until(a.id, (x) => x.status === 'waiting');
    expect(w.waiting).toMatchObject({
      kind: 'command',
      command: 'npm install -D vitest',
      source: `agent:${a.id}`,
    });
    await api('POST', `/api/approvals/${w.waiting!.id}`, { answer: 'deny' });
    await until(a.id, (x) => x.status === 'done');
    expect(log.permissions).toEqual([expect.objectContaining({ tool: 'Bash', allowed: false })]);
  });

  it('refuses edits outside the worktree', async () => {
    script = () => [
      { tool: { name: 'Write', input: { file_path: path.join(dir, 'hack.txt'), content: 'x' } } },
      { text: 'Tried.' },
    ];
    const a = await startAgent('Escape');
    await until(a.id, (x) => x.status === 'done');
    expect(existsSync(path.join(dir, 'hack.txt'))).toBe(false);
    expect(log.permissions[0]).toMatchObject({ tool: 'Write', allowed: false });
    expect(log.permissions[0]!.message).toMatch(/inside their worktree/);
  });

  it('queues agents over the limit and starts them when one finishes', async () => {
    d.config.update({ agents: { maxRunning: 1 } });
    script = () => [{ wait: 120 }, { text: 'ok' }];
    const a = await startAgent('first task');
    const b = await startAgent('second task');
    expect(agent(a.id).status).toBe('running');
    expect(agent(b.id).status).toBe('queued');
    await until(a.id, (x) => x.status === 'done');
    await until(b.id, (x) => x.status === 'running' || x.status === 'done');
    await until(b.id, (x) => x.status === 'done');
  });

  it('a failed agent can be tried again', async () => {
    script = () => [{ tool: { name: 'Bash', input: { command: 'npm ls' } } }];
    const a = await startAgent('Check deps');
    const w = await until(a.id, (x) => x.status === 'waiting');
    await api('POST', `/api/agents/${a.id}/stop`);
    const failed = await until(a.id, (x) => x.status === 'failed');
    expect(failed.error).toBe('Stopped.');
    expect(d.approvals.list('pending').find((p) => p.id === w.waiting!.id)).toBeUndefined();
    script = () => [{ text: 'All good.' }];
    const r = await api('POST', `/api/agents/${a.id}/retry`);
    expect(r.body.task).toBe('Check deps');
    expect(r.body.branch).toBe('agent/check-deps');
    await until(r.body.id, (x) => x.status === 'done');
    expect(agent(a.id).status).toBe('discarded');
  });

  it('needs a repository with a commit', async () => {
    write(path.join(d.projectsDir, 'plain', 'a.txt'), 'x');
    const r = await api('POST', '/api/projects/plain/agents', { task: 'do things' });
    expect(r.status).toBe(409);
  });
});
