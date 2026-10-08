import { realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

/** `~/.apeiron`, or `$APEIRON_HOME` (tests point this at a temp dir). */
export function apeironHome(): string {
  return process.env.APEIRON_HOME ?? path.join(homedir(), '.apeiron');
}

export function expandHome(p: string): string {
  if (p === '~') return homedir();
  if (p.startsWith('~/')) return path.join(homedir(), p.slice(2));
  return p;
}

/** Shows a path with `~` for the home folder, for display only. */
export function tildify(p: string): string {
  const home = homedir();
  return p === home || p.startsWith(home + path.sep) ? '~' + p.slice(home.length) : p;
}

export class PathOutsideRoot extends Error {
  constructor(userPath: string) {
    super(`Path is outside the allowed folder: ${userPath}`);
    this.name = 'PathOutsideRoot';
  }
}

function realpathOrSelf(p: string): string {
  // Resolve the deepest existing ancestor, so a not-yet-created file inside a symlinked folder
  // is still checked against where the folder really points.
  let current = p;
  const rest: string[] = [];
  for (;;) {
    try {
      return path.join(realpathSync(current), ...rest);
    } catch {
      const parent = path.dirname(current);
      if (parent === current) return p;
      rest.unshift(path.basename(current));
      current = parent;
    }
  }
}

/**
 * The path guard (docs/security.md). Every path that comes from the client goes through here.
 * Resolves symlinks before checking the prefix and throws if the result leaves `root`.
 */
export function resolveInside(root: string, userPath: string): string {
  if (userPath.includes('\0')) throw new PathOutsideRoot(userPath);
  let decoded: string;
  try {
    decoded = decodeURIComponent(userPath);
  } catch {
    throw new PathOutsideRoot(userPath);
  }
  if (path.isAbsolute(decoded)) throw new PathOutsideRoot(userPath);
  const realRoot = realpathOrSelf(path.resolve(root));
  const target = realpathOrSelf(path.resolve(realRoot, decoded));
  if (target !== realRoot && !target.startsWith(realRoot + path.sep)) {
    throw new PathOutsideRoot(userPath);
  }
  return target;
}

/** Files the viewer and Claude's calibration never read (docs/security.md). */
const SECRET_PATTERNS = [
  /^\.env$/,
  /^\.env\..+/,
  /\.pem$/,
  /\.key$/,
  /^id_rsa/,
  /^id_ed25519/,
  /^\.npmrc$/,
  /^\.netrc$/,
];

export function isSecretFile(relPath: string): boolean {
  const parts = relPath.split(/[\\/]/);
  if (parts.includes('.git')) return true;
  const base = parts[parts.length - 1] ?? '';
  if (base === '.env.example') return false;
  return SECRET_PATTERNS.some((re) => re.test(base));
}
