import { ArrowUpRight, ChevronRight, GitBranch, GitPullRequest } from 'lucide-react';
import type { ReactNode } from 'react';
import { relativeTime, type GitInfo, type GitResult, type PullRequestList } from '@apeiron/shared';
import styles from './GitHubBox.module.css';

interface GitHubBoxProps {
  git: GitInfo | undefined;
  now: number;
  compact?: boolean;
  onPull?: () => void;
  onPush?: () => void;
  busy?: 'pull' | 'push' | null;
  /** The last Pull or Push outcome, shown under the buttons. */
  result?: GitResult | null;
  /** Open pull requests, shown when the count is clicked. */
  prs?: PullRequestList | null;
  prsOpen?: boolean;
  onTogglePrs?: () => void;
  /** Shown inside the box under the footer (the push approval). */
  children?: ReactNode;
}

export function GitHubBox({
  git,
  now,
  compact,
  onPull,
  onPush,
  busy,
  result,
  prs,
  prsOpen,
  onTogglePrs,
  children,
}: GitHubBoxProps) {
  if (!git) {
    return (
      <div className={styles.box} aria-busy="true">
        <span className="shimmer" style={{ height: 16, width: '60%' }} />
        <span className="shimmer" style={{ height: 28 }} />
      </div>
    );
  }
  if (!git.isRepo) {
    return (
      <div className={styles.box}>
        <span className={styles.label}>Repository</span>
        <span className={styles.muted}>This folder is not a git repository.</span>
      </div>
    );
  }
  return (
    <section className={styles.box} aria-label="Repository">
      <div className={styles.top}>
        <div className={styles.repo}>
          <span className={styles.label}>Repository</span>
          {git.repo && git.url ? (
            <a href={git.url} target="_blank" rel="noreferrer" className={styles.name}>
              {git.repo}
              <ArrowUpRight size={12} strokeWidth={2} aria-hidden="true" />
            </a>
          ) : (
            <span className={styles.name}>
              {git.remote ? 'Remote set, not on GitHub' : 'No remote'}
            </span>
          )}
        </div>
        {git.visibility && (
          <span className={styles.visibility}>
            {git.visibility[0]?.toUpperCase() + git.visibility.slice(1)}
          </span>
        )}
      </div>
      <div className={styles.branchRow}>
        <span className={styles.branch}>
          <GitBranch size={12} strokeWidth={2} aria-hidden="true" />
          <span className="mono">{git.branch ?? 'detached'}</span>
        </span>
        <span className={styles.ab} aria-label={`${git.ahead} ahead, ${git.behind} behind`}>
          <span>↑ {git.ahead}</span>
          <span>↓ {git.behind}</span>
        </span>
        {git.changes > 0 ? (
          <span className={styles.uncommitted}>{git.changes} uncommitted</span>
        ) : (
          <span className={styles.clean}>clean</span>
        )}
      </div>
      {!compact && (
        <ul className={styles.commits}>
          {git.commits.map((c) => (
            <li key={c.hash}>
              <span className={styles.subject}>
                <span className={styles.subjectText} title={c.subject}>
                  {c.subject}
                </span>
                <span className={styles.when}>{relativeTime(c.time, now)}</span>
              </span>
              <span className={styles.hash}>{c.hash}</span>
            </li>
          ))}
          {git.commits.length === 0 && <li className={styles.muted}>No commits yet.</li>}
        </ul>
      )}
      <div className={styles.foot}>
        {git.openPRs !== null && onTogglePrs ? (
          <button
            type="button"
            className={styles.prsBtn}
            aria-expanded={!!prsOpen}
            onClick={onTogglePrs}
          >
            <ChevronRight
              size={12}
              aria-hidden="true"
              style={{ transform: prsOpen ? 'rotate(90deg)' : undefined }}
            />
            {git.openPRs} open pull request{git.openPRs === 1 ? '' : 's'}
          </button>
        ) : (
          <span className={styles.prs}>
            {git.openPRs === null
              ? git.remote && !git.repo
                ? 'GitHub CLI not linked'
                : ''
              : `${git.openPRs} open pull request${git.openPRs === 1 ? '' : 's'}`}
          </span>
        )}
        <div className={styles.actions}>
          <button
            type="button"
            className="btn btn-secondary btn-md"
            onClick={onPull}
            disabled={!onPull || !git.remote || (busy !== null && busy !== undefined)}
          >
            {busy === 'pull' ? 'Pulling…' : 'Pull'}
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-md"
            onClick={onPush}
            disabled={!onPush || !git.remote || (busy !== null && busy !== undefined)}
          >
            {busy === 'push' ? 'Waiting…' : 'Push'}
          </button>
        </div>
      </div>
      {prsOpen && (
        <ul className={styles.prList} aria-label="Open pull requests">
          {!prs && <li className={styles.muted}>Loading…</li>}
          {prs?.error && <li className={styles.muted}>{prs.error}</li>}
          {prs && !prs.error && prs.prs.length === 0 && (
            <li className={styles.muted}>No open pull requests.</li>
          )}
          {prs?.prs.map((p) => (
            <li key={p.number}>
              <GitPullRequest size={13} aria-hidden="true" className={styles.prIcon} />
              <a href={p.url} target="_blank" rel="noreferrer" className={styles.prTitle}>
                <span>{p.title}</span>
                <span className={styles.when}>
                  #{p.number} · {p.author}
                  {p.draft ? ' · draft' : ''} · {relativeTime(p.updatedAt, now)}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
      {result && (
        <p className={styles.result} data-ok={result.ok || undefined} role="status">
          {result.message}
        </p>
      )}
      {children}
    </section>
  );
}
