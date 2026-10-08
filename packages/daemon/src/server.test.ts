import { afterAll, describe, expect, it } from 'vitest';
import { HealthSchema } from '@apeiron/shared';
import { buildServer } from './server.ts';

describe('GET /api/health', () => {
  const app = buildServer();
  afterAll(() => app.close());

  it('answers with the shared health shape', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(HealthSchema.parse(res.json()).name).toBe('apeiron');
  });
});
