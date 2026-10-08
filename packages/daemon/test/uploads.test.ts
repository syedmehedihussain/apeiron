import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MAX_UPLOAD_BYTES } from '@apeiron/shared';
import { safeName } from '../src/chat/uploads.ts';
import { fakeRunner, type FakeLog } from '../src/claude/fake-runner.ts';
import { HOST, ORIGIN, testDaemon, write, type TestDaemon } from './helpers.ts';

describe('chat attachments', () => {
  let d: TestDaemon;
  let cookie: string;
  let log: FakeLog;
  let dir: string;

  const upload = (name: string, data: Buffer, withCookie = true) =>
    d.app.inject({
      method: 'POST',
      url: `/api/projects/core/uploads?name=${encodeURIComponent(name)}`,
      headers: {
        host: HOST,
        origin: ORIGIN,
        'content-type': 'application/octet-stream',
        ...(withCookie ? { cookie } : {}),
      },
      payload: data,
    });

  beforeEach(async () => {
    log = { requests: [], permissions: [], decisions: [] };
    d = await testDaemon({ runner: fakeRunner([{ text: 'Got it.' }], log) });
    cookie = await d.login();
    dir = path.join(d.projectsDir, 'core');
    write(path.join(dir, 'README.md'), '# core\n');
    write(path.join(dir, '.gitignore'), 'node_modules/');
  });
  afterEach(() => d.cleanup());

  it('cleans file names', () => {
    expect(safeName('My Photo (1).PNG')).toBe('my-photo-1.png');
    expect(safeName('../../etc/passwd')).toBe('passwd');
    expect(safeName('...')).toBe('file');
  });

  it('saves into apeiron/uploads, ignores apeiron/ in git, and Claude is told the path', async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
    const r = await upload('Screen Shot.png', png);
    expect(r.statusCode).toBe(200);
    const f = r.json() as { id: string; name: string; size: number };
    expect(f).toMatchObject({ name: 'Screen Shot.png', size: 7 });
    expect(f.id).toMatch(/^\d{4}-\d{2}-\d{2}-[0-9a-f]{6}-screen-shot\.png$/);
    expect(readFileSync(path.join(dir, 'apeiron', 'uploads', f.id))).toEqual(png);
    expect(readFileSync(path.join(dir, '.gitignore'), 'utf8')).toBe(
      'node_modules/\n\n# Apeiron chat attachments\napeiron/\n',
    );
    await upload('b.txt', Buffer.from('x'));
    expect(readFileSync(path.join(dir, '.gitignore'), 'utf8').match(/apeiron\//g)).toHaveLength(1);

    const res = await d.app.inject({
      method: 'POST',
      url: '/api/projects/core/chat',
      headers: { host: HOST, origin: ORIGIN, cookie },
      payload: { text: 'What is in this picture?', attachments: [f.id] },
    });
    expect(res.statusCode).toBe(200);
    await new Promise((r) => setTimeout(r, 50));
    expect(log.requests[0]!.prompt).toContain(`apeiron/uploads/${f.id}`);
    expect(log.requests[0]!.prompt).toContain('Read tool');
    const user = d.chat.state('core').items.find((i) => i.kind === 'user');
    expect(user).toMatchObject({ text: 'What is in this picture?', attachments: [f.id] });

    const img = await d.app.inject({
      method: 'GET',
      url: `/api/projects/core/uploads/${f.id}`,
      headers: { host: HOST, cookie },
    });
    expect(img.statusCode).toBe(200);
    expect(img.headers['content-type']).toBe('image/png');
    expect(img.headers['content-disposition']).toMatch(/^inline/);
  });

  it('deletes an upload that was never sent, and keeps one that was', async () => {
    const del = (id: string) =>
      d.app.inject({
        method: 'DELETE',
        url: `/api/projects/core/uploads/${id}`,
        headers: { host: HOST, origin: ORIGIN, cookie },
      });
    const a = (await upload('a.png', Buffer.from('a'))).json() as { id: string };
    const b = (await upload('b.png', Buffer.from('b'))).json() as { id: string };
    expect((await del(a.id)).statusCode).toBe(200);
    expect(existsSync(path.join(dir, 'apeiron', 'uploads', a.id))).toBe(false);
    expect((await del(a.id)).statusCode).toBe(404);

    await d.app.inject({
      method: 'POST',
      url: '/api/projects/core/chat',
      headers: { host: HOST, origin: ORIGIN, cookie },
      payload: { text: 'look', attachments: [b.id] },
    });
    expect((await del(b.id)).statusCode).toBe(409);
    expect(existsSync(path.join(dir, 'apeiron', 'uploads', b.id))).toBe(true);
    expect((await del('..%2F..%2FREADME.md')).statusCode).toBe(404);
    expect(existsSync(path.join(dir, 'README.md'))).toBe(true);
  });

  it('serves anything that is not an image as a download, never as a page', async () => {
    const f = (await upload('page.html', Buffer.from('<script>alert(1)</script>'))).json() as {
      id: string;
    };
    const r = await d.app.inject({
      method: 'GET',
      url: `/api/projects/core/uploads/${f.id}`,
      headers: { host: HOST, cookie },
    });
    expect(r.headers['content-type']).toBe('application/octet-stream');
    expect(r.headers['content-disposition']).toMatch(/^attachment/);
    expect(r.headers['x-content-type-options']).toBe('nosniff');
  });

  it('refuses no login, oversize files, unknown attachments and path tricks', async () => {
    expect((await upload('a.png', Buffer.from('x'), false)).statusCode).toBe(401);
    const big = await upload('big.bin', Buffer.alloc(MAX_UPLOAD_BYTES + 1));
    expect([400, 413]).toContain(big.statusCode);
    const send = await d.app.inject({
      method: 'POST',
      url: '/api/projects/core/chat',
      headers: { host: HOST, origin: ORIGIN, cookie },
      payload: { text: 'hi', attachments: ['../../README.md'] },
    });
    expect(send.statusCode).toBe(404);
    for (const bad of ['..%2F..%2FREADME.md', '.gitignore']) {
      const r = await d.app.inject({
        method: 'GET',
        url: `/api/projects/core/uploads/${bad}`,
        headers: { host: HOST, cookie },
      });
      expect(r.statusCode).toBe(404);
    }
    expect(log.requests).toHaveLength(0);
    const uploads = path.join(dir, 'apeiron', 'uploads');
    expect(existsSync(uploads) ? readdirSync(uploads) : []).toEqual([]);
  });
});
