import { useCallback, useEffect, useRef, useState } from 'react';
import { PHASES, PHASE_LABEL, type Task, type TaskStatus } from '@cherry/shared';
import { queryClient } from '../../api/queries.ts';
import { saveNotes, setTaskStatus, useNotes, useTasks, wk } from '../../api/workspace.ts';
import styles from './Workspace.module.css';

/** Notes & Tasks (not designed; built from the component sheet, screens.md §4). */
export function NotesTab({ projectId, stacked }: { projectId: string; stacked?: boolean }) {
  return (
    <div className={styles.notes} data-stacked={stacked || undefined}>
      <NotesEditor projectId={projectId} />
      <TaskList projectId={projectId} />
    </div>
  );
}

function NotesEditor({ projectId }: { projectId: string }) {
  const notes = useNotes(projectId);
  const [generation, setGeneration] = useState(0);
  if (!notes.data) {
    return (
      <section className={styles.notesCol} aria-labelledby="notes-h">
        <div className={styles.colHead}>
          <h2 id="notes-h">Notes</h2>
        </div>
        <span className="shimmer" style={{ flex: 1, minHeight: 300 }} />
      </section>
    );
  }
  return (
    <NotesEditorLoaded
      key={`${projectId}:${generation}`}
      projectId={projectId}
      initial={notes.data.content}
      initialMtime={notes.data.mtime}
      onReload={() => {
        void queryClient
          .invalidateQueries({ queryKey: wk.notes(projectId) })
          .then(() => setGeneration((g) => g + 1));
      }}
    />
  );
}

function NotesEditorLoaded({
  projectId,
  initial,
  initialMtime,
  onReload,
}: {
  projectId: string;
  initial: string;
  initialMtime: number | null;
  onReload(): void;
}) {
  const [text, setText] = useState(initial);
  const [state, setState] = useState<'saved' | 'saving' | 'unsaved' | 'error'>('saved');
  const [error, setError] = useState<string | null>(null);
  const mtime = useRef<number | null>(initialMtime);
  const timer = useRef<number | null>(null);
  const pending = useRef<string | null>(null);

  const save = useCallback(
    async (value: string) => {
      setState('saving');
      try {
        const res = await saveNotes(projectId, value, mtime.current);
        mtime.current = res.mtime;
        setState(pending.current === null ? 'saved' : 'unsaved');
        setError(null);
      } catch (e) {
        setState('error');
        setError((e as Error).message);
      }
    },
    [projectId],
  );

  const flush = useCallback(() => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
    if (pending.current !== null) {
      const value = pending.current;
      pending.current = null;
      void save(value);
    }
  }, [save]);

  const onChange = (value: string) => {
    setText(value);
    setState('unsaved');
    pending.current = value;
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, 700);
  };

  // Save what is left when the tab closes or the page goes away.
  useEffect(() => {
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [flush]);

  return (
    <section className={styles.notesCol} aria-labelledby="notes-h">
      <div className={styles.colHead}>
        <h2 id="notes-h">Notes</h2>
        <span className={styles.muted}>
          <span className="mono">_project/notes.md</span> ·{' '}
          {state === 'saving'
            ? 'Saving…'
            : state === 'unsaved'
              ? 'Unsaved'
              : state === 'error'
                ? 'Not saved'
                : 'Saved'}
        </span>
      </div>
      {error && (
        <p className={styles.error} role="alert">
          {error}{' '}
          <button type="button" className="btn btn-ghost btn-sm" onClick={onReload}>
            Reload
          </button>
        </p>
      )}
      <label htmlFor="notes-editor" className="sr-only">
        Notes for this project
      </label>
      <textarea
        id="notes-editor"
        className={styles.notesEditor}
        placeholder="Your own notes for this project. Plain Markdown. Only you write here."
        value={text}
        onChange={(e) => onChange(e.target.value)}
        onBlur={flush}
      />
    </section>
  );
}

const NEXT: Record<TaskStatus, TaskStatus> = {
  todo: 'doing',
  doing: 'done',
  done: 'todo',
  skipped: 'todo',
};

function TaskList({ projectId }: { projectId: string }) {
  const tasks = useTasks(projectId);
  const list = tasks.data?.tasks ?? [];

  const cycle = async (t: Task) => {
    const res = await setTaskStatus(projectId, t.id, NEXT[t.status]);
    queryClient.setQueryData(wk.tasks(projectId), res);
  };

  return (
    <section className={styles.notesCol} aria-labelledby="tasks-h">
      <div className={styles.colHead}>
        <h2 id="tasks-h">Tasks</h2>
        <span className={styles.muted}>
          {list.filter((t) => t.status === 'done').length} of {list.length} done
        </span>
      </div>
      {tasks.data && list.length === 0 && (
        <p className={styles.muted}>
          No task graph yet. The survey and calibration create one in{' '}
          <span className="mono">_project/tasks.json</span>.
        </p>
      )}
      {PHASES.map((phase) => {
        const items = list.filter((t) => t.phase === phase);
        if (items.length === 0) return null;
        return (
          <div key={phase} className={styles.taskGroup}>
            <div className="label">{PHASE_LABEL[phase]}</div>
            {items.map((t) => (
              <button
                key={t.id}
                type="button"
                className={styles.task}
                data-status={t.status}
                onClick={() => void cycle(t)}
              >
                <span className={styles.taskBox} aria-hidden="true" />
                <span className={styles.taskTitle}>{t.title}</span>
                <span className={styles.taskStatus}>
                  {t.status === 'doing'
                    ? 'In progress'
                    : t.status === 'done'
                      ? 'Done'
                      : t.status === 'skipped'
                        ? 'Skipped'
                        : 'To do'}
                </span>
              </button>
            ))}
          </div>
        );
      })}
    </section>
  );
}
