import { z } from 'zod';
import { ProjectCardSchema } from './project.ts';
import { HealthSchema } from './system.ts';
import type { Approval, ChatItem } from './chat.ts';
import type { CalibrationState } from './calibration.ts';
import type { SurveyState } from './survey.ts';
import type { GitResult } from './workspace.ts';
import type { Agent } from './agent.ts';

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
  /** A transcript item was added or changed (upsert by id). */
  'chat.item': { projectId: string; conversationId: string; item: ChatItem };
  /** Streaming text appended to a text item. */
  'chat.delta': {
    projectId: string;
    conversationId: string;
    itemId: string;
    turnId: string;
    text: string;
  };
  /** A turn started or stopped; also sent when the conversation is replaced. */
  'chat.state': {
    projectId: string;
    conversationId: string | null;
    running: boolean;
    turnId: string | null;
    touched: string[];
  };
  'calibrate.updated': { projectId: string; state: CalibrationState };
  'survey.updated': { projectId: string; state: SurveyState };
  /** Pull or Push finished (Push runs after its approval). */
  'git.result': { projectId: string } & GitResult;
  /** An agent was added or changed (upsert by id). */
  'agent.updated': { projectId: string; agent: Agent };
  /** A scan agent started, made progress, or saved a report. */
  'scan.updated': { projectId: string; agentId: string };
  /** Magnet's conversation (topic "magnet"). */
  'magnet.item': { conversationId: string; item: ChatItem };
  'magnet.delta': { conversationId: string; itemId: string; text: string };
  'magnet.state': { conversationId: string | null; running: boolean };
  'approval.requested': { approval: Approval };
  'approval.resolved': { approval: Approval };
}
export type EventType = keyof EventMap;
export type ServerEvent = {
  [K in EventType]: { type: K; at: number } & EventMap[K];
}[EventType];
