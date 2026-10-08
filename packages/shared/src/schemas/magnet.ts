import { z } from 'zod';
import { ChatItemSchema } from './chat.ts';

export const MAGNET_FILES = ['MAGNET.md', 'me.md', 'work.md'] as const;
export const MagnetFileNameSchema = z.enum(MAGNET_FILES);
export type MagnetFileName = z.infer<typeof MagnetFileNameSchema>;

export const MagnetStateSchema = z.object({
  conversationId: z.string().nullable(),
  running: z.boolean(),
  items: z.array(ChatItemSchema),
  readOnly: z.boolean(),
  /** How many projects Magnet knows ("knows 7 projects"). */
  projects: z.number(),
});
export type MagnetState = z.infer<typeof MagnetStateSchema>;

export const MagnetSendSchema = z.object({
  text: z.string().trim().min(1).max(8000),
  /** The project the user is looking at, if any. */
  projectId: z.string().max(200).optional(),
});
export type MagnetSend = z.infer<typeof MagnetSendSchema>;

export const UsageSchema = z.object({
  sessionsMonth: z.number(),
  longestMs: z.number(),
  currentStreak: z.number(),
  longestStreak: z.number(),
  /** Last 26 weeks, oldest first, one entry per local day. */
  days: z.array(z.object({ day: z.string(), sessions: z.number() })),
});
export type Usage = z.infer<typeof UsageSchema>;

/** GET /api/magnet: the profile files and the numbers on Settings → Magnet. */
export const MagnetInfoSchema = z.object({
  dir: z.string(),
  readOnly: z.boolean(),
  files: z.array(
    z.object({ name: MagnetFileNameSchema, content: z.string(), updatedAt: z.number() }),
  ),
  stats: z.object({ projects: z.number(), sessionsWeek: z.number(), agentsRun: z.number() }),
  usage: UsageSchema,
});
export type MagnetInfo = z.infer<typeof MagnetInfoSchema>;

export const MagnetFileSaveSchema = z.object({ content: z.string().max(100_000) });
