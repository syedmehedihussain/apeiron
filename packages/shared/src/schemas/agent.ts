import { z } from 'zod';
import { ApprovalFileSchema, ApprovalSchema, ChatItemSchema } from './chat.ts';

export const AgentStatusSchema = z.enum([
  'queued',
  'running',
  'waiting',
  'done',
  'failed',
  'accepted',
  'discarded',
]);
export type AgentStatus = z.infer<typeof AgentStatusSchema>;

/** A background agent in its own worktree (prd.md A-1 to A-6). */
export const AgentSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  task: z.string(),
  model: z.string(),
  branch: z.string(),
  baseBranch: z.string(),
  status: AgentStatusSchema,
  /** One line from Claude when done. */
  summary: z.string().nullable(),
  error: z.string().nullable(),
  /** The last few timeline rows (tool items). */
  activity: z.array(ChatItemSchema),
  /** The approval the agent is waiting on. */
  waiting: ApprovalSchema.nullable(),
  /** Change size on the agent branch vs where it started. */
  changes: z.object({ files: z.number(), added: z.number(), removed: z.number() }).nullable(),
  startedAt: z.number(),
  endedAt: z.number().nullable(),
});
export type Agent = z.infer<typeof AgentSchema>;

export const AgentListSchema = z.object({ agents: z.array(AgentSchema), maxRunning: z.number() });
export type AgentList = z.infer<typeof AgentListSchema>;

export const AgentStartSchema = z.object({
  task: z.string().trim().min(3, 'Describe the task.').max(2000),
  model: z.enum(['sonnet', 'opus', 'haiku']).optional(),
});
export type AgentStart = z.infer<typeof AgentStartSchema>;

export const AgentDiffSchema = z.object({ files: z.array(ApprovalFileSchema) });
export type AgentDiff = z.infer<typeof AgentDiffSchema>;
