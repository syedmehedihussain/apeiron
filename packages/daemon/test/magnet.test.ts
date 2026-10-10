import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ChatItem, MagnetAction } from '@cherry/shared';
import { fakeRunner, type FakeLog, type Step } from '../src/claude/fake-runner.ts';
import { usageStats } from '../src/magnet/service.ts';
import { HOST, gitInit, testDaemon, write, type TestDaemon } from './helpers.ts';

describe('Magnet', () => {
  let d: TestDaemon;
  let cookie: string;
  let log: FakeLog;
  let magnetScript: Step[];

  const api = async (method: 'GET' | 'POST' | 'PUT', url: string, payload?: unknown) => {
    const res = await d.app.inject({
      method,
      url,
      headers: { host: HOST, cookie },
      ...(payload !== undefined ? { payload: payload as object } : {}),
    });
    return { status: res.statusCode, body: res.json() };
  };
  const idle = async () => {
    const start = Date.now();
    while ((await d.magnet.state()).running) {
      if (Date.now() - start > 3000) throw new Error('magnet still running');
      await new Promise((r) => setTimeout(r, 10));
    }
    return d.magnet.state();
  };
  const actionItem = async () =>
    (await d.magnet.state()).items.find(
      (i): i is Extract<ChatItem, { kind: 'action' }> => i.kind === 'action',
    )!;

  beforeEach(async () => {
    log = { requests: [], permissions: [], decisions: [], calls: [] };
    magnetScript = [];
    d = await testDaemon({
      runner: fakeRunner(
        (req) =>
          req.prompt.includes('Calibrate the project')
            ? [{ wait: 50 }, { text: 'scanning' }]
            : req.prompt.includes('background agent')
              ? [{ text: 'done' }]
              : magnetScript,
        log,
      ),
    });
    cookie = await d.login();
    write(path.join(d.projectsDir, 'torongo', 'README.md'), '# torongo\n');
    const core = path.join(d.projectsDir, 'core');
    gitInit(core);
    write(
      path.join(core, '_project', 'project.json'),
      JSON.stringify({ schema: 1, name: 'core', phase: 'development' }),
    );
    write(path.join(core, '_project', 'STATUS.md'), '## Next steps\n- [ ] Ship it\n');
  });
  afterEach(() => d.cleanup());

  it('answers from the projects it knows, with cards and the projects list in its prompt', async () => {
    magnetScript = [
      {
        tool: {
          name: 'Read',
          input: { file_path: path.join(d.projectsDir, 'core', '_project', 'STATUS.md') },
        },
      },
      { call: { name: 'show_projects', input: { ids: ['torongo', 'nope'] } } },
      { text: 'torongo is not calibrated yet.' },
    ];
    const r = await api('POST', '/api/magnet/chat', { text: "What's stuck this week?" });
    expect(r.status).toBe(200);
    const s = await idle();
    const req = log.requests[0]!;
    expect(req.cwd).toBe(path.join(d.home, 'magnet'));
    expect(req.additionalDirectories).toEqual([d.projectsDir]);
    expect(req.appendSystemPrompt).toContain('- torongo · Not calibrated');
    expect(req.appendSystemPrompt).toContain('- core · Ready · development');
    expect(s.items.find((i) => i.kind === 'projects')).toMatchObject({ ids: ['torongo'] });
    expect(s.items.some((i) => i.kind === 'text' && i.text.includes('not calibrated'))).toBe(true);
    expect(s.projects).toBe(2);
    expect(readFileSync(path.join(d.home, 'magnet', 'projects.md'), 'utf8')).toContain('torongo');
  });

  it('is read-only: commands, edits and reads outside the projects are refused', async () => {
    magnetScript = [
      { tool: { name: 'Bash', input: { command: 'ls' } } },
      {
        tool: {
          name: 'Write',
          input: { file_path: path.join(d.projectsDir, 'core', 'x.txt'), content: 'x' },
        },
      },
      { tool: { name: 'Read', input: { file_path: '/etc/passwd' } } },
      { tool: { name: 'Write', input: { file_path: 'me.md', content: 'hacked' } } },
      { text: 'ok' },
    ];
    await api('POST', '/api/magnet/chat', { text: 'try things' });
    await idle();
    expect(log.permissions.map((p) => p.allowed)).toEqual([false, false, false, false]);
    expect(existsSync(path.join(d.projectsDir, 'core', 'x.txt'))).toBe(false);
    expect(readFileSync(path.join(d.home, 'magnet', 'me.md'), 'utf8')).not.toContain('hacked');
    expect(d.approvals.list()).toEqual([]);
  });

  it('a proposed calibration runs only after Approve, and Cancel does nothing', async () => {
    magnetScript = [
      { call: { name: 'propose_action', input: { kind: 'calibrate', projectId: 'torongo' } } },
      { text: 'Want me to start the calibration for torongo?' },
    ];
    await api('POST', '/api/magnet/chat', { text: "What's stuck?" });
    await idle();
    let item = await actionItem();
    expect(item.action).toMatchObject({
      kind: 'calibrate',
      status: 'proposed',
      title: 'Magnet wants to start calibration in torongo',
    });
    expect(d.calibration.state('torongo').status).toBe('idle');

    const r = await api('POST', `/api/magnet/actions/${item.id}/approve`);
    expect(r.body as MagnetAction).toMatchObject({
      status: 'approved',
      href: '/p/torongo/calibrate',
    });
    expect(d.calibration.state('torongo').status).not.toBe('idle');
    expect((await api('POST', `/api/magnet/actions/${item.id}/approve`)).status).toBe(409);

    magnetScript = [
      { call: { name: 'propose_action', input: { kind: 'new_project', task: 'A habit app' } } },
    ];
    await api('POST', '/api/magnet/chat', { text: 'new idea' });
    await idle();
    item = (await d.magnet.state()).items.filter(
      (i): i is Extract<ChatItem, { kind: 'action' }> => i.kind === 'action',
    )[1]!;
    const c = await api('POST', `/api/magnet/actions/${item.id}/cancel`);
    expect(c.body.status).toBe('cancelled');
  });

  it('a proposed agent starts through the agent manager after Approve', async () => {
    magnetScript = [
      {
        call: {
          name: 'propose_action',
          input: { kind: 'start_agent', projectId: 'core', task: 'Write tests' },
        },
      },
      { call: { name: 'propose_action', input: { kind: 'calibrate', projectId: 'ghost' } } },
    ];
    await api('POST', '/api/magnet/chat', { text: 'tests please', projectId: 'core' });
    await idle();
    expect(log.requests[0]!.prompt).toContain('looking at the project "core"');
    expect(log.calls?.[1]).toMatchObject({ name: 'propose_action', ok: false });
    const item = await actionItem();
    const r = await api('POST', `/api/magnet/actions/${item.id}/approve`);
    expect(r.body.status).toBe('approved');
    expect(r.body.href).toMatch(/^\/p\/core\?agent=ag_/);
    expect((await d.agents.list('core')).agents[0]).toMatchObject({ task: 'Write tests' });
  });

  it('keeps one conversation, resumes it, and New starts over', async () => {
    magnetScript = [{ text: 'hi' }];
    await api('POST', '/api/magnet/chat', { text: 'one' });
    await idle();
    await api('POST', '/api/magnet/chat', { text: 'two' });
    await idle();
    expect(log.requests[1]!.resume).toBe('fake_session_1');
    expect(
      (await api('GET', '/api/magnet/chat')).body.items.filter((i: ChatItem) => i.kind === 'user'),
    ).toHaveLength(2);
    await api('POST', '/api/magnet/chat/new');
    expect((await api('GET', '/api/magnet/chat')).body.items).toEqual([]);
  });

  it('serves and saves the knowledge files, with stats', async () => {
    const info = await api('GET', '/api/magnet');
    expect(info.body.files.map((f: { name: string }) => f.name)).toEqual([
      'MAGNET.md',
      'me.md',
      'work.md',
    ]);
    expect(info.body.stats.projects).toBe(2);
    const saved = await api('PUT', '/api/magnet/files/me.md', { content: 'Meddy.\n' });
    expect(saved.body.files[1].content).toBe('Meddy.\n');
    expect((await api('PUT', '/api/magnet/files/projects.md', { content: 'x' })).status).toBe(400);
  });

  it('works out usage streaks', () => {
    d.db
      .prepare('INSERT INTO usage_days (day, sessions, longest_ms) VALUES (?, ?, ?)')
      .run('2026-10-06', 2, 1000);
    d.db
      .prepare('INSERT INTO usage_days (day, sessions, longest_ms) VALUES (?, ?, ?)')
      .run('2026-10-07', 1, 5000);
    d.db
      .prepare('INSERT INTO usage_days (day, sessions, longest_ms) VALUES (?, ?, ?)')
      .run('2026-10-08', 3, 2000);
    d.db
      .prepare('INSERT INTO usage_days (day, sessions, longest_ms) VALUES (?, ?, ?)')
      .run('2026-09-20', 1, 0);
    const u = usageStats(d.db, new Date('2026-10-08T20:00:00'));
    expect(u).toMatchObject({
      sessionsMonth: 6,
      longestMs: 5000,
      currentStreak: 3,
      longestStreak: 3,
    });
    expect(u.days).toHaveLength(182);
    expect(u.days.at(-1)).toEqual({ day: '2026-10-08', sessions: 3 });
  });
});
