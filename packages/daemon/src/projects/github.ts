import type { GitInfo } from '@cherry/shared';
import { run } from '../exec.ts';
import { git, gitStatus } from '../git.ts';

interface GhInfo {
  repo: string | null;
  url: string | null;
  visibility: GitInfo['visibility'];
  openPRs: number | null;
  at: number;
}

const GH_TTL_MS = 60_000;

/** git data straight from disk plus GitHub data from `gh`, cached for a minute per project. */
export class GitInfoService {
  private readonly gh = new Map<string, GhInfo>();

  invalidate(dir: string): void {
    this.gh.delete(dir);
  }

  async get(dir: string): Promise<GitInfo> {
    const status = await gitStatus(dir);
    if (!status) {
      return {
        isRepo: false,
        branch: null,
        ahead: 0,
        behind: 0,
        changes: 0,
        remote: false,
        commits: [],
        repo: null,
        url: null,
        visibility: null,
        openPRs: null,
      };
    }
    const log = await git(dir, ['log', '-3', '--format=%h%x1f%s%x1f%ct']);
    const commits = log.ok
      ? log.stdout
          .trim()
          .split('\n')
          .filter(Boolean)
          .map((l) => {
            const [hash = '', subject = '', ct = '0'] = l.split('\x1f');
            return { hash, subject, time: Number(ct) * 1000 };
          })
      : [];
    const gh = status.remote ? await this.ghInfo(dir) : null;
    return {
      isRepo: true,
      branch: status.branch,
      ahead: status.ahead,
      behind: status.behind,
      changes: status.changes,
      remote: status.remote,
      commits,
      repo: gh?.repo ?? null,
      url: gh?.url ?? null,
      visibility: gh?.visibility ?? null,
      openPRs: gh?.openPRs ?? null,
    };
  }

  private async ghInfo(dir: string): Promise<GhInfo> {
    const cached = this.gh.get(dir);
    if (cached && Date.now() - cached.at < GH_TTL_MS) return cached;
    const [view, prs] = await Promise.all([
      run('gh', ['repo', 'view', '--json', 'nameWithOwner,visibility,url'], {
        cwd: dir,
        timeoutMs: 10_000,
      }),
      run('gh', ['pr', 'list', '--state', 'open', '--json', 'number', '--limit', '100'], {
        cwd: dir,
        timeoutMs: 10_000,
      }),
    ]);
    const info: GhInfo = { repo: null, url: null, visibility: null, openPRs: null, at: Date.now() };
    if (view.ok) {
      try {
        const v = JSON.parse(view.stdout) as {
          nameWithOwner?: string;
          url?: string;
          visibility?: string;
        };
        info.repo = v.nameWithOwner ?? null;
        info.url = v.url ?? null;
        const vis = v.visibility?.toLowerCase();
        info.visibility = vis === 'public' || vis === 'private' || vis === 'internal' ? vis : null;
      } catch {
        // gh output changed; leave GitHub fields empty
      }
    }
    if (prs.ok) {
      try {
        info.openPRs = (JSON.parse(prs.stdout) as unknown[]).length;
      } catch {
        info.openPRs = null;
      }
    }
    this.gh.set(dir, info);
    return info;
  }
}
