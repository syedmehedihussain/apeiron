import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import {
  SCAN_ICONS,
  type ChatItem,
  type Report,
  type ReportMeta,
  type ScanAgent,
  type ScanAgentList,
  type ScanCounts,
  type ScanRun,
  type ScanVerdict,
} from '@cherry/shared';
import type { ConfigStore } from '../config.ts';
import type { EventHub } from '../events.ts';
import { badRequest, conflict, notFound } from '../http.ts';
import { resolveInside } from '../paths.ts';
import type { ApprovalBroker } from '../claude/approvals.ts';
import { Conversation } from '../claude/conversation.ts';
import type { DecisionBroker } from '../claude/decisions.ts';
import { READ_TOOLS, type CustomTool, type RunHandle, type Runner } from '../claude/runner.ts';
import { Transcript } from '../claude/transcript.ts';
import { ensureIgnored } from '../chat/uploads.ts';
import { frontMatter } from '../projects/status.ts';
import { projectDir } from '../projects/workspace.ts';
import { BUILTIN_PRESETS, COMMON_COMMANDS, type ScanPreset } from './presets.ts';

/** Reports live in the project's git-ignored cherry/ folder, one folder per agent. */
export const REPORTS_DIR = 'cherry/reports';
const ID = /^[a-z0-9][a-z0-9-]{0,59}$/;
const MODELS = new Set(['sonnet', 'opus', 'haiku']);

/**
 * Is this exactly one allowed command (or it plus arguments)? Returns why not, or null.
 * No shell syntax at all, so `pnpm test && curl …` can never ride along.
 */
export function commandRefusal(command: string, allowed: string[]): string | null {
  const cmd = command.trim().replace(/\s+/g, ' ');
  const list = allowed.map((c) => `\`${c}\``).join(', ');
  if (/[;&|<>`$()\\\n{}]/.test(cmd) || /(^|\s)--output\b/.test(cmd))
    return `Scan agents run one plain command at a time, with no pipes, redirects, && or $(…). Allowed: ${list}.`;
  if (allowed.some((a) => cmd === a || cmd.startsWith(a + ' '))) return null;
  return `This scan agent may only run: ${list}. Work with what those show, or read the files.`;
}

function slug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'agent'
  );
}

/**
 * Custom scan agents: `~/.cherry/agents/<id>.md`, front matter (name, description, icon,
 * model, commands as a comma-separated list) and the instructions as the body.
 */
export function loadCustom(home: string): {
  presets: ScanPreset[];
  problems: { file: string; error: string }[];
} {
  const dir = path.join(home, 'agents');
  const presets: ScanPreset[] = [];
  const problems: { file: string; error: string }[] = [];
  if (!existsSync(dir)) return { presets, problems };
  for (const file of readdirSync(dir).sort()) {
    if (!file.endsWith('.md')) continue;
    try {
      const { fields, body } = frontMatter(readFileSync(path.join(dir, file), 'utf8'));
      if (!fields.name) throw new Error('Add a `name:` line to the front matter.');
      if (body.trim().length < 20)
        throw new Error('Write the instructions below the front matter.');
      const icon = (SCAN_ICONS as readonly string[]).includes(fields.icon ?? '')
        ? (fields.icon as ScanPreset['icon'])
        : 'bot';
      const model = MODELS.has(fields.model ?? '') ? fields.model! : 'sonnet';
      presets.push({
        id: slug(file.replace(/\.md$/, '')),
        name: fields.name.slice(0, 60),
        description: (fields.description ?? '').slice(0, 200),
        icon,
        model,
        commands: (fields.commands ?? '')
          .split(',')
          .map((c) => c.trim().replace(/\s+/g, ' '))
          .filter(Boolean),
        instructions: body.trim(),
        source: 'custom',
      });
    } catch (e) {
      problems.push({ file, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return { presets, problems };
}

function scanPrompt(p: ScanPreset, commands: string[]): string {
  return [
    p.instructions,
    '',
    '## How you work',
    '- You are a read-only scan agent inside Cherry, running in the background. The user is not watching and cannot answer questions.',
    '- Read CLAUDE.md and README first if they exist, to learn how the project is laid out.',
    '- You cannot edit files. Secret files (.env, keys) are always refused; do not try.',
    `- You may run only these commands, each on its own with no pipes, redirects or &&: ${commands.map((c) => `\`${c}\``).join(', ')}. Anything else is refused.`,
    '- When you are done, call submit_report once with the whole report. Do not print the report as a message as well.',
    '',
    '## Report format (the `markdown` of submit_report)',
    '- No top-level `#` heading; Cherry adds the title.',
    '- `## Summary`: 2 to 4 sentences, the verdict in plain words.',
    '- `## Findings`: one `### <Severity> · <short title>` per finding, most severe first, each with where (`path:line`), why it matters, and the fix. Say "No findings." if there are none.',
    '- `## What to do next`: a short numbered list.',
  ].join('\n');
}

/** One-line, front-matter-safe text. */
const line = (s: string, max = 240) => s.replace(/\s+/g, ' ').trim().slice(0, max);

function reportId(at: number, taken: (id: string) => boolean): string {
  const d = new Date(at);
  const p = (n: number) => String(n).padStart(2, '0');
  const base = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  let id = base;
  for (let n = 2; taken(id); n++) id = `${base}-${n}`;
  return id;
}

const SubmitSchema = z.object({
  verdict: z.enum(['pass', 'warn', 'fail']),
  summary: z.string().min(1).max(400),
  counts: z
    .object({
      critical: z.number().int().min(0),
      high: z.number().int().min(0),
      medium: z.number().int().min(0),
      low: z.number().int().min(0),
    })
    .optional(),
  markdown: z.string().min(20).max(200_000),
});

interface Live {
  run: ScanRun;
  handle: RunHandle | null;
  stopped: boolean;
}

/**
 * Ready-made agents that scan a project read-only and write a Markdown report (ADR-0012).
 * They run in the project folder itself (no worktree, nothing to merge): read tools, plus only
 * the preset's own commands, never asked for, never anything else.
 */
export class ScanService {
  private readonly live = new Map<string, Live>();

  constructor(
    private readonly config: ConfigStore,
    private readonly hub: EventHub,
    private readonly approvals: ApprovalBroker,
    private readonly decisions: DecisionBroker,
    private readonly runner: Runner,
    private readonly home: string,
  ) {}

  private presets(): { presets: ScanPreset[]; problems: { file: string; error: string }[] } {
    const custom = loadCustom(this.home);
    // A custom file with a built-in id replaces the built-in one.
    const ids = new Set(custom.presets.map((p) => p.id));
    return {
      presets: [...BUILTIN_PRESETS.filter((p) => !ids.has(p.id)), ...custom.presets],
      problems: custom.problems,
    };
  }

  private preset(agentId: string): ScanPreset {
    const p = this.presets().presets.find((x) => x.id === agentId);
    if (!p) throw notFound(`No scan agent ${agentId}`);
    return p;
  }

  private key = (projectId: string, agentId: string) => `${projectId}\0${agentId}`;

  private publish(projectId: string, agentId: string): void {
    this.hub.publish(`project:${projectId}`, 'scan.updated', { projectId, agentId });
  }

  list(projectId: string): ScanAgentList {
    const dir = projectDir(this.config.projectsDir(), projectId);
    const { presets, problems } = this.presets();
    const agents: ScanAgent[] = presets.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      icon: p.icon,
      source: p.source,
      model: p.model,
      commands: p.commands,
      run: this.live.get(this.key(projectId, p.id))?.run ?? null,
      last: this.readMetas(dir, p.id)[0] ?? null,
    }));
    return { agents, problems };
  }

  reports(projectId: string, agentId: string): { reports: ReportMeta[] } {
    if (!ID.test(agentId)) throw badRequest('Bad agent id.');
    return { reports: this.readMetas(projectDir(this.config.projectsDir(), projectId), agentId) };
  }

  report(projectId: string, agentId: string, id: string): Report {
    if (!ID.test(agentId) || !/^[0-9a-z-]{1,40}$/.test(id)) throw badRequest('Bad report id.');
    const dir = projectDir(this.config.projectsDir(), projectId);
    const rel = `${REPORTS_DIR}/${agentId}/${id}.md`;
    let abs: string;
    try {
      abs = resolveInside(dir, rel);
    } catch {
      throw notFound('No such report.');
    }
    if (!existsSync(abs)) throw notFound('No such report.');
    const parsed = this.parse(readFileSync(abs, 'utf8'), agentId, id, rel);
    if (!parsed) throw notFound('This report file is damaged.');
    return parsed;
  }

  private readMetas(dir: string, agentId: string): ReportMeta[] {
    const folder = path.join(dir, REPORTS_DIR, agentId);
    if (!existsSync(folder)) return [];
    const out: ReportMeta[] = [];
    for (const f of readdirSync(folder)) {
      if (!f.endsWith('.md')) continue;
      const id = f.slice(0, -3);
      try {
        const r = this.parse(
          readFileSync(path.join(folder, f), 'utf8'),
          agentId,
          id,
          `${REPORTS_DIR}/${agentId}/${f}`,
        );
        if (r) out.push(r.meta);
      } catch {
        // An unreadable file is skipped, not fatal.
      }
    }
    return out.sort((a, b) => b.startedAt - a.startedAt);
  }

  private parse(text: string, agentId: string, id: string, rel: string): Report | null {
    const { fields: f, body } = frontMatter(text);
    const startedAt = Date.parse(f.started ?? '');
    if (!f.title || Number.isNaN(startedAt)) return null;
    const n = (k: string) => Math.max(0, Number.parseInt(f[k] ?? '', 10) || 0);
    const hasCounts = ['critical', 'high', 'medium', 'low'].some((k) => k in f);
    const verdict = (['pass', 'warn', 'fail'] as const).find((v) => v === f.verdict) ?? 'none';
    return {
      meta: {
        id,
        agentId,
        title: f.title,
        status: f.status === 'failed' ? 'failed' : 'done',
        verdict,
        summary: f.summary ?? '',
        counts: hasCounts
          ? { critical: n('critical'), high: n('high'), medium: n('medium'), low: n('low') }
          : null,
        model: f.model ?? '',
        startedAt,
        endedAt: Date.parse(f.finished ?? '') || startedAt,
        path: rel,
      },
      markdown: body.replace(/^\s+/, ''),
    };
  }

  private write(
    dir: string,
    p: ScanPreset,
    r: {
      status: 'done' | 'failed';
      verdict: ScanVerdict;
      summary: string;
      counts: ScanCounts | null;
      markdown: string;
      startedAt: number;
    },
  ): void {
    ensureIgnored(dir);
    const folder = path.join(dir, REPORTS_DIR, p.id);
    mkdirSync(folder, { recursive: true });
    resolveInside(dir, `${REPORTS_DIR}/${p.id}`);
    const id = reportId(r.startedAt, (x) => existsSync(path.join(folder, `${x}.md`)));
    const fm = [
      '---',
      `agent: ${p.id}`,
      `title: ${line(p.name, 80)}`,
      `status: ${r.status}`,
      `verdict: ${r.verdict}`,
      `summary: ${line(r.summary)}`,
      ...(r.counts
        ? [
            `critical: ${r.counts.critical}`,
            `high: ${r.counts.high}`,
            `medium: ${r.counts.medium}`,
            `low: ${r.counts.low}`,
          ]
        : []),
      `model: ${p.model}`,
      `started: ${new Date(r.startedAt).toISOString()}`,
      `finished: ${new Date().toISOString()}`,
      '---',
      '',
    ].join('\n');
    writeFileSync(path.join(folder, `${id}.md`), fm + r.markdown.trim() + '\n');
  }

  start(projectId: string, agentId: string): ScanRun {
    const dir = projectDir(this.config.projectsDir(), projectId);
    const p = this.preset(agentId);
    const k = this.key(projectId, agentId);
    if (this.live.has(k)) throw conflict(`${p.name} is already running on this project.`);

    const commands = [...COMMON_COMMANDS, ...p.commands];
    const id = `sc_${randomUUID().slice(0, 10)}`;
    const run: ScanRun = { id, agentId, startedAt: Date.now(), activity: [] };
    const live: Live = { run, handle: null, stopped: false };
    this.live.set(k, live);

    let submitted: z.infer<typeof SubmitSchema> | null = null;
    let lastText = '';
    const source = `scan:${id}`;
    const conversation = new Conversation({
      projectId,
      cwd: dir,
      source,
      transcript: new Transcript(path.join(this.home, 'transcripts', `${id}.jsonl`)),
      approvals: this.approvals,
      decisions: this.decisions,
      onItem: (item: ChatItem) => {
        if (item.kind === 'text') lastText = item.text;
        if (item.kind !== 'tool') return;
        run.activity = [...run.activity.filter((x) => x.id !== item.id), item].slice(-6);
        this.publish(projectId, agentId);
      },
      onDelta: (itemId) => {
        const item = conversation.items.get(itemId);
        if (item?.kind === 'text') lastText = item.text;
      },
      // Never asks: the preset's commands run, everything else is refused.
      policy: (tool, input) => {
        if (tool !== 'Bash')
          return { deny: 'Scan agents only read files and run their own check commands.' };
        const why = commandRefusal(String(input.command ?? ''), commands);
        return why ? { deny: why } : 'allow';
      },
    });
    conversation.startTurn(id);

    const submit: CustomTool = {
      name: 'submit_report',
      description:
        'Save your finished report. Call once, at the end. verdict: pass (nothing important), warn (things to fix), fail (serious problems or failing checks). counts: findings by severity, when the report has findings.',
      shape: SubmitSchema.shape,
      handler: async (args) => {
        const parsed = SubmitSchema.safeParse(args);
        if (!parsed.success)
          return {
            ok: false,
            text: `The report is not valid, fix it and call submit_report again: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
          };
        submitted = parsed.data;
        return { ok: true, text: 'Saved. You are done; stop here.' };
      },
    };

    let finished = false;
    const handle = this.runner({
      cwd: dir,
      prompt: scanPrompt(p, commands),
      resume: null,
      model: p.model,
      planMode: false,
      appendSystemPrompt:
        'You are a read-only scan agent inside Cherry. You cannot edit files. Finish by calling submit_report.',
      allowedTools: READ_TOOLS,
      disallowedTools: ['Edit', 'Write', 'MultiEdit', 'NotebookEdit', 'WebFetch', 'WebSearch'],
      decisions: false,
      extraTools: [submit],
      onPermission: (tool, input, toolUseId) => conversation.permission(tool, input, toolUseId),
      onDecision: async () => ({ ok: false, error: 'Scan agents cannot ask questions.' }),
      onEvent: (ev) => {
        conversation.handle(ev);
        if (ev.t !== 'result') return;
        finished = true;
        this.live.delete(k);
        this.approvals.cancel(source, 'Scan finished');
        try {
          const report = submitted as z.infer<typeof SubmitSchema> | null;
          if (live.stopped || ev.stopped) {
            // Stopped by the user: nothing to keep.
          } else if (report) {
            this.write(dir, p, {
              status: 'done',
              verdict: report.verdict,
              summary: report.summary,
              counts: report.counts ?? null,
              markdown: report.markdown,
              startedAt: run.startedAt,
            });
          } else if (ev.ok && lastText.trim().length > 40) {
            // Finished without the tool: keep what it wrote rather than lose the run.
            this.write(dir, p, {
              status: 'done',
              verdict: 'none',
              summary:
                lastText
                  .trim()
                  .split('\n')
                  .find((l) => l.trim()) ?? '',
              counts: null,
              markdown: lastText,
              startedAt: run.startedAt,
            });
          } else {
            const error = ev.error ?? 'The agent ended without a report.';
            this.write(dir, p, {
              status: 'failed',
              verdict: 'none',
              summary: error,
              counts: null,
              markdown: `## Summary\n\nThe scan did not finish: ${error}\n\nRun it again. If it keeps failing, check that Claude Code is signed in.`,
              startedAt: run.startedAt,
            });
          }
        } finally {
          this.publish(projectId, agentId);
          this.hub.publish(`project:${projectId}`, 'project.changed', { projectId, paths: [] });
        }
      },
    });
    if (!finished) live.handle = handle;
    this.publish(projectId, agentId);
    return run;
  }

  async stop(projectId: string, agentId: string): Promise<void> {
    const l = this.live.get(this.key(projectId, agentId));
    if (!l) return;
    l.stopped = true;
    await l.handle?.interrupt();
  }

  async stopAll(): Promise<void> {
    await Promise.all(
      [...this.live.values()].map((l) => {
        l.stopped = true;
        return l.handle?.interrupt();
      }),
    );
  }
}
