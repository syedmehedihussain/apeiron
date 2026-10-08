import { homedir } from 'node:os';
import path from 'node:path';

export type CommandVerdict = { blocked: true; reason: string } | { blocked: false };

/** Splits a shell line into simple commands on ; && || | and newlines (quotes kept as-is). */
function segments(cmd: string): string[] {
  return cmd
    .split(/\|\||&&|;|\n|\|/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function tokens(segment: string): string[] {
  return (segment.match(/'[^']*'|"[^"]*"|\S+/g) ?? []).map((t) => t.replace(/^['"]|['"]$/g, ''));
}

function insideProject(target: string, cwd: string): boolean {
  if (target.startsWith('~') || target.includes('$') || target.includes('`')) return false;
  const abs = path.resolve(cwd, target);
  const root = path.resolve(cwd);
  return abs !== root && abs.startsWith(root + path.sep) && abs !== homedir();
}

/**
 * Commands that are never even shown as an approval (docs/security.md → Command rules).
 * Everything else still needs the user's approval.
 */
export function classifyCommand(command: string, cwd: string): CommandVerdict {
  if (/(curl|wget)\b[^|]*\|\s*(sudo\s+)?(ba|z|da|k)?sh\b/.test(command)) {
    return { blocked: true, reason: 'Piping a download into a shell is blocked.' };
  }
  for (const seg of segments(command)) {
    const t = tokens(seg);
    const prog = t[0] ?? '';
    if (prog === 'sudo' || prog === 'doas') return { blocked: true, reason: 'sudo is blocked.' };
    if (prog === 'rm') {
      const flags = t.filter((x) => x.startsWith('-')).join(' ');
      const recursive = /(^|\s)-[a-zA-Z]*[rR]|--recursive/.test(flags);
      if (recursive) {
        const targets = t.slice(1).filter((x) => !x.startsWith('-'));
        const outside = targets.find((x) => !insideProject(x, cwd));
        if (targets.length === 0 || outside !== undefined) {
          return {
            blocked: true,
            reason: `rm -r outside the project is blocked (${outside ?? 'no target'}).`,
          };
        }
      }
    }
    if (prog === 'git' && t[1] === 'push') {
      const force = t.some(
        (x) => x === '-f' || x === '--force' || x.startsWith('--force-with-lease') || /^\+/.test(x),
      );
      const protectedRef = t.some(
        (x) =>
          /^\+?(refs\/heads\/)?(main|master)$/.test(x) || /:(refs\/heads\/)?(main|master)$/.test(x),
      );
      const refspecs = t.slice(2).filter((x) => !x.startsWith('-'));
      if (force && (protectedRef || refspecs.length <= 1)) {
        return { blocked: true, reason: 'Force-pushing to main or master is blocked.' };
      }
    }
  }
  return { blocked: false };
}
