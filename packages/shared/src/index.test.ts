import { describe, expect, it } from 'vitest';
import { ConfigSchema, HealthSchema, ProjectJsonSchema } from './index.ts';

describe('shared schemas', () => {
  it('rejects a health body from another app', () => {
    expect(HealthSchema.safeParse({ ok: true, name: 'other', version: '1' }).success).toBe(false);
  });

  it('fills config defaults from an empty file', () => {
    const config = ConfigSchema.parse({});
    expect(config.projectsDir).toBe('~/Projects');
    expect(config.agents.maxRunning).toBe(3);
    expect(config.magnet.readOnly).toBe(true);
  });

  it('accepts the project.json example from the data model', () => {
    const parsed = ProjectJsonSchema.parse({
      schema: 1,
      name: 'atlas-api',
      summary: 'REST API for mission tracking',
      phase: 'plan',
      stack: ['Node 22'],
    });
    expect(parsed.claude.sessionId).toBeNull();
  });

  it('rejects an unknown phase', () => {
    expect(ProjectJsonSchema.safeParse({ schema: 1, name: 'x', phase: 'ship' }).success).toBe(
      false,
    );
  });
});
