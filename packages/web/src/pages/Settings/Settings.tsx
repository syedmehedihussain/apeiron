import { ArrowLeft, Check } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { z } from 'zod';
import {
  ConfigSchema,
  MAGNET_FILES,
  relativeTime,
  type MagnetFileName,
  type Usage,
} from '@apeiron/shared';
import { api, ApiFailure } from '../../api/client.ts';
import { patchConfig, saveMagnetFile, useMagnetInfo } from '../../api/magnet.ts';
import { keys, recheckHealth, useHealth } from '../../api/queries.ts';
import { useQuery } from '@tanstack/react-query';
import { MagnetAvatar } from '../../components/MagnetAvatar/MagnetAvatar.tsx';
import { Switch } from '../../components/Switch/Switch.tsx';
import { TopBar } from '../../components/TopBar/TopBar.tsx';
import { tildify } from '../../lib/paths.ts';
import { useNow } from '../../lib/useNow.ts';
import styles from './Settings.module.css';

const ConfigViewSchema = ConfigSchema.extend({ resolvedProjectsDir: z.string() });
const useConfig = () =>
  useQuery({
    queryKey: keys.config,
    queryFn: () => api('GET', '/api/config', undefined, ConfigViewSchema),
  });

const GROUPS: { title: string | null; items: [string, string][] }[] = [
  {
    title: 'App',
    items: [
      ['general', 'General'],
      ['appearance', 'Appearance'],
      ['shortcuts', 'Shortcuts'],
    ],
  },
  {
    title: 'Connections',
    items: [
      ['folder', 'Projects folder'],
      ['claude', 'Claude Code'],
      ['github', 'GitHub'],
    ],
  },
  { title: 'Assistant', items: [['magnet', 'Magnet']] },
];

export function Settings() {
  const section = useParams().section ?? 'general';
  const health = useHealth();
  const dot = (key: string) => {
    if (!health.data) return null;
    const ok =
      key === 'claude'
        ? health.data.claude.found && health.data.claude.loggedIn
        : key === 'github'
          ? health.data.gh.loggedIn
          : null;
    return ok === null ? null : <span className={styles.dot} data-ok={ok || undefined} />;
  };
  return (
    <div className={styles.page}>
      <TopBar crumbs={[{ label: 'Settings' }]} />
      <div className={styles.grid}>
        <nav aria-label="Settings" className={styles.nav}>
          <Link to="/" className={styles.back}>
            <ArrowLeft size={14} aria-hidden="true" />
            Back to projects
          </Link>
          {GROUPS.map((g) => (
            <div key={g.title} className={styles.group}>
              <div className={styles.groupTitle}>{g.title}</div>
              {g.items.map(([key, label]) => (
                <Link
                  key={key}
                  to={`/settings/${key}`}
                  className={styles.item}
                  aria-current={section === key ? 'page' : undefined}
                >
                  {label}
                  {dot(key)}
                </Link>
              ))}
            </div>
          ))}
          <div className={styles.group} style={{ marginTop: 'auto' }}>
            <Link
              to="/settings/about"
              className={styles.item}
              aria-current={section === 'about' ? 'page' : undefined}
            >
              About
            </Link>
          </div>
        </nav>
        <main className={styles.main}>
          <div className={styles.content}>
            {section === 'magnet' ? (
              <MagnetSection />
            ) : section === 'folder' ? (
              <FolderSection />
            ) : section === 'claude' ? (
              <ClaudeSection />
            ) : section === 'github' ? (
              <GitHubSection />
            ) : section === 'appearance' ? (
              <Simple title="Appearance">
                <p>
                  Apeiron uses one dark theme, built from the design tokens. A light theme comes
                  after the MVP.
                </p>
              </Simple>
            ) : section === 'shortcuts' ? (
              <ShortcutsSection />
            ) : section === 'about' ? (
              <AboutSection />
            ) : (
              <GeneralSection />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

function Simple({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={styles.section}>
      <h1>{title}</h1>
      <div className={styles.prose}>{children}</div>
    </section>
  );
}

function Saved({ at }: { at: number | null }) {
  return at ? (
    <span className={styles.saved} role="status">
      <Check size={12} aria-hidden="true" /> Saved
    </span>
  ) : null;
}

function useSave() {
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      setSavedAt(Date.now());
    } catch (e) {
      setSavedAt(null);
      setError(e instanceof ApiFailure ? e.message : 'Could not save.');
    }
  };
  return { savedAt, error, run };
}

function GeneralSection() {
  const config = useConfig();
  const save = useSave();
  if (!config.data) return null;
  const c = config.data;
  return (
    <section className={styles.section}>
      <h1>General</h1>
      <div className={styles.rows}>
        <label className={styles.row}>
          <span>
            <strong>Default model</strong>
            <span>Used for new chats, calibration, the survey, agents and Magnet.</span>
          </span>
          <select
            value={c.claude.defaultModel}
            onChange={(e) =>
              void save.run(() => patchConfig({ claude: { defaultModel: e.target.value } }))
            }
          >
            <option value="sonnet">Sonnet</option>
            <option value="opus">Opus</option>
            <option value="haiku">Haiku</option>
          </select>
        </label>
        <label className={styles.row}>
          <span>
            <strong>Agents running at once</strong>
            <span>More agents wait in a queue until a slot frees.</span>
          </span>
          <select
            value={c.agents.maxRunning}
            onChange={(e) =>
              void save.run(() => patchConfig({ agents: { maxRunning: Number(e.target.value) } }))
            }
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>
      <Saved at={save.savedAt} />
      {save.error && <p className={styles.error}>{save.error}</p>}
    </section>
  );
}

function FolderSection() {
  const config = useConfig();
  const [value, setValue] = useState<string | null>(null);
  const save = useSave();
  if (!config.data) return null;
  const v = value ?? config.data.projectsDir;
  return (
    <section className={styles.section}>
      <h1>Projects folder</h1>
      <p className={styles.lead}>
        Every direct sub-folder is a project. Now reading{' '}
        <span className="mono">{tildify(config.data.resolvedProjectsDir)}</span>.
      </p>
      <form
        className={styles.inline}
        onSubmit={(e) => {
          e.preventDefault();
          void save.run(() => patchConfig({ projectsDir: v.trim() }));
        }}
      >
        <label className="sr-only" htmlFor="projects-dir">
          Projects folder
        </label>
        <input
          id="projects-dir"
          className="input mono"
          value={v}
          onChange={(e) => setValue(e.target.value)}
        />
        <button
          type="submit"
          className="btn btn-primary btn-md"
          disabled={!v.trim() || v === config.data.projectsDir}
        >
          Save
        </button>
      </form>
      <Saved at={save.savedAt} />
      {save.error && <p className={styles.error}>{save.error}</p>}
    </section>
  );
}

function HealthRows({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className={styles.facts}>
      {rows.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function CheckAgain() {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-secondary btn-md"
      disabled={busy}
      onClick={() => {
        setBusy(true);
        void recheckHealth().finally(() => setBusy(false));
      }}
    >
      {busy ? 'Checking…' : 'Check again'}
    </button>
  );
}

function ClaudeSection() {
  const h = useHealth().data;
  return (
    <section className={styles.section}>
      <h1>Claude Code</h1>
      <p className={styles.lead}>
        Apeiron drives the claude command on this machine. It never sees your login.
      </p>
      {h && (
        <HealthRows
          rows={[
            ['Installed', h.claude.found ? `Yes · ${h.claude.version ?? ''}` : 'No'],
            ['Logged in', h.claude.loggedIn ? 'Yes' : 'No — run claude in a terminal and log in'],
          ]}
        />
      )}
      <CheckAgain />
    </section>
  );
}

function GitHubSection() {
  const h = useHealth().data;
  return (
    <section className={styles.section}>
      <h1>GitHub</h1>
      <p className={styles.lead}>
        Optional. The GitHub CLI (<span className="mono">gh</span>) creates repositories and lists
        pull requests. Without it the GitHub box shows git data only.
      </p>
      {h && (
        <HealthRows
          rows={[
            ['git', h.git.found ? `Yes · ${h.git.version ?? ''}` : 'Not found'],
            ['gh installed', h.gh.found ? 'Yes' : 'No'],
            [
              'gh logged in',
              h.gh.loggedIn ? (
                'Yes'
              ) : (
                <>
                  No — run <span className="mono">gh auth login</span>
                </>
              ),
            ],
          ]}
        />
      )}
      <CheckAgain />
    </section>
  );
}

function ShortcutsSection() {
  const list: [string, string][] = [
    ['Enter', 'Send a message, confirm a decision card'],
    ['Shift + Enter', 'New line in the composer'],
    ['↑ / ↓', 'Move between options on a decision card'],
    ['Ctrl/⌘ + Enter', 'Start an agent from the New agent form'],
    ['Esc', 'Close Magnet, a dialog or the agent form'],
  ];
  return (
    <section className={styles.section}>
      <h1>Shortcuts</h1>
      <dl className={styles.facts}>
        {list.map(([k, v]) => (
          <div key={k}>
            <dt>
              <kbd>{k}</kbd>
            </dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function AboutSection() {
  const h = useHealth().data;
  return (
    <Simple title="About">
      <p>
        Apeiron {h?.version ?? ''} — a local workspace that drives Claude Code to plan, document and
        build your projects. MIT licence.
      </p>
      <p>
        Settings live in <span className="mono">~/.apeiron/config.json</span>, Magnet's notes in{' '}
        <span className="mono">~/.apeiron/magnet/</span>. Each project keeps its own state in{' '}
        <span className="mono">_project/</span>, outside git.
      </p>
      <p>The app only listens on 127.0.0.1 and talks to Claude and GitHub, nothing else.</p>
    </Simple>
  );
}

function MagnetSection() {
  const info = useMagnetInfo();
  const now = useNow(60_000);
  const d = info.data;
  return (
    <>
      <div className={styles.hero}>
        <span className={styles.heroAvatar}>
          <MagnetAvatar size={96} />
        </span>
        <div className={styles.heroText}>
          <h1>Magnet</h1>
          <p>
            Your assistant across all projects. He reads everything and changes nothing until you
            approve.
          </p>
        </div>
        {d && (
          <Switch
            checked={d.readOnly}
            label="Read-only mode"
            onChange={(v) => void patchConfig({ magnet: { readOnly: v } })}
          />
        )}
      </div>
      {d && !d.readOnly && (
        <p className={styles.lead}>
          With read-only off, Magnet may also edit its own notes below, each edit shown for your
          approval. Actions on projects always need Approve.
        </p>
      )}
      <div className={styles.stats}>
        <Stat n={d?.stats.projects} label="Projects tracked" />
        <Stat n={d?.stats.sessionsWeek} label="Sessions this week" />
        <Stat n={d?.stats.agentsRun} label="Agents run" />
      </div>
      <section aria-labelledby="knows" className={styles.block}>
        <div className={styles.blockHead}>
          <h2 id="knows">What Magnet knows</h2>
          <span className={styles.muted}>
            Plain Markdown in{' '}
            <span className="mono">{d ? tildify(d.dir) : '~/.apeiron/magnet'}/</span>
          </span>
        </div>
        <div className={styles.files}>
          {MAGNET_FILES.map((name) => {
            const f = d?.files.find((x) => x.name === name);
            return f ? (
              <KnowledgeFile
                key={name}
                name={name}
                content={f.content}
                updatedAt={f.updatedAt}
                now={now}
              />
            ) : null;
          })}
        </div>
      </section>
      {d && <UsageBlock usage={d.usage} />}
    </>
  );
}

function Stat({ n, label }: { n: number | undefined; label: string }) {
  return (
    <div>
      <span className={styles.statN}>{n ?? '—'}</span>
      <span className={styles.muted}>{label}</span>
    </div>
  );
}

const FILE_HINT: Record<MagnetFileName, string> = {
  'MAGNET.md': 'Personality',
  'me.md': 'About you',
  'work.md': 'Your work',
};

function KnowledgeFile({
  name,
  content,
  updatedAt,
  now,
}: {
  name: MagnetFileName;
  content: string;
  updatedAt: number;
  now: number;
}) {
  const [text, setText] = useState(content);
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const dirty = text !== content;
  useEffect(() => {
    if (!dirty) return;
    const t = window.setTimeout(() => {
      setState('saving');
      saveMagnetFile(name, text).then(
        () => setState('saved'),
        () => setState('error'),
      );
    }, 800);
    return () => window.clearTimeout(t);
  }, [text, dirty, name]);
  const id = `mf-${name}`;
  return (
    <div className={styles.file}>
      <div className={styles.fileHead}>
        <label htmlFor={id} className="mono">
          {name}
        </label>
        <span className={styles.muted}>
          {state === 'saving'
            ? 'Saving…'
            : state === 'error'
              ? 'Could not save'
              : dirty
                ? 'Unsaved'
                : state === 'saved'
                  ? 'Saved'
                  : updatedAt
                    ? `${FILE_HINT[name]} · ${relativeTime(updatedAt, now)}`
                    : FILE_HINT[name]}
        </span>
      </div>
      <textarea
        id={id}
        rows={8}
        value={text}
        spellCheck={false}
        onChange={(e) => setText(e.target.value)}
      />
    </div>
  );
}

function UsageBlock({ usage }: { usage: Usage }) {
  const [weekly, setWeekly] = useState(false);
  const level = (n: number, max: number) =>
    n === 0 ? 0 : Math.min(4, Math.ceil((n / Math.max(1, max)) * 4));
  const weeks: { label: string; sessions: number }[] = [];
  for (let i = 0; i < usage.days.length; i += 7) {
    const chunk = usage.days.slice(i, i + 7);
    weeks.push({ label: chunk[0]!.day, sessions: chunk.reduce((s, d) => s + d.sessions, 0) });
  }
  const cells = weekly
    ? weeks.map((w) => ({ key: w.label, n: w.sessions, title: `Week of ${w.label}` }))
    : usage.days.map((d) => ({ key: d.day, n: d.sessions, title: d.day }));
  const max = Math.max(...cells.map((c) => c.n), 1);
  const months = [
    ...new Set(
      usage.days
        .filter((d) => d.day.endsWith('-01'))
        .map((d) => new Date(`${d.day}T12:00:00`).toLocaleString('en', { month: 'short' })),
    ),
  ];
  const minutes = Math.round(usage.longestMs / 60_000);
  return (
    <section aria-labelledby="usage" className={styles.block}>
      <h2 id="usage">Usage</h2>
      <div className={styles.usage}>
        <div className={styles.usageStats}>
          <Stat n={usage.sessionsMonth} label="Sessions this month" />
          <div>
            <span className={styles.statN}>{minutes < 1 ? '<1 m' : `${minutes} m`}</span>
            <span className={styles.muted}>Longest task</span>
          </div>
          <div>
            <span className={styles.statN}>
              {usage.currentStreak} day{usage.currentStreak === 1 ? '' : 's'}
            </span>
            <span className={styles.muted}>Current streak</span>
          </div>
          <div>
            <span className={styles.statN}>
              {usage.longestStreak} day{usage.longestStreak === 1 ? '' : 's'}
            </span>
            <span className={styles.muted}>Longest streak</span>
          </div>
        </div>
        <div className={styles.heatHead}>
          <span className={styles.muted}>Days worked, all projects</span>
          <div className={styles.toggle}>
            <button type="button" aria-pressed={!weekly} onClick={() => setWeekly(false)}>
              Daily
            </button>
            <button type="button" aria-pressed={weekly} onClick={() => setWeekly(true)}>
              Weekly
            </button>
          </div>
        </div>
        <div
          className={styles.heat}
          data-weekly={weekly || undefined}
          role="img"
          aria-label="Sessions per day, last 26 weeks"
        >
          {cells.map((c) => (
            <span
              key={c.key}
              title={`${c.title}: ${c.n} session${c.n === 1 ? '' : 's'}`}
              data-level={level(c.n, max)}
            />
          ))}
        </div>
        <div className={styles.heatFoot}>
          <span className={styles.months}>
            {months.map((m) => (
              <span key={m}>{m}</span>
            ))}
          </span>
          <span className={styles.legend}>
            Less
            {[0, 1, 2, 3, 4].map((l) => (
              <span key={l} data-level={l} />
            ))}
            More
          </span>
        </div>
      </div>
    </section>
  );
}
