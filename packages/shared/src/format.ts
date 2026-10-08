import type { GitSummary, ProjectState } from './schemas/project.ts';

/** "just now", "25 min ago", "2 h ago", "Yesterday", "3 days ago", "2 weeks ago", "1 month ago". */
export function relativeTime(then: number, now: number = Date.now()): string {
  const s = Math.max(0, Math.round((now - then) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d === 1) return 'Yesterday';
  if (d < 7) return `${d} days ago`;
  const w = Math.round(d / 7);
  if (d < 30) return w === 1 ? '1 week ago' : `${w} weeks ago`;
  const mo = Math.round(d / 30);
  if (mo < 12) return mo === 1 ? '1 month ago' : `${mo} months ago`;
  const y = Math.round(d / 365);
  return y === 1 ? '1 year ago' : `${y} years ago`;
}

export const STATE_LABEL: Record<ProjectState, string> = {
  ready: 'Ready',
  cctop: 'cctop',
  uncalibrated: 'Not calibrated',
};

export type GitChipTone = 'clean' | 'ahead' | 'behind' | 'changes' | 'none';

/** The one git chip a card shows, most important first. */
export function gitChip(git: GitSummary | null): { label: string; tone: GitChipTone } {
  if (!git) return { label: 'No git', tone: 'none' };
  if (git.changes > 0)
    return { label: `${git.changes} change${git.changes === 1 ? '' : 's'}`, tone: 'changes' };
  if (git.behind > 0) return { label: `${git.behind} behind`, tone: 'behind' };
  if (git.ahead > 0) return { label: `${git.ahead} ahead`, tone: 'ahead' };
  if (!git.remote) return { label: 'No remote', tone: 'none' };
  return { label: 'clean', tone: 'clean' };
}
