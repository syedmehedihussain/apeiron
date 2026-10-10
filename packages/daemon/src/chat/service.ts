import { randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';
import path from 'node:path';
import type { ChatSend, ChatState, Phase } from '@apeiron/shared';
import type { ConfigStore } from '../config.ts';
import type { Db } from '../db.ts';
import type { EventHub } from '../events.ts';
import { conflict } from '../http.ts';
import type { ApprovalBroker } from '../claude/approvals.ts';
import { Conversation } from '../claude/conversation.ts';
import type { DecisionBroker } from '../claude/decisions.ts';
import { READ_TOOLS, type RunHandle, type Runner } from '../claude/runner.ts';
import { Transcript } from '../claude/transcript.ts';
import { readProjectFiles } from '../projects/scanner.ts';
import { projectDir } from '../projects/workspace.ts';
import { recordUsage } from '../usage.ts';
import { UPLOADS_DIR, saveUpload, uploadPath } from './uploads.ts';

/** Tells Claude where the attached files are; it opens them with Read (images too). */
export function withAttachments(text: string, attachments: string[]): string {
  if (!attachments.length) return text;
  return [
    text,
    '',
    `The user attached ${attachments.length === 1 ? 'a file' : `${attachments.length} files`}. Read ${attachments.length === 1 ? 'it' : 'them'} with the Read tool before you answer:`,
    ...attachments.map((a) => `- ${UPLOADS_DIR}/${a}`),
  ].join('\n');
}

export function chatSystemPrompt(phase: Phase | null): string {
  return [
    'You are working inside Apeiron, a workspace that follows a strict engineering process.',
    '- Read CLAUDE.md and _project/STATUS.md before anything else, when they exist.',
    '- When there is a real choice to make, call the ask_decision tool. Do not pick for the user.',
    '- Keep answers short and plain. Name the file, then the change.',
    '- Every edit and command is shown to the user for approval. If they deny one, ask what they want instead.',
    phase
      ? `- Current phase: ${phase}. Do not write production code in the plan or design phase.`
      : '- The project phase is unknown.',
  ].join('\n');
}

interface Live {
  conversationId: string;
  claudeSessionId: string | null;
  conversation: Conversation;
  model: string;
  startedAt: number;
  turns: number;
  running: RunHandle | null;
  turnId: string | null;
}

/** One chat conversation per project at a time; resumes across reloads and restarts. */
export class ChatService {
  private readonly live = new Map<string, Live>();

  constructor(
    private readonly config: ConfigStore,
    private readonly db: Db,
    private readonly hub: EventHub,
    private readonly approvals: ApprovalBroker,
    private readonly decisions: DecisionBroker,
    private readonly runner: Runner,
    private readonly home: string,
  ) {}

  private transcriptFile(conversationId: string): string {
    return path.join(this.home, 'transcripts', `${conversationId}.jsonl`);
  }

  private open(
    projectId: string,
    conversationId: string,
    claudeSessionId: string | null,
    model: string,
    startedAt: number,
    turns: number,
  ): Live {
    const dir = projectDir(this.config.projectsDir(), projectId);
    const topic = `project:${projectId}`;
    const conversation = new Conversation({
      projectId,
      cwd: dir,
      source: `chat:${conversationId}`,
      transcript: new Transcript(this.transcriptFile(conversationId)),
      approvals: this.approvals,
      decisions: this.decisions,
      onItem: (item) => this.hub.publish(topic, 'chat.item', { projectId, conversationId, item }),
      onDelta: (itemId, turnId, text) =>
        this.hub.publish(topic, 'chat.delta', { projectId, conversationId, itemId, turnId, text }),
    });
    const live: Live = {
      conversationId,
      claudeSessionId,
      conversation,
      model,
      startedAt,
      turns,
      running: null,
      turnId: null,
    };
    this.live.set(projectId, live);
    return live;
  }

  /** The current conversation, loading the latest one from disk after a restart. */
  private current(projectId: string): Live | null {
    const cached = this.live.get(projectId);
    if (cached) return cached;
    const row = this.db
      .prepare(
        `SELECT id, claude_session_id, model, started_at, title FROM sessions WHERE project_id = ? AND kind = 'chat' AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1`,
      )
      .get(projectId) as
      | { id: string; claude_session_id: string | null; model: string; started_at: number }
      | undefined;
    if (!row) return null;
    const turns = (
      this.db
        .prepare(`SELECT COUNT(*) AS n FROM sessions WHERE project_id = ? AND kind = 'chat'`)
        .get(projectId) as { n: number }
    ).n;
    const live = this.open(
      projectId,
      row.id,
      row.claude_session_id,
      row.model,
      row.started_at,
      turns,
    );
    live.conversation.closeInterrupted(
      'Apeiron restarted while Claude was working, so this turn stopped. Send a message (for example "continue") to pick up where it left off.',
    );
    return live;
  }

  state(projectId: string): ChatState {
    projectDir(this.config.projectsDir(), projectId);
    const live = this.current(projectId);
    const sessionNumber = (
      this.db
        .prepare(`SELECT COUNT(*) AS n FROM sessions WHERE project_id = ? AND kind = 'chat'`)
        .get(projectId) as { n: number }
    ).n;
    return {
      conversationId: live?.conversationId ?? null,
      claudeSessionId: live?.claudeSessionId ?? null,
      running: !!live?.running,
      turnId: live?.turnId ?? null,
      model: live?.model ?? this.config.get().claude.defaultModel,
      startedAt: live?.startedAt ?? null,
      turns: sessionNumber,
      touched: live ? [...live.conversation.touched] : [],
      items: live?.conversation.list() ?? [],
    };
  }

  private publishState(projectId: string, live: Live | null): void {
    this.hub.publish(`project:${projectId}`, 'chat.state', {
      projectId,
      conversationId: live?.conversationId ?? null,
      running: !!live?.running,
      turnId: live?.turnId ?? null,
      touched: live ? [...live.conversation.touched] : [],
    });
  }

  send(projectId: string, body: ChatSend): { turnId: string; conversationId: string } {
    const dir = projectDir(this.config.projectsDir(), projectId);
    let live = this.current(projectId);
    if (live?.running)
      throw conflict('Claude is still working on the last message. Stop it first or wait.');
    for (const a of body.attachments) uploadPath(dir, a);
    const model = body.model ?? live?.model ?? this.config.get().claude.defaultModel;
    if (!live) {
      const conversationId = randomUUID();
      const now = Date.now();
      this.db
        .prepare(
          `INSERT INTO sessions (id, project_id, kind, title, model, started_at, transcript) VALUES (?, ?, 'chat', ?, ?, ?, ?)`,
        )
        .run(
          conversationId,
          projectId,
          body.text.slice(0, 80),
          model,
          now,
          this.transcriptFile(conversationId),
        );
      live = this.open(projectId, conversationId, null, model, now, 0);
      recordUsage(this.db, now, 0, true);
    }
    live.model = model;
    const turnId = randomUUID().slice(0, 12);
    const current = live;
    current.turnId = turnId;
    current.conversation.startTurn(turnId);
    current.conversation.addUser(`u_${turnId}`, body.text, body.attachments);

    const phase = readProjectFiles(dir).projectJson?.phase ?? null;
    let finished = false;
    const handle = this.runner({
      cwd: dir,
      prompt: withAttachments(body.text, body.attachments),
      resume: current.claudeSessionId,
      model,
      ...(body.effort && model !== 'haiku' ? { effort: body.effort } : {}),
      planMode: body.planMode,
      appendSystemPrompt: chatSystemPrompt(phase),
      allowedTools: READ_TOOLS,
      decisions: true,
      onPermission: (tool, input, id) => current.conversation.permission(tool, input, id),
      onDecision: (input) => current.conversation.decision(input),
      onEvent: (ev) => {
        if (ev.t === 'session' && ev.sessionId !== current.claudeSessionId) {
          current.claudeSessionId = ev.sessionId;
          this.db
            .prepare('UPDATE sessions SET claude_session_id = ?, model = ? WHERE id = ?')
            .run(ev.sessionId, model, current.conversationId);
        }
        current.conversation.handle(ev);
        if (ev.t === 'result') {
          finished = true;
          recordUsage(this.db, Date.now(), ev.durationMs, false);
          current.running = null;
          current.turnId = null;
          this.approvals.cancel(`chat:${current.conversationId}`, 'Turn ended');
          this.decisions.cancel(`chat:${current.conversationId}`);
          this.publishState(projectId, current);
        }
      },
    });
    // A runner may finish before it returns (the fake Claude does); only mark running if not.
    if (!finished) {
      current.running = handle;
      this.publishState(projectId, current);
    }
    return { turnId, conversationId: current.conversationId };
  }

  async stop(projectId: string): Promise<void> {
    const live = this.current(projectId);
    if (!live?.running) return;
    const source = `chat:${live.conversationId}`;
    this.approvals.cancel(source, 'Stopped by the user');
    this.decisions.cancel(source);
    await live.running.interrupt();
  }

  async newConversation(projectId: string): Promise<void> {
    const live = this.current(projectId);
    if (live) {
      await this.stop(projectId);
      this.db
        .prepare('UPDATE sessions SET ended_at = ? WHERE id = ?')
        .run(Date.now(), live.conversationId);
      this.approvals.clearSession(`chat:${live.conversationId}`);
      this.live.delete(projectId);
    }
    this.publishState(projectId, null);
  }

  upload(projectId: string, name: string, data: Buffer) {
    return saveUpload(projectDir(this.config.projectsDir(), projectId), name, data);
  }

  /** Deletes an upload that was never sent (the user removed its chip). */
  discardUpload(projectId: string, id: string): void {
    const file = this.uploadFile(projectId, id);
    const sent = this.current(projectId)
      ?.conversation.list(Infinity)
      .some((i) => i.kind === 'user' && i.attachments?.includes(id));
    if (sent) throw conflict('This file was already sent in a message, so it stays.');
    rmSync(file);
  }

  uploadFile(projectId: string, id: string): string {
    return uploadPath(projectDir(this.config.projectsDir(), projectId), id);
  }

  /** Stops every running turn (daemon shutdown). */
  async stopAll(): Promise<void> {
    await Promise.all([...this.live.keys()].map((id) => this.stop(id)));
  }
}
