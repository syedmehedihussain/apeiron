import {
  existsSync,
  lstatSync,
  readdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

/**
 * Cherry was called Apeiron until 2026-10-11 (ADR-0014). These move the old data once, so an
 * update keeps settings, sessions, Magnet files, transcripts, uploads and reports.
 */

/** `~/.apeiron` → `~/.cherry`, only when the new folder does not exist yet. */
export function migrateHome(home: string, oldHome = path.join(homedir(), '.apeiron')): boolean {
  if (existsSync(home) || !existsSync(oldHome)) return false;
  renameSync(oldHome, home);
  return true;
}

const OURS = new Set(['uploads', 'reports']);

/**
 * `<project>/apeiron/` → `<project>/cherry/` for every project, but only when that folder holds
 * nothing but our `uploads/` and `reports/` (a project may have its own `apeiron/` folder).
 * The .gitignore line we added follows along. Returns the ids that moved.
 */
export function migrateProjects(projectsDir: string): string[] {
  if (!existsSync(projectsDir)) return [];
  const moved: string[] = [];
  for (const id of readdirSync(projectsDir)) {
    const dir = path.join(projectsDir, id);
    const old = path.join(dir, 'apeiron');
    try {
      if (!lstatSync(old).isDirectory() || existsSync(path.join(dir, 'cherry'))) continue;
      const entries = readdirSync(old);
      if (entries.length === 0 || !entries.every((e) => OURS.has(e))) continue;
      renameSync(old, path.join(dir, 'cherry'));
      const ignore = path.join(dir, '.gitignore');
      if (existsSync(ignore)) {
        const text = readFileSync(ignore, 'utf8')
          .split('\n')
          .map((l) =>
            /^\/?apeiron\/?\s*$/.test(l.trim())
              ? '/cherry/'
              : /^# Apeiron (chat attachments|uploads and reports)\s*$/.test(l.trim())
                ? '# Cherry uploads and reports'
                : l,
          )
          .join('\n');
        writeFileSync(ignore, text);
      }
      moved.push(id);
    } catch {
      // No apeiron/ folder, or one we cannot read: leave it alone.
    }
  }
  return moved;
}
