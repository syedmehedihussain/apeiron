import { ArrowRight, Check, Circle, LoaderCircle, RotateCw } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import {
  ProjectNameSchema,
  REVIEW_STEP,
  SURVEY_STEPS,
  relativeTime,
  type SurveyFileEntry,
  type SurveyState,
} from '@apeiron/shared';
import { ApiFailure } from '../../api/client.ts';
import { queryClient, useHealth } from '../../api/queries.ts';
import {
  answerStep,
  changeStep,
  createProject,
  nextCard,
  startSurvey,
  useLiveSurvey,
  useSurvey,
} from '../../api/survey.ts';
import { DecisionCard } from '../../components/DecisionCard/DecisionCard.tsx';
import { Markdown } from '../../components/Markdown/Markdown.tsx';
import { Pill } from '../../components/Pill/Pill.tsx';
import { Switch } from '../../components/Switch/Switch.tsx';
import { TopBar } from '../../components/TopBar/TopBar.tsx';
import { tildify } from '../../lib/paths.ts';
import { useNow } from '../../lib/useNow.ts';
import styles from './Survey.module.css';

const label = (n: number) => SURVEY_STEPS.find((s) => s.step === n)?.label ?? `Step ${n}`;
const message = (e: unknown, fallback: string) => (e instanceof ApiFailure ? e.message : fallback);

/** A folder name from the first words of the idea ("A printable QR code…" → "printable-qr-code"). */
export function suggestName(idea: string): string {
  const skip = new Set(['a', 'an', 'the', 'for', 'to', 'of', 'and', 'that', 'my', 'with', 'app']);
  return idea
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !skip.has(w))
    .slice(0, 3)
    .join('-')
    .slice(0, 40);
}

export function Survey() {
  const { id } = useParams();
  const survey = useSurvey(id);
  useLiveSurvey(id);
  const now = useNow(30_000);
  const s = survey.data;
  const name = s?.name ?? id ?? '';

  const right = (
    <>
      {s && (
        <span className={styles.saved}>
          Draft saved · {relativeTime(Date.parse(s.updatedAt), now)}
        </span>
      )}
      <Link to="/" className="btn btn-secondary btn-md">
        Save and exit
      </Link>
    </>
  );

  return (
    <div className={styles.page}>
      <TopBar
        crumbs={[{ label: 'Projects', href: '/' }, { label: name || 'New project' }]}
        status={<Pill tone="neutral">New</Pill>}
        phase="plan"
        right={right}
        claude={s?.drafting ? 'working' : undefined}
      />
      {!id ? (
        <Frame state={null} step={1}>
          <IdeaStep />
        </Frame>
      ) : survey.isError ? (
        <div className={styles.centreOnly}>
          <div className={styles.notice}>
            <h1>No survey here</h1>
            <p>{message(survey.error, 'Could not load the survey.')}</p>
            <Link to="/new" className="btn btn-primary btn-md">
              Start a new project
            </Link>
          </div>
        </div>
      ) : !s ? null : s.status === 'created' && s.create?.stage !== 'done' ? (
        <div className={styles.centreOnly}>
          <div className={styles.notice}>
            <h1>{s.name} is already created</h1>
            <Link to={`/p/${encodeURIComponent(s.id)}`} className="btn btn-primary btn-md">
              Open the project
            </Link>
          </div>
        </div>
      ) : s.step === REVIEW_STEP ? (
        <Review state={s} />
      ) : (
        <Frame state={s} step={s.step}>
          {s.step === 1 ? <IdeaStep state={s} /> : <DecisionStep state={s} />}
        </Frame>
      )}
    </div>
  );
}

function Frame({
  state,
  step,
  children,
  wide,
}: {
  state: SurveyState | null;
  step: number;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={styles.grid} data-wide={wide || undefined}>
      <StepRail state={state} current={step} />
      <main className={styles.centre}>
        <div className={styles.column}>{children}</div>
      </main>
      {!wide && <KnownSoFar state={state} current={step} />}
    </div>
  );
}

function StepRail({ state, current }: { state: SurveyState | null; current: number }) {
  const steps = state?.steps ?? SURVEY_STEPS.map((s) => s.step);
  const answered = new Set(state?.answers.map((a) => a.step) ?? []);
  const total = steps.length;
  const done = steps.filter((n) => answered.has(n)).length;
  const go = (n: number) => {
    if (!state || n === current) return;
    void changeStep(state.id, n);
  };
  return (
    <nav aria-label="Survey steps" className={styles.rail}>
      <div className={styles.railTitle}>New project survey</div>
      <ol className={styles.railList}>
        {steps.map((n) => {
          const isDone = answered.has(n) && n !== current;
          const stale = state?.stale.includes(n);
          const reachable =
            !!state &&
            n !== current &&
            (answered.has(n) || (n === REVIEW_STEP && state.status === 'review'));
          return (
            <li key={n}>
              <button
                type="button"
                className={styles.railStep}
                aria-current={n === current ? 'step' : undefined}
                data-done={isDone || undefined}
                data-stale={stale || undefined}
                disabled={!reachable}
                onClick={() => go(n)}
              >
                <span className={styles.railDot}>
                  {isDone && !stale ? <Check size={11} strokeWidth={3} aria-hidden="true" /> : n}
                </span>
                <span>{label(n)}</span>
                {stale && <span className={styles.railStale}>Check</span>}
              </button>
            </li>
          );
        })}
      </ol>
      <div className={styles.railBar}>
        <div style={{ width: `${Math.round((done / total) * 100)}%` }} />
      </div>
      <div className={styles.railCount}>
        {done} of {total} answered
      </div>
    </nav>
  );
}

function KnownSoFar({ state, current }: { state: SurveyState | null; current: number }) {
  const rows: { label: string; step: number; value: string }[] = [];
  if (state) {
    rows.push({ label: 'Name', step: 1, value: state.name });
    rows.push({ label: 'Idea', step: 1, value: state.idea });
    for (const a of state.answers)
      if (a.kind === 'decision')
        rows.push({ label: label(a.step), step: a.step, value: a.summary });
  }
  return (
    <aside aria-label="What we know so far" className={styles.known}>
      <div className={styles.knownHead}>
        <h2>What we know so far</h2>
        <span>Live</span>
      </div>
      {rows.length === 0 && <p className={styles.muted}>Your answers show up here.</p>}
      <dl className={styles.knownList}>
        {rows.map((r) => (
          <div key={`${r.step}-${r.label}`} className={styles.knownRow}>
            <dt>
              <span>{r.label}</span>
              <span>Step {r.step}</span>
            </dt>
            <dd>{r.value}</dd>
          </div>
        ))}
        {state &&
          current > 1 &&
          current < REVIEW_STEP &&
          !state.answers.some((a) => a.step === current) && (
            <div className={styles.knownPending}>
              <span>
                {label(current)} · Step {current}
              </span>
              <span className="shimmer" style={{ height: 10, width: '70%' }} />
            </div>
          )}
      </dl>
    </aside>
  );
}

function IdeaStep({ state }: { state?: SurveyState }) {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const health = useHealth();
  const [idea, setIdea] = useState(state?.idea ?? params.get('idea') ?? '');
  const [name, setName] = useState(state?.name ?? '');
  const [nameTouched, setNameTouched] = useState(!!state);
  const [quick, setQuick] = useState(state?.quick ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const shownName = nameTouched ? name : suggestName(idea);
  const nameCheck = ProjectNameSchema.safeParse(shownName);
  const claudeMissing = health.data
    ? !(health.data.claude.found && health.data.claude.loggedIn)
    : false;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!nameCheck.success || !idea.trim()) return;
    setBusy(true);
    setError(null);
    try {
      if (state) {
        await answerStep(state.id, { step: 1, idea: idea.trim(), quick });
      } else {
        const s = await startSurvey({ name: nameCheck.data, idea: idea.trim(), quick });
        void queryClient.invalidateQueries({ queryKey: ['projects'] });
        void navigate(`/new/${encodeURIComponent(s.id)}`, { replace: true });
      }
    } catch (err) {
      setError(message(err, 'Could not save.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className={styles.card} onSubmit={(e) => void submit(e)} aria-labelledby="idea-title">
      <div className={styles.cardHead}>
        <div className={styles.kicker}>
          Step 1 of {quick ? 5 : 7} · <span>Idea</span>
        </div>
        <h1 id="idea-title">What are we building?</h1>
        <p className={styles.lead}>
          A name and a paragraph is enough. Claude drafts a question for each step from this.
        </p>
      </div>
      <div className={styles.fields}>
        <label className={styles.field}>
          <span>Idea</span>
          <textarea
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            rows={4}
            placeholder="A printable QR code that opens a business's Google review page."
            autoFocus={!state}
          />
        </label>
        <label className={styles.field}>
          <span>Folder name</span>
          <div className={styles.nameRow}>
            <span className={styles.prefix}>~/Projects/</span>
            <input
              value={shownName}
              readOnly={!!state}
              onChange={(e) => {
                setNameTouched(true);
                setName(e.target.value);
              }}
              placeholder="review-qr"
              spellCheck={false}
              aria-invalid={shownName.length > 0 && !nameCheck.success}
            />
          </div>
          {state ? (
            <span className={styles.hint}>The folder already exists, so the name stays.</span>
          ) : shownName && !nameCheck.success ? (
            <span className={styles.bad}>{nameCheck.error.issues[0]?.message}</span>
          ) : (
            <span className={styles.hint}>Lower case, digits and dashes.</span>
          )}
        </label>
        <div className={styles.quick}>
          <Switch checked={quick} onChange={setQuick} label="Quick" />
          <span className={styles.hint}>
            Skips Data and Quality bar. Five steps instead of seven.
          </span>
        </div>
      </div>
      {error && <p className={styles.error}>{error}</p>}
      <div className={styles.foot}>
        <span className={styles.muted}>Nothing is written outside this folder.</span>
        <button
          type="submit"
          className="btn btn-primary btn-md"
          disabled={busy || !nameCheck.success || !idea.trim() || claudeMissing}
          title={claudeMissing ? 'Connect Claude Code first' : undefined}
        >
          {busy ? 'Saving…' : 'Confirm'}
          <ArrowRight size={14} aria-hidden="true" />
        </button>
      </div>
    </form>
  );
}

function DecisionStep({ state }: { state: SurveyState }) {
  const [error, setError] = useState<string | null>(null);
  const step = state.step;
  const steps = state.steps;
  const position = steps.indexOf(step) + 1;
  const saved = state.answers.find((a) => a.step === step);
  const stale = state.stale.includes(step);
  const prev = steps[steps.indexOf(step) - 1] ?? 1;

  // A step with no card and nothing running (after a restart) asks Claude for one.
  useEffect(() => {
    if (!state.card && !state.drafting && !state.error) void nextCard(state.id);
  }, [state.id, state.card, state.drafting, state.error, step]);

  const answered = state.answers.filter((a) => a.kind === 'decision' && a.step !== step);

  return (
    <>
      {!state.card && (
        <div className={styles.kicker}>
          Step {position} of {steps.length} · <span>{label(step)}</span>
        </div>
      )}
      {state.error && !state.card ? (
        <div className={styles.card}>
          <div className={styles.cardHead}>
            <h1>Claude could not draft this step</h1>
            <p className={styles.lead}>{state.error}</p>
          </div>
          <div className={styles.foot}>
            <button
              type="button"
              className="btn btn-secondary btn-md"
              onClick={() => void changeStep(state.id, prev)}
            >
              Back
            </button>
            <button
              type="button"
              className="btn btn-primary btn-md"
              onClick={() => void nextCard(state.id, true)}
            >
              <RotateCw size={14} aria-hidden="true" />
              Try again
            </button>
          </div>
        </div>
      ) : (
        <DecisionCard
          key={state.card?.id ?? 'drafting'}
          card={
            state.card
              ? { ...state.card, label: `Step ${position} of ${steps.length} · ${label(step)}` }
              : undefined
          }
          state={!state.card ? 'drafting' : stale ? 'stale' : 'open'}
          initial={
            saved?.kind === 'decision' && saved.card.id === state.card?.id
              ? { optionId: saved.chosen, custom: saved.custom }
              : undefined
          }
          onBack={() => void changeStep(state.id, prev)}
          onConfirm={async (a) => {
            setError(null);
            try {
              await answerStep(state.id, { step, ...a });
            } catch (e) {
              setError(message(e, 'Could not save the answer.'));
            }
          }}
        />
      )}
      {error && <p className={styles.error}>{error}</p>}
      {state.card && (
        <button
          type="button"
          className={styles.redraft}
          onClick={() => void nextCard(state.id, true)}
        >
          <RotateCw size={12} aria-hidden="true" />
          Ask Claude for new options
        </button>
      )}
      {answered.length > 0 && (
        <div className={styles.answered}>
          <div className={styles.muted}>Answered</div>
          {answered.map((a) =>
            a.kind === 'decision' ? (
              <DecisionCard
                key={a.step}
                card={{ ...a.card, topic: label(a.step) }}
                state="confirmed"
                answer={a.summary}
                onChange={() => void changeStep(state.id, a.step)}
              />
            ) : null,
          )}
        </div>
      )}
    </>
  );
}

function Review({ state }: { state: SurveyState }) {
  const navigate = useNavigate();
  const files = useMemo(() => state.proposal?.files ?? [], [state.proposal]);
  const [selected, setSelected] = useState<string>('CLAUDE.md');
  const [repo, setRepo] = useState<boolean>(!!state.repoName);
  const [error, setError] = useState<string | null>(null);
  const sel = files.find((f) => f.path === selected) ?? files[0];
  const create = state.create;
  const creating = !!create && ['writing', 'git', 'repo'].includes(create.stage);

  useEffect(() => {
    if (!state.proposal && !state.drafting && !state.error) void nextCard(state.id);
  }, [state.id, state.proposal, state.drafting, state.error]);

  useEffect(() => {
    if (create?.stage === 'done' && !create.repoError) {
      void queryClient.invalidateQueries({ queryKey: ['projects'] });
      void navigate(`/p/${encodeURIComponent(state.id)}`);
    }
  }, [create?.stage, create?.repoError, navigate, state.id]);

  const rows: [number, string, string][] = [
    [1, 'Idea', state.idea],
    ...state.answers
      .filter((a) => a.kind === 'decision')
      .map(
        (a) =>
          [a.step, label(a.step), a.kind === 'decision' ? a.summary : ''] as [
            number,
            string,
            string,
          ],
      ),
  ];

  const go = async () => {
    setError(null);
    try {
      await createProject(state.id, repo && !!state.repoName);
    } catch (e) {
      setError(message(e, 'Could not create the project.'));
    }
  };

  return (
    <Frame state={state} step={REVIEW_STEP} wide>
      <div className={styles.reviewWrap}>
        <div className={styles.reviewMain}>
          <div className={styles.cardHead}>
            <div className={styles.kicker}>
              Step {state.steps.length} of {state.steps.length} · <span>Review</span>
            </div>
            <h1>Ready to create {state.name}</h1>
            <p className={styles.lead}>
              Check the answers. Apeiron writes these files into{' '}
              <span className="mono">{tildify(state.path)}</span> and the project moves to Design.
            </p>
          </div>

          <section aria-label="Answers" className={styles.answers}>
            {rows.map(([n, l, v]) => (
              <div key={n} className={styles.answerRow}>
                <span>{l}</span>
                <span>{v}</span>
                <button
                  type="button"
                  className={styles.link}
                  disabled={creating}
                  onClick={() => void changeStep(state.id, n)}
                >
                  Change
                </button>
              </div>
            ))}
          </section>

          <section aria-labelledby="files-title" className={styles.files}>
            <div className={styles.filesHead}>
              <h2 id="files-title">Files to be created</h2>
              <span className={styles.muted}>
                {files.length ? `${files.length} files · nothing is overwritten` : ''}
              </span>
            </div>
            <div className={styles.fileList}>
              {!state.proposal ? (
                state.error ? (
                  <div className={styles.fileError}>
                    <span>{state.error}</span>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => void nextCard(state.id, true)}
                    >
                      Try again
                    </button>
                  </div>
                ) : (
                  <div className={styles.drafting} aria-busy="true">
                    <span>
                      <span className="spinner" style={{ width: 10, height: 10 }} /> Claude is
                      drafting the documents…
                    </span>
                    {[0, 1, 2, 3].map((i) => (
                      <span key={i} className="shimmer" style={{ height: 20 }} />
                    ))}
                  </div>
                )
              ) : (
                files.map((f) => (
                  <div
                    key={f.path}
                    className={styles.fileRow}
                    data-selected={f.path === sel?.path || undefined}
                  >
                    <span className={styles.fileTag}>
                      {f.path.endsWith('.json') ? 'JSON' : 'MD'}
                    </span>
                    <span className={styles.filePath}>{f.path}</span>
                    <span className={styles.muted}>{f.warning ? 'Blocked' : f.note}</span>
                    <button
                      type="button"
                      className={styles.previewBtn}
                      data-selected={f.path === sel?.path || undefined}
                      onClick={() => setSelected(f.path)}
                      aria-label={`Preview ${f.path}`}
                    >
                      Preview
                    </button>
                  </div>
                ))
              )}
            </div>
          </section>

          {create && create.stage !== 'done' ? (
            <Progress state={state} />
          ) : create?.repoError ? (
            <div className={styles.repoError}>
              <p>The project was created, but the GitHub repository was not: {create.repoError}</p>
              <Link to={`/p/${encodeURIComponent(state.id)}`} className="btn btn-primary btn-md">
                Open the project
              </Link>
            </div>
          ) : null}
          {error && <p className={styles.error}>{error}</p>}

          <div className={styles.reviewFoot}>
            {state.repoName ? (
              <label className={styles.repoToggle}>
                <input
                  type="checkbox"
                  checked={repo}
                  disabled={creating}
                  onChange={(e) => setRepo(e.target.checked)}
                />
                Create a private GitHub repository <span className="mono">{state.repoName}</span>
              </label>
            ) : (
              <span className={styles.muted}>
                GitHub is not connected; you can add a repository later.
              </span>
            )}
            <div className={styles.actions}>
              <button
                type="button"
                className="btn btn-secondary btn-lg"
                disabled={creating}
                onClick={() => void changeStep(state.id, state.steps[state.steps.length - 2] ?? 1)}
              >
                Back
              </button>
              <button
                type="button"
                className="btn btn-primary btn-lg"
                disabled={!state.proposal || creating || files.some((f) => f.warning)}
                onClick={() => void go()}
              >
                {creating ? 'Creating…' : 'Create project'}
                <ArrowRight size={15} aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
        {sel && <Preview file={sel} />}
      </div>
    </Frame>
  );
}

function Progress({ state }: { state: SurveyState }) {
  const stage = state.create?.stage;
  const list: [string, string][] = [
    ['writing', 'Writing files'],
    ['git', 'git init and first commit'],
    ...(stage === 'repo'
      ? ([['repo', 'Creating the GitHub repository']] as [string, string][])
      : []),
  ];
  const order = ['writing', 'git', 'repo', 'done'];
  return (
    <ol className={styles.progress} aria-label="Creating the project">
      {list.map(([key, text]) => {
        const i = order.indexOf(key);
        const cur = order.indexOf(stage ?? '');
        return (
          <li key={key} data-state={i < cur ? 'done' : i === cur ? 'now' : 'next'}>
            {i < cur ? (
              <Check size={13} aria-hidden="true" />
            ) : i === cur ? (
              <LoaderCircle size={13} className={styles.spin} aria-hidden="true" />
            ) : (
              <Circle size={13} aria-hidden="true" />
            )}
            {text}
          </li>
        );
      })}
      {stage === 'failed' && <li data-state="failed">{state.create?.error}</li>}
    </ol>
  );
}

function Preview({ file }: { file: SurveyFileEntry }) {
  return (
    <aside aria-label="Preview" className={styles.preview}>
      <div className={styles.previewHead}>
        <div>
          <span className={styles.muted}>Preview</span>
          <span className="mono">{file.path}</span>
        </div>
        <Pill tone={file.warning ? 'danger' : 'success'}>
          {file.warning ? 'Blocked' : `New · ${formatSize(file.size)}`}
        </Pill>
      </div>
      {file.warning && <p className={styles.error}>{file.warning}</p>}
      <article className={styles.previewBody}>
        {file.path.endsWith('.md') ? (
          <Markdown source={file.content} variant="doc" />
        ) : (
          <pre>{file.content}</pre>
        )}
      </article>
    </aside>
  );
}

function formatSize(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
}
