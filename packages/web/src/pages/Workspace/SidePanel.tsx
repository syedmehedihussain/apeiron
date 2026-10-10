import { ChevronRight } from 'lucide-react';
import { create } from 'zustand';
import { useTasks } from '../../api/workspace.ts';
import { AgentsPanel } from '../../components/AgentsPanel/AgentsPanel.tsx';
import { GitPanel } from '../../components/GitHubBox/GitPanel.tsx';
import { MagnetChat } from '../../components/MagnetChat/MagnetChat.tsx';
import { NotesTab } from './NotesTab.tsx';
import styles from './SidePanel.module.css';

const VIEWS = [
  ['overview', 'Overview'],
  ['github', 'GitHub'],
  ['agents', 'Agents'],
  ['magnet', 'Magnet'],
  ['notes', 'Notes'],
] as const;

type View = (typeof VIEWS)[number][0];

const KEY = 'apeiron.sideView';

function readView(): View {
  try {
    const v = localStorage.getItem(KEY);
    return VIEWS.some(([id]) => id === v) ? (v as View) : 'overview';
  } catch {
    return 'overview';
  }
}

/** The chosen view stays the same across projects and reloads. */
const useSideView = create<{ view: View; set(v: View): void }>((set) => ({
  view: readView(),
  set: (view) => {
    try {
      localStorage.setItem(KEY, view);
    } catch {
      // Private window: the choice just isn't remembered.
    }
    set({ view });
  },
}));

/** Right column of the workspace: a row of views, one shown at a time. */
export function SidePanel({
  projectId,
  branch,
  now,
}: {
  projectId: string;
  branch: string | null;
  now: number;
}) {
  const view = useSideView((s) => s.view);
  const setView = useSideView((s) => s.set);
  const label = VIEWS.find(([id]) => id === view)?.[1];

  return (
    <>
      <nav className={styles.views} role="tablist" aria-label="Side panel">
        {VIEWS.map(([id, name]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={view === id}
            className={styles.view}
            onClick={() => setView(id)}
          >
            {name}
          </button>
        ))}
      </nav>
      <div className={styles.body} role="tabpanel" aria-label={label}>
        {view === 'overview' && (
          <>
            <div className={styles.pad}>
              <GitPanel key={projectId} projectId={projectId} now={now} />
              <TasksLine projectId={projectId} onOpen={() => setView('notes')} />
            </div>
            <AgentsPanel
              projectId={projectId}
              branch={branch}
              now={now}
              limit={3}
              onSeeAll={() => setView('agents')}
            />
          </>
        )}
        {view === 'github' && (
          <div className={styles.scroll}>
            <GitPanel key={projectId} projectId={projectId} now={now} full />
          </div>
        )}
        {view === 'agents' && <AgentsPanel projectId={projectId} branch={branch} now={now} />}
        {view === 'magnet' && <MagnetChat projectId={projectId} />}
        {view === 'notes' && <NotesTab projectId={projectId} stacked />}
      </div>
    </>
  );
}

/** One line on the Overview: how far the task list is, and what is next. */
function TasksLine({ projectId, onOpen }: { projectId: string; onOpen(): void }) {
  const tasks = useTasks(projectId);
  const list = tasks.data?.tasks ?? [];
  if (list.length === 0) return null;
  const done = list.filter((t) => t.status === 'done' || t.status === 'skipped').length;
  const next = list.find((t) => t.status === 'doing') ?? list.find((t) => t.status === 'todo');
  return (
    <button type="button" className={styles.tasks} onClick={onOpen}>
      <span className={styles.tasksCount}>
        {done}/{list.length} tasks
      </span>
      <span className={styles.tasksNext} title={next?.title}>
        {next ? `Next: ${next.title}` : 'All done'}
      </span>
      <ChevronRight size={13} aria-hidden="true" />
    </button>
  );
}
