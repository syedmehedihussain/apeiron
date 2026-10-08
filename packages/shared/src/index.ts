import { z } from 'zod';

export const APP_NAME = 'apeiron';
export const DEFAULT_PORT = 4317;
export const LOOPBACK_HOST = '127.0.0.1';

/** `GET /api/health` response. */
export const HealthSchema = z.object({
  ok: z.literal(true),
  name: z.literal(APP_NAME),
  version: z.string(),
});
export type Health = z.infer<typeof HealthSchema>;
