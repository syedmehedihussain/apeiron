import chokidar, { type FSWatcher } from 'chokidar';
import path from 'node:path';

const IGNORED_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  '.next',
  '.venv',
  '__pycache__',
  'target',
]);

/**
 * Watches the projects folder (two levels deep) and calls `onChange` with the ids of the projects
 * that changed, debounced. `.git/HEAD` and `.git/index` are watched so commits and checkouts show.
 */
export function watchProjects(
  projectsDir: string,
  onChange: (projectIds: Set<string>, topLevel: boolean) => void,
  debounceMs = 400,
): FSWatcher {
  let pending = new Set<string>();
  let topLevel = false;
  let timer: NodeJS.Timeout | null = null;

  const watcher = chokidar.watch(projectsDir, {
    ignoreInitial: true,
    depth: 3,
    ignored: (p: string) => {
      const rel = path.relative(projectsDir, p);
      if (!rel || rel.startsWith('..')) return false;
      const parts = rel.split(path.sep);
      if (parts[0]?.startsWith('.')) return true;
      if (parts.some((s) => IGNORED_DIRS.has(s))) return true;
      const gitAt = parts.indexOf('.git');
      if (gitAt >= 0) {
        const inside = parts.slice(gitAt + 1);
        return !(inside.length === 0 || inside[0] === 'HEAD' || inside[0] === 'index');
      }
      return false;
    },
  });

  watcher.on('all', (_event, p) => {
    const rel = path.relative(projectsDir, p);
    const parts = rel.split(path.sep);
    if (parts.length === 1) topLevel = true;
    if (parts[0]) pending.add(parts[0]);
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      const ids = pending;
      const top = topLevel;
      pending = new Set();
      topLevel = false;
      onChange(ids, top);
    }, debounceMs);
  });

  return watcher;
}
