import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { SurveyFile, SurveyState } from '@cherry/shared';
import { fakeRunner, type FakeLog, type Step } from '../src/claude/fake-runner.ts';
import { activeSteps, nextStep } from '../src/survey/service.ts';
import { HOST, testDaemon, write, type TestDaemon } from './helpers.ts';

const card = (step: number, extra = '') => ({
  call: {
    name: 'draft_card',
    input: {
      topic: `t${step}`,
      question: `Question for step ${step}${extra}?`,
      context: 'You said: QR codes for reviews.',
      options: [
        { id: 'opt_a', title: `A${step}${extra}`, detail: 'd', tradeoff: 'ta', recommended: true },
        { id: 'opt_b', title: `B${step}${extra}`, detail: 'd', tradeoff: 'tb' },
      ],
      why: 'Because.',
    },
  },
});

const docs: Step = {
  call: {
    name: 'propose_docs',
    input: {
      summary: 'Printable QR codes that open a review page',
      stack: ['Node 22', 'SQLite'],
      files: [
        { path: 'CLAUDE.md', content: '# CLAUDE.md — review-qr\n\nQR codes.\n' },
        { path: 'docs/prd.md', content: '# PRD\n\nRequirements.\n' },
        { path: 'docs/architecture.md', content: '# Architecture\n' },
        { path: 'docs/adr/0001-host-on-home-server.md', content: '# 0001 — Host at home\n' },
        { path: 'src/index.ts', content: 'no code allowed' },
      ],
    },
  },
};

describe('new project survey', () => {
  let d: TestDaemon;
  let cookie: string;
  let log: FakeLog;
  let repoCalls: string[];

  const api = async (method: 'GET' | 'POST', url: string, payload?: unknown) => {
    const res = await d.app.inject({
      method,
      url,
      headers: { host: HOST, cookie },
      ...(payload !== undefined ? { payload: payload as object } : {}),
    });
    return { status: res.statusCode, body: res.json() };
  };
  const state = () => d.survey.state('review-qr');
  const until = async (pred: (s: SurveyState) => boolean, ms = 3000) => {
    const start = Date.now();
    for (;;) {
      const s = await state();
      if (pred(s)) return s;
      if (Date.now() - start > ms) throw new Error(`timed out; ${JSON.stringify(s).slice(0, 400)}`);
      await new Promise((r) => setTimeout(r, 10));
    }
  };
  const fileOf = (): SurveyFile =>
    JSON.parse(readFileSync(path.join(dir(), '_project', 'survey.json'), 'utf8')) as SurveyFile;
  const dir = () => path.join(d.projectsDir, 'review-qr');
  const pick = async (step: number, optionId = 'opt_a') => {
    await until((s) => s.step === step && !!s.card && !s.drafting);
    const r = await api('POST', '/api/survey/review-qr/answer', { step, optionId });
    expect(r.status).toBe(200);
    return r.body as SurveyState;
  };

  beforeEach(async () => {
    log = { requests: [], permissions: [], decisions: [], calls: [] };
    repoCalls = [];
    let round = 0;
    d = await testDaemon({
      runner: fakeRunner((req) => {
        if (req.prompt.includes('Write the planning documents')) return [docs];
        const step = Number(/this is step (\d)/.exec(req.prompt)?.[1]);
        // The second time a step is drafted, its options carry a marker.
        return [card(step, round++ >= 100 ? 'x' : '')];
      }, log),
      github: {
        owner: async () => 'meddy',
        createRepo: async (_dir, name) => {
          repoCalls.push(name);
          return { ok: true, repo: `meddy/${name}` };
        },
      },
    });
    cookie = await d.login();
  });
  afterEach(() => d.cleanup());

  it('works out the next step from answers, stale steps and Quick', () => {
    expect(activeSteps(true)).toEqual([1, 2, 3, 4, 7]);
    const f = (steps: number[], stale: number[] = []): SurveyFile => ({
      schema: 1,
      status: 'in_progress',
      startedAt: '',
      updatedAt: '',
      step: 1,
      stale,
      answers: steps.map((step) =>
        step === 1
          ? {
              step: 1,
              topic: 'name_idea',
              kind: 'typed',
              value: { name: 'x', idea: 'y', quick: false },
            }
          : {
              step,
              topic: 't',
              kind: 'decision',
              card: {
                id: 'c',
                topic: 't',
                label: 'l',
                question: 'q',
                context: '',
                options: [],
                why: '',
                allowCustom: true,
              },
              chosen: 'opt_a',
              custom: null,
              summary: 's',
              answeredAt: '',
            },
      ),
    });
    expect(nextStep(f([1, 2]), false)).toBe(3);
    expect(nextStep(f([1, 2, 3, 4]), true)).toBe(7);
    expect(nextStep(f([1, 2, 3, 4]), false)).toBe(5);
    expect(nextStep(f([1, 2, 3, 4, 5, 6], [4, 3]), false)).toBe(3);
  });

  it('rejects bad names and folders that already exist', async () => {
    expect((await api('POST', '/api/survey', { name: 'Bad Name', idea: 'x' })).status).toBe(400);
    write(path.join(d.projectsDir, 'taken', 'README.md'), 'hi');
    const r = await api('POST', '/api/survey', { name: 'taken', idea: 'x' });
    expect(r.status).toBe(409);
    expect(readFileSync(path.join(d.projectsDir, 'taken', 'README.md'), 'utf8')).toBe('hi');
  });

  it('saves every answer to survey.json and resumes after a restart', async () => {
    const r = await api('POST', '/api/survey', { name: 'review-qr', idea: 'QR codes for reviews' });
    expect(r.status).toBe(200);
    expect(fileOf().answers).toHaveLength(1);
    // The survey turn gets no file tools at all.
    expect(log.requests[0]!.disallowedTools).toContain('Write');
    expect(log.requests[0]!.guard?.('Read', {})).toMatch(/only drafts/);

    await pick(2);
    expect(fileOf().answers.map((a) => a.step)).toEqual([1, 2]);
    expect(fileOf().step).toBe(3);
    const s = await pick(3, 'opt_b');
    expect(s.answers.find((a) => a.step === 3)).toMatchObject({ chosen: 'opt_b', summary: 'B3' });

    // A draft folder shows as a draft on Home, not as a folder to calibrate.
    const cards = await d.projects.rescan();
    expect(cards.find((c) => c.id === 'review-qr')?.draft).toBe(true);

    // A new service (daemon restart) reads the same file and drafts the current card again.
    (d.survey as unknown as { live: Map<string, unknown> }).live.clear();
    const resumed = await api('GET', '/api/survey/review-qr');
    expect(resumed.body.step).toBe(4);
    expect(resumed.body.card).toBeNull();
    await api('POST', '/api/survey/review-qr/next');
    await until((x) => !!x.card && x.card.question.includes('step 4'));
  });

  it('drafts the next step when the answer comes before the turn has closed', async () => {
    await d.cleanup();
    d = await testDaemon({
      runner: fakeRunner((req) => {
        const step = Number(/this is step (\d)/.exec(req.prompt)?.[1]);
        return [card(step), { wait: 150 }];
      }),
    });
    cookie = await d.login();
    await api('POST', '/api/survey', { name: 'review-qr', idea: 'QR' });
    await until((s) => !!s.card);
    // The turn is still running (drafting) when the user confirms.
    expect((await state()).drafting).toBe(true);
    await api('POST', '/api/survey/review-qr/answer', { step: 2, optionId: 'opt_a' });
    await until((s) => s.step === 3 && !!s.card?.question.includes('step 3'));
  });

  it('Quick skips Data and Quality bar', async () => {
    await api('POST', '/api/survey', { name: 'review-qr', idea: 'QR', quick: true });
    await pick(2);
    await pick(3);
    const s = await pick(4);
    expect(s.step).toBe(7);
    expect(s.status).toBe('review');
    expect(s.steps).toEqual([1, 2, 3, 4, 7]);
  });

  it('changing an answer marks later steps for re-check', async () => {
    await api('POST', '/api/survey', { name: 'review-qr', idea: 'QR', quick: true });
    await pick(2);
    await pick(3);
    await pick(4);
    let s = await until((x) => !!x.proposal);
    expect(s.proposal).not.toBeNull();

    s = (await api('POST', '/api/survey/review-qr/change', { step: 2 })).body;
    expect(s.step).toBe(2);
    expect(s.card?.question).toContain('step 2');
    // Same answer again: nothing goes stale, straight back to review.
    s = (await api('POST', '/api/survey/review-qr/answer', { step: 2, optionId: 'opt_a' })).body;
    expect(s.stale).toEqual([]);
    expect(s.step).toBe(7);

    await api('POST', '/api/survey/review-qr/change', { step: 2 });
    s = (await api('POST', '/api/survey/review-qr/answer', { step: 2, custom: 'Cafe owners' }))
      .body;
    expect(s.stale).toEqual([3, 4]);
    expect(s.step).toBe(3);
    expect(s.proposal).toBeNull();
    expect(fileOf().stale).toEqual([3, 4]);
    // The stale step shows its saved card again.
    expect(s.card?.question).toContain('step 3');
    s = (await api('POST', '/api/survey/review-qr/answer', { step: 3, optionId: 'opt_a' })).body;
    expect(s.stale).toEqual([4]);
    expect(s.step).toBe(4);
  });

  it('creates the project: docs, git init, first commit, phase Design, private repo', async () => {
    await api('POST', '/api/survey', { name: 'review-qr', idea: 'QR', quick: true });
    await pick(2);
    await pick(3);
    await pick(4);
    const s = await until((x) => !!x.proposal);
    const paths = s.proposal!.files.map((f) => f.path);
    expect(paths).toContain('_project/project.json');
    expect(paths).toContain('docs/adr/template.md');
    expect(paths).not.toContain('src/index.ts');
    expect(s.repoName).toBe('meddy/review-qr');

    const r = await api('POST', '/api/survey/review-qr/create', { createRepo: true });
    expect(r.status).toBe(200);
    expect(r.body.create).toMatchObject({ stage: 'done', repo: 'meddy/review-qr' });
    expect(repoCalls).toEqual(['review-qr']);

    const pj = JSON.parse(readFileSync(path.join(dir(), '_project', 'project.json'), 'utf8'));
    expect(pj).toMatchObject({ phase: 'design', createdBy: 'survey', repo: 'meddy/review-qr' });
    expect(existsSync(path.join(dir(), 'docs', 'prd.md'))).toBe(true);
    expect(readFileSync(path.join(dir(), '.git', 'info', 'exclude'), 'utf8')).toContain(
      '_project/',
    );
    const git = (...args: string[]) =>
      execFileSync('git', args, { cwd: dir(), encoding: 'utf8' }).trim();
    expect(git('log', '--oneline')).toMatch(/docs: project plan/);
    expect(git('status', '--porcelain')).toBe('');
    expect(git('ls-files')).not.toContain('_project');
    expect(fileOf().status).toBe('created');

    const card = (await d.projects.rescan()).find((c) => c.id === 'review-qr');
    expect(card).toMatchObject({ state: 'ready', phase: 'design', draft: false });
    expect((await api('POST', '/api/survey/review-qr/create', { createRepo: false })).status).toBe(
      409,
    );
  });

  // Must-pass safety test 3.
  it('refuses to create if the folder is not empty', async () => {
    await api('POST', '/api/survey', { name: 'review-qr', idea: 'QR', quick: true });
    await pick(2);
    await pick(3);
    await pick(4);
    await until((x) => !!x.proposal);
    write(path.join(dir(), 'notes.txt'), 'mine');
    const r = await api('POST', '/api/survey/review-qr/create', { createRepo: false });
    expect(r.status).toBe(409);
    expect(existsSync(path.join(dir(), 'CLAUDE.md'))).toBe(false);
    expect(existsSync(path.join(dir(), '.git'))).toBe(false);
    expect(repoCalls).toEqual([]);
  });
});
