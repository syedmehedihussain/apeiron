import { randomUUID } from 'node:crypto';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import {
  DecisionCardInputSchema,
  ProjectNameSchema,
  ProposeDocsInputSchema,
  QUICK_SKIPS,
  REVIEW_STEP,
  SURVEY_STEPS,
  SurveyFileSchema,
  type DecisionCard,
  type SurveyAnswerInput,
  type SurveyDecisionAnswer,
  type SurveyFile,
  type SurveyFileEntry,
  type SurveyProposal,
  type SurveyState,
} from '@apeiron/shared';
import { z } from 'zod';
import type { ConfigStore } from '../config.ts';
import type { EventHub } from '../events.ts';
import { run } from '../exec.ts';
import { readJsonFile, writeFileAtomic } from '../fsutil.ts';
import { badRequest, conflict, notFound } from '../http.ts';
import { resolveInside } from '../paths.ts';
import type { RunHandle, Runner } from '../claude/runner.ts';
import type { ProjectService } from '../projects/service.ts';
import {
  CLAUDE_MD_TEMPLATE,
  buildProjectJson,
  buildTasks,
  findSecret,
  today,
} from '../projects/standard.ts';
import { projectDir } from '../projects/workspace.ts';

/** GitHub calls the survey needs; tests and e2e replace them so nothing leaves the machine. */
export interface SurveyGitHub {
  /** The logged-in gh user, or null when gh is missing or logged out. */
  owner(): Promise<string | null>;
  /** `gh repo create <name> --private --source . --push`. */
  createRepo(
    dir: string,
    name: string,
  ): Promise<{ ok: true; repo: string } | { ok: false; error: string }>;
}

export const ghCli: SurveyGitHub = {
  async owner() {
    const r = await run('gh', ['api', 'user', '--jq', '.login'], { timeoutMs: 10_000 });
    return r.ok && r.stdout.trim() ? r.stdout.trim() : null;
  },
  async createRepo(dir, name) {
    const r = await run(
      'gh',
      ['repo', 'create', name, '--private', '--source', '.', '--remote', 'origin', '--push'],
      { cwd: dir, timeoutMs: 120_000 },
    );
    if (!r.ok)
      return { ok: false, error: (r.stderr || r.stdout).trim() || 'gh repo create failed' };
    const url =
      r.stdout
        .trim()
        .split('\n')
        .find((l) => l.includes('github.com/')) ?? '';
    const m = /github\.com\/([^/\s]+\/[^/\s]+?)(?:\.git)?\s*$/.exec(url);
    return { ok: true, repo: m?.[1] ?? name };
  },
};

/** No GitHub at all (e2e): the toggle is hidden and nothing is created. */
export const noGitHub: SurveyGitHub = {
  owner: async () => null,
  createRepo: async () => ({ ok: false, error: 'GitHub is turned off.' }),
};

const STEP_GUIDE: Record<number, string> = {
  2: 'Problem & users: who is this for, and what problem does it solve for them? Each option names a concrete group of users and the pain it removes.',
  3: 'Scope: what must version 1 do? Each option is a different cut of v1: list the must-haves in the title and say what is left out in the detail.',
  4: 'Stack: where should it run and what is it built with? Options are concrete stacks (language, framework, storage, hosting) that fit what the user said.',
  5: 'Data: what does it store? Each option lists the main entities (e.g. "Business, ReviewLink, Scan") and where they live.',
  6: 'Quality bar: what must be true before v1 counts as done? Options combine tests, performance, accessibility or reliability targets that fit this project.',
};

const DOC_NOTES: Record<string, string> = {
  'CLAUDE.md': 'Instructions Claude reads first',
  'README.md': 'What it is, how to run it',
  'docs/prd.md': 'Requirements',
  'docs/architecture.md': 'Parts and how they talk',
  'docs/data-model.md': 'Entities and shapes',
  'docs/adr/template.md': 'Template for new decisions',
  '_project/STATUS.md': 'Where we left off',
  '_project/project.json': 'Phase and settings',
  '_project/tasks.json': 'Task list by phase',
};
const DOC_PATHS =
  /^(CLAUDE\.md|README\.md|docs\/(prd|architecture|data-model)\.md|docs\/adr\/\d{4}-[a-z0-9-]+\.md)$/;

export const ADR_TEMPLATE = `# NNNN — Title in plain words

- **Status:** Proposed | Accepted | Superseded by NNNN
- **Date:** YYYY-MM-DD

## Context

What problem are we solving? What constraints matter? 3–6 sentences.

## Options

1. **Option A** — one line. Trade-off: …
2. **Option B** — one line. Trade-off: …

## Decision

We chose **…** because …

## Consequences

- Good: …
- Bad / cost: …
`;

const NO_TOOLS = [
  'Bash',
  'Read',
  'Edit',
  'Write',
  'MultiEdit',
  'Glob',
  'Grep',
  'LS',
  'WebFetch',
  'WebSearch',
  'Task',
  'NotebookEdit',
  'TodoWrite',
];

interface Live {
  card: DecisionCard | null;
  /** Fresh drafts by step, kept so Back and Change do not ask Claude again. */
  drafts: Map<number, DecisionCard>;
  drafting: boolean;
  error: string | null;
  proposal: SurveyProposal | null;
  create: SurveyState['create'];
  handle: RunHandle | null;
}

const isoNow = () => new Date().toISOString();
const stepLabel = (n: number) => SURVEY_STEPS.find((s) => s.step === n)?.label ?? `Step ${n}`;

/** The steps this survey uses, in order (review last). */
export function activeSteps(quick: boolean): number[] {
  return SURVEY_STEPS.map((s) => s.step).filter((n) => !(quick && QUICK_SKIPS.includes(n)));
}

/** Where the survey goes after an answer: the first stale step, else the first unanswered one. */
export function nextStep(file: SurveyFile, quick: boolean): number {
  const steps = activeSteps(quick).filter((n) => n !== REVIEW_STEP);
  const stale = steps.find((n) => file.stale.includes(n));
  if (stale) return stale;
  const answered = new Set(file.answers.map((a) => a.step));
  return steps.find((n) => !answered.has(n)) ?? REVIEW_STEP;
}

function nameIdea(file: SurveyFile) {
  const a = file.answers.find((x) => x.kind === 'typed');
  if (!a || a.kind !== 'typed') throw conflict('This survey has no name and idea.');
  return a.value;
}

function answersText(file: SurveyFile): string {
  const { name, idea } = nameIdea(file);
  const lines = [`Name: ${name}`, `Idea: ${idea}`];
  for (const a of file.answers) {
    if (a.kind !== 'decision') continue;
    lines.push(`${stepLabel(a.step)}: ${a.summary}`);
  }
  return lines.join('\n');
}

/**
 * The new-project survey (screens.md §2). Each step is one short Claude turn with no file tools
 * that returns a decision card through draft_card (ADR-0009). Answers are saved to
 * `_project/survey.json` as soon as they are confirmed, so the survey can stop and resume.
 */
export class SurveyService {
  private readonly live = new Map<string, Live>();
  private ownerCache: { at: number; owner: string | null } | null = null;

  constructor(
    private readonly config: ConfigStore,
    private readonly hub: EventHub,
    private readonly runner: Runner,
    private readonly projects: ProjectService,
    private readonly github: SurveyGitHub,
  ) {}

  private dir(id: string): string {
    return projectDir(this.config.projectsDir(), id);
  }

  private file(id: string): string {
    return path.join(this.dir(id), '_project', 'survey.json');
  }

  private read(id: string): SurveyFile {
    const f = this.file(id);
    if (!existsSync(f)) throw notFound(`No survey for ${id}`);
    const parsed = SurveyFileSchema.safeParse(readJsonFile(f));
    if (!parsed.success) throw conflict('survey.json is not valid.');
    return parsed.data;
  }

  private save(id: string, file: SurveyFile): void {
    file.updatedAt = isoNow();
    writeFileAtomic(this.file(id), JSON.stringify(file, null, 2) + '\n');
  }

  private liveOf(id: string): Live {
    let l = this.live.get(id);
    if (!l) {
      l = {
        card: null,
        drafts: new Map(),
        drafting: false,
        error: null,
        proposal: null,
        create: null,
        handle: null,
      };
      this.live.set(id, l);
    }
    return l;
  }

  private async owner(): Promise<string | null> {
    if (this.ownerCache && Date.now() - this.ownerCache.at < 10 * 60_000)
      return this.ownerCache.owner;
    const owner = await this.github.owner().catch(() => null);
    this.ownerCache = { at: Date.now(), owner };
    return owner;
  }

  async state(id: string): Promise<SurveyState> {
    const file = this.read(id);
    const owner = await this.owner();
    return this.view(id, file, owner);
  }

  private view(id: string, file: SurveyFile, owner: string | null): SurveyState {
    const l = this.liveOf(id);
    const { name, idea, quick } = nameIdea(file);
    return {
      id,
      path: this.dir(id),
      status: file.status,
      name,
      idea,
      quick,
      step: file.step,
      steps: activeSteps(quick),
      answers: file.answers,
      stale: file.stale,
      card: l.card,
      drafting: l.drafting,
      error: l.error,
      proposal: l.proposal,
      create: l.create,
      updatedAt: file.updatedAt,
      repoName: owner ? `${owner}/${name}` : null,
    };
  }

  private publish(id: string): void {
    try {
      const file = this.read(id);
      this.hub.publish(`project:${id}`, 'survey.updated', {
        projectId: id,
        state: this.view(id, file, this.ownerCache?.owner ?? null),
      });
    } catch {
      // The folder went away; nothing to tell.
    }
  }

  /** POST /api/survey: makes the folder with only `_project/survey.json` in it. */
  async start(input: { name: string; idea: string; quick: boolean }): Promise<SurveyState> {
    // The name passed ProjectNameSchema: no slashes, no leading dot, so this stays a direct child.
    const dir = path.join(this.config.projectsDir(), ProjectNameSchema.parse(input.name));
    if (existsSync(dir)) {
      if (existsSync(this.file(input.name)))
        throw conflict(`There is already a survey for ${input.name}. Open it from Home.`);
      if (readdirSync(dir).length > 0)
        throw conflict(`~/Projects/${input.name} already exists. Pick another name.`);
    }
    mkdirSync(path.join(dir, '_project'), { recursive: true });
    const now = isoNow();
    const file: SurveyFile = {
      schema: 1,
      status: 'in_progress',
      startedAt: now,
      updatedAt: now,
      step: 2,
      answers: [
        {
          step: 1,
          topic: 'name_idea',
          kind: 'typed',
          value: { name: input.name, idea: input.idea, quick: input.quick },
          answeredAt: now,
        },
      ],
      stale: [],
    };
    this.save(input.name, file);
    this.draft(input.name);
    return this.state(input.name);
  }

  /** Asks Claude for the current step's card (or the files at review). */
  next(id: string, fresh = false): Promise<SurveyState> {
    const file = this.read(id);
    if (file.status === 'created') throw conflict('This project was already created.');
    const l = this.liveOf(id);
    if (fresh) {
      l.drafts.delete(file.step);
      l.card = null;
      if (file.step === REVIEW_STEP) l.proposal = null;
    }
    this.draft(id);
    return this.state(id);
  }

  private draft(id: string): void {
    const file = this.read(id);
    const l = this.liveOf(id);
    if (l.drafting) return;
    l.error = null;
    if (file.step === REVIEW_STEP) {
      if (!l.proposal) this.propose(id, file);
      return;
    }
    if (file.step === 1) return;
    const kept = l.drafts.get(file.step);
    if (kept) {
      l.card = kept;
      this.publish(id);
      return;
    }
    l.card = null;
    l.drafting = true;
    const step = file.step;
    const { name } = nameIdea(file);
    this.publish(id);
    this.runTurn(id, {
      prompt: [
        `You are helping plan a new software project called "${name}". Nothing exists yet; this is step ${step} of a short survey.`,
        '',
        'What we know so far:',
        answersText(file),
        '',
        `Now draft ONE decision card for this step. ${STEP_GUIDE[step]}`,
        'Call draft_card exactly once with: topic, question (short, addressed to the user, naming the project), context (one line starting "You said: …" that quotes or sums up their words), 2 to 4 options, and why.',
        'Every option has an id (opt_a, opt_b, …), a short title, a one-line detail, and an honest trade-off. Mark exactly one option recommended: true and explain why in 2-4 plain sentences, based on what the user said.',
        'Use plain, short English. Do not use any other tool. After draft_card, stop.',
      ].join('\n'),
      tools: [
        {
          name: 'draft_card',
          description: 'Return the decision card for this survey step. Call exactly once.',
          shape: {
            topic: z.string(),
            question: z.string(),
            context: z.string().optional(),
            options: z.array(
              z.object({
                id: z.string(),
                title: z.string(),
                detail: z.string().optional(),
                tradeoff: z.string(),
                recommended: z.boolean().optional(),
              }),
            ),
            why: z.string().optional(),
          },
          handler: async (args) => {
            const parsed = DecisionCardInputSchema.safeParse({
              ...(args as object),
              allowCustom: true,
            });
            if (!parsed.success)
              return {
                ok: false,
                text: `The card is not valid, fix it and call draft_card again: ${parsed.error.issues.map((i) => i.message).join('; ')}`,
              };
            const card: DecisionCard = {
              ...parsed.data,
              id: `dc_${randomUUID().slice(0, 10)}`,
              topic: stepLabel(step),
              label: `Step ${step} · ${stepLabel(step)}`,
            };
            if (this.read(id).step === step) l.card = card;
            l.drafts.set(step, card);
            return { ok: true, text: 'Thank you. Stop here.' };
          },
        },
      ],
      done: () => {
        if (!l.card && this.read(id).step === step)
          l.error = l.error ?? 'Claude did not draft the options. Try again.';
      },
    });
  }

  private propose(id: string, file: SurveyFile): void {
    const l = this.liveOf(id);
    const { name, quick } = nameIdea(file);
    l.drafting = true;
    l.proposal = null;
    this.publish(id);
    this.runTurn(id, {
      prompt: [
        `Write the planning documents for a new project called "${name}". Nothing exists yet. No code: only documents.`,
        '',
        'The survey answers:',
        answersText(file),
        '',
        'Call propose_docs exactly once with: summary (one line, at most 120 characters), stack (short tags such as "Node 22", "SQLite"), and files:',
        '- CLAUDE.md, under 80 lines, following this template (fill the holes, keep the headings; turn scope limits from the survey into rules such as "No payments. They are out of scope."; for Commands write what they will be once the stack is set up):',
        CLAUDE_MD_TEMPLATE.split('\n')
          .map((l) => '    ' + l)
          .join('\n'),
        '- README.md: what it is in two sentences and that the plan lives in docs/.',
        '- docs/prd.md: problem, users, goals, non-goals, requirements table (ID, requirement, priority P0/P1/P2) and open questions.',
        '- docs/architecture.md: the parts, how they talk, where it runs, with a small ASCII diagram.',
        quick
          ? '- docs/data-model.md only if the project clearly stores data (the user chose Quick, so keep it short).'
          : '- docs/data-model.md: entities, fields and relations.',
        "- One ADR per real decision in the survey (at least the stack), named docs/adr/0001-kebab-title.md, 0002-…, using this template with Status Accepted and today's date " +
          today() +
          ':',
        ADR_TEMPLATE.split('\n')
          .map((l) => '    ' + l)
          .join('\n'),
        'Use plain, short English. Do not invent features the user did not choose. Do not use any other tool. After propose_docs, stop.',
      ].join('\n'),
      tools: [
        {
          name: 'propose_docs',
          description:
            'Return the planning documents. Call exactly once. The user reviews them first.',
          shape: {
            summary: z.string(),
            stack: z.array(z.string()).optional(),
            files: z.array(z.object({ path: z.string(), content: z.string() })),
          },
          handler: async (args) => {
            const result = this.buildProposal(id, args);
            if (!result.ok) return { ok: false, text: result.error };
            l.proposal = result.proposal;
            return { ok: true, text: 'Thank you. The user will review the files now. Stop here.' };
          },
        },
      ],
      done: () => {
        if (!l.proposal) l.error = l.error ?? 'Claude did not draft the files. Try again.';
      },
    });
  }

  private runTurn(
    id: string,
    opts: {
      prompt: string;
      tools: NonNullable<Parameters<Runner>[0]['extraTools']>;
      done(): void;
    },
  ): void {
    const l = this.liveOf(id);
    const turnStep = this.read(id).step;
    let finished = false;
    const handle = this.runner({
      cwd: this.dir(id),
      prompt: opts.prompt,
      resume: null,
      model: this.config.get().claude.defaultModel,
      planMode: false,
      appendSystemPrompt:
        'You are inside Apeiron, planning a new project with the user. You only draft text through the tools you are given.',
      allowedTools: [],
      disallowedTools: NO_TOOLS,
      decisions: false,
      extraTools: opts.tools,
      guard: (tool) =>
        tool.startsWith('mcp__apeiron__') || tool === 'ToolSearch'
          ? null
          : 'The survey only drafts text. No other tools.',
      onPermission: async () => ({ allow: false, message: 'The survey only drafts text.' }),
      onDecision: async () => ({ ok: false, error: 'Not available in the survey.' }),
      onEvent: (ev) => {
        if (ev.t !== 'result') return;
        finished = true;
        l.handle = null;
        l.drafting = false;
        if (!ev.ok && !ev.stopped && ev.error) l.error = ev.error;
        try {
          opts.done();
          // The user answered while this turn was still closing: draft the step they are on now.
          if (this.read(id).step !== turnStep) this.draft(id);
        } catch {
          // survey.json went away
        }
        this.publish(id);
      },
    });
    if (!finished) l.handle = handle;
  }

  buildProposal(
    id: string,
    args: unknown,
  ): { ok: true; proposal: SurveyProposal } | { ok: false; error: string } {
    const parsed = ProposeDocsInputSchema.safeParse(args);
    if (!parsed.success)
      return {
        ok: false,
        error: `Fix the files and call propose_docs again: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
      };
    const file = this.read(id);
    const { name } = nameIdea(file);
    const p = parsed.data;
    const files: SurveyFileEntry[] = [];
    const seen = new Set<string>();
    for (const f of p.files) {
      const rel = f.path.replace(/^\.\//, '');
      if (!DOC_PATHS.test(rel) || seen.has(rel)) continue;
      seen.add(rel);
      files.push(entry(rel, f.content));
    }
    if (!seen.has('CLAUDE.md') || !seen.has('docs/prd.md'))
      return {
        ok: false,
        error: 'CLAUDE.md and docs/prd.md are required. Call propose_docs again with both.',
      };
    const adrs = files.filter((f) => f.path.startsWith('docs/adr/'));
    if (adrs.length) files.push(entry('docs/adr/template.md', ADR_TEMPLATE));
    files.sort((a, b) => order(a.path) - order(b.path) || a.path.localeCompare(b.path));
    const projectJson = buildProjectJson({
      name,
      summary: p.summary,
      phase: 'design',
      stack: p.stack,
      createdBy: 'survey',
      repo: null,
      docs: {
        prd: 'docs/prd.md',
        ...(seen.has('docs/architecture.md') ? { architecture: 'docs/architecture.md' } : {}),
        ...(seen.has('docs/data-model.md') ? { dataModel: 'docs/data-model.md' } : {}),
        ...(adrs.length ? { adr: 'docs/adr/' } : {}),
      },
    });
    // Design tasks the survey already did (the docs it wrote) start as done.
    const written: Record<string, string> = {
      'Write the architecture doc': 'docs/architecture.md',
      'Write the data model': 'docs/data-model.md',
    };
    const tasks = buildTasks('design');
    for (const t of tasks.tasks) {
      const doc = written[t.title];
      if (t.phase === 'design' && doc && seen.has(doc)) t.status = 'done';
    }
    const drafted = [
      'prd.md',
      ...(seen.has('docs/architecture.md') ? ['architecture.md'] : []),
      ...(seen.has('docs/data-model.md') ? ['data-model.md'] : []),
      ...(adrs.length ? [`${adrs.length} ADR${adrs.length === 1 ? '' : 's'}`] : []),
    ];
    const status = [
      '---',
      `name: ${name}`,
      'status: active',
      `summary: ${p.summary}`,
      `updated: ${today()}`,
      '---',
      '',
      '## Where we left off',
      '',
      `Finished the new project survey in Apeiron and drafted ${drafted.join(', ')} in docs/. No code yet; the project is in the Design phase.`,
      '',
      '## Next steps',
      '',
      ...tasks.tasks
        .filter((t) => t.phase === 'design' && t.status === 'todo')
        .map((t) => `- [ ] ${t.title}`),
      '- [ ] Read the drafted docs and correct anything Claude got wrong',
      '',
    ].join('\n');
    files.push(entry('_project/STATUS.md', status));
    files.push(entry('_project/project.json', JSON.stringify(projectJson, null, 2) + '\n'));
    files.push(entry('_project/tasks.json', JSON.stringify(tasks, null, 2) + '\n'));
    return { ok: true, proposal: { summary: p.summary, stack: p.stack, files } };
  }

  /** Saves a confirmed answer, marks later steps stale if it changed, moves to the next step. */
  async answer(id: string, input: SurveyAnswerInput): Promise<SurveyState> {
    const file = this.read(id);
    const l = this.liveOf(id);
    if (file.status === 'created') throw conflict('This project was already created.');
    if (input.step !== file.step) throw conflict(`The survey is on step ${file.step}.`);
    const now = isoNow();
    let changed: boolean;
    if ('idea' in input) {
      const prev = nameIdea(file);
      const value = { ...prev, idea: input.idea, quick: input.quick };
      changed = prev.idea !== input.idea;
      file.answers = file.answers.map((a) =>
        a.kind === 'typed' ? { ...a, value, answeredAt: now } : a,
      );
      if (input.quick) {
        file.answers = file.answers.filter((a) => !QUICK_SKIPS.includes(a.step));
        file.stale = file.stale.filter((n) => !QUICK_SKIPS.includes(n));
      }
    } else {
      const card = l.card;
      if (!card) throw conflict('There is no card to answer yet.');
      let chosen: string | null = null;
      let custom: string | null = null;
      let summary: string;
      if ('optionId' in input && input.optionId) {
        const opt = card.options.find((o) => o.id === input.optionId);
        if (!opt) throw badRequest(`No option ${input.optionId}`);
        chosen = opt.id;
        summary = opt.title;
      } else {
        custom = ('custom' in input ? input.custom : '')?.trim() ?? '';
        summary = custom;
      }
      const prev = file.answers.find((a) => a.step === input.step);
      changed =
        !!prev &&
        prev.kind === 'decision' &&
        (prev.card.id !== card.id || prev.chosen !== chosen || prev.custom !== custom);
      const entry: SurveyDecisionAnswer = {
        step: input.step,
        topic: SURVEY_STEPS.find((s) => s.step === input.step)!.topic,
        kind: 'decision',
        card,
        chosen,
        custom,
        summary,
        answeredAt: now,
      };
      file.answers = [...file.answers.filter((a) => a.step !== input.step), entry].sort(
        (a, b) => a.step - b.step,
      );
    }
    file.stale = file.stale.filter((n) => n !== input.step);
    if (changed) {
      const later = file.answers.map((a) => a.step).filter((n) => n > input.step);
      file.stale = [...new Set([...file.stale, ...later])].sort((a, b) => a - b);
      // Old drafts were written from the old answer.
      for (const n of [...l.drafts.keys()]) if (n > input.step) l.drafts.delete(n);
      l.proposal = null;
    }
    const { quick } = nameIdea(file);
    file.step = nextStep(file, quick);
    file.status = file.step === REVIEW_STEP ? 'review' : 'in_progress';
    this.save(id, file);
    l.card = this.cardFor(file, l);
    this.draft(id);
    return this.state(id);
  }

  /** A stale or changed step shows its saved card again; other steps need a draft. */
  private cardFor(file: SurveyFile, l: Live): DecisionCard | null {
    if (file.step === 1 || file.step === REVIEW_STEP) return null;
    const saved = file.answers.find((a) => a.step === file.step);
    if (saved?.kind === 'decision' && file.stale.includes(file.step)) return saved.card;
    return l.drafts.get(file.step) ?? (saved?.kind === 'decision' ? saved.card : null);
  }

  /** Reopens an answered step (Change, Back). */
  async change(id: string, step: number): Promise<SurveyState> {
    const file = this.read(id);
    const l = this.liveOf(id);
    if (file.status === 'created') throw conflict('This project was already created.');
    const { quick } = nameIdea(file);
    if (!activeSteps(quick).includes(step)) throw badRequest(`Step ${step} is not in this survey.`);
    if (step !== 1 && step !== REVIEW_STEP && !file.answers.some((a) => a.step === step))
      throw conflict('Answer the earlier steps first.');
    if (l.drafting && l.handle) await l.handle.interrupt();
    file.step = step;
    file.status = step === REVIEW_STEP ? 'review' : 'in_progress';
    this.save(id, file);
    const saved = file.answers.find((a) => a.step === step);
    l.card = saved?.kind === 'decision' ? saved.card : this.cardFor(file, l);
    l.error = null;
    if (step === REVIEW_STEP) this.draft(id);
    this.publish(id);
    return this.state(id);
  }

  /** Writes every proposed file, runs git init and the first commit, optionally creates the repo. */
  async create(id: string, opts: { createRepo: boolean }): Promise<SurveyState> {
    const file = this.read(id);
    const l = this.liveOf(id);
    if (file.status === 'created') throw conflict('This project was already created.');
    if (file.step !== REVIEW_STEP || !l.proposal) throw conflict('The files are not drafted yet.');
    if (l.create && ['writing', 'git', 'repo'].includes(l.create.stage))
      throw conflict('The project is already being created.');
    const dir = this.dir(id);
    // Safety rule 3: refuse if anything besides _project/ is already in the folder.
    const other = readdirSync(dir).filter((n) => n !== '_project');
    if (other.length)
      throw conflict(
        `The folder is not empty (${other.slice(0, 3).join(', ')}). Apeiron never overwrites.`,
      );
    const blocked = l.proposal.files.find((f) => f.warning);
    if (blocked) throw conflict(`${blocked.path}: ${blocked.warning}`);
    for (const f of l.proposal.files) {
      if (existsSync(resolveInside(dir, f.path)))
        throw conflict(`${f.path} already exists. Apeiron never overwrites.`);
    }

    type Create = NonNullable<SurveyState['create']>;
    const setStage = (stage: Create['stage'], extra: Partial<Create> = {}) => {
      l.create = { error: null, repo: null, repoError: null, ...l.create, ...extra, stage };
      this.publish(id);
    };
    l.create = null;
    setStage('writing');
    const { name } = nameIdea(file);
    try {
      for (const f of l.proposal.files) {
        const abs = resolveInside(dir, f.path);
        mkdirSync(path.dirname(abs), { recursive: true });
        writeFileSync(abs, f.content, { flag: 'wx' });
      }
      setStage('git');
      await gitFirstCommit(dir);
    } catch (e) {
      setStage('failed', { error: (e as Error).message });
      return this.state(id);
    }
    let repo: string | null = null;
    if (opts.createRepo) {
      setStage('repo');
      const r = await this.github.createRepo(dir, name);
      if (r.ok) {
        repo = r.repo;
        const pj = path.join(dir, '_project', 'project.json');
        const data = readJsonFile(pj) as Record<string, unknown>;
        writeFileAtomic(pj, JSON.stringify({ ...data, repo }, null, 2) + '\n');
      } else {
        setStage('repo', { repoError: r.error });
      }
    }
    file.status = 'created';
    this.save(id, file);
    setStage('done', { repo });
    await this.projects.rescan();
    return this.state(id);
  }

  async stopAll(): Promise<void> {
    await Promise.all([...this.live.values()].map((l) => l.handle?.interrupt()));
  }
}

function entry(rel: string, content: string): SurveyFileEntry {
  const text = content.endsWith('\n') ? content : content + '\n';
  return {
    path: rel,
    content: text,
    size: Buffer.byteLength(text),
    note: rel.startsWith('docs/adr/0') ? 'Decision record' : (DOC_NOTES[rel] ?? 'New document'),
    warning: findSecret(text),
  };
}

function order(rel: string): number {
  const list = [
    'CLAUDE.md',
    'README.md',
    'docs/prd.md',
    'docs/architecture.md',
    'docs/data-model.md',
    'docs/adr/',
    '_project/STATUS.md',
    '_project/project.json',
    '_project/tasks.json',
  ];
  const i = list.findIndex((p) => rel === p || (p.endsWith('/') && rel.startsWith(p)));
  return i < 0 ? list.length : i;
}

async function git(dir: string, args: string[]): Promise<string> {
  const r = await run('git', args, { cwd: dir, timeoutMs: 30_000 });
  if (!r.ok) throw new Error(`git ${args[0]} failed: ${(r.stderr || r.stdout).trim()}`);
  return r.stdout;
}

/** git init, keep _project/ out of git, first commit. */
export async function gitFirstCommit(dir: string): Promise<void> {
  if (!existsSync(path.join(dir, '.git'))) await git(dir, ['init', '-q', '-b', 'main']);
  const exclude = path.join(dir, '.git', 'info', 'exclude');
  mkdirSync(path.dirname(exclude), { recursive: true });
  const text = existsSync(exclude) ? readFileSync(exclude, 'utf8') : '';
  if (!text.split('\n').some((l) => /^\/?_project\/?\s*$/.test(l.trim())))
    appendFileSync(exclude, (text && !text.endsWith('\n') ? '\n' : '') + '_project/\n');
  await git(dir, ['add', '-A']);
  // Use the user's git identity; fall back to a local one only if none is set.
  const email = (await run('git', ['config', 'user.email'], { cwd: dir })).stdout.trim();
  const ident = email ? [] : ['-c', 'user.name=Apeiron', '-c', 'user.email=apeiron@localhost'];
  await git(dir, [...ident, 'commit', '-q', '-m', 'docs: project plan from the Apeiron survey']);
}
