import { randomUUID } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import {
  MAGNET_FILES,
  type ChatItem,
  type MagnetAction,
  type MagnetFileName,
  type MagnetInfo,
  type MagnetSend,
  type MagnetState,
  type Usage,
} from '@apeiron/shared';
import { z } from 'zod';
import type { ConfigStore } from '../config.ts';
import type { Db } from '../db.ts';
import type { EventHub } from '../events.ts';
import { writeFileAtomic } from '../fsutil.ts';
import { badRequest, conflict, notFound } from '../http.ts';
import type { AgentManager } from '../agents/manager.ts';
import type { CalibrationService } from '../calibrate/service.ts';
import type { ApprovalBroker } from '../claude/approvals.ts';
import { Conversation } from '../claude/conversation.ts';
import type { DecisionBroker } from '../claude/decisions.ts';
import { READ_TOOLS, type RunHandle, type Runner } from '../claude/runner.ts';
import { Transcript } from '../claude/transcript.ts';
import type { GitActions } from '../projects/git-actions.ts';
import type { ProjectService } from '../projects/service.ts';
import { projectDir } from '../projects/workspace.ts';
import { recordUsage } from '../usage.ts';
import { magnetDir } from './files.ts';

const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit']);

/** What each proposed action does, in the words the card uses. */
function describe(
  kind: MagnetAction['kind'],
  projectId: string | null,
  task: string | null,
): { title: string; detail: string } {
  switch (kind) {
    case 'calibrate':
      return {
        title: `Magnet wants to start calibration in ${projectId}`,
        detail: `Reads ~/Projects/${projectId} and proposes project files. Nothing is written until you approve the files.`,
      };
    case 'start_agent':
      return {
        title: `Magnet wants to start an agent in ${projectId}`,
        detail: `Task: ${task}. It works in its own worktree; you review the diff before anything lands.`,
      };
    case 'new_project':
      return {
        title: 'Magnet wants to start a new project',
        detail: `Opens the survey with this idea: ${task}. Nothing is created until you finish it.`,
      };
    case 'push':
      return {
        title: `Magnet wants to push ${projectId}`,
        detail: 'You still see the push approval with the commits before anything is sent.',
      };
  }
}

function magnetSystemPrompt(o: {
  files: Record<string, string>;
  projectsMd: string;
  readOnly: boolean;
  projectsDir: string;
  now: Date;
}): string {
  return [
    "You are Magnet, an assistant inside Apeiron who knows all of the user's projects.",
    `Today is ${o.now.toDateString()}, ${o.now.toTimeString().slice(0, 5)}.`,
    '',
    '## Who you are (MAGNET.md)',
    o.files['MAGNET.md'] ?? '',
    '## The user (me.md)',
    o.files['me.md'] ?? '',
    '## Their work (work.md)',
    o.files['work.md'] ?? '',
    '## Projects (projects.md, generated)',
    o.projectsMd,
    '',
    '## How you work',
    `- Projects live in ${o.projectsDir}/<id>. For details read <id>/_project/STATUS.md, <id>/_project/project.json, <id>/_project/survey.json and files in <id>/docs/. Read only what you need.`,
    '- You cannot run commands. Git state (changes, ahead, behind) and last activity are already in the projects list above; use it.',
    '- Answer in a few short sentences. Name the project first, then the problem.',
    '- When you talk about specific projects, call show_projects with their ids so the user sees cards they can click.',
    '- You cannot change anything yourself. To calibrate a folder, start a background agent, start a new project or push, call propose_action. The user approves or cancels it. Propose at most one action per answer, and only when it clearly helps.',
    o.readOnly
      ? '- You are in read-only mode: you may not edit any file.'
      : '- You may edit your own notes (me.md, work.md, MAGNET.md in your folder) when the user asks; each edit is shown for approval.',
    '- Never read .env files, keys or secrets.',
  ].join('\n');
}

interface Live {
  conversationId: string;
  claudeSessionId: string | null;
  conversation: Conversation;
  running: RunHandle | null;
}

/**
 * Magnet (prd.md M-1 to M-5): one conversation across all projects, read-only. Writes, agent
 * starts and pushes become proposed-action cards that call the real services after Approve.
 */
export class MagnetService {
  private live: Live | null = null;

  constructor(
    private readonly config: ConfigStore,
    private readonly db: Db,
    private readonly hub: EventHub,
    private readonly approvals: ApprovalBroker,
    private readonly decisions: DecisionBroker,
    private readonly runner: Runner,
    private readonly projects: ProjectService,
    private readonly home: string,
    private readonly actions: {
      calibration: CalibrationService;
      agents: AgentManager;
      git: GitActions;
    },
  ) {}

  private dir(): string {
    return magnetDir(this.home);
  }

  private open(conversationId: string, claudeSessionId: string | null): Live {
    const conversation = new Conversation({
      projectId: 'magnet',
      cwd: this.dir(),
      source: `magnet:${conversationId}`,
      transcript: new Transcript(
        path.join(this.home, 'transcripts', `magnet_${conversationId}.jsonl`),
      ),
      approvals: this.approvals,
      decisions: this.decisions,
      onItem: (item) => this.hub.publish('magnet', 'magnet.item', { conversationId, item }),
      onDelta: (itemId, _turnId, text) =>
        this.hub.publish('magnet', 'magnet.delta', { conversationId, itemId, text }),
      policy: (tool, input) => {
        if (READ_TOOLS.includes(tool)) return 'allow';
        if (EDIT_TOOLS.has(tool) && !this.config.get().magnet.readOnly) {
          const file = typeof input.file_path === 'string' ? input.file_path : '';
          const abs = path.resolve(this.dir(), file);
          if (
            path.dirname(abs) === this.dir() &&
            MAGNET_FILES.includes(path.basename(abs) as MagnetFileName)
          )
            return 'ask';
        }
        return { deny: 'Magnet is read-only. Propose an action instead.' };
      },
    });
    this.live = { conversationId, claudeSessionId, conversation, running: null };
    return this.live;
  }

  private current(): Live | null {
    if (this.live) return this.live;
    const row = this.db
      .prepare(
        `SELECT id, claude_session_id FROM sessions WHERE kind = 'magnet' AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1`,
      )
      .get() as { id: string; claude_session_id: string | null } | undefined;
    return row ? this.open(row.id, row.claude_session_id) : null;
  }

  async state(): Promise<MagnetState> {
    const live = this.current();
    return {
      conversationId: live?.conversationId ?? null,
      running: !!live?.running,
      items: live?.conversation.list() ?? [],
      readOnly: this.config.get().magnet.readOnly,
      projects: (await this.projects.known()).length,
    };
  }

  private publishState(): void {
    this.hub.publish('magnet', 'magnet.state', {
      conversationId: this.live?.conversationId ?? null,
      running: !!this.live?.running,
    });
  }

  private readFiles(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const name of [...MAGNET_FILES, 'projects.md']) {
      try {
        out[name] = readFileSync(path.join(this.dir(), name), 'utf8');
      } catch {
        out[name] = '';
      }
    }
    return out;
  }

  async send(body: MagnetSend): Promise<{ turnId: string; conversationId: string }> {
    let live = this.current();
    if (live?.running) throw conflict('Magnet is still answering. Wait or stop it.');
    if (body.projectId) projectDir(this.config.projectsDir(), body.projectId);
    if (!live) {
      const id = randomUUID();
      const now = Date.now();
      this.db
        .prepare(
          `INSERT INTO sessions (id, project_id, kind, title, model, started_at, transcript) VALUES (?, 'magnet', 'magnet', ?, ?, ?, ?)`,
        )
        .run(
          id,
          body.text.slice(0, 80),
          this.config.get().claude.defaultModel,
          now,
          path.join(this.home, 'transcripts', `magnet_${id}.jsonl`),
        );
      live = this.open(id, null);
      recordUsage(this.db, now, 0, true);
    }
    // Fresh project lines for this turn.
    await this.projects.rescan();
    const files = this.readFiles();
    const turnId = randomUUID().slice(0, 12);
    const cur = live;
    cur.conversation.startTurn(turnId);
    cur.conversation.addUser(`u_${turnId}`, body.text);
    const prompt = body.projectId
      ? `(I am looking at the project "${body.projectId}".)\n\n${body.text}`
      : body.text;
    const projectsDir = this.config.projectsDir();
    const magnet = this.dir();
    let finished = false;
    const handle = this.runner({
      cwd: magnet,
      prompt,
      resume: cur.claudeSessionId,
      model: this.config.get().claude.defaultModel,
      planMode: false,
      appendSystemPrompt: magnetSystemPrompt({
        files,
        projectsMd: files['projects.md'] ?? '',
        readOnly: this.config.get().magnet.readOnly,
        projectsDir,
        now: new Date(),
      }),
      allowedTools: READ_TOOLS,
      additionalDirectories: [projectsDir],
      decisions: false,
      guard: (tool, input) => {
        if (tool.startsWith('mcp__apeiron__')) return null;
        if (READ_TOOLS.includes(tool) || EDIT_TOOLS.has(tool)) {
          const p = ['file_path', 'path'].map((k) => input[k]).find((v) => typeof v === 'string');
          if (typeof p !== 'string') return null;
          const abs = path.resolve(magnet, p);
          const inside = (root: string) => abs === root || abs.startsWith(root + path.sep);
          if (EDIT_TOOLS.has(tool))
            return inside(magnet) ? null : 'Magnet may only edit its own notes.';
          return inside(projectsDir) || inside(magnet)
            ? null
            : 'Magnet only reads the projects folder and its own notes.';
        }
        return 'Magnet is read-only: it reads files and proposes actions, nothing else.';
      },
      extraTools: [
        {
          name: 'show_projects',
          description:
            'Show project cards inline in your answer. Pass the project ids (folder names).',
          shape: { ids: z.array(z.string()) },
          handler: async (args) => {
            const ids = z.object({ ids: z.array(z.string()).max(8) }).safeParse(args);
            if (!ids.success) return { ok: false, text: 'ids must be a list of project ids.' };
            const known = new Set((await this.projects.known()).map((c) => c.id));
            const good = ids.data.ids.filter((i) => known.has(i));
            if (!good.length) return { ok: false, text: 'None of those ids is a project.' };
            cur.conversation.put({
              kind: 'projects',
              id: `pj_${randomUUID().slice(0, 8)}`,
              at: Date.now(),
              turnId,
              ids: good,
            });
            return { ok: true, text: 'Shown.' };
          },
        },
        {
          name: 'propose_action',
          description:
            'Propose an action the user approves or cancels: calibrate (projectId), start_agent (projectId + task), new_project (task = the idea), push (projectId).',
          shape: {
            kind: z.enum(['calibrate', 'start_agent', 'new_project', 'push']),
            projectId: z.string().optional(),
            task: z.string().optional(),
          },
          handler: async (args) => {
            const parsed = z
              .object({
                kind: z.enum(['calibrate', 'start_agent', 'new_project', 'push']),
                projectId: z.string().optional(),
                task: z.string().max(2000).optional(),
              })
              .safeParse(args);
            if (!parsed.success) return { ok: false, text: 'Invalid action.' };
            const a = parsed.data;
            const needsProject = a.kind !== 'new_project';
            if (needsProject) {
              const known = (await this.projects.known()).some((c) => c.id === a.projectId);
              if (!a.projectId || !known)
                return { ok: false, text: 'projectId must be one of the projects.' };
            }
            if ((a.kind === 'start_agent' || a.kind === 'new_project') && !a.task?.trim())
              return { ok: false, text: 'This action needs a task.' };
            const projectId = needsProject ? (a.projectId ?? null) : null;
            const task = a.task?.trim() ?? null;
            const action: MagnetAction = {
              id: `act_${randomUUID().slice(0, 10)}`,
              kind: a.kind,
              projectId,
              ...describe(a.kind, projectId, task),
              task,
              status: 'proposed',
              result: null,
              href: null,
            };
            cur.conversation.put({ kind: 'action', id: action.id, at: Date.now(), turnId, action });
            return {
              ok: true,
              text: 'Proposed. The user sees Approve and Cancel; do not repeat the proposal or claim it is done.',
            };
          },
        },
      ],
      onPermission: (tool, input, id) => cur.conversation.permission(tool, input, id),
      onDecision: async () => ({ ok: false, error: 'Not available to Magnet.' }),
      onEvent: (ev) => {
        if (ev.t === 'session' && ev.sessionId !== cur.claudeSessionId) {
          cur.claudeSessionId = ev.sessionId;
          this.db
            .prepare('UPDATE sessions SET claude_session_id = ? WHERE id = ?')
            .run(ev.sessionId, cur.conversationId);
        }
        cur.conversation.handle(ev);
        if (ev.t === 'result') {
          finished = true;
          cur.running = null;
          recordUsage(this.db, Date.now(), ev.durationMs, false);
          this.approvals.cancel(`magnet:${cur.conversationId}`, 'Magnet finished');
          this.publishState();
        }
      },
    });
    if (!finished) {
      cur.running = handle;
      this.publishState();
    }
    return { turnId, conversationId: cur.conversationId };
  }

  async stop(): Promise<void> {
    const live = this.current();
    if (!live?.running) return;
    this.approvals.cancel(`magnet:${live.conversationId}`, 'Stopped');
    await live.running.interrupt();
  }

  async newConversation(): Promise<void> {
    const live = this.current();
    if (live) {
      await this.stop();
      this.db
        .prepare('UPDATE sessions SET ended_at = ? WHERE id = ?')
        .run(Date.now(), live.conversationId);
      this.live = null;
    }
    this.publishState();
  }

  private findAction(actionId: string): {
    live: Live;
    item: Extract<ChatItem, { kind: 'action' }>;
  } {
    const live = this.current();
    const item = live?.conversation.items.get(actionId);
    if (!live || item?.kind !== 'action') throw notFound(`No action ${actionId}`);
    if (item.action.status !== 'proposed')
      throw conflict(`This action was already ${item.action.status}.`);
    return { live, item };
  }

  private settle(
    live: Live,
    item: Extract<ChatItem, { kind: 'action' }>,
    patch: Partial<MagnetAction>,
  ) {
    const next = { ...item, action: { ...item.action, ...patch } };
    live.conversation.put(next);
    return next.action;
  }

  /** Approve runs the real thing; each service keeps its own safety rules. */
  async approve(actionId: string): Promise<MagnetAction> {
    const { live, item } = this.findAction(actionId);
    const a = item.action;
    const p = encodeURIComponent(a.projectId ?? '');
    try {
      switch (a.kind) {
        case 'calibrate':
          this.actions.calibration.start(a.projectId!);
          return this.settle(live, item, {
            status: 'approved',
            result: 'Calibration started. Nothing is written until you approve the files.',
            href: `/p/${p}/calibrate`,
          });
        case 'start_agent': {
          const agent = await this.actions.agents.start(a.projectId!, { task: a.task! });
          return this.settle(live, item, {
            status: 'approved',
            result: `Agent started on ${agent.branch}.`,
            href: `/p/${p}?agent=${agent.id}`,
          });
        }
        case 'new_project':
          return this.settle(live, item, {
            status: 'approved',
            result: 'Opening the survey.',
            href: `/new?idea=${encodeURIComponent(a.task ?? '')}`,
          });
        case 'push':
          await this.actions.git.push(a.projectId!);
          return this.settle(live, item, {
            status: 'approved',
            result: 'The push approval is waiting in the GitHub box.',
            href: `/p/${p}`,
          });
      }
    } catch (e) {
      return this.settle(live, item, { status: 'failed', result: (e as Error).message });
    }
  }

  cancel(actionId: string): MagnetAction {
    const { live, item } = this.findAction(actionId);
    return this.settle(live, item, { status: 'cancelled' });
  }

  async info(): Promise<MagnetInfo> {
    const files = MAGNET_FILES.map((name) => {
      const file = path.join(this.dir(), name);
      let content = '';
      let updatedAt = 0;
      try {
        content = readFileSync(file, 'utf8');
        updatedAt = statSync(file).mtimeMs;
      } catch {
        // missing: shown empty
      }
      return { name, content, updatedAt };
    });
    const weekAgo = Date.now() - 7 * 86_400_000;
    const n = (sql: string, ...args: unknown[]) =>
      (this.db.prepare(sql).get(...args) as { n: number }).n;
    return {
      dir: this.dir(),
      readOnly: this.config.get().magnet.readOnly,
      files,
      stats: {
        projects: (await this.projects.known()).length,
        sessionsWeek: n('SELECT COUNT(*) AS n FROM sessions WHERE started_at >= ?', weekAgo),
        agentsRun: n('SELECT COUNT(*) AS n FROM agents'),
      },
      usage: usageStats(this.db),
    };
  }

  saveFile(name: string, content: string): void {
    if (!MAGNET_FILES.includes(name as MagnetFileName)) throw badRequest(`Unknown file ${name}`);
    writeFileAtomic(path.join(this.dir(), name), content);
  }

  async stopAll(): Promise<void> {
    await this.stop();
  }
}

const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Settings → Usage: month total, longest task, streaks and the last 26 weeks of days. */
export function usageStats(db: Db, now = new Date()): Usage {
  const rows = db.prepare('SELECT day, sessions, longest_ms FROM usage_days').all() as {
    day: string;
    sessions: number;
    longest_ms: number;
  }[];
  const byDay = new Map(rows.map((r) => [r.day, r]));
  const month = dayKey(now).slice(0, 7);
  const sessionsMonth = rows
    .filter((r) => r.day.startsWith(month))
    .reduce((s, r) => s + r.sessions, 0);
  const longestMs = rows.reduce((m, r) => Math.max(m, r.longest_ms), 0);
  const days: Usage['days'] = [];
  const start = new Date(now);
  start.setDate(start.getDate() - (26 * 7 - 1));
  for (const d = new Date(start); d <= now; d.setDate(d.getDate() + 1)) {
    const k = dayKey(d);
    days.push({ day: k, sessions: byDay.get(k)?.sessions ?? 0 });
  }
  // Current streak counts back from today (or yesterday, if today has nothing yet).
  let currentStreak = 0;
  const back = new Date(now);
  if (!byDay.get(dayKey(back))?.sessions) back.setDate(back.getDate() - 1);
  while (byDay.get(dayKey(back))?.sessions) {
    currentStreak++;
    back.setDate(back.getDate() - 1);
  }
  let longestStreak = 0;
  let run = 0;
  let prev: Date | null = null;
  for (const r of [...rows]
    .filter((x) => x.sessions > 0)
    .sort((a, b) => a.day.localeCompare(b.day))) {
    const d = new Date(`${r.day}T12:00:00`);
    run = prev && Math.round((d.getTime() - prev.getTime()) / 86_400_000) === 1 ? run + 1 : 1;
    longestStreak = Math.max(longestStreak, run);
    prev = d;
  }
  return { sessionsMonth, longestMs, currentStreak, longestStreak, days };
}
