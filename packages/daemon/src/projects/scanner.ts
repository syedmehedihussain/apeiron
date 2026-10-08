import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import {
  ProjectJsonSchema,
  type ProjectCard,
  type ProjectJson,
  type StatusDoc,
} from '@apeiron/shared';
import { readJsonFile, readTextOrNull } from '../fsutil.ts';
import { gitStatus, lastCommitTime } from '../git.ts';
import { firstOpenStep, parseStatusMd } from './status.ts';

export interface ProjectFiles {
  projectJson: ProjectJson | null;
  projectJsonError: boolean;
  status: StatusDoc | null;
}

export function readProjectFiles(dir: string): ProjectFiles {
  const pdir = path.join(dir, '_project');
  let projectJson: ProjectJson | null = null;
  let projectJsonError = false;
  const pj = path.join(pdir, 'project.json');
  if (existsSync(pj)) {
    try {
      const parsed = ProjectJsonSchema.safeParse(readJsonFile(pj));
      if (parsed.success) projectJson = parsed.data;
      else projectJsonError = true;
    } catch {
      projectJsonError = true;
    }
  }
  const statusMd = readTextOrNull(path.join(pdir, 'STATUS.md'));
  return {
    projectJson,
    projectJsonError,
    status: statusMd === null ? null : parseStatusMd(statusMd),
  };
}

/** Latest `updated` time in cctop's `_project/sessions.json`, if any. */
function lastSessionTime(dir: string): number | null {
  const file = path.join(dir, '_project', 'sessions.json');
  if (!existsSync(file)) return null;
  try {
    const data = readJsonFile(file);
    if (!data || typeof data !== 'object') return null;
    let latest: number | null = null;
    for (const s of Object.values(data as Record<string, unknown>)) {
      const updated = (s as { updated?: unknown })?.updated;
      if (typeof updated !== 'string') continue;
      const t = Date.parse(updated);
      if (!Number.isNaN(t) && (latest === null || t > latest)) latest = t;
    }
    return latest;
  } catch {
    return null;
  }
}

export async function buildCard(dir: string): Promise<ProjectCard> {
  const id = path.basename(dir);
  const files = readProjectFiles(dir);
  const { projectJson, status } = files;
  const state = projectJson ? 'ready' : status ? 'cctop' : 'uncalibrated';
  const git = await gitStatus(dir);
  const lastWorked =
    lastSessionTime(dir) ?? (git ? await lastCommitTime(dir) : null) ?? statSync(dir).mtimeMs;

  return {
    id,
    name: projectJson?.name ?? id,
    path: dir,
    state,
    phase: projectJson?.phase ?? null,
    summary: projectJson?.summary || status?.summary || '',
    stack: projectJson?.stack ?? [],
    nextStep: status ? firstOpenStep(status) : null,
    leftOff: status?.leftOff ?? null,
    git: git && {
      branch: git.branch,
      ahead: git.ahead,
      behind: git.behind,
      changes: git.changes,
      remote: git.remote,
    },
    lastWorked,
    projectJsonError: files.projectJsonError,
  };
}

/** Direct sub-folders of the projects folder, minus dot-folders and `scan.ignore`. */
export function listProjectDirs(projectsDir: string, ignore: string[]): string[] {
  if (!existsSync(projectsDir)) return [];
  return readdirSync(projectsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('.') && !ignore.includes(e.name))
    .map((e) => path.join(projectsDir, e.name));
}

export async function scanProjects(projectsDir: string, ignore: string[]): Promise<ProjectCard[]> {
  const dirs = listProjectDirs(projectsDir, ignore);
  const cards = await Promise.all(dirs.map((d) => buildCard(d)));
  return cards.sort((a, b) => (b.lastWorked ?? 0) - (a.lastWorked ?? 0));
}
