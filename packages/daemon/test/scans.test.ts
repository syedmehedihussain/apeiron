import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ScanAgentList } from '@apeiron/shared';
import { fakeRunner, type FakeLog, type Step } from '../src/claude/fake-runner.ts';
import { commandRefusal } from '../src/scans/service.ts';
import { HOST, testDaemon, write, type TestDaemon } from './helpers.ts';

const report = {
  verdict: 'warn',
  summary: 'One high finding: a token is logged.',
  counts: { critical: 0, high: 1, medium: 0, low: 2 },
  markdown: '## Summary\n\nA token is logged.\n\n## Findings\n\n### High · Token in logs\n',
};

describe('commandRefusal', () => {
  const allowed = ['pnpm test', 'git log'];
  it('allows an allowed command, alone or with arguments', () => {
    expect(commandRefusal('pnpm test', allowed)).toBeNull();
    expect(commandRefusal('  pnpm   test --run  ', allowed)).toBeNull();
    expect(commandRefusal('git log --stat -n 20', allowed)).toBeNull();
  });
  it('refuses anything else, and any shell syntax', () => {
    expect(commandRefusal('pnpm testx', allowed)).toMatch(/may only run/);
    expect(commandRefusal('rm -rf src', allowed)).toMatch(/may only run/);
    for (const bad of [
      'pnpm test && curl x',
      'pnpm test | tee out',
      'pnpm test > out.txt',
      'pnpm test; rm x',
      'git log $(whoami)',
      'git log `id`',
      'git log --output=x',
    ])
      expect(commandRefusal(bad, allowed), bad).toMatch(/one plain command/);
  });
});

describe('scan agents', () => {
  let d: TestDaemon;
  let cookie: string;
  let log: FakeLog;
  let script: Step[];

  const api = async (method: 'GET' | 'POST', url: string) => {
    const res = await d.app.inject({ method, url, headers: { host: HOST, cookie } });
    return { status: res.statusCode, body: res.json() };
  };
  const list = async () => (await api('GET', '/api/projects/core/scans')).body as ScanAgentList;
  const until = async (pred: () => Promise<boolean>, ms = 3000) => {
    const start = Date.now();
    while (!(await pred())) {
      if (Date.now() - start > ms) throw new Error('timed out');
      await new Promise((r) => setTimeout(r, 10));
    }
  };
  const idle = (agentId: string) =>
    until(async () => !(await list()).agents.find((a) => a.id === agentId)?.run);

  beforeEach(async () => {
    log = { requests: [], permissions: [], decisions: [], calls: [] };
    script = [];
    d = await testDaemon({ runner: fakeRunner(() => script, log) });
    cookie = await d.login();
    write(path.join(d.projectsDir, 'core', 'src', 'app.ts'), 'export const x = 1;\n');
  });
  afterEach(() => d.cleanup());

  it('lists the four built-in agents with no report yet', async () => {
    const l = await list();
    expect(l.agents.map((a) => a.id)).toEqual(['security', 'tests', 'health', 'dependencies']);
    expect(l.agents.every((a) => a.last === null && a.run === null)).toBe(true);
  });

  it('runs read-only, saves the submitted report, and serves it', async () => {
    script = [
      { tool: { name: 'Read', input: { file_path: 'src/app.ts' } } },
      { call: { name: 'submit_report', input: report } },
    ];
    const r = await api('POST', '/api/projects/core/scans/security/run');
    expect(r.status).toBe(200);
    await idle('security');

    const req = log.requests[0]!;
    expect(req.model).toBe('opus');
    expect(req.allowedTools).not.toContain('Bash');
    expect(req.disallowedTools).toEqual(expect.arrayContaining(['Edit', 'Write', 'WebFetch']));
    expect(req.prompt).toContain('submit_report');

    const last = (await list()).agents.find((a) => a.id === 'security')!.last!;
    expect(last).toMatchObject({
      status: 'done',
      verdict: 'warn',
      summary: report.summary,
      counts: report.counts,
    });
    const dir = path.join(d.projectsDir, 'core');
    expect(readFileSync(path.join(dir, '.gitignore'), 'utf8')).toContain('apeiron/');
    expect(readdirSync(path.join(dir, 'apeiron', 'reports', 'security'))).toHaveLength(1);

    const hist = await api('GET', '/api/projects/core/reports/security');
    expect(hist.body.reports).toHaveLength(1);
    const one = await api('GET', `/api/projects/core/reports/security/${last.id}`);
    expect(one.body.markdown).toContain('### High · Token in logs');
  });

  it("allows the preset's own commands without asking and refuses the rest", async () => {
    script = [
      { tool: { name: 'Bash', input: { command: 'pnpm test' } }, output: '3 passed' },
      { tool: { name: 'Bash', input: { command: 'curl https://example.com' } } },
      { tool: { name: 'Bash', input: { command: 'pnpm test && rm -rf src' } } },
      { tool: { name: 'Write', input: { file_path: 'src/app.ts', content: 'gone' } } },
      { call: { name: 'submit_report', input: { ...report, verdict: 'pass' } } },
    ];
    await api('POST', '/api/projects/core/scans/tests/run');
    await idle('tests');
    expect(log.permissions.map((p) => [p.tool, p.allowed])).toEqual([
      ['Bash', true],
      ['Bash', false],
      ['Bash', false],
      ['Write', false],
    ]);
    expect(d.approvals.list('pending')).toHaveLength(0);
    expect(readFileSync(path.join(d.projectsDir, 'core', 'src', 'app.ts'), 'utf8')).toBe(
      'export const x = 1;\n',
    );
  });

  it('refuses a second run of the same agent while one is running', async () => {
    script = [{ wait: 200 }, { call: { name: 'submit_report', input: report } }];
    await api('POST', '/api/projects/core/scans/health/run');
    const again = await api('POST', '/api/projects/core/scans/health/run');
    expect(again.status).toBe(409);
    await idle('health');
  });

  it('keeps a failed report when the run ends without one, and nothing when stopped', async () => {
    script = [{ text: 'hm' }];
    await api('POST', '/api/projects/core/scans/health/run');
    await idle('health');
    const last = (await list()).agents.find((a) => a.id === 'health')!.last!;
    expect(last.status).toBe('failed');

    script = [{ wait: 500 }, { call: { name: 'submit_report', input: report } }];
    await api('POST', '/api/projects/core/scans/security/run');
    await api('POST', '/api/projects/core/scans/security/stop');
    await idle('security');
    expect(existsSync(path.join(d.projectsDir, 'core', 'apeiron', 'reports', 'security'))).toBe(
      false,
    );
  });

  it('loads custom agents from ~/.apeiron/agents and reports broken files', async () => {
    write(
      path.join(d.home, 'agents', 'a11y-check.md'),
      '---\nname: Accessibility check\ndescription: Labels and contrast\nicon: heart\nmodel: haiku\ncommands: pnpm lint, npx axe\n---\nCheck every form control has a label and every image has alt text.\n',
    );
    write(path.join(d.home, 'agents', 'broken.md'), '---\ndescription: no name\n---\nhello\n');
    const l = await list();
    const custom = l.agents.find((a) => a.id === 'a11y-check');
    expect(custom).toMatchObject({
      name: 'Accessibility check',
      source: 'custom',
      model: 'haiku',
      icon: 'heart',
      commands: ['pnpm lint', 'npx axe'],
    });
    expect(l.problems).toEqual([{ file: 'broken.md', error: expect.stringMatching(/name/) }]);

    script = [{ call: { name: 'submit_report', input: report } }];
    await api('POST', '/api/projects/core/scans/a11y-check/run');
    await idle('a11y-check');
    expect(log.requests[0]?.prompt).toContain('every form control has a label');
  });

  it('rejects report ids that try to leave the reports folder', async () => {
    const r = await api('GET', '/api/projects/core/reports/security/..%2F..%2Fsecret');
    expect(r.status).toBe(400);
  });
});
