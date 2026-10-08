import path from 'node:path';
import {
  DecisionCardInputSchema,
  type Approval,
  type ChatItem,
  type ToolVerb,
} from '@apeiron/shared';
import { resolveInside } from '../paths.ts';
import type { ApprovalBroker, ApprovalDraft } from './approvals.ts';
import { classifyCommand } from './commands.ts';
import type { DecisionBroker } from './decisions.ts';
import { editPreview } from './preview.ts';
import {
  DECISION_TOOL,
  type DecisionReply,
  type PermissionAnswer,
  type RunnerEvent,
} from './runner.ts';
import type { Transcript } from './transcript.ts';

const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const READ_LIKE = new Set(['Read', 'Glob', 'Grep', 'LS', 'WebFetch', 'WebSearch']);

export function verbFor(tool: string): ToolVerb {
  if (EDIT_TOOLS.has(tool)) return 'edit';
  if (tool === 'Bash') return 'run';
  if (READ_LIKE.has(tool)) return 'read';
  return 'other';
}

export interface ConversationOptions {
  projectId: string;
  /** Folder Claude works in (project or agent worktree). */
  cwd: string;
  /** Who is asking, e.g. "chat:<id>" or "agent:<id>". Used for approvals and decisions. */
  source: string;
  transcript: Transcript;
  approvals: ApprovalBroker;
  decisions: DecisionBroker;
  /** Called for every new or changed item. */
  onItem(item: ChatItem): void;
  onDelta(itemId: string, turnId: string, text: string): void;
  /**
   * Decide a tool call before asking the user. "ask" shows an approval card.
   * Default: edits and commands ask, everything else asks too.
   */
  policy?(tool: string, input: Record<string, unknown>): 'allow' | 'ask' | { deny: string };
}

/**
 * Turns runner events into transcript items and handles approvals and decision cards for one
 * conversation (chat, agent, calibration).
 */
export class Conversation {
  readonly items = new Map<string, ChatItem>();
  readonly touched = new Set<string>();
  private turnId = '';
  private dirtyText = new Set<string>();

  constructor(private readonly o: ConversationOptions) {
    for (const item of o.transcript.load()) {
      this.items.set(item.id, item);
      if (item.kind === 'tool' && item.verb === 'edit' && item.status === 'ok')
        this.touched.add(item.target);
    }
  }

  list(limit = 200): ChatItem[] {
    const all = [...this.items.values()];
    return all.slice(-limit);
  }

  startTurn(turnId: string): void {
    this.turnId = turnId;
  }

  put(item: ChatItem, persist = true): void {
    this.items.set(item.id, item);
    if (persist) this.o.transcript.append(item);
    this.o.onItem(item);
  }

  addUser(id: string, text: string): void {
    this.put({ kind: 'user', id, at: Date.now(), text });
  }

  /** Is this path (relative to cwd, or absolute) inside the project? Symlinks resolved. */
  private inside(p: string): boolean {
    if (!p) return false;
    try {
      resolveInside(this.o.cwd, path.isAbsolute(p) ? path.relative(this.o.cwd, p) : p);
      return true;
    } catch {
      return false;
    }
  }

  private rel(p: string): string {
    const abs = path.resolve(this.o.cwd, p);
    const r = path.relative(this.o.cwd, abs);
    return r.startsWith('..') ? abs : r.split(path.sep).join('/');
  }

  private targetOf(tool: string, input: Record<string, unknown>): string {
    const s = (k: string) => (typeof input[k] === 'string' ? (input[k] as string) : '');
    if (s('file_path')) return this.rel(s('file_path'));
    if (s('notebook_path')) return this.rel(s('notebook_path'));
    if (tool === 'Bash') return s('command');
    if (s('pattern')) return s('pattern') + (s('path') ? ` in ${this.rel(s('path'))}` : '');
    if (s('path')) return this.rel(s('path'));
    if (s('url')) return s('url');
    if (s('query')) return s('query');
    if (s('description')) return s('description');
    if (tool === 'TodoWrite') return 'to-do list';
    return tool;
  }

  private flushText(): void {
    for (const id of this.dirtyText) {
      const item = this.items.get(id);
      if (item) this.o.transcript.append(item);
    }
    this.dirtyText.clear();
  }

  handle(ev: RunnerEvent): void {
    const now = Date.now();
    switch (ev.t) {
      case 'text_start':
        this.put({ kind: 'text', id: ev.blockId, at: now, turnId: this.turnId, text: '' }, false);
        break;
      case 'text': {
        const item = this.items.get(ev.blockId);
        if (item?.kind !== 'text') break;
        item.text += ev.delta;
        this.dirtyText.add(item.id);
        this.o.onDelta(item.id, this.turnId, ev.delta);
        break;
      }
      case 'tool_start': {
        this.flushText();
        if (ev.name === DECISION_TOOL || ev.name.startsWith('mcp__apeiron__')) break;
        if (this.items.has(ev.id)) break;
        this.put({
          kind: 'tool',
          id: ev.id,
          at: now,
          turnId: this.turnId,
          tool: ev.name,
          verb: verbFor(ev.name),
          target: this.targetOf(ev.name, ev.input),
          status: 'running',
          meta: null,
          added: null,
          removed: null,
          durationMs: null,
          approvalId: null,
        });
        break;
      }
      case 'tool_end': {
        const item = this.items.get(ev.id);
        if (item?.kind !== 'tool') break;
        if (item.status === 'denied') break;
        const durationMs = now - item.at;
        const ok = ev.ok;
        let meta: string | null = null;
        if (!ok) meta = (ev.output.split('\n').find((l) => l.trim()) ?? 'failed').slice(0, 120);
        else if (item.tool === 'Read') {
          const n = ev.output.split('\n').filter((l) => /^\s*\d+[→\t]/.test(l)).length;
          meta = n ? `${n} lines` : null;
        } else if (item.verb === 'run') {
          const passed = /(\d+) passed/.exec(ev.output);
          meta = passed ? `✓ ${passed[1]} passed` : `${(durationMs / 1000).toFixed(1)}s`;
        }
        if (ok && item.verb === 'edit') this.touched.add(item.target);
        this.put({ ...item, status: ok ? 'ok' : 'failed', meta: meta ?? item.meta, durationMs });
        break;
      }
      case 'result':
        this.flushText();
        this.put({
          kind: 'turn-end',
          id: `end_${this.turnId}`,
          at: now,
          turnId: this.turnId,
          ok: ev.ok,
          stopped: ev.stopped,
          error: ev.error,
          durationMs: ev.durationMs,
        });
        break;
      case 'session':
        break;
    }
  }

  private setTool(toolUseId: string, patch: Partial<Extract<ChatItem, { kind: 'tool' }>>): void {
    const item = this.items.get(toolUseId);
    if (item?.kind === 'tool') this.put({ ...item, ...patch });
  }

  /** canUseTool: policy, blocked commands, session rules, then an approval card. */
  async permission(
    tool: string,
    input: Record<string, unknown>,
    toolUseId: string,
  ): Promise<PermissionAnswer> {
    const policy = this.o.policy?.(tool, input) ?? 'ask';
    if (policy === 'allow') return { allow: true };
    if (typeof policy === 'object') {
      this.setTool(toolUseId, { status: 'denied', meta: policy.deny });
      return { allow: false, message: policy.deny };
    }

    let draft: ApprovalDraft;
    let ruleKeys: string[];
    const base = { projectId: this.o.projectId, source: this.o.source, tool, cwd: this.o.cwd };
    if (EDIT_TOOLS.has(tool)) {
      const target =
        typeof input.file_path === 'string'
          ? input.file_path
          : typeof input.notebook_path === 'string'
            ? input.notebook_path
            : '';
      if (!this.inside(target)) {
        const reason = `Apeiron only allows edits inside the project. ${target} is outside it.`;
        this.setTool(toolUseId, { status: 'denied', meta: 'outside the project' });
        return { allow: false, message: reason };
      }
      const file = editPreview(this.o.cwd, tool, input);
      const files = file ? [file] : [];
      draft = {
        ...base,
        kind: 'edit',
        title: `Claude wants to edit ${files.length || 1} file${files.length > 1 ? 's' : ''}`,
        files,
        command: null,
        detail: null,
      };
      ruleKeys = files.map((f) => `edit:${f.path}`);
      if (file) this.setTool(toolUseId, { added: file.added, removed: file.removed });
    } else if (tool === 'Bash') {
      const command = typeof input.command === 'string' ? input.command : '';
      const verdict = classifyCommand(command, this.o.cwd);
      if (verdict.blocked) {
        this.setTool(toolUseId, { status: 'denied', meta: verdict.reason });
        return { allow: false, message: `${verdict.reason} Do not try to work around this rule.` };
      }
      draft = {
        ...base,
        kind: 'command',
        title: 'Claude wants to run a command',
        files: [],
        command,
        detail: null,
      };
      ruleKeys = [`run:${command}`];
    } else {
      draft = {
        ...base,
        kind: 'other',
        title: `Claude wants to use ${tool}`,
        files: [],
        command: null,
        detail: JSON.stringify(input, null, 2).slice(0, 4000),
      };
      ruleKeys = [`tool:${tool}`];
    }

    if (this.o.approvals.isAllowedBySession(this.o.source, ruleKeys)) return { allow: true };

    const { approval, done } = this.o.approvals.request(draft, this.o.source, ruleKeys);
    this.setTool(toolUseId, { status: 'waiting', approvalId: approval.id });
    this.putApproval(approval);
    const answered = await done;
    this.putApproval(answered);
    if (answered.status === 'allowed' || answered.status === 'allowed_session') {
      this.setTool(toolUseId, { status: 'running', at: Date.now() });
      return { allow: true };
    }
    const message =
      answered.status === 'cancelled'
        ? `The request was cancelled (${answered.reason ?? 'session stopped'}).`
        : answered.reason
          ? `The user denied this: ${answered.reason}`
          : 'The user denied this. Ask what they want instead.';
    this.setTool(toolUseId, {
      status: 'denied',
      meta: answered.status === 'cancelled' ? 'cancelled' : 'denied',
    });
    return { allow: false, message };
  }

  private putApproval(approval: Approval): void {
    this.put({
      kind: 'approval',
      id: approval.id,
      at: approval.createdAt,
      turnId: this.turnId,
      approval,
    });
  }

  /** ask_decision: validate, show the card, wait for the answer. */
  async decision(input: unknown): Promise<DecisionReply> {
    this.flushText();
    const parsed = DecisionCardInputSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        error: `The card is not valid, fix it and call ask_decision again: ${parsed.error.issues.map((i) => i.message).join('; ')}`,
      };
    }
    const id = this.o.decisions.newId();
    const card = { ...parsed.data, id, label: `Decision · ${parsed.data.topic}` };
    const item: ChatItem = {
      kind: 'decision',
      id,
      at: Date.now(),
      turnId: this.turnId,
      card,
      status: 'open',
      answer: null,
    };
    this.put(item);
    const answer = await this.o.decisions.wait(card, this.o.source);
    if (!answer) {
      this.put({ ...item, status: 'cancelled' });
      return { ok: false, error: 'The user stopped the session before answering.' };
    }
    this.put({ ...item, status: 'confirmed', answer: answer.label });
    return { ok: true, text: answer.text };
  }
}
