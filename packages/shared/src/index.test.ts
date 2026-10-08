import { describe, expect, it } from 'vitest';
import { HealthSchema } from './index.ts';

describe('HealthSchema', () => {
  it('accepts a valid health body', () => {
    expect(HealthSchema.parse({ ok: true, name: 'apeiron', version: '0.0.0' })).toBeTruthy();
  });

  it('rejects a body from another app', () => {
    expect(HealthSchema.safeParse({ ok: true, name: 'other', version: '1' }).success).toBe(false);
  });
});
