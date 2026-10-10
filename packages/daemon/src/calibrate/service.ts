import { randomUUID } from 'node:crypto';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  type Dirent,
} from 'node:fs';
import path from 'node:path';
import {
  ProposeFilesInputSchema,
  type CalibrationState,
  type DiffLine,
  type FoundTag,
  type ProposedFile,
} from '@cherry/shared';
import { z } from 'zod';
import type { ConfigStore } from '../config.ts';
import type { EventHub } from '../events.ts';
import { badRequest, conflict } from '../http.ts';
import { resolveInside } from '../paths.ts';
import type { ApprovalBroker } from '../claude/approvals.ts';
import { Conversation } from '../claude/conversation.ts';
import type { DecisionBroker } from '../claude/decisions.ts';
import type { RunHandle, Runner } from '../claude/runner.ts';
import { Transcript } from '../claude/transcript.ts';
import type { ProjectService } from '../projects/service.ts';
import { readProjectFiles } from '../projects/scanner.ts';
import {
  CLAUDE_MD_TEMPLATE,
  STATUS_MD_FORMAT,
  buildProjectJson,
  buildTasks,
  findSecret,
  needsGitExclude,
} from '../projects/standard.ts';
import { IGNORED_DIRS, projectDir } from '../projects/workspace.ts';

const READ_ONLY_GIT =
  /^git\s+(log|status|show|ls-files|diff|branch|remote|rev-parse|shortlog)\b[^;&|`$<>]*$/;
const READ_TOOLS = new Set(['Read', 'Glob', 'Grep', 'LS', 'TodoWrite', 'ToolSearch']);
/** Only these paths may be proposed (docs/project-standard.md). */
const ALLOWED_PATHS = /^(CLAUDE\.md|README\.md|docs\/[\w./-]+\.md|_project\/(STATUS|notes)\.md)$/;

const NOTES: Record<string, string> = {
  'CLAUDE.md': 'Instructions Claude reads first',
  'README.md': 'A short section at the end',
  'docs/prd.md': 'Requirements',
  'docs/architecture.md': 'Parts and how they talk',
  'docs/data-model.md': 'Entities and shapes',
  '_project/STATUS.md': 'Where we left off',
  '_project/project.json': 'Phase and settings',
  '_project/tasks.json': 'Task list by phase',
  '.git/info/exclude': 'Keeps _project/ out of git',
};

function calibrationPrompt(opts: {
  name: string;
  light: boolean;
  hasClaudeMd: boolean;
  hasReadme: boolean;
}): string {
  return [
    `Calibrate the project "${opts.name}" in the current folder for Cherry. You are read-only: you cannot write files, and you must not try.`,
    '',
    'Do this in order:',
    '1. Read the project: README, package or build files, CLAUDE.md and _project/STATUS.md if they exist, the main source folders, and the git history (`git log --oneline -30`, `git status`). Do not read .env files or keys.',
    '2. While you read, call note_found with short tags for what you learn, e.g. "Node 20", "Express", "React". Mark gaps with gap: true, e.g. "no tests", "no deploy config".',
    '3. Call ask_decision for what you cannot work out from the code, one question at a time, at most 3. Always ask for the current phase (plan, design, preparation, development or deployment) unless STATUS.md states it plainly. Ask who the users are only if it is unclear. Options must be concrete and based on what you read; mark one as recommended.',
    '4. Call propose_files exactly once with: summary (one line, at most 120 characters), phase, stack tags, and files:',
    opts.hasClaudeMd
      ? '   - CLAUDE.md already exists: use action "append" with only a short section to add at the end (e.g. "## Cherry" with Read first and Rules). Never rewrite it.'
      : '   - CLAUDE.md (action "create"), under 80 lines, following this template:\n' +
        CLAUDE_MD_TEMPLATE.split('\n')
          .map((l) => '     ' + l)
          .join('\n'),
    '   - docs/architecture.md (action "create"): parts of the system and how they talk, written from what you read. Skip it if it already exists.',
    '   - docs/data-model.md only if the project clearly has stored data, and only if it does not exist.',
    opts.light
      ? '   - _project/STATUS.md already exists (cctop). Do not propose it.'
      : '   - _project/STATUS.md (action "create") in this format:\n' +
        STATUS_MD_FORMAT.split('\n')
          .map((l) => '     ' + l)
          .join('\n'),
    opts.hasReadme
      ? '   - README.md exists: you may append a short section, never rewrite it. Skip it if nothing useful to add.'
      : '',
    '   Use plain, short English. Do not invent features you did not see in the code.',
    '5. After propose_files, stop. The user reviews the files and Cherry writes the ones they tick.',
  ]
    .filter(Boolean)
    .join('\n');
}

function countFiles(dir: string, limit = 5000): number {
  let n = 0;
  const walk = (d: string) => {
    if (n >= limit) return;
    let entries: Dirent[];
    try {
      entries = readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name.startsWith('.') || IGNORED_DIRS.has(e.name)) continue;
      if (e.isDirectory()) walk(path.join(d, e.name));
      else if (++n >= limit) return;
    }
  };
  walk(dir);
  return n;
}

function plusLines(text: string, start = 1): DiffLine[] {
  const body = text.endsWith('\n') ? text.slice(0, -1) : text;
  return body.split('\n').map((t, i) => ({ kind: '+' as const, a: null, b: start + i, text: t }));
}

interface Run {
  state: CalibrationState;
  handle: RunHandle | null;
  conversation: Conversation;
  source: string;
}

const PUBLIC_IDLE = (projectId: string, light: boolean, fileCount: number): CalibrationState => ({
  projectId,
  status: 'idle',
  light,
  startedAt: null,
  model: null,
  fileCount,
  items: [],
  found: [],
  answers: [],
  proposal: null,
  error: null,
  written: [],
});

/**
 * Calibration (screens.md §3): a read-only Claude session reads the project, asks a few
 * questions, and proposes files. Nothing is written until the user ticks files and writes them.
 */
export class CalibrationService {
  private readonly runs = new Map<string, Run>();
  private timers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly config: ConfigStore,
    private readonly hub: EventHub,
    private readonly approvals: ApprovalBroker,
    private readonly decisions: DecisionBroker,
    private readonly runner: Runner,
    private readonly projects: ProjectService,
    private readonly home: string,
  ) {}

  state(projectId: string): CalibrationState {
    const dir = projectDir(this.config.projectsDir(), projectId);
    const run = this.runs.get(projectId);
    if (run) return run.state;
    const files = readProjectFiles(dir);
    return PUBLIC_IDLE(projectId, !!files.status && !files.projectJson, countFiles(dir));
  }

  private publish(projectId: string, now = false): void {
    const send = () => {
      this.timers.delete(projectId);
      const run = this.runs.get(projectId);
      if (run)
        this.hub.publish(`project:${projectId}`, 'calibrate.updated', {
          projectId,
          state: run.state,
        });
    };
    if (now) {
      const t = this.timers.get(projectId);
      if (t) clearTimeout(t);
      send();
    } else if (!this.timers.has(projectId)) {
      this.timers.set(projectId, setTimeout(send, 80));
    }
  }

  start(projectId: string, model?: string): CalibrationState {
    const dir = projectDir(this.config.projectsDir(), projectId);
    const existing = this.runs.get(projectId);
    if (
      existing &&
      ['scanning', 'questions', 'drafting', 'writing'].includes(existing.state.status)
    ) {
      throw conflict('Calibration is already running for this project.');
    }
    const files = readProjectFiles(dir);
    const light = !!files.status && !files.projectJson;
    const id = randomUUID();
    const source = `calibration:${id}`;
    const state: CalibrationState = {
      ...PUBLIC_IDLE(projectId, light, countFiles(dir)),
      status: 'scanning',
      startedAt: Date.now(),
      model: model ?? this.config.get().claude.defaultModel,
    };
    const conversation = new Conversation({
      projectId,
      cwd: dir,
      source,
      transcript: new Transcript(path.join(this.home, 'transcripts', `cal_${id}.jsonl`)),
      approvals: this.approvals,
      decisions: this.decisions,
      onItem: (item) => {
        const run = this.runs.get(projectId);
        if (!run) return;
        const i = run.state.items.findIndex((x) => x.id === item.id);
        run.state.items =
          i < 0
            ? [...run.state.items, item]
            : run.state.items.map((x) => (x.id === item.id ? item : x));
        if (item.kind === 'decision') {
          if (item.status === 'open') run.state.status = 'questions';
          if (item.status === 'confirmed' && item.answer) {
            run.state.answers = [
              ...run.state.answers.filter((a) => a.topic !== item.card.topic),
              { topic: item.card.topic, answer: item.answer },
            ];
            run.state.status = 'drafting';
          }
        }
        this.publish(projectId);
      },
      onDelta: () => undefined,
      // Read-only: anything that is not a read is refused before it runs.
      policy: (tool, input) =>
        READ_TOOLS.has(tool) ||
        (tool === 'Bash' &&
          typeof input.command === 'string' &&
          READ_ONLY_GIT.test(input.command.trim()))
          ? 'allow'
          : {
              deny: 'Calibration is read-only. Do not write files or run commands that change anything.',
            },
    });
    const run: Run = { state, handle: null, conversation, source };
    this.runs.set(projectId, run);

    const name = files.projectJson?.name ?? projectId;
    const hasClaudeMd = existsSync(path.join(dir, 'CLAUDE.md'));
    const hasReadme = existsSync(path.join(dir, 'README.md'));
    conversation.startTurn(id.slice(0, 12));
    let finished = false;
    const handle = this.runner({
      cwd: dir,
      prompt: calibrationPrompt({ name, light, hasClaudeMd, hasReadme }),
      resume: null,
      model: state.model ?? 'sonnet',
      planMode: false,
      appendSystemPrompt: 'You are calibrating a project for Cherry. You are read-only.',
      allowedTools: [],
      decisions: true,
      guard: (tool, input) => {
        if (READ_TOOLS.has(tool) || tool.startsWith('mcp__cherry__')) return null;
        if (
          tool === 'Bash' &&
          typeof input.command === 'string' &&
          READ_ONLY_GIT.test(input.command.trim())
        )
          return null;
        return 'Calibration is read-only. Only reading files and read-only git commands are allowed.';
      },
      extraTools: [
        {
          name: 'note_found',
          description:
            'Record short tags about what you found while reading (stack, tools, gaps). Shown to the user live.',
          shape: { tags: z.array(z.object({ label: z.string(), gap: z.boolean().optional() })) },
          handler: async (args) => {
            const parsed = z
              .object({
                tags: z
                  .array(
                    z.object({ label: z.string().min(1).max(60), gap: z.boolean().optional() }),
                  )
                  .max(20),
              })
              .safeParse(args);
            if (!parsed.success)
              return { ok: false, text: 'tags must be a list of { label, gap? }.' };
            const seen = new Set(run.state.found.map((f) => f.label.toLowerCase()));
            const add: FoundTag[] = parsed.data.tags
              .filter((t) => !seen.has(t.label.toLowerCase()))
              .map((t) => ({ label: t.label, gap: !!t.gap }));
            run.state.found = [...run.state.found, ...add].slice(0, 30);
            this.publish(projectId);
            return { ok: true, text: 'Noted.' };
          },
        },
        {
          name: 'propose_files',
          description:
            'Propose the files to create or append. Call exactly once, at the end. The user reviews them before anything is written.',
          shape: {
            summary: z.string(),
            phase: z.enum(['plan', 'design', 'preparation', 'development', 'deployment']),
            stack: z.array(z.string()).optional(),
            files: z.array(
              z.object({
                path: z.string(),
                action: z.enum(['create', 'append']),
                content: z.string(),
              }),
            ),
          },
          handler: async (args) => {
            const result = this.buildProposal(dir, projectId, args, light);
            if (!result.ok) return { ok: false, text: result.error };
            run.state.proposal = result.proposal;
            run.state.status = 'proposal';
            this.publish(projectId, true);
            return { ok: true, text: 'Thank you. The user will review the files now. Stop here.' };
          },
        },
      ],
      onPermission: (tool, input, toolUseId) => conversation.permission(tool, input, toolUseId),
      onDecision: (input) => conversation.decision(input),
      onEvent: (ev) => {
        conversation.handle(ev);
        if (ev.t === 'result') {
          finished = true;
          run.handle = null;
          if (run.state.status !== 'proposal') {
            run.state.status = 'failed';
            run.state.error = ev.stopped
              ? 'Calibration was cancelled.'
              : (ev.error ?? 'Claude finished without proposing files. Try again.');
          }
          this.decisions.cancel(source);
          this.approvals.cancel(source, 'Calibration ended');
          this.publish(projectId, true);
        }
      },
    });
    if (!finished) run.handle = handle;
    this.publish(projectId, true);
    return run.state;
  }

  /** Validates Claude's proposal and adds the files Cherry writes itself. */
  buildProposal(
    dir: string,
    projectId: string,
    args: unknown,
    light: boolean,
  ):
    | { ok: true; proposal: NonNullable<CalibrationState['proposal']> }
    | { ok: false; error: string } {
    const parsed = ProposeFilesInputSchema.safeParse(args);
    if (!parsed.success)
      return {
        ok: false,
        error: `Fix the proposal and call propose_files again: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
      };
    const p = parsed.data;
    const files: ProposedFile[] = [];
    const seen = new Set<string>();
    for (const f of p.files) {
      const rel = f.path.replace(/^\.\//, '');
      if (!ALLOWED_PATHS.test(rel) || seen.has(rel)) continue;
      if (light && rel === '_project/STATUS.md') continue;
      seen.add(rel);
      const abs = path.join(dir, rel);
      const exists = existsSync(abs);
      // Existing files are never replaced: a "create" on an existing file becomes an append of
      // nothing useful, so it is dropped; appends go only to files that exist.
      if (exists && f.action === 'create') {
        if (rel === 'CLAUDE.md' || rel === 'README.md') {
          files.push(this.appendFile(abs, rel, f.content));
        }
        continue;
      }
      if (!exists && f.action === 'append') {
        files.push(this.createFile(rel, f.content));
        continue;
      }
      files.push(exists ? this.appendFile(abs, rel, f.content) : this.createFile(rel, f.content));
    }
    const projectJson = buildProjectJson({
      name: projectId,
      summary: p.summary,
      phase: p.phase,
      stack: p.stack,
      createdBy: 'calibration',
      repo: null,
      docs: {
        ...(seen.has('docs/prd.md') || existsSync(path.join(dir, 'docs/prd.md'))
          ? { prd: 'docs/prd.md' }
          : {}),
        ...(seen.has('docs/architecture.md') || existsSync(path.join(dir, 'docs/architecture.md'))
          ? { architecture: 'docs/architecture.md' }
          : {}),
        ...(seen.has('docs/data-model.md') || existsSync(path.join(dir, 'docs/data-model.md'))
          ? { dataModel: 'docs/data-model.md' }
          : {}),
        ...(existsSync(path.join(dir, 'docs/adr')) ? { adr: 'docs/adr/' } : {}),
      },
    });
    if (!existsSync(path.join(dir, '_project', 'project.json'))) {
      files.push(
        this.createFile('_project/project.json', JSON.stringify(projectJson, null, 2) + '\n'),
      );
    }
    if (!existsSync(path.join(dir, '_project', 'tasks.json'))) {
      files.push(
        this.createFile('_project/tasks.json', JSON.stringify(buildTasks(p.phase), null, 2) + '\n'),
      );
    }
    if (needsGitExclude(dir)) {
      files.push(
        this.appendFile(
          path.join(dir, '.git', 'info', 'exclude'),
          '.git/info/exclude',
          '_project/\n',
        ),
      );
    }
    return { ok: true, proposal: { summary: p.summary, phase: p.phase, stack: p.stack, files } };
  }

  private createFile(rel: string, content: string): ProposedFile {
    const text = content.endsWith('\n') ? content : content + '\n';
    return {
      path: rel,
      action: 'create',
      content: text,
      lines: plusLines(text),
      size: Buffer.byteLength(text),
      note: NOTES[rel] ?? 'New document',
      warning: findSecret(text),
    };
  }

  private appendFile(abs: string, rel: string, section: string): ProposedFile {
    const current = existsSync(abs) ? readFileSync(abs, 'utf8') : '';
    const sep =
      current.length === 0 || current.endsWith('\n\n')
        ? ''
        : current.endsWith('\n')
          ? '\n'
          : '\n\n';
    const add = sep + (section.endsWith('\n') ? section : section + '\n');
    const oldLines = current.endsWith('\n')
      ? current.slice(0, -1).split('\n')
      : current
        ? current.split('\n')
        : [];
    const tail: DiffLine[] = oldLines.slice(-4).map((t, i, arr) => {
      const n = oldLines.length - arr.length + i + 1;
      return { kind: ' ', a: n, b: n, text: t };
    });
    const added = plusLines(add, oldLines.length + 1);
    return {
      path: rel,
      action: 'append',
      content: add,
      lines: [...tail, ...added],
      size: Buffer.byteLength(add),
      note: NOTES[rel] ?? 'A section at the end',
      warning: findSecret(add),
    };
  }

  /** Stops every running scan (daemon shutdown). */
  async stopAll(): Promise<void> {
    await Promise.all([...this.runs.keys()].map((id) => this.cancel(id)));
  }

  async cancel(projectId: string): Promise<CalibrationState> {
    const run = this.runs.get(projectId);
    if (!run) return this.state(projectId);
    this.decisions.cancel(run.source);
    this.approvals.cancel(run.source, 'Calibration cancelled');
    const handle = run.handle;
    await handle?.interrupt();
    // Let the run write its last transcript line before we forget it.
    if (handle) await Promise.race([handle.done, new Promise((r) => setTimeout(r, 5000))]);
    this.runs.delete(projectId);
    this.hub.publish(`project:${projectId}`, 'calibrate.updated', {
      projectId,
      state: this.state(projectId),
    });
    return this.state(projectId);
  }

  /** Writes only the ticked files. Creates never overwrite; appends only add at the end. */
  async write(
    projectId: string,
    paths: string[],
  ): Promise<{ written: string[]; skipped: { path: string; reason: string }[] }> {
    const dir = projectDir(this.config.projectsDir(), projectId);
    const run = this.runs.get(projectId);
    const proposal = run?.state.proposal;
    if (!run || !proposal || run.state.status !== 'proposal')
      throw conflict('There is no proposal to write. Run calibration first.');
    if (paths.length === 0) throw badRequest('Tick at least one file.');
    run.state.status = 'writing';
    this.publish(projectId, true);
    const written: string[] = [];
    const skipped: { path: string; reason: string }[] = [];
    for (const rel of paths) {
      const f = proposal.files.find((x) => x.path === rel);
      if (!f) {
        skipped.push({ path: rel, reason: 'Not in the proposal' });
        continue;
      }
      if (f.warning) {
        skipped.push({ path: rel, reason: f.warning });
        continue;
      }
      const abs =
        rel === '.git/info/exclude'
          ? path.join(dir, '.git', 'info', 'exclude')
          : resolveInside(dir, rel);
      if (f.action === 'create') {
        if (existsSync(abs)) {
          skipped.push({
            path: rel,
            reason: 'The file appeared since the proposal; Cherry never overwrites.',
          });
          continue;
        }
        mkdirSync(path.dirname(abs), { recursive: true });
        writeFileSync(abs, f.content, { flag: 'wx' });
      } else {
        mkdirSync(path.dirname(abs), { recursive: true });
        appendFileSync(abs, f.content);
      }
      written.push(rel);
    }
    run.state.written = written;
    run.state.status = 'done';
    this.publish(projectId, true);
    await this.projects.rescan();
    this.runs.delete(projectId);
    return { written, skipped };
  }
}

export function isReadOnlyGit(command: string): boolean {
  return READ_ONLY_GIT.test(command.trim());
}
