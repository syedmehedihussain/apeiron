import { ArrowUpRight, GitBranch } from 'lucide-react';
import { relativeTime, type GitInfo } from '@apeiron/shared';
import styles from './GitHubBox.module.css';

interface GitHubBoxProps {
  git: GitInfo | undefined;
  now: number;
  compact?: boolean;
  onPull?: () => void;
  onPush?: () => void;
  busy?: 'pull' | 'push' | null;
}

export function GitHubBox({ git, now, compact, onPull, onPush, busy }: GitHubBoxProps) {
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
        <span className={styles.prs}>
          {git.openPRs === null
            ? git.repo
              ? ''
              : 'GitHub CLI not linked'
            : `${git.openPRs} open pull request${git.openPRs === 1 ? '' : 's'}`}
        </span>
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
    </section>
  );
}
