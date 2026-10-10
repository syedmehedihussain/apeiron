import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { migrateHome, migrateProjects } from '../src/migrate.ts';
import { tempDir, write } from './helpers.ts';

describe('migration from Apeiron (ADR-0014)', () => {
  it('moves ~/.apeiron to ~/.cherry once, never over an existing folder', () => {
    const root = tempDir();
    const old = path.join(root, '.apeiron');
    const home = path.join(root, '.cherry');
    write(path.join(old, 'config.json'), '{}');
    expect(migrateHome(home, old)).toBe(true);
    expect(existsSync(path.join(home, 'config.json'))).toBe(true);
    expect(existsSync(old)).toBe(false);

    write(path.join(old, 'config.json'), '{"again":1}');
    expect(migrateHome(home, old)).toBe(false);
    expect(readFileSync(path.join(home, 'config.json'), 'utf8')).toBe('{}');
  });

  it("moves a project's apeiron/ uploads and reports, and its ignore line", () => {
    const projects = tempDir();
    const a = path.join(projects, 'a');
    write(path.join(a, 'apeiron', 'reports', 'security', 'r.md'), 'report');
    write(path.join(a, 'apeiron', 'uploads', 'x.png'), 'png');
    write(
      path.join(a, '.gitignore'),
      'node_modules/\n\n# Apeiron uploads and reports\n/apeiron/\n',
    );
    // A project with its own apeiron/ folder is left alone.
    write(path.join(projects, 'b', 'apeiron', 'index.ts'), 'mine');
    // So is one that already has cherry/.
    mkdirSync(path.join(projects, 'c', 'apeiron', 'uploads'), { recursive: true });
    mkdirSync(path.join(projects, 'c', 'cherry'), { recursive: true });

    expect(migrateProjects(projects)).toEqual(['a']);
    expect(readFileSync(path.join(a, 'cherry', 'reports', 'security', 'r.md'), 'utf8')).toBe(
      'report',
    );
    expect(readFileSync(path.join(a, '.gitignore'), 'utf8')).toBe(
      'node_modules/\n\n# Cherry uploads and reports\n/cherry/\n',
    );
    expect(existsSync(path.join(projects, 'b', 'apeiron', 'index.ts'))).toBe(true);
    expect(existsSync(path.join(projects, 'c', 'apeiron'))).toBe(true);
    expect(migrateProjects(projects)).toEqual([]);
  });
});
