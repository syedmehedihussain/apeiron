import { Plus, X } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import type { Agent } from '@apeiron/shared';
import { ApiFailure } from '../../api/client.ts';
import { startAgent, useAgentDiff, useAgents, useLiveAgents } from '../../api/agents.ts';
import { AgentCard } from '../AgentCard/AgentCard.tsx';
import { FileDiff } from '../ApprovalCard/ApprovalCard.tsx';
import styles from './AgentsPanel.module.css';

type Model = 'sonnet' | 'opus' | 'haiku';

/** Right column tabs: Agents (M7) and Magnet. */
export function AgentsPanel({
  projectId,
  branch,
  now,
  magnet,
}: {
  projectId: string;
  branch: string | null;
  now: number;
  magnet: ReactNode;
}) {
  const [tab, setTab] = useState<'agents' | 'magnet'>('agents');
  const agents = useAgents(projectId);
  useLiveAgents(projectId);
  const [params] = useSearchParams();
  const focus = params.get('agent');
  const [adding, setAdding] = useState(false);
  const [diffOf, setDiffOf] = useState<Agent | null>(null);
  const list = agents.data?.agents ?? [];
  const running = list.filter((a) => a.status === 'running' || a.status === 'waiting').length;

  useEffect(() => {
    if (!focus) return;
    document.getElementById(`agent-${focus}`)?.scrollIntoView({ block: 'nearest' });
  }, [focus, list.length]);

  return (
    <>
      <nav className={styles.tabs} role="tablist" aria-label="Agents and Magnet">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'agents'}
          className={styles.tab}
          onClick={() => setTab('agents')}
        >
          Agents <span className={styles.count}>{list.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'magnet'}
          className={styles.tab}
          onClick={() => setTab('magnet')}
        >
          Magnet
        </button>
      </nav>
      {tab === 'magnet' ? (
        magnet
      ) : (
        <div className={styles.body} role="tabpanel" aria-label="Agents">
          {adding ? (
            <NewAgentForm
              projectId={projectId}
              branch={branch}
              full={!!agents.data && running >= agents.data.maxRunning}
              onDone={() => setAdding(false)}
            />
          ) : (
            <button type="button" className={styles.newAgent} onClick={() => setAdding(true)}>
              <Plus size={14} aria-hidden="true" />
              New agent
            </button>
          )}
          {list.length === 0 && !adding && (
            <p className={styles.empty}>
              Agents work on a task on their own branch while you keep chatting. You review the diff
              before anything lands.
            </p>
          )}
          {list.map((a) => (
            <AgentCard
              key={a.id}
              agent={a}
              now={now}
              focus={a.id === focus}
              onReviewDiff={setDiffOf}
            />
          ))}
        </div>
      )}
      {diffOf && <DiffDialog agent={diffOf} onClose={() => setDiffOf(null)} />}
    </>
  );
}

function NewAgentForm({
  projectId,
  branch,
  full,
  onDone,
}: {
  projectId: string;
  branch: string | null;
  full: boolean;
  onDone(): void;
}) {
  const [task, setTask] = useState('');
  const [model, setModel] = useState<Model>('sonnet');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const start = async () => {
    if (task.trim().length < 3) return;
    setBusy(true);
    setError(null);
    try {
      await startAgent(projectId, { task: task.trim(), model });
      onDone();
    } catch (e) {
      setError(e instanceof ApiFailure ? e.message : 'Could not start the agent.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <form
      className={styles.form}
      aria-label="New agent"
      onSubmit={(e) => {
        e.preventDefault();
        void start();
      }}
    >
      <label className={styles.field}>
        <span>Task</span>
        <textarea
          rows={3}
          autoFocus
          value={task}
          placeholder="Write tests for the streak service"
          onChange={(e) => setTask(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void start();
            if (e.key === 'Escape') onDone();
          }}
        />
      </label>
      <div className={styles.formRow}>
        <label className={styles.model}>
          <span className="sr-only">Model</span>
          <select value={model} onChange={(e) => setModel(e.target.value as Model)}>
            <option value="sonnet">Sonnet</option>
            <option value="opus">Opus</option>
            <option value="haiku">Haiku</option>
          </select>
        </label>
        <span className={styles.spacer} />
        <button type="button" className="btn btn-ghost btn-sm" onClick={onDone}>
          Cancel
        </button>
        <button
          type="submit"
          className="btn btn-primary btn-sm"
          disabled={busy || task.trim().length < 3}
        >
          {busy ? 'Starting…' : 'Start'}
        </button>
      </div>
      <p className={styles.hint}>
        Starts from your last commit{branch ? ` on ${branch}` : ''}, in its own worktree. Edits
        there need no approval; commands do.
        {full && ' All agent slots are busy, so it will wait in the queue.'}
      </p>
      {error && <p className={styles.error}>{error}</p>}
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
