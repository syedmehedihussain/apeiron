import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CalibrationState } from '@cherry/shared';
import { isReadOnlyGit } from '../src/calibrate/service.ts';
import { fakeRunner, type FakeLog, type Step } from '../src/claude/fake-runner.ts';
import { HOST, gitInit, testDaemon, write, type TestDaemon } from './helpers.ts';

const phaseCard = {
  topic: 'Phase',
  question: 'Which phase is torongo in?',
  options: [
    {
      id: 'dev',
      title: 'Development',
      tradeoff: 'Assumes the core is still being built',
      recommended: true,
    },
    { id: 'dep', title: 'Deployment', tradeoff: 'Assumes it is live' },
  ],
};

const proposal = (extra: object[] = []) => ({
  call: {
    name: 'propose_files',
    input: {
      summary: 'Real-time AI healthcare translation for Bangladesh',
      phase: 'development',
      stack: ['Node 20', 'Express'],
      files: [
        {
          path: 'CLAUDE.md',
          action: 'create',
          content: '# CLAUDE.md — torongo\n\nTranslation app.\n',
        },
        {
          path: 'docs/architecture.md',
          action: 'create',
          content: '# Architecture\n\nExpress server.\n',
        },
        {
          path: '_project/STATUS.md',
          action: 'create',
          content: '## Where we left off\n\nCalibrated.\n',
        },
        { path: 'src/server.js', action: 'create', content: 'evil' },
        ...extra,
      ],
    },
  },
});

/** Hash of every file in the folder (except .git internals other than info/exclude). */
function snapshot(dir: string): string {
  const h = createHash('sha256');
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) {
        if (e.name === '.git') {
          const ex = path.join(p, 'info', 'exclude');
          if (existsSync(ex)) h.update(readFileSync(ex));
          continue;
        }
        walk(p);
      } else {
        h.update(path.relative(dir, p));
        h.update(readFileSync(p));
        h.update(String(statSync(p).mtimeMs));
      }
    }
  };
  walk(dir);
  return h.digest('hex');
}

describe('calibration', () => {
  let d: TestDaemon;
  let cookie: string;
  let log: FakeLog;
  let script: Step[];
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
  const state = (): CalibrationState => d.calibration.state('torongo');
  const until = async (pred: () => boolean, ms = 3000) => {
    const start = Date.now();
    while (!pred()) {
      if (Date.now() - start > ms)
        throw new Error(`timed out; state ${JSON.stringify(state()).slice(0, 300)}`);
      await new Promise((r) => setTimeout(r, 10));
    }
  };

  beforeEach(async () => {
    log = { requests: [], permissions: [], decisions: [], calls: [] };
    script = [];
    d = await testDaemon({ runner: fakeRunner(() => script, log) });
    cookie = await d.login();
    dir = path.join(d.projectsDir, 'torongo');
    gitInit(dir);
    write(path.join(dir, 'README.md'), '# torongo\n\nTranslation.\n');
    write(path.join(dir, 'src', 'server.js'), 'console.log(1)\n');
    write(path.join(dir, '.env'), 'SECRET=hunter2\n');
  });
  afterEach(() => d.cleanup());

  const fullScript = (): Step[] => [
    { tool: { name: 'Read', input: { file_path: 'README.md' } } },
    { tool: { name: 'Read', input: { file_path: '.env' } } },
    { tool: { name: 'Write', input: { file_path: 'hack.txt', content: 'x' } } },
    { tool: { name: 'Bash', input: { command: 'git log --oneline -30' } } },
    { tool: { name: 'Bash', input: { command: 'npm install' } } },
    {
      call: {
        name: 'note_found',
        input: { tags: [{ label: 'Node 20' }, { label: 'no tests', gap: true }] },
      },
    },
    { decision: phaseCard },
    proposal(),
  ];

  // Must-pass safety test 1.
  it('changes nothing under the project until write is called', async () => {
    const before = snapshot(dir);
    script = fullScript();
    expect((await api('POST', '/api/projects/torongo/calibrate')).status).toBe(200);
    await until(() => state().status === 'questions');
    const card = state().items.find((i) => i.kind === 'decision')!;
    await api('POST', `/api/decisions/${card.id}`, { optionId: 'dev' });
    await until(() => state().status === 'proposal');
    expect(snapshot(dir)).toBe(before);
    expect(state().found).toEqual([
      { label: 'Node 20', gap: false },
      { label: 'no tests', gap: true },
    ]);
    expect(state().answers).toEqual([{ topic: 'Phase', answer: 'Development' }]);
  });

  it('refuses secret reads, writes and changing commands during the scan', async () => {
    script = fullScript();
    await api('POST', '/api/projects/torongo/calibrate');
    await until(() => state().status === 'questions');
    expect(log.permissions).toEqual([
      {
        tool: 'Read',
        allowed: false,
        message: expect.stringContaining('never lets Claude read secret files'),
      },
      { tool: 'Write', allowed: false, message: expect.stringContaining('read-only') },
      { tool: 'Bash', allowed: true },
      { tool: 'Bash', allowed: false, message: expect.stringContaining('read-only') },
    ]);
    expect(d.approvals.list()).toHaveLength(0);
    await d.calibration.cancel('torongo');
  });

  it('proposes only allowed files and adds project.json, tasks.json and the git exclude', async () => {
    script = [proposal()];
    await api('POST', '/api/projects/torongo/calibrate');
    await until(() => state().status === 'proposal');
    const files = state().proposal!.files.map((f) => [f.path, f.action]);
    expect(files).toEqual([
      ['CLAUDE.md', 'create'],
      ['docs/architecture.md', 'create'],
      ['_project/STATUS.md', 'create'],
      ['_project/project.json', 'create'],
      ['_project/tasks.json', 'create'],
      ['.git/info/exclude', 'append'],
    ]);
  });

  it('writes only the ticked files and the project becomes Ready', async () => {
    script = [proposal()];
    await api('POST', '/api/projects/torongo/calibrate');
    await until(() => state().status === 'proposal');
    const res = await api('POST', '/api/projects/torongo/calibrate/write', {
      paths: ['CLAUDE.md', '_project/project.json', '_project/STATUS.md', '.git/info/exclude'],
    });
    expect(res.body).toEqual({
      written: ['CLAUDE.md', '_project/project.json', '_project/STATUS.md', '.git/info/exclude'],
      skipped: [],
    });
    expect(existsSync(path.join(dir, 'docs', 'architecture.md'))).toBe(false);
    expect(existsSync(path.join(dir, '_project', 'tasks.json'))).toBe(false);
    expect(
      JSON.parse(readFileSync(path.join(dir, '_project', 'project.json'), 'utf8')),
    ).toMatchObject({ phase: 'development', createdBy: 'calibration' });
    const card = d.projects.get('torongo');
    expect(card?.state).toBe('ready');
    expect(readFileSync(path.join(dir, '.git', 'info', 'exclude'), 'utf8')).toMatch(
      /_project\/\n$/,
    );
    const { execFileSync } = await import('node:child_process');
    const status = execFileSync('git', ['status', '--porcelain'], { cwd: dir, encoding: 'utf8' });
    expect(status).not.toContain('_project');
  });

  // Must-pass safety test 2.
  it('appends to an existing CLAUDE.md and never replaces it', async () => {
    const original = '# My own CLAUDE.md\n\nHand-written rules.\n';
    write(path.join(dir, 'CLAUDE.md'), original);
    script = [proposal()];
    await api('POST', '/api/projects/torongo/calibrate');
    await until(() => state().status === 'proposal');
    expect(state().proposal!.files.find((f) => f.path === 'CLAUDE.md')?.action).toBe('append');
    await api('POST', '/api/projects/torongo/calibrate/write', { paths: ['CLAUDE.md'] });
    const after = readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8');
    expect(after.startsWith(original)).toBe(true);
    expect(after.length).toBeGreaterThan(original.length);
  });

  it('keeps STATUS.md for a cctop project (light calibration)', async () => {
    write(path.join(dir, '_project', 'STATUS.md'), '## Where we left off\n\nMine.\n');
    script = [proposal()];
    await api('POST', '/api/projects/torongo/calibrate');
    await until(() => state().status === 'proposal');
    expect(state().light).toBe(true);
    expect(state().proposal!.files.some((f) => f.path === '_project/STATUS.md')).toBe(false);
  });

  it('will not write a file that looks like it holds a secret', async () => {
    script = [
      proposal([{ path: 'docs/setup.md', action: 'create', content: 'key: AKIAABCDEFGHIJKLMNOP' }]),
    ];
    await api('POST', '/api/projects/torongo/calibrate');
    await until(() => state().status === 'proposal');
    const res = await api('POST', '/api/projects/torongo/calibrate/write', {
      paths: ['docs/setup.md'],
    });
    expect(res.body.skipped[0].reason).toContain('AWS access key');
    expect(existsSync(path.join(dir, 'docs', 'setup.md'))).toBe(false);
  });

  it('sends an invalid proposal back to Claude', async () => {
    script = [
      { call: { name: 'propose_files', input: { summary: 'x', phase: 'shipping', files: [] } } },
    ];
    await api('POST', '/api/projects/torongo/calibrate');
    await until(() => state().status === 'failed');
    expect(log.calls?.[0]).toMatchObject({ name: 'propose_files', ok: false });
  });

  it('cancel writes nothing and returns to idle', async () => {
    const before = snapshot(dir);
    script = [{ decision: phaseCard }, proposal()];
    await api('POST', '/api/projects/torongo/calibrate');
    await until(() => state().status === 'questions');
    await api('POST', '/api/projects/torongo/calibrate/cancel');
    expect(state().status).toBe('idle');
    expect(snapshot(dir)).toBe(before);
  });
});

describe('isReadOnlyGit', () => {
  it.each(['git log --oneline -30', 'git status', 'git show HEAD~1', 'git ls-files'])(
    'allows %s',
    (c) => expect(isReadOnlyGit(c)).toBe(true),
  );
  it.each([
    'git commit -m x',
    'git log; rm -rf .',
    'git status && touch x',
    'git push',
    'git log > out.txt',
  ])('refuses %s', (c) => expect(isReadOnlyGit(c)).toBe(false));
});
