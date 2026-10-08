import Fastify, { type FastifyInstance } from 'fastify';
import { APP_NAME, type Health } from '@apeiron/shared';
import pkg from '../package.json' with { type: 'json' };

export function buildServer(): FastifyInstance {
  const app = Fastify({ logger: false });

  app.get('/api/health', async (): Promise<Health> => {
    return { ok: true, name: APP_NAME, version: pkg.version };
  });

  return app;
}
