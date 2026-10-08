import { z } from 'zod';
import { APP_NAME } from './common.ts';

export const HealthSchema = z.object({
  ok: z.literal(true),
  name: z.literal(APP_NAME),
  version: z.string(),
  claude: z.object({
    found: z.boolean(),
    loggedIn: z.boolean(),
    version: z.string().nullable(),
  }),
  git: z.object({ found: z.boolean(), version: z.string().nullable() }),
  gh: z.object({ found: z.boolean(), loggedIn: z.boolean() }),
});
export type Health = z.infer<typeof HealthSchema>;

/** `~/.apeiron/config.json` (docs/data-model.md §5). */
export const ConfigSchema = z.object({
  schema: z.literal(1).default(1),
  projectsDir: z.string().default('~/Projects'),
  port: z.number().int().default(4317),
  scan: z.object({ ignore: z.array(z.string()).default([]) }).default({ ignore: [] }),
  claude: z
    .object({ bin: z.string().default('claude'), defaultModel: z.string().default('sonnet') })
    .default({ bin: 'claude', defaultModel: 'sonnet' }),
  agents: z
    .object({
      maxRunning: z.number().int().min(1).max(10).default(3),
      worktreeDir: z.string().default('~/Projects/.apeiron-worktrees'),
    })
    .default({ maxRunning: 3, worktreeDir: '~/Projects/.apeiron-worktrees' }),
  magnet: z.object({ readOnly: z.boolean().default(true) }).default({ readOnly: true }),
});
export type Config = z.infer<typeof ConfigSchema>;

export const ConfigPatchSchema = z.object({
  projectsDir: z.string().min(1).optional(),
  scan: z.object({ ignore: z.array(z.string()) }).optional(),
  claude: z.object({ defaultModel: z.string() }).partial().optional(),
  agents: z
    .object({ maxRunning: z.number().int().min(1).max(10) })
    .partial()
    .optional(),
  magnet: z.object({ readOnly: z.boolean() }).partial().optional(),
});
export type ConfigPatch = z.infer<typeof ConfigPatchSchema>;

export const LoginBodySchema = z.object({ code: z.string().min(1).max(200) });
