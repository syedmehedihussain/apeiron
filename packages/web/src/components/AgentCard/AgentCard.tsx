import { Check, X } from 'lucide-react';
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

function RunPill({ status }: { status: Agent['status'] }) {
  const label = {
    queued: 'Queued',
    running: 'Running',
    waiting: 'Waiting',
    done: 'Done',
    failed: 'Failed',
    accepted: 'Accepted',
    discarded: 'Discarded',
  }[status];
  return (
    <span className={styles.pill} data-status={status}>
      {status === 'done' || status === 'accepted' ? (
        <Check size={10} strokeWidth={3} aria-hidden="true" />
      ) : status === 'failed' ? (
        <X size={10} strokeWidth={3} aria-hidden="true" />
      ) : (
        <span className={styles.dot} aria-hidden="true" />
      )}
      {label}
    </span>
  );
}

interface AgentCardProps {
  agent: Agent;
  now: number;
  /** Open the approval right away (arrived from a toast's Review). */
  focus?: boolean;
  onReviewDiff(agent: Agent): void;
}

export function AgentCard({ agent, now, focus, onReviewDiff }: AgentCardProps) {
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
      <div className={styles.head}>
        <h4 title={agent.task}>{agent.task}</h4>
        <RunPill status={agent.status} />
      </div>
      <div className={styles.meta}>
        <span>{MODEL[agent.model] ?? agent.model}</span>
        <span>·</span>
        <span>
          {agent.status === 'queued' ? 'waiting for a free slot' : elapsed(end - agent.startedAt)}
        </span>
        <span>·</span>
        <span className="mono">{agent.branch}</span>
      </div>

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
    </article>
  );
}
