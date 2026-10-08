import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { readJsonFile, writeFileAtomic } from './fsutil.ts';

export const SESSION_COOKIE = 'apeiron_session';
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const LOGIN_CODE_TTL_MS = 10 * 60 * 1000;

const SessionsFileSchema = z.object({
  schema: z.literal(1),
  sessions: z.array(z.object({ hash: z.string(), createdAt: z.number(), expiresAt: z.number() })),
});

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function token(): string {
  return randomBytes(32).toString('base64url');
}

function sameHash(a: string, b: string): boolean {
  const x = Buffer.from(a, 'hex');
  const y = Buffer.from(b, 'hex');
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Login codes (single use, in memory) and browser sessions (hashed, on disk so they survive
 * restarts). See ADR-0008.
 */
export class AuthStore {
  private readonly file: string;
  private codes: { hash: string; expiresAt: number }[] = [];
  private sessions: z.infer<typeof SessionsFileSchema>['sessions'] = [];

  constructor(
    home: string,
    private readonly now: () => number = Date.now,
  ) {
    this.file = path.join(home, 'sessions.json');
    if (existsSync(this.file)) {
      const parsed = SessionsFileSchema.safeParse(readJsonFile(this.file));
      if (parsed.success) this.sessions = parsed.data.sessions;
    }
  }

  issueLoginCode(): string {
    const code = token();
    const t = this.now();
    this.codes = this.codes.filter((c) => c.expiresAt > t);
    this.codes.push({ hash: sha256(code), expiresAt: t + LOGIN_CODE_TTL_MS });
    return code;
  }

  /** Trades a login code for a session id. Returns null if the code is wrong, used or expired. */
  redeemLoginCode(code: string): string | null {
    const hash = sha256(code);
    const t = this.now();
    const found = this.codes.find((c) => sameHash(c.hash, hash));
    if (!found) return null;
    this.codes = this.codes.filter((c) => c !== found);
    if (found.expiresAt <= t) return null;
    const sessionId = token();
    this.sessions = this.sessions.filter((s) => s.expiresAt > t);
    this.sessions.push({ hash: sha256(sessionId), createdAt: t, expiresAt: t + SESSION_TTL_MS });
    this.save();
    return sessionId;
  }

  isValidSession(sessionId: string | undefined): boolean {
    if (!sessionId) return false;
    const hash = sha256(sessionId);
    const t = this.now();
    return this.sessions.some((s) => s.expiresAt > t && sameHash(s.hash, hash));
  }

  endSession(sessionId: string): void {
    const hash = sha256(sessionId);
    this.sessions = this.sessions.filter((s) => !sameHash(s.hash, hash));
    this.save();
  }

  endAllSessions(): void {
    this.sessions = [];
    this.save();
  }

  private save(): void {
    writeFileAtomic(
      this.file,
      JSON.stringify({ schema: 1, sessions: this.sessions }, null, 2) + '\n',
      0o600,
    );
  }
}

/** Secret shared with the CLI through `run/daemon.json` (mode 0600). */
export function newCliSecret(): string {
  return token();
}

export function secretsMatch(a: string, b: string): boolean {
  return sameHash(sha256(a), sha256(b));
}
