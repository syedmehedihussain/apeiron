import { chmodSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { ConfigSchema, type Config, type ConfigPatch } from '@apeiron/shared';
import { readJsonFile, writeFileAtomic } from './fsutil.ts';
import { expandHome } from './paths.ts';

export class ConfigStore {
  readonly file: string;
  private current: Config;

  constructor(readonly home: string) {
    mkdirSync(home, { recursive: true, mode: 0o700 });
    chmodSync(home, 0o700);
    this.file = path.join(home, 'config.json');
    this.current = this.load();
  }

  private load(): Config {
    if (!existsSync(this.file)) {
      const fresh = ConfigSchema.parse({});
      writeFileAtomic(this.file, JSON.stringify(fresh, null, 2) + '\n', 0o600);
      return fresh;
    }
    const parsed = ConfigSchema.safeParse(readJsonFile(this.file));
    if (!parsed.success) {
      throw new Error(`${this.file} is not valid: ${parsed.error.issues[0]?.message ?? 'unknown'}`);
    }
    return parsed.data;
  }

  get(): Config {
    return this.current;
  }

  /** Absolute projects folder. `$APEIRON_PROJECTS_DIR` wins (used by tests and e2e). */
  projectsDir(): string {
    return path.resolve(expandHome(process.env.APEIRON_PROJECTS_DIR ?? this.current.projectsDir));
  }

  worktreeDir(): string {
    return path.resolve(expandHome(this.current.agents.worktreeDir));
  }

  update(patch: ConfigPatch): Config {
    const next = ConfigSchema.parse({
      ...this.current,
      ...(patch.projectsDir !== undefined && { projectsDir: patch.projectsDir }),
      scan: { ...this.current.scan, ...patch.scan },
      claude: { ...this.current.claude, ...patch.claude },
      agents: { ...this.current.agents, ...patch.agents },
      magnet: { ...this.current.magnet, ...patch.magnet },
    });
    writeFileAtomic(this.file, JSON.stringify(next, null, 2) + '\n', 0o600);
    this.current = next;
    return next;
  }
}
