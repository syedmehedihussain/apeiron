import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/** Writes through a temp file and a rename, so readers never see half a file. */
export function writeFileAtomic(file: string, content: string, mode?: number): void {
  mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${randomBytes(4).toString('hex')}.tmp`;
  writeFileSync(tmp, content, mode === undefined ? undefined : { mode });
  renameSync(tmp, file);
}

export function readJsonFile(file: string): unknown {
  return JSON.parse(readFileSync(file, 'utf8'));
}

export function readTextOrNull(file: string): string | null {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}
