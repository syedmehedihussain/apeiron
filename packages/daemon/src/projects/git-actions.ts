import type { GitResult, PullRequestList } from '@apeiron/shared';
import type { ConfigStore } from '../config.ts';
import type { EventHub } from '../events.ts';
import { run } from '../exec.ts';
import { git, gitStatus } from '../git.ts';
import { conflict } from '../http.ts';
import type { ApprovalBroker } from '../claude/approvals.ts';
import type { GitInfoService } from './github.ts';
import { projectDir } from './workspace.ts';

/** `gh pr list` for one folder; replaced in tests so nothing leaves the machine. */
export type PrLister = (dir: string) => Promise<PullRequestList>;

export const ghPrList: PrLister = async (dir) => {
  const r = await run(
    'gh',
    [
      'pr',
      'list',
      '--state',
      'open',
      '--limit',
      '30',
      '--json',
      'number,title,url,author,headRefName,isDraft,updatedAt',
    ],
    { cwd: dir, timeoutMs: 15_000 },
  );
  if (!r.ok) {
    const msg = (r.stderr || r.stdout).trim();
    return {
      prs: [],
      error:
        r.code === 127 || /not found|ENOENT/.test(msg)
          ? 'The GitHub CLI (gh) is not installed.'
          : msg.split('\n')[0] || 'gh could not list pull requests.',
    };
  }
  try {
    const rows = JSON.parse(r.stdout) as {
      number: number;
      title: string;
      url: string;
      author?: { login?: string };
      headRefName?: string;
      isDraft?: boolean;
      updatedAt?: string;
    }[];
    return {
      prs: rows.map((p) => ({
        number: p.number,
        title: p.title,
        url: p.url,
        author: p.author?.login ?? '',
        branch: p.headRefName ?? '',
        draft: !!p.isDraft,
        updatedAt: p.updatedAt ? Date.parse(p.updatedAt) : 0,
      })),
      error: null,
    };
  } catch {
    return { prs: [], error: 'gh returned something Apeiron could not read.' };
  }
};

const firstLine = (s: string) =>
  s
    .trim()
    .split('\n')
    .filter((l) => l && !l.startsWith('hint:'))
    .slice(-1)[0] ?? '';

/**
 * Pull and Push from the GitHub box (api.md → Git and GitHub). Pull is fast-forward only. Push
 * always waits for an approval and never forces.
 */
export class GitActions {
  constructor(
    private readonly config: ConfigStore,
    private readonly hub: EventHub,
    private readonly approvals: ApprovalBroker,
    private readonly gitInfo: GitInfoService,
    private readonly listPrs: PrLister = ghPrList,
  ) {}

  private changed(id: string, dir: string, result: GitResult): void {
    this.gitInfo.invalidate(dir);
    this.hub.publish(`project:${id}`, 'project.changed', { projectId: id, paths: [] });
    this.hub.publish(`project:${id}`, 'git.result', { projectId: id, ...result });
  }

  async pull(id: string): Promise<GitResult> {
    const dir = projectDir(this.config.projectsDir(), id);
    const status = await gitStatus(dir);
    if (!status) throw conflict('This folder is not a git repository.');
    if (!status.remote) throw conflict('This branch has no upstream to pull from.');
    const r = await git(dir, ['pull', '--ff-only'], 120_000);
    const result: GitResult = r.ok
      ? {
          action: 'pull',
          ok: true,
          message: /Already up to date/i.test(r.stdout)
            ? 'Already up to date.'
            : `Pulled. ${firstLine(r.stdout)}`.trim(),
        }
      : {
          action: 'pull',
          ok: false,
          message: /Not possible to fast-forward|diverged|non-fast-forward/i.test(r.stderr)
            ? 'Your branch and the remote have both changed, so Apeiron will not merge them. Ask Claude to help, or merge in a terminal.'
            : /would be overwritten/i.test(r.stderr)
              ? 'Uncommitted changes would be overwritten. Commit or stash them first.'
              : firstLine(r.stderr || r.stdout) || 'git pull failed.',
        };
    this.changed(id, dir, result);
    return result;
  }

  /** Creates a push approval; the push runs in the background after Allow. */
  async push(id: string): Promise<{ approvalId: string }> {
    const dir = projectDir(this.config.projectsDir(), id);
    const status = await gitStatus(dir);
    if (!status) throw conflict('This folder is not a git repository.');
    if (!status.branch) throw conflict('Check out a branch before pushing.');
    if (this.approvals.list('pending').some((a) => a.projectId === id && a.kind === 'push'))
      throw conflict('A push is already waiting for your approval.');
    let args: string[];
    let target: string;
    let log: string;
    if (status.remote) {
      if (status.ahead === 0) throw conflict('Nothing to push.');
      const upstream = (
        await git(dir, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'])
      ).stdout.trim();
      const [remote = 'origin', ...rest] = upstream.split('/');
      args = ['push', remote, `HEAD:${rest.join('/') || status.branch}`];
      target = upstream;
      log = (await git(dir, ['log', '--format=%h %s', '@{u}..HEAD', '-50'])).stdout;
    } else {
      const remotes = (await git(dir, ['remote'])).stdout.split('\n').filter(Boolean);
      if (!remotes.includes('origin')) throw conflict('This repository has no remote to push to.');
      args = ['push', '-u', 'origin', status.branch];
      target = `origin/${status.branch}`;
      log = (await git(dir, ['log', '--format=%h %s', '-20'])).stdout;
    }
    const commits = log.trim().split('\n').filter(Boolean);
    const n = status.remote ? status.ahead : commits.length;
    const { approval, done } = this.approvals.request(
      {
        projectId: id,
        source: 'git',
        kind: 'push',
        tool: 'git push',
        title: `Push ${n} commit${n === 1 ? '' : 's'} to ${target}`,
        files: [],
        command: `git ${args.join(' ')}`,
        detail: commits.join('\n') || null,
        cwd: dir,
      },
      `git:${id}`,
      [],
    );
    void done.then(async (answer) => {
      if (answer.status !== 'allowed' && answer.status !== 'allowed_session') {
        this.hub.publish(`project:${id}`, 'git.result', {
          projectId: id,
          action: 'push',
          ok: false,
          message:
            answer.status === 'cancelled' ? 'Push cancelled.' : 'Push denied. Nothing was sent.',
        });
        return;
      }
      const r = await git(dir, args, 120_000);
      this.changed(
        id,
        dir,
        r.ok
          ? { action: 'push', ok: true, message: `Pushed to ${target}.` }
          : {
              action: 'push',
              ok: false,
              message: /rejected|non-fast-forward|fetch first/i.test(r.stderr)
                ? 'The remote has commits you do not have. Pull first, then push again.'
                : firstLine(r.stderr || r.stdout) || 'git push failed.',
            },
      );
    });
    return { approvalId: approval.id };
  }

  async prs(id: string): Promise<PullRequestList> {
    const dir = projectDir(this.config.projectsDir(), id);
    const status = await gitStatus(dir);
    if (!status?.remote) return { prs: [], error: null };
    return this.listPrs(dir);
  }
}
