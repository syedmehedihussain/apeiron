import type { Db } from './db.ts';

function dayKey(t: number): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Counts a new session and the longest task per local day (Settings → Usage). */
export function recordUsage(db: Db, at: number, durationMs: number, newSession: boolean): void {
  db.prepare(
    `INSERT INTO usage_days (day, sessions, longest_ms) VALUES (?, ?, ?)
     ON CONFLICT(day) DO UPDATE SET sessions = sessions + excluded.sessions, longest_ms = MAX(longest_ms, excluded.longest_ms)`,
  ).run(dayKey(at), newSession ? 1 : 0, Math.round(durationMs));
}
