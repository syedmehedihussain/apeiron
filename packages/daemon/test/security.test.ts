import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuthStore, LOGIN_CODE_TTL_MS } from '../src/auth.ts';
import { HOST, ORIGIN, tempDir, testDaemon, type TestDaemon } from './helpers.ts';

// Must-pass safety test 5 (docs/testing.md).
describe('request security', () => {
  let d: TestDaemon;
  let cookie: string;
  beforeAll(async () => {
    d = await testDaemon();
    cookie = await d.login();
  });
  afterAll(() => d.cleanup());

  const get = (headers: Record<string, string>) =>
    d.app.inject({ method: 'GET', url: '/api/projects', headers });

  it('rejects a request without a session cookie', async () => {
    expect((await get({ host: HOST })).statusCode).toBe(401);
  });

  it('accepts a request with the session cookie', async () => {
    expect((await get({ host: HOST, cookie })).statusCode).toBe(200);
  });

  it('rejects a wrong Host header even with a cookie (DNS rebinding)', async () => {
    expect((await get({ host: 'evil.com:4317', cookie })).statusCode).toBe(403);
  });

  it('accepts localhost as an alias of 127.0.0.1', async () => {
    expect((await get({ host: 'localhost:4317', cookie })).statusCode).toBe(200);
  });

  it('rejects a foreign Origin even with a cookie', async () => {
    expect((await get({ host: HOST, origin: 'https://evil.com', cookie })).statusCode).toBe(403);
  });

  it('rejects the WebSocket without a cookie', async () => {
    const res = await d.app.inject({ method: 'GET', url: '/ws', headers: { host: HOST } });
    expect(res.statusCode).toBe(401);
  });

  it('refuses a used login code', async () => {
    const code = d.auth.issueLoginCode();
    const post = () =>
      d.app.inject({
        method: 'POST',
        url: '/api/session',
        headers: { host: HOST, origin: ORIGIN },
        payload: { code },
      });
    expect((await post()).statusCode).toBe(200);
    expect((await post()).statusCode).toBe(401);
  });

  it('refuses a made-up login code', async () => {
    const res = await d.app.inject({
      method: 'POST',
      url: '/api/session',
      headers: { host: HOST, origin: ORIGIN },
      payload: { code: 'nope' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('sets an HttpOnly SameSite=Strict cookie', async () => {
    const res = await d.app.inject({
      method: 'POST',
      url: '/api/session',
      headers: { host: HOST, origin: ORIGIN },
      payload: { code: d.auth.issueLoginCode() },
    });
    const setCookie = String(res.headers['set-cookie']);
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Strict');
  });

  it('logs out every browser', async () => {
    const other = await d.login();
    const res = await d.app.inject({
      method: 'POST',
      url: '/api/cli/logout',
      headers: { host: HOST, 'x-apeiron-cli': d.cliSecret },
    });
    expect(res.statusCode).toBe(200);
    expect((await get({ host: HOST, cookie: other })).statusCode).toBe(401);
    cookie = await d.login();
  });

  it('keeps CLI routes closed without the CLI secret', async () => {
    const res = await d.app.inject({
      method: 'POST',
      url: '/api/cli/login-code',
      headers: { host: HOST, cookie },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('AuthStore', () => {
  it('refuses an expired login code', () => {
    let now = 1_000_000;
    const auth = new AuthStore(tempDir(), () => now);
    const code = auth.issueLoginCode();
    now += LOGIN_CODE_TTL_MS + 1;
    expect(auth.redeemLoginCode(code)).toBeNull();
  });

  it('keeps sessions across restarts', () => {
    const home = tempDir();
    const id = new AuthStore(home).redeemLoginCode(new AuthStore(home).issueLoginCode());
    expect(id).toBeNull(); // codes live in memory only
    const a = new AuthStore(home);
    const session = a.redeemLoginCode(a.issueLoginCode());
    expect(new AuthStore(home).isValidSession(session ?? undefined)).toBe(true);
  });
});
