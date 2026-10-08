import { mkdirSync, symlinkSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PathOutsideRoot, isSecretFile, resolveInside } from '../src/paths.ts';
import { tempDir, write } from './helpers.ts';

// Must-pass safety test 6 (docs/testing.md).
describe('resolveInside', () => {
  const root = tempDir();
  write(path.join(root, 'src', 'a.ts'), 'x');
  const outside = tempDir();
  write(path.join(outside, 'secret.txt'), 'x');
  symlinkSync(outside, path.join(root, 'link-out'));
  mkdirSync(path.join(root, 'docs'));

  it('allows a normal path', () => {
    expect(resolveInside(root, 'src/a.ts')).toMatch(/src\/a\.ts$/);
  });

  it('allows the root itself', () => {
    expect(() => resolveInside(root, '')).not.toThrow();
  });

  it('allows a file that does not exist yet', () => {
    expect(() => resolveInside(root, 'docs/new.md')).not.toThrow();
  });

  it.each([
    ['../outside'],
    ['src/../../x'],
    ['/etc/passwd'],
    ['%2e%2e/%2e%2e/etc/passwd'],
    ['src/a.ts\0.png'],
    ['link-out/secret.txt'],
    ['link-out/new-file'],
    ['%E0%A4%A'],
  ])('rejects %s', (p) => {
    expect(() => resolveInside(root, p)).toThrow(PathOutsideRoot);
  });
});

describe('isSecretFile', () => {
  it.each([
    '.env',
    '.env.local',
    'certs/server.pem',
    'id_rsa',
    'id_ed25519.pub',
    '.npmrc',
    '.git/config',
    'a/b.key',
  ])('hides %s', (p) => expect(isSecretFile(p)).toBe(true));
  it.each(['.env.example', 'src/env.ts', 'README.md', 'keys.md'])('shows %s', (p) =>
    expect(isSecretFile(p)).toBe(false),
  );
});
