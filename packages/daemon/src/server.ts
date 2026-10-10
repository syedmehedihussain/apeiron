import { existsSync } from 'node:fs';
import path from 'node:path';
import fastifyCookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import {
  ClientMessageSchema,
  ConfigPatchSchema,
  LoginBodySchema,
  type ApiError,
} from '@cherry/shared';
import { AuthStore, SESSION_COOKIE, SESSION_TTL_MS, secretsMatch } from './auth.ts';
import type { ConfigStore } from './config.ts';
import type { EventHub } from './events.ts';
import type { HealthService } from './health-service.ts';
import { HttpError } from './http.ts';
import { PathOutsideRoot } from './paths.ts';
import type { ProjectService } from './projects/service.ts';

export interface ServerDeps {
  version: string;
  config: ConfigStore;
  auth: AuthStore;
  hub: EventHub;
  health: HealthService;
  projects: ProjectService;
  /** Secret the CLI sends in `x-cherry-cli` (from run/daemon.json). */
  cliSecret: string;
  /** Origins the UI is served from, e.g. http://127.0.0.1:4317 (and the Vite dev server). */
  origins: string[];
  /** Built web UI to serve, if present. */
  webDist?: string;
  /** Extra routes from later milestones. */
  routes?: ((app: FastifyInstance) => void)[];
}

const PUBLIC_API = new Set(['POST /api/session']);

function withLocalhostAliases(origins: string[]): string[] {
  const out = new Set<string>();
  for (const o of origins) {
    out.add(o);
    out.add(o.replace('://127.0.0.1:', '://localhost:'));
  }
  return [...out];
}

export function buildServer(deps: ServerDeps): FastifyInstance {
  const app = Fastify({ logger: false, bodyLimit: 2 * 1024 * 1024 });
  const origins = withLocalhostAliases(deps.origins);
  const hosts = new Set(origins.map((o) => new URL(o).host));

  void app.register(fastifyCookie);
  void app.register(fastifyWebsocket);

  const sessionId = (req: FastifyRequest) => req.cookies[SESSION_COOKIE];

  // Host / Origin / session checks for every request (docs/security.md, ADR-0008).
  app.addHook('onRequest', async (req, reply) => {
    const host = req.headers.host ?? '';
    if (!hosts.has(host)) {
      return reply.code(403).send({ error: { code: 'bad_host', message: 'Unknown Host header' } });
    }
    const origin = req.headers.origin;
    if (origin !== undefined && !origins.includes(origin)) {
      return reply.code(403).send({ error: { code: 'bad_origin', message: 'Unknown Origin' } });
    }
    const url = req.url.split('?')[0] ?? '';
    if (url.startsWith('/api/cli/')) {
      const secret = req.headers['x-cherry-cli'];
      if (typeof secret !== 'string' || !secretsMatch(secret, deps.cliSecret)) {
        return reply.code(401).send({ error: { code: 'unauthorized', message: 'CLI only' } });
      }
      return;
    }
    const needsSession =
      (url.startsWith('/api/') || url === '/ws') && !PUBLIC_API.has(`${req.method} ${url}`);
    if (needsSession && !deps.auth.isValidSession(sessionId(req))) {
      return reply.code(401).send({
        error: {
          code: 'unauthorized',
          message: 'Run `cherry` in a terminal and open the link it prints.',
        },
      });
    }
  });

  app.setErrorHandler((err, _req, reply) => {
    let status = 500;
    let body: ApiError = {
      error: { code: 'internal', message: 'Something went wrong in the daemon.' },
    };
    if (err instanceof HttpError) {
      status = err.status;
      body = { error: { code: err.code, message: err.message } };
    } else if (err instanceof ZodError) {
      status = 400;
      body = {
        error: {
          code: 'bad_request',
          message: err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
        },
      };
    } else if (err instanceof PathOutsideRoot) {
      status = 400;
      body = { error: { code: 'path_outside', message: err.message } };
    } else if (
      (err as { statusCode?: number }).statusCode &&
      (err as { statusCode: number }).statusCode < 500
    ) {
      status = (err as { statusCode: number }).statusCode;
      body = { error: { code: 'bad_request', message: (err as Error).message } };
    } else {
      console.error(err);
    }
    void reply.code(status).send(body);
  });

  // --- Session (login link → cookie) ---
  app.post('/api/session', async (req, reply) => {
    const { code } = LoginBodySchema.parse(req.body);
    const id = deps.auth.redeemLoginCode(code);
    if (!id) {
      return reply.code(401).send({
        error: {
          code: 'bad_code',
          message: 'This login link is used or expired. Run `cherry` again.',
        },
      });
    }
    void reply.setCookie(SESSION_COOKIE, id, {
      httpOnly: true,
      sameSite: 'strict',
      path: '/',
      maxAge: Math.floor(SESSION_TTL_MS / 1000),
    });
    return { ok: true };
  });

  app.delete('/api/session', async (req, reply) => {
    const id = sessionId(req);
    if (id) deps.auth.endSession(id);
    void reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  });

  // --- CLI-only routes (secret from run/daemon.json) ---
  app.post('/api/cli/login-code', async () => ({ code: deps.auth.issueLoginCode() }));
  app.post('/api/cli/logout', async () => {
    deps.auth.endAllSessions();
    return { ok: true };
  });
  app.get('/api/cli/status', async () => {
    const cards = await deps.projects.list();
    return { version: deps.version, projects: cards.length, health: await deps.health.get() };
  });

  // --- System ---
  app.get('/api/health', () => deps.health.get());
  app.post('/api/health/recheck', () => deps.health.recheck());
  app.get('/api/config', () => ({
    ...deps.config.get(),
    resolvedProjectsDir: deps.config.projectsDir(),
  }));
  app.patch('/api/config', async (req) => {
    const next = deps.config.update(ConfigPatchSchema.parse(req.body));
    void deps.projects.rescan();
    return { ...next, resolvedProjectsDir: deps.config.projectsDir() };
  });

  // --- Projects ---
  app.get('/api/projects', async () => ({
    projectsDir: deps.config.projectsDir(),
    cards: await deps.projects.list(),
  }));
  app.post('/api/projects/rescan', async () => {
    void deps.projects.rescan();
    return { ok: true };
  });

  // --- Events ---
  app.register(async (scope) => {
    scope.get('/ws', { websocket: true }, (socket) => {
      const sub = {
        topics: new Set<string>(),
        send: (event: unknown) => {
          if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(event));
        },
      };
      const remove = deps.hub.add(sub);
      socket.on('message', (raw: Buffer) => {
        try {
          sub.topics = new Set(ClientMessageSchema.parse(JSON.parse(raw.toString())).topics);
        } catch {
          socket.close(1003, 'bad message');
        }
      });
      socket.on('close', remove);
    });
  });

  for (const add of deps.routes ?? []) add(app);

  // --- Built UI (production) ---
  if (deps.webDist && existsSync(path.join(deps.webDist, 'index.html'))) {
    void app.register(fastifyStatic, { root: deps.webDist, wildcard: false });
    app.setNotFoundHandler((req, reply) => {
      if (req.method === 'GET' && !req.url.startsWith('/api/')) return reply.sendFile('index.html');
      return reply
        .code(404)
        .send({ error: { code: 'not_found', message: `No route ${req.method} ${req.url}` } });
    });
  } else {
    app.setNotFoundHandler((req, reply) =>
      reply
        .code(404)
        .send({ error: { code: 'not_found', message: `No route ${req.method} ${req.url}` } }),
    );
  }

  return app;
}
