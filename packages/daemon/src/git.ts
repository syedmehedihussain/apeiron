import type { GitSummary } from '@cherry/shared';
import { run } from './exec.ts';

const GIT_ENV = { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0' };

export function git(cwd: string, args: string[], timeoutMs = 15_000) {
  return run('git', args, { cwd, timeoutMs, env: GIT_ENV });
}

export interface StatusEntry {
  path: string;
  /** M modified, A added, D deleted, U untracked, R renamed */
  letter: 'M' | 'A' | 'D' | 'U' | 'R';
}

export interface GitStatus extends GitSummary {
  entries: StatusEntry[];
}

function letterFor(xy: string): StatusEntry['letter'] {
  if (xy.includes('D')) return 'D';
  if (xy.includes('A')) return 'A';
  if (xy.includes('R') || xy.includes('C')) return 'R';
  return 'M';
}

/** Parses `git status --porcelain=v2 --branch -z`. */
export function parseStatus(out: string): GitStatus {
  const status: GitStatus = {
    branch: null,
    ahead: 0,
    behind: 0,
    changes: 0,
    remote: false,
    entries: [],
  };
  const records = out.split('\0');
  for (let i = 0; i < records.length; i++) {
    const rec = records[i] ?? '';
    if (rec.startsWith('# branch.head ')) {
      const head = rec.slice('# branch.head '.length);
      status.branch = head === '(detached)' ? null : head;
    } else if (rec.startsWith('# branch.upstream ')) {
      status.remote = true;
    } else if (rec.startsWith('# branch.ab ')) {
      const m = /\+(\d+) -(\d+)/.exec(rec);
      if (m) {
        status.ahead = Number(m[1]);
        status.behind = Number(m[2]);
      }
    } else if (rec.startsWith('1 ')) {
      const parts = rec.split(' ');
      status.entries.push({ path: parts.slice(8).join(' '), letter: letterFor(parts[1] ?? '') });
    } else if (rec.startsWith('2 ')) {
      const parts = rec.split(' ');
      status.entries.push({ path: parts.slice(9).join(' '), letter: 'R' });
      i++; // the original path follows as its own record
    } else if (rec.startsWith('u ')) {
      const parts = rec.split(' ');
      status.entries.push({ path: parts.slice(10).join(' '), letter: 'M' });
    } else if (rec.startsWith('? ')) {
      status.entries.push({ path: rec.slice(2), letter: 'U' });
    }
  }
  status.changes = status.entries.length;
  return status;
}

/** Null when the folder is not a git repository. */
export async function gitStatus(cwd: string): Promise<GitStatus | null> {
  const res = await git(cwd, [
    'status',
    '--porcelain=v2',
    '--branch',
    '-z',
    '--untracked-files=all',
  ]);
  if (!res.ok) return null;
  const status = parseStatus(res.stdout);
  if (!status.remote) {
    const remotes = await git(cwd, ['remote']);
    status.remote = remotes.ok && remotes.stdout.trim().length > 0;
  }
  return status;
}

export async function lastCommitTime(cwd: string): Promise<number | null> {
  const res = await git(cwd, ['log', '-1', '--format=%ct']);
  const secs = Number(res.stdout.trim());
  return res.ok && secs > 0 ? secs * 1000 : null;
}
