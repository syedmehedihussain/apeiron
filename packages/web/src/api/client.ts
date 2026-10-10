import type { ZodType } from 'zod';
import { ApiErrorSchema } from '@cherry/shared';

/** The daemon answered with an error. */
export class ApiFailure extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** The daemon did not answer at all (not running). */
export class DaemonUnreachable extends Error {}

type Listener = (err: ApiFailure | DaemonUnreachable) => void;
const listeners = new Set<Listener>();

/** Global failure listener: the app shell uses it for the logged-out and not-running pages. */
export function onApiFailure(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export async function api<T>(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
  schema?: ZodType<T>,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    const err = new DaemonUnreachable('Cherry is not running.');
    listeners.forEach((fn) => fn(err));
    throw err;
  }
  if (res.status === 502 || res.status === 503 || res.status === 504) {
    // The Vite dev proxy answers 5xx when the daemon is down.
    const err = new DaemonUnreachable('Cherry is not running.');
    listeners.forEach((fn) => fn(err));
    throw err;
  }
  const data: unknown = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    const parsed = ApiErrorSchema.safeParse(data);
    const err = parsed.success
      ? new ApiFailure(res.status, parsed.data.error.code, parsed.data.error.message)
      : new ApiFailure(res.status, 'unknown', `Request failed (${res.status})`);
    listeners.forEach((fn) => fn(err));
    throw err;
  }
  return schema ? schema.parse(data) : (data as T);
}

/** Reads `#login=<code>` from the URL, trades it for the session cookie and strips it. */
export async function redeemLoginFromHash(): Promise<'none' | 'ok' | 'failed'> {
  const m = /(?:^#|&)login=([^&]+)/.exec(window.location.hash);
  if (!m?.[1]) return 'none';
  const code = decodeURIComponent(m[1]);
  window.history.replaceState(null, '', window.location.pathname + window.location.search);
  try {
    await api('POST', '/api/session', { code });
    return 'ok';
  } catch {
    return 'failed';
  }
}
