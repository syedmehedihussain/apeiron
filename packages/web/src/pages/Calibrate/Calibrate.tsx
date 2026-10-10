import { ArrowRight, Check, Eye, FolderCog, ShieldCheck } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import {
  relativeTime,
  type CalibrationState,
  type ChatItem,
  type ProposedFile,
} from '@cherry/shared';
import { ApiFailure } from '../../api/client.ts';
import {
  cancelCalibration,
  startCalibration,
  useCalibration,
  useLiveCalibration,
  writeCalibration,
} from '../../api/calibrate.ts';
import { answerDecision } from '../../api/chat.ts';
import { queryClient } from '../../api/queries.ts';
import { useGitInfo, useLiveProject, useProjectDetail, wk } from '../../api/workspace.ts';
import { DecisionCard } from '../../components/DecisionCard/DecisionCard.tsx';
import { FileTree } from '../../components/FileTree/FileTree.tsx';
import { GitHubBox } from '../../components/GitHubBox/GitHubBox.tsx';
import { Pill } from '../../components/Pill/Pill.tsx';
import { TimelineRow, type ToolItem } from '../../components/Timeline/Timeline.tsx';
import { TopBar } from '../../components/TopBar/TopBar.tsx';
import { tildify } from '../../lib/paths.ts';
import { useNow } from '../../lib/useNow.ts';
import styles from './Calibrate.module.css';

export function Calibrate() {
  const id = useParams().id ?? '';
  const cal = useCalibration(id);
  const detail = useProjectDetail(id);
  const git = useGitInfo(id);
  useLiveCalibration(id);
  useLiveProject(id);
  const now = useNow(1000);
  const s = cal.data;
  const card = detail.data?.card;
  const running = s && ['scanning', 'questions', 'drafting', 'writing'].includes(s.status);

  const read = useMemo(
    () =>
      new Set(
        (s?.items ?? [])
          .filter((i): i is ToolItem => i.kind === 'tool' && i.verb === 'read' && i.status === 'ok')
          .map((i) => i.target),
      ),
    [s?.items],
  );

  const pill =
    s?.status === 'proposal' ? (
      <Pill tone="warning" dot>
        Waiting for your review
      </Pill>
    ) : running ? (
      <Pill tone="accent" spin>
        Calibrating
      </Pill>
    ) : (
      <Pill tone="warning">Not calibrated</Pill>
    );

  return (
    <div className={styles.page}>
      <TopBar
        crumbs={[{ label: 'Projects', href: '/' }, { label: card?.name ?? id }]}
        status={pill}
        claude={running ? 'working' : undefined}
      />
      {running && <div className={styles.progress} role="progressbar" aria-label="Calibrating" />}
      {s?.status === 'proposal' || s?.status === 'writing' ? (
        <Review id={id} state={s} />
      ) : (
        <div className={styles.grid}>
          <FileTree
            projectId={id}
            projectPath={card ? tildify(card.path) : ''}
            selected={null}
            onOpen={() => undefined}
            touched={read}
          />
          <main className={styles.centre}>
            {!s ? null : s.status === 'idle' || s.status === 'done' ? (
              <Prompt id={id} name={card?.name ?? id} light={s.light} />
            ) : s.status === 'failed' ? (
              <Failed id={id} error={s.error} />
            ) : s.status === 'questions' ? (
              <Questions state={s} name={card?.name ?? id} />
            ) : (
              <Scan id={id} state={s} name={card?.name ?? id} now={now} />
            )}
          </main>
          <aside className={styles.right} aria-label="Repository">
            <GitHubBox git={git.data} now={now} compact />
            {s && s.status !== 'idle' && s.found.length > 0 ? (
              <section className={styles.found} aria-label="Found so far">
                <span className={styles.foundTitle}>Found so far</span>
                <div className={styles.tags}>
                  {s.found.map((f) => (
                    <span
                      key={f.label}
                      className="tag"
                      data-gap={f.gap || undefined}
                      style={
                        f.gap
                          ? { color: 'var(--warning)', borderColor: 'rgba(210,153,34,0.35)' }
                          : undefined
                      }
                    >
                      {f.label}
                    </span>
                  ))}
                </div>
              </section>
            ) : (
              <div className={styles.noAgents}>
                <span>No agents yet</span>
                <span>Agents become available after calibration.</span>
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}

function Prompt({ id, name, light }: { id: string; name: string; light: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      await startCalibration(id);
    } catch (e) {
      setError(e instanceof ApiFailure ? e.message : 'Could not start calibration.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className={styles.card}>
      <span className={styles.cardIcon}>
        <FolderCog size={18} strokeWidth={1.8} aria-hidden="true" />
      </span>
      <div>
        <h1>
          {light
            ? `${name} has notes but no Cherry setup yet.`
            : `${name} isn't set up for Cherry yet.`}
        </h1>
        <p className={styles.lead}>
          {light
            ? 'A light calibration keeps your STATUS.md and adds CLAUDE.md, docs, a project file and a task list.'
            : 'Calibration gives it the same structure as your other projects, so Claude knows where things stand next time.'}
        </p>
      </div>
      <div className={styles.box}>
        <span className={styles.boxTitle}>What calibration does</span>
        <ol className={styles.steps}>
          <li>
            <span>1</span>Reads your code, README and git history.
          </li>
          <li>
            <span>2</span>Asks you about anything it can't work out, like the current phase.
          </li>
          <li>
            <span>3</span>Proposes <code>CLAUDE.md</code>, docs and a status file for you to review.
          </li>
        </ol>
      </div>
      <div className={styles.box}>
        <span className={styles.boxTitle}>What it will not do</span>
        <ul className={styles.nots}>
          <li>
            <ShieldCheck size={14} aria-hidden="true" /> Never overwrites your files
          </li>
          <li>
            <Eye size={14} aria-hidden="true" /> Reads only until you approve
          </li>
        </ul>
      </div>
      {error && <p className={styles.error}>{error}</p>}
      <div className={styles.actions}>
        <button
          type="button"
          className="btn btn-primary btn-md"
          onClick={() => void start()}
          disabled={busy}
        >
          {busy ? 'Starting…' : 'Calibrate'}
        </button>
        <Link to="/" className="btn btn-ghost btn-md">
          Not now
        </Link>
        <span className={styles.spacer} />
        <span className={styles.muted}>Usually under 2 minutes</span>
      </div>
    </div>
  );
}

function Scan({
  id,
  state,
  name,
  now,
}: {
  id: string;
  state: CalibrationState;
  name: string;
  now: number;
}) {
  const tools = state.items.filter((i): i is ToolItem => i.kind === 'tool');
  const reads = tools.filter((t) => t.verb === 'read' && t.status === 'ok').length;
  const current = [...tools].reverse().find((t) => t.status === 'running');
  const drafting = state.status === 'drafting';
  return (
    <div className={styles.card}>
      <div>
        <div className={styles.kicker}>
          Calibrating {name} · step {drafting ? 3 : 1} of 3
        </div>
        <h1>{drafting ? 'Drafting the files' : 'Reading the project'}</h1>
        <p className={styles.lead}>
          Nothing is being written. You'll review every file before it is saved.
        </p>
      </div>
      <div className={styles.meter}>
        <div className={styles.meterHead}>
          <span>
            {drafting
              ? 'Writing the proposal'
              : current
                ? `Reading ${current.target}`
                : 'Starting…'}
          </span>
          <span className={styles.muted}>
            {reads} / {state.fileCount} files
          </span>
        </div>
        <div className={styles.bar}>
          <div className={styles.barFill} />
        </div>
      </div>
      <div className={styles.rows}>
        {tools.slice(-6).map((t, i, all) => (
          <TimelineRow key={t.id} item={t} last={i === all.length - 1} />
        ))}
      </div>
      {!drafting && (
        <div className={styles.then}>
          <span className={styles.boxTitle}>Then</span>
          <div>
            <span className={styles.num}>2</span>A few questions
          </div>
          <div>
            <span className={styles.num}>3</span>Review proposed files
          </div>
        </div>
      )}
      <div className={styles.actions}>
        <span className={styles.muted}>
          Started{' '}
          {state.startedAt
            ? relativeTime(state.startedAt, now).replace(
                'just now',
                `${Math.round((now - state.startedAt) / 1000)} s ago`,
              )
            : ''}
        </span>
        <span className={styles.spacer} />
        <button
          type="button"
          className="btn btn-secondary btn-md"
          onClick={() => void cancelCalibration(id)}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function Questions({ state, name }: { state: CalibrationState; name: string }) {
  const decisions = state.items.filter(
    (i): i is Extract<ChatItem, { kind: 'decision' }> => i.kind === 'decision',
  );
  return (
    <div className={styles.questions}>
      <div>
        <div className={styles.kicker}>Calibrating {name} · step 2 of 3</div>
        <h1>A few questions</h1>
        <p className={styles.lead}>Claude could not work these out from the code.</p>
      </div>
      {decisions.map((d) => (
        <DecisionCard
          key={d.id}
          card={d.card}
          state={d.status === 'open' ? 'open' : d.status}
          answer={d.answer}
          onConfirm={async (a) => {
            await answerDecision(d.id, a);
          }}
        />
      ))}
    </div>
  );
}

function Failed({ id, error }: { id: string; error: string | null }) {
  return (
    <div className={styles.card}>
      <h1>Calibration stopped</h1>
      <p className={styles.lead}>{error ?? 'Something went wrong.'} Nothing was written.</p>
      <div className={styles.actions}>
        <button
          type="button"
          className="btn btn-primary btn-md"
          onClick={() => void startCalibration(id)}
        >
          Try again
        </button>
        <Link to="/" className="btn btn-ghost btn-md">
          Back to Home
        </Link>
      </div>
    </div>
  );
}

function Review({ id, state }: { id: string; state: CalibrationState }) {
  const files = state.proposal?.files ?? [];
  const [ticked, setTicked] = useState<Set<string>>(
    () => new Set(files.filter((f) => !f.warning).map((f) => f.path)),
  );
  const [selected, setSelected] = useState<string>(files[0]?.path ?? '');
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const sel = files.find((f) => f.path === selected);
  const created = files.filter((f) => f.action === 'create').length;
  const appended = files.filter((f) => f.action === 'append');

  const write = async () => {
    setError(null);
    try {
      const res = await writeCalibration(id, [...ticked]);
      await queryClient.invalidateQueries({ queryKey: wk.all(id) });
      await queryClient.invalidateQueries({ queryKey: ['projects'] });
      if (res.skipped.length)
        setError(`Skipped: ${res.skipped.map((s) => `${s.path} (${s.reason})`).join('; ')}`);
      else void navigate(`/p/${encodeURIComponent(id)}`);
    } catch (e) {
      setError(e instanceof ApiFailure ? e.message : 'Could not write the files.');
    }
  };

  return (
    <div className={styles.reviewGrid}>
      <aside className={styles.reviewSide} aria-label="Calibration steps">
        <div className={styles.kicker}>Calibrating {id}</div>
        <ol className={styles.stepList}>
          <li data-done>
            <span>
              <Check size={11} strokeWidth={2.4} aria-hidden="true" />
            </span>
            Read the project
          </li>
          <li data-done>
            <span>
              <Check size={11} strokeWidth={2.4} aria-hidden="true" />
            </span>
            Questions
          </li>
          <li aria-current="step">
            <span>3</span>Review proposal
          </li>
        </ol>
        <div className={styles.answers}>
          <span className={styles.boxTitle}>Your answers</span>
          {state.answers.length === 0 && (
            <span className={styles.muted}>No questions were needed.</span>
          )}
          {state.answers.map((a) => (
            <div key={a.topic} className={styles.answer}>
              <span>{a.topic}</span>
              <span>{a.answer}</span>
            </div>
          ))}
          <div className={styles.answer}>
            <span>Phase</span>
            <span>{state.proposal?.phase}</span>
          </div>
          <button type="button" className={styles.link} onClick={() => void startCalibration(id)}>
            Start again
          </button>
        </div>
      </aside>
      <main className={styles.reviewMain}>
        <div className={styles.reviewHead}>
          <div>
            <h1>Review proposed files</h1>
            <p className={styles.lead}>
              {created} new file{created === 1 ? '' : 's'}
              {appended.length > 0 &&
                ` and ${appended.length} addition${appended.length === 1 ? '' : 's'} to existing files`}
              . Untick anything you don't want.
            </p>
          </div>
          <div className={styles.actions}>
            <button
              type="button"
              className="btn btn-ghost btn-md"
              onClick={() => void cancelCalibration(id).then(() => navigate('/'))}
            >
              Discard
            </button>
            <button
              type="button"
              className="btn btn-primary btn-md"
              disabled={ticked.size === 0 || state.status === 'writing'}
              onClick={() => void write()}
            >
              {state.status === 'writing'
                ? 'Writing…'
                : `Write ${ticked.size} selected file${ticked.size === 1 ? '' : 's'}`}
              <ArrowRight size={14} aria-hidden="true" />
            </button>
          </div>
        </div>
        {error && <p className={styles.error}>{error}</p>}
        <div className={styles.reviewBody}>
          <div role="list" className={styles.fileList}>
            {files.map((f) => (
              <div
                key={f.path}
                role="listitem"
                className={styles.fileRow}
                data-selected={f.path === selected || undefined}
              >
                <input
                  type="checkbox"
                  checked={ticked.has(f.path)}
                  disabled={!!f.warning}
                  aria-label={`Include ${f.path}`}
                  onChange={(e) => {
                    const next = new Set(ticked);
                    if (e.target.checked) next.add(f.path);
                    else next.delete(f.path);
                    setTicked(next);
                  }}
                />
                <button
                  type="button"
                  className={styles.fileBtn}
                  onClick={() => setSelected(f.path)}
                >
                  <span className={styles.fileTag} data-action={f.action}>
                    {f.action === 'create' ? 'New' : 'Append'}
                  </span>
                  <span className={styles.filePath}>{f.path}</span>
                  <span className={styles.size}>{formatSize(f.size)}</span>
                </button>
              </div>
            ))}
            <p className={styles.note}>
              Your existing files stay as they are. Appended files only get a new section at the
              end.
            </p>
          </div>
          {sel && <Preview file={sel} />}
        </div>
      </main>
    </div>
  );
}

function Preview({ file }: { file: ProposedFile }) {
  return (
    <section className={styles.preview} aria-label="Preview">
      <div className={styles.previewHead}>
        <span className="mono">{file.path}</span>
        <span className={styles.fileTag} data-action={file.action}>
          {file.action === 'create' ? 'New' : 'Append'}
        </span>
        <span className={styles.spacer} />
        <span className={styles.muted}>{file.note}</span>
      </div>
      {file.warning && <p className={styles.error}>{file.warning}</p>}
      <div className={styles.previewCode}>
        {file.lines.map((l, i) => (
          <div key={i} className={styles.pline} data-kind={l.kind}>
            <span className={styles.pnum}>{l.b ?? l.a}</span>
            <span className={styles.psign}>
              {l.kind === '+' && file.action === 'append' ? '+' : ''}
            </span>
            <span>{l.text || ' '}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function formatSize(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
}
