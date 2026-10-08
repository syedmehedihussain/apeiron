import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import type { Health } from '@apeiron/shared';
import { AuthStore, newCliSecret } from './auth.ts';
import { ConfigStore } from './config.ts';
import { openDb, type Db } from './db.ts';
import { EventHub } from './events.ts';
import { HealthService } from './health-service.ts';
import { ensureMagnetFiles } from './magnet/files.ts';
import { ProjectService } from './projects/service.ts';
import { buildServer } from './server.ts';
import { watchProjects } from './watcher.ts';
import pkg from '../package.json' with { type: 'json' };

export interface Daemon {
  app: FastifyInstance;
  config: ConfigStore;
  auth: AuthStore;
  hub: EventHub;
  db: Db;
  projects: ProjectService;
  health: HealthService;
  cliSecret: string;
  close(): Promise<void>;
}

export interface DaemonOptions {
  home: string;
  /** Port the daemon listens on; used to build the allowed origins. */
  port: number;
  /** Extra allowed UI origins (the Vite dev server). */
  extraOrigins?: string[];
  /** Watch the projects folder for changes (off in unit tests). */
  watch?: boolean;
  /** Use an in-memory database (tests). */
  memoryDb?: boolean;
  /** Replace the real tool checks (tests). */
  healthCheck?: () => Promise<Health>;
}

const WEB_DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../web/dist');

export function createDaemon(opts: DaemonOptions): Daemon {
  const config = new ConfigStore(opts.home);
  ensureMagnetFiles(opts.home);
  const db = openDb(opts.memoryDb ? ':memory:' : path.join(opts.home, 'cache.db'));
  const hub = new EventHub();
  const auth = new AuthStore(opts.home);
  const health = new HealthService(pkg.version, config, hub, opts.healthCheck);
  const projects = new ProjectService(config, db, hub, opts.home);
  const cliSecret = newCliSecret();

  const app = buildServer({
    version: pkg.version,
    config,
    auth,
    hub,
    health,
    projects,
    cliSecret,
    origins: [`http://127.0.0.1:${opts.port}`, ...(opts.extraOrigins ?? [])],
    webDist: WEB_DIST,
  });

  const watcher = opts.watch
    ? watchProjects(config.projectsDir(), () => void projects.rescan())
    : null;

  return {
    app,
    config,
    auth,
    hub,
    db,
    projects,
    health,
    cliSecret,
    async close() {
      await watcher?.close();
      await app.close();
      db.close();
    },
  };
}
