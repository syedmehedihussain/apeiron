import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import type { Agent } from '@cherry/shared';
import { ApiFailure } from '../../api/client.ts';
import { startAgent, useAgentDiff, useAgents, useLiveAgents } from '../../api/agents.ts';
import { AgentCard } from '../AgentCard/AgentCard.tsx';
import { FileDiff } from '../ApprovalCard/ApprovalCard.tsx';
import { ScanAgents } from '../ScanAgents/ScanAgents.tsx';
import styles from './AgentsPanel.module.css';

type Model = 'sonnet' | 'opus' | 'haiku';

/** Right column under the GitHub box: a timeline of agents and a task box to start one. */
export function AgentsPanel({
  projectId,
  branch,
  now,
  limit,
  onSeeAll,
}: {
  projectId: string;
  branch: string | null;
  now: number;
  /** Show only the newest few (the Overview); the rest are one click away. */
  limit?: number;
  onSeeAll?(): void;
}) {
  const agents = useAgents(projectId);
  useLiveAgents(projectId);
  const [params] = useSearchParams();
  const focus = params.get('agent');
  const [diffOf, setDiffOf] = useState<Agent | null>(null);
  const list = agents.data?.agents ?? [];
  const shown = limit ? list.slice(0, limit) : list;
  const running = list.filter((a) => a.status === 'running' || a.status === 'waiting').length;

  useEffect(() => {
    if (!focus) return;
    document.getElementById(`agent-${focus}`)?.scrollIntoView({ block: 'nearest' });
  }, [focus, list.length]);

  return (
    <section className={styles.panel} aria-label="Agents">
      {!limit && <ScanAgents projectId={projectId} now={now} />}
      <div className={styles.feed}>
        {!limit && (
          <div className="label" style={{ padding: '8px 0 6px' }}>
            Tasks
          </div>
        )}
        {list.length === 0 ? (
          <p className={styles.empty}>
            Give an agent a task below. It works on its own branch while you keep chatting, and you
            review the diff before anything lands.
          </p>
        ) : (
          shown.map((a, i) => (
            <AgentCard
              key={a.id}
              agent={a}
              now={now}
              last={i === shown.length - 1}
              focus={a.id === focus}
              onReviewDiff={setDiffOf}
            />
          ))
        )}
        {shown.length < list.length && onSeeAll && (
          <button type="button" className={styles.seeAll} onClick={onSeeAll}>
            All {list.length} agents →
          </button>
        )}
      </div>
      <TaskBox
        projectId={projectId}
        branch={branch}
        full={!!agents.data && running >= agents.data.maxRunning}
      />
      {diffOf && <DiffDialog agent={diffOf} onClose={() => setDiffOf(null)} />}
    </section>
  );
}

function TaskBox({
  projectId,
  branch,
  full,
}: {
  projectId: string;
  branch: string | null;
  full: boolean;
}) {
  const [task, setTask] = useState('');
  const [model, setModel] = useState<Model>('sonnet');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = task.trim().length >= 3 && !busy;
  const start = async () => {
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      await startAgent(projectId, { task: task.trim(), model });
      setTask('');
    } catch (e) {
      setError(e instanceof ApiFailure ? e.message : 'Could not start the agent.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <form
      className={styles.box}
      aria-label="New agent"
      onSubmit={(e) => {
        e.preventDefault();
        void start();
      }}
    >
      <textarea
        className={styles.text}
        rows={2}
        value={task}
        aria-label="Task"
        placeholder="Give an agent a task…"
        title={`Starts from your last commit${branch ? ` on ${branch}` : ''}, in its own worktree. Edits there need no approval; commands do.`}
        onChange={(e) => setTask(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            void start();
          }
        }}
      />
      {full && (
        <p className={styles.hint}>All agent slots are busy, so it will wait in the queue.</p>
      )}
      {error && <p className={styles.error}>{error}</p>}
      <div className={styles.row}>
        <label className={styles.model}>
          <span className="sr-only">Model</span>
          <select value={model} onChange={(e) => setModel(e.target.value as Model)}>
            <option value="sonnet">Sonnet</option>
            <option value="opus">Opus</option>
            <option value="haiku">Haiku</option>
          </select>
        </label>
        <span className={styles.spacer} />
        <button type="submit" className={styles.send} disabled={!ready}>
          {busy ? 'Starting…' : 'Start'}
        </button>
      </div>
    </form>
  );
}

function DiffDialog({ agent, onClose }: { agent: Agent; onClose(): void }) {
  const diff = useAgentDiff(agent.id);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className={styles.overlay} onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Diff of ${agent.branch}`}
        className={styles.dialog}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.dialogHead}>
          <div>
            <h3>{agent.task}</h3>
            <span className={styles.hint}>
              <span className="mono">{agent.branch}</span> →{' '}
              <span className="mono">{agent.baseBranch}</span>
            </span>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            aria-label="Close"
            onClick={onClose}
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>
        <div className={styles.dialogBody}>
          {diff.isPending && <span className="shimmer" style={{ height: 120 }} />}
          {diff.data?.files.length === 0 && <p className={styles.hint}>No changes.</p>}
          {diff.data?.files.map((f) => (
            <FileDiff key={f.path} file={f} defaultOpen />
          ))}
        </div>
      </div>
    </div>
  );
}
