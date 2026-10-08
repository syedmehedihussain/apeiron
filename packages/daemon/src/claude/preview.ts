import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { structuredPatch } from 'diff';
import type { ApprovalFile, DiffLine } from '@apeiron/shared';

const MAX_PREVIEW_LINES = 400;

/** Unified hunks (3 lines of context) as DiffLines with both line numbers. */
export function diffLines(
  before: string,
  after: string,
): { lines: DiffLine[]; added: number; removed: number } {
  const patch = structuredPatch('a', 'b', before, after, '', '', { context: 3 });
  const lines: DiffLine[] = [];
  let added = 0;
  let removed = 0;
  for (const hunk of patch.hunks) {
    let a = hunk.oldStart;
    let b = hunk.newStart;
    for (const raw of hunk.lines) {
      const kind = raw[0];
      const text = raw.slice(1);
      if (kind === '+') {
        added++;
        lines.push({ kind: '+', a: null, b: b++, text });
      } else if (kind === '-') {
        removed++;
        lines.push({ kind: '-', a: a++, b: null, text });
      } else if (kind === ' ') {
        lines.push({ kind: ' ', a: a++, b: b++, text });
      }
    }
  }
  return { lines: lines.slice(0, MAX_PREVIEW_LINES), added, removed };
}

function readOrEmpty(file: string): string | null {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

interface EditInput {
  file_path?: unknown;
  old_string?: unknown;
  new_string?: unknown;
  replace_all?: unknown;
  content?: unknown;
  edits?: unknown;
}

function applyEdit(text: string, oldStr: string, newStr: string, all: boolean): string {
  if (!oldStr) return newStr + text;
  return all ? text.split(oldStr).join(newStr) : text.replace(oldStr, () => newStr);
}

/**
 * What an Edit / Write / MultiEdit call would change, as a diff for the approval card
 * (claude-runner.md → Approvals).
 */
export function editPreview(
  cwd: string,
  tool: string,
  input: Record<string, unknown>,
): ApprovalFile | null {
  const i = input as EditInput;
  if (typeof i.file_path !== 'string') return null;
  const abs = path.resolve(cwd, i.file_path);
  const rel = path.relative(cwd, abs).split(path.sep).join('/');
  const current = readOrEmpty(abs);
  const before = current ?? '';
  let after = before;
  if (tool === 'Write' && typeof i.content === 'string') {
    after = i.content;
  } else if (
    tool === 'Edit' &&
    typeof i.old_string === 'string' &&
    typeof i.new_string === 'string'
  ) {
    after = applyEdit(before, i.old_string, i.new_string, i.replace_all === true);
  } else if (tool === 'MultiEdit' && Array.isArray(i.edits)) {
    for (const e of i.edits as EditInput[]) {
      if (typeof e.old_string === 'string' && typeof e.new_string === 'string') {
        after = applyEdit(after, e.old_string, e.new_string, e.replace_all === true);
      }
    }
  } else {
    return { path: rel, isNew: current === null, added: 0, removed: 0, lines: [] };
  }
  return { path: rel, isNew: current === null && !existsSync(abs), ...diffLines(before, after) };
}
