import { randomUUID } from 'node:crypto';
import type { Approval, ApprovalAnswer } from '@cherry/shared';
import type { Db } from '../db.ts';
import type { EventHub } from '../events.ts';
import { notFound, conflict } from '../http.ts';

export type ApprovalDraft = Omit<Approval, 'id' | 'status' | 'reason' | 'createdAt' | 'answeredAt'>;

interface Pending {
  approval: Approval;
  resolve(a: Approval): void;
}

/**
 * Holds pending approvals and routes answers back (claude-runner.md → Approvals). No timeout:
 * Claude waits. "Allow for this session" rules live in memory only, keyed by session.
 */
export class ApprovalBroker {
  private readonly pending = new Map<string, Pending>();
  private readonly rules = new Map<string, Set<string>>();

  constructor(
    private readonly db: Db,
    private readonly hub: EventHub,
  ) {
    // Nothing can be waiting on an approval from a previous daemon run.
    db.prepare(
      `UPDATE approvals SET status = 'cancelled', answered_at = ? WHERE status = 'pending'`,
    ).run(Date.now());
  }

  isAllowedBySession(sessionKey: string, ruleKeys: string[]): boolean {
    const set = this.rules.get(sessionKey);
    return !!set && ruleKeys.length > 0 && ruleKeys.every((k) => set.has(k));
  }

  clearSession(sessionKey: string): void {
    this.rules.delete(sessionKey);
  }

  /** Creates the approval and resolves when the user answers (or it is cancelled). */
  request(
    draft: ApprovalDraft,
    sessionKey: string,
    ruleKeys: string[],
  ): { approval: Approval; done: Promise<Approval> } {
    const approval: Approval = {
      ...draft,
      id: `ap_${randomUUID().slice(0, 12)}`,
      status: 'pending',
      reason: null,
      createdAt: Date.now(),
      answeredAt: null,
    };
    this.db
      .prepare(
        'INSERT INTO approvals (id, session_id, project_id, kind, payload_json, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        approval.id,
        sessionKey,
        approval.projectId,
        approval.kind,
        JSON.stringify(approval),
        'pending',
        approval.createdAt,
      );
    const done = new Promise<Approval>((resolve) => {
      this.pending.set(approval.id, {
        approval,
        resolve: (a) => {
          if (a.status === 'allowed_session') {
            const set = this.rules.get(sessionKey) ?? new Set<string>();
            ruleKeys.forEach((k) => set.add(k));
            this.rules.set(sessionKey, set);
          }
          resolve(a);
        },
      });
    });
    this.hub.publish(['approvals', `project:${approval.projectId}`], 'approval.requested', {
      approval,
    });
    return { approval, done };
  }

  answer(id: string, answer: ApprovalAnswer): Approval {
    const p = this.pending.get(id);
    if (!p) {
      const row = this.db.prepare('SELECT status FROM approvals WHERE id = ?').get(id) as
        { status: string } | undefined;
      if (!row) throw notFound(`No approval ${id}`);
      throw conflict(`This approval was already ${row.status}.`);
    }
    const status =
      answer.answer === 'allow'
        ? 'allowed'
        : answer.answer === 'allow_session'
          ? 'allowed_session'
          : 'denied';
    return this.finish(p, status, answer.reason?.trim() || null);
  }

  /** Cancels every pending approval from one source (session stopped) or all of them. */
  cancel(source?: string, reason = 'Cancelled'): void {
    for (const p of [...this.pending.values()]) {
      if (!source || p.approval.source === source) this.finish(p, 'cancelled', reason);
    }
  }

  list(status?: Approval['status']): Approval[] {
    if (status === 'pending') return [...this.pending.values()].map((p) => p.approval);
    const rows = this.db
      .prepare('SELECT payload_json FROM approvals ORDER BY created_at DESC LIMIT 200')
      .all() as { payload_json: string }[];
    return rows
      .map((r) => JSON.parse(r.payload_json) as Approval)
      .filter((a) => !status || a.status === status);
  }

  private finish(p: Pending, status: Approval['status'], reason: string | null): Approval {
    this.pending.delete(p.approval.id);
    const done: Approval = { ...p.approval, status, reason, answeredAt: Date.now() };
    this.db
      .prepare('UPDATE approvals SET status = ?, payload_json = ?, answered_at = ? WHERE id = ?')
      .run(status, JSON.stringify(done), done.answeredAt, done.id);
    this.hub.publish(['approvals', `project:${done.projectId}`], 'approval.resolved', {
      approval: done,
    });
    p.resolve(done);
    return done;
  }
}
