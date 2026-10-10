import { randomBytes } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
  appendFileSync,
} from 'node:fs';
import path from 'node:path';
import { MAX_UPLOAD_BYTES, type UploadedFile } from '@apeiron/shared';
import { badRequest, notFound } from '../http.ts';
import { resolveInside } from '../paths.ts';

/** Chat attachments live in the project, kept out of git (the user's choice). */
export const UPLOADS_DIR = 'apeiron/uploads';

/** Image types the browser may show inline; everything else downloads. */
const INLINE_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};

/** "My Photo (1).PNG" → "my-photo-1.png"; never empty, never a path. */
export function safeName(name: string): string {
  const base = path.basename(name.replace(/\\/g, '/'));
  const ext = path
    .extname(base)
    .toLowerCase()
    .replace(/[^.a-z0-9]/g, '')
    .slice(0, 10);
  const stem = base
    .slice(0, base.length - path.extname(base).length)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${stem || 'file'}${ext.length > 1 ? ext : ''}`;
}

/**
 * Adds `/apeiron/` to the project's .gitignore once, so uploads and reports never get committed.
 * Anchored to the root: a bare `apeiron/` would also hide folders like .claude/skills/apeiron.
 */
export function ensureIgnored(dir: string): void {
  const file = path.join(dir, '.gitignore');
  const text = existsSync(file) ? readFileSync(file, 'utf8') : '';
  if (text.split('\n').some((l) => /^\/?apeiron\/?\s*$/.test(l.trim()))) return;
  const sep = text && !text.endsWith('\n') ? '\n' : '';
  appendFileSync(file, `${sep}${text ? '\n' : ''}# Apeiron uploads and reports\n/apeiron/\n`);
}

export function saveUpload(dir: string, name: string, data: Buffer): UploadedFile {
  if (data.length === 0) throw badRequest('The file is empty.');
  if (data.length > MAX_UPLOAD_BYTES)
    throw badRequest(`The file is larger than ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`);
  const uploads = path.join(dir, UPLOADS_DIR);
  mkdirSync(uploads, { recursive: true });
  // Refuses an uploads folder that is really a symlink to somewhere else.
  resolveInside(dir, UPLOADS_DIR);
  ensureIgnored(dir);
  const stored = `${new Date().toISOString().slice(0, 10)}-${randomBytes(3).toString('hex')}-${safeName(name)}`;
  writeFileSync(path.join(uploads, stored), data, { flag: 'wx' });
  return { id: stored, name: path.basename(name).slice(0, 200), size: data.length };
}

/** The stored file for an id from a chat message, or a 404. */
export function uploadPath(dir: string, id: string): string {
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(id) || id.includes('..')) throw notFound('No such upload');
  const abs = resolveInside(dir, `${UPLOADS_DIR}/${id}`);
  if (!existsSync(abs) || !statSync(abs).isFile()) throw notFound('No such upload');
  return abs;
}

export function contentTypeFor(id: string): { type: string; inline: boolean } {
  const t = INLINE_TYPES[path.extname(id).toLowerCase()];
  return t ? { type: t, inline: true } : { type: 'application/octet-stream', inline: false };
}
