import { z } from 'zod';
import { ProjectCardSchema } from './project.ts';
import { HealthSchema } from './system.ts';

/** Client → server over /ws. */
export const ClientMessageSchema = z.object({
  type: z.literal('subscribe'),
  topics: z.array(z.string().max(200)).max(50),
});
export type ClientMessage = z.infer<typeof ClientMessageSchema>;

/**
 * Server → client events. Each has a topic (who receives it) and a payload. Later milestones add
 * more event types here.
 */
export interface EventMap {
  'projects.updated': { cards: z.infer<typeof ProjectCardSchema>[] };
  'health.updated': z.infer<typeof HealthSchema>;
  /** Files changed on disk in a project (tree, git, open file may be stale). */
  'project.changed': { projectId: string; paths: string[] };
}
export type EventType = keyof EventMap;
export type ServerEvent = {
  [K in EventType]: { type: K; at: number } & EventMap[K];
}[EventType];
