import { Check, Clock, ShieldAlert, X } from 'lucide-react';
import { useState } from 'react';
import type { Agent } from '@apeiron/shared';
import { ApiFailure } from '../../api/client.ts';
import { answerApproval } from '../../api/chat.ts';
import { acceptAgent, discardAgent, retryAgent, stopAgent } from '../../api/agents.ts';
import { ApprovalCard } from '../ApprovalCard/ApprovalCard.tsx';
import { TimelineRow, type ToolItem } from '../Timeline/Timeline.tsx';
import styles from './AgentCard.module.css';

const MODEL: Record<string, string> = { sonnet: 'Sonnet', opus: 'Opus', haiku: 'Haiku' };

export function elapsed(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
}

/** "just now", "4m ago", "2h ago", "3d ago". */
export function ago(ms: number): string {
  const m = Math.floor(Math.max(0, ms) / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
}

const LABEL: Record<Agent['status'], string> = {
  queued: 'Queued',
  running: 'Running',
  waiting: 'Waiting',
  done: 'Done',
  failed: 'Failed',
  accepted: 'Accepted',
  discarded: 'Discarded',
};

/** The coloured circle on the timeline rail. */
function Node({ status }: { status: Agent['status'] }) {
  const p = { size: 11, strokeWidth: 2.4, 'aria-hidden': true } as const;
  return (
    <span className={styles.node} data-status={status}>
      {status === 'done' || status === 'accepted' ? (
        <Check {...p} />
      ) : status === 'failed' || status === 'discarded' ? (
        <X {...p} />
      ) : status === 'waiting' ? (
        <ShieldAlert {...p} strokeWidth={2} />
      ) : status === 'queued' ? (
        <Clock {...p} strokeWidth={2} />
      ) : (
        <span className={styles.dot} aria-hidden="true" />
      )}
    </span>
  );
}

interface AgentCardProps {
  agent: Agent;
  now: number;
  /** No rail line below the last item. */
  last?: boolean;
  /** Open the approval right away (arrived from a toast's Review). */
  focus?: boolean;
  onReviewDiff(agent: Agent): void;
}

export function AgentCard({ agent, now, last, focus, onReviewDiff }: AgentCardProps) {
  const [reviewing, setReviewing] = useState(!!focus);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tools = agent.activity.filter((i): i is ToolItem => i.kind === 'tool');
  const end = agent.endedAt ?? now;
  const act = async (name: string, fn: () => Promise<unknown>) => {
    setBusy(name);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof ApiFailure ? e.message : `Could not ${name}.`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <article
      className={styles.card}
      data-status={agent.status}
      aria-label={agent.task}
      id={`agent-${agent.id}`}
    >
      <div className={styles.rail} aria-hidden="true">
        <Node status={agent.status} />
        {!last && <span className={styles.line} />}
      </div>
      <div className={styles.content}>
        <div className={styles.head}>
          <h4 title={agent.task}>{agent.task}</h4>
          <span className={styles.time}>{ago(now - (agent.endedAt ?? agent.startedAt))}</span>
        </div>
        <div className={styles.meta}>
          <span className={styles.status} data-status={agent.status}>
            {LABEL[agent.status]}
          </span>
          <span>·</span>
          <span>{MODEL[agent.model] ?? agent.model}</span>
          <span>·</span>
          <span>
            {agent.status === 'queued' ? 'waiting for a free slot' : elapsed(end - agent.startedAt)}
          </span>
        </div>
        <span className={`mono ${styles.branch}`}>{agent.branch}</span>

        {agent.status === 'running' && tools.length > 0 && (
          <div className={styles.rows}>
            {tools.slice(-3).map((t, i, all) => (
              <TimelineRow key={t.id} item={t} last={i === all.length - 1} />
            ))}
          </div>
        )}

        {agent.status === 'waiting' && agent.waiting && !reviewing && (
          <div className={styles.ask}>
            <span>
              {agent.waiting.kind === 'command' ? (
                <>
                  Wants to run <span className="mono">{agent.waiting.command}</span>
                </>
              ) : (
                agent.waiting.title
              )}
            </span>
            <button type="button" onClick={() => setReviewing(true)}>
              Review
            </button>
          </div>
        )}
        {agent.status === 'waiting' && agent.waiting && reviewing && (
          <ApprovalCard
            approval={agent.waiting}
            now={now}
            compact
            autoFocus
            onAnswer={async (answer, reason) => {
              await answerApproval(agent.waiting!.id, { answer, ...(reason ? { reason } : {}) });
              setReviewing(false);
            }}
          />
        )}

        {agent.status === 'done' && (
          <>
            <p className={styles.summary}>
              {agent.summary ?? 'Finished.'}
              {agent.changes && agent.changes.files > 0 && (
                <span className={styles.stat}>
                  {' '}
                  {agent.changes.files} file{agent.changes.files === 1 ? '' : 's'} ·{' '}
                  <span className={styles.add}>+{agent.changes.added}</span>{' '}
                  <span className={styles.del}>−{agent.changes.removed}</span>
                </span>
              )}
            </p>
            <div className={styles.actions}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={!agent.changes?.files}
                onClick={() => onReviewDiff(agent)}
              >
                Review diff
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={!!busy || !agent.changes?.files}
                onClick={() => void act('accept', () => acceptAgent(agent.projectId, agent.id))}
              >
                {busy === 'accept' ? 'Merging…' : 'Accept'}
              </button>
              <span className={styles.spacer} />
              <button
                type="button"
                className={styles.discard}
                disabled={!!busy}
                onClick={() => void act('discard', () => discardAgent(agent.projectId, agent.id))}
              >
                Discard
              </button>
            </div>
          </>
        )}

        {agent.status === 'failed' && (
          <>
            <div className={styles.failed}>
              <span>{agent.error ?? 'The agent stopped.'}</span>
              <button
                type="button"
                disabled={!!busy}
                onClick={() => void act('retry', () => retryAgent(agent.projectId, agent.id))}
              >
                Try again
              </button>
            </div>
            <div className={styles.actions}>
              <span className={styles.spacer} />
              <button
                type="button"
                className={styles.discard}
                disabled={!!busy}
                onClick={() => void act('discard', () => discardAgent(agent.projectId, agent.id))}
              >
                Discard
              </button>
            </div>
          </>
        )}

        {(agent.status === 'running' || agent.status === 'queued') && (
          <div className={styles.actions}>
            <span className={styles.spacer} />
            <button
              type="button"
              className={styles.discard}
              disabled={!!busy}
              onClick={() => void act('stop', () => stopAgent(agent.projectId, agent.id))}
            >
              Stop
            </button>
          </div>
        )}
        {error && <p className={styles.error}>{error}</p>}
      </div>
    </article>
  );
}
