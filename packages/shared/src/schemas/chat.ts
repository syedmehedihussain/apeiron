import { z } from 'zod';
import { DiffLineSchema } from './workspace.ts';

/** A structured question Claude asks (docs/data-model.md §3). */
export const DecisionOptionSchema = z.object({
  id: z.string().min(1).max(40),
  title: z.string().min(1).max(200),
  detail: z.string().max(400).default(''),
  tradeoff: z.string().min(1).max(300),
  recommended: z.boolean().default(false),
});

/** What Claude sends to the ask_decision tool. */
export const DecisionCardInputSchema = z
  .object({
    topic: z.string().min(1).max(60),
    question: z.string().min(1).max(300),
    context: z.string().max(400).default(''),
    options: z.array(DecisionOptionSchema).min(2).max(4),
    why: z.string().max(1500).default(''),
    allowCustom: z.boolean().default(true),
  })
  .refine((c) => c.options.filter((o) => o.recommended).length === 1, {
    message: 'Exactly one option must have recommended: true.',
    path: ['options'],
  })
  .refine((c) => new Set(c.options.map((o) => o.id)).size === c.options.length, {
    message: 'Option ids must be unique.',
    path: ['options'],
  });
export type DecisionCardInput = z.infer<typeof DecisionCardInputSchema>;

export const DecisionCardSchema = z.object({
  id: z.string(),
  topic: z.string(),
  label: z.string(),
  question: z.string(),
  context: z.string(),
  options: z.array(DecisionOptionSchema),
  why: z.string(),
  allowCustom: z.boolean(),
});
export type DecisionCard = z.infer<typeof DecisionCardSchema>;

export const DecisionAnswerSchema = z
  .object({ optionId: z.string().max(40).optional(), custom: z.string().max(2000).optional() })
  .refine((a) => !!a.optionId !== !!a.custom?.trim(), {
    message: 'Pick an option or type an answer.',
  });
export type DecisionAnswer = z.infer<typeof DecisionAnswerSchema>;

export const ApprovalStatusSchema = z.enum([
  'pending',
  'allowed',
  'allowed_session',
  'denied',
  'cancelled',
]);
export type ApprovalStatus = z.infer<typeof ApprovalStatusSchema>;

export const ApprovalFileSchema = z.object({
  path: z.string(),
  isNew: z.boolean(),
  added: z.number(),
  removed: z.number(),
  /** Diff lines with context; the card shows the first ~12. */
  lines: z.array(DiffLineSchema),
});
export type ApprovalFile = z.infer<typeof ApprovalFileSchema>;

export const ApprovalSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  /** chat, agent:<id>, … — where the request came from. */
  source: z.string(),
  kind: z.enum(['edit', 'command', 'other', 'push']),
  tool: z.string(),
  title: z.string(),
  files: z.array(ApprovalFileSchema),
  command: z.string().nullable(),
  /** Free-form details for the "other" kind (tool input as JSON). */
  detail: z.string().nullable(),
  cwd: z.string(),
  status: ApprovalStatusSchema,
  reason: z.string().nullable(),
  createdAt: z.number(),
  answeredAt: z.number().nullable(),
});
export type Approval = z.infer<typeof ApprovalSchema>;

export const ApprovalAnswerSchema = z.object({
  answer: z.enum(['allow', 'allow_session', 'deny']),
  reason: z.string().max(1000).optional(),
});
export type ApprovalAnswer = z.infer<typeof ApprovalAnswerSchema>;

export const ToolVerbSchema = z.enum(['read', 'edit', 'run', 'other']);
export type ToolVerb = z.infer<typeof ToolVerbSchema>;

/** One row in the chat transcript. Items are upserted by id. */
export const ChatItemSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('user'), id: z.string(), at: z.number(), text: z.string() }),
  z.object({
    kind: z.literal('text'),
    id: z.string(),
    at: z.number(),
    turnId: z.string(),
    text: z.string(),
  }),
  z.object({
    kind: z.literal('tool'),
    id: z.string(),
    at: z.number(),
    turnId: z.string(),
    tool: z.string(),
    verb: ToolVerbSchema,
    target: z.string(),
    status: z.enum(['running', 'waiting', 'ok', 'failed', 'denied']),
    meta: z.string().nullable(),
    added: z.number().nullable(),
    removed: z.number().nullable(),
    durationMs: z.number().nullable(),
    approvalId: z.string().nullable(),
  }),
  z.object({
    kind: z.literal('decision'),
    id: z.string(),
    at: z.number(),
    turnId: z.string(),
    card: DecisionCardSchema,
    status: z.enum(['open', 'confirmed', 'cancelled']),
    answer: z.string().nullable(),
  }),
  z.object({
    kind: z.literal('approval'),
    id: z.string(),
    at: z.number(),
    turnId: z.string(),
    approval: ApprovalSchema,
  }),
  z.object({
    kind: z.literal('turn-end'),
    id: z.string(),
    at: z.number(),
    turnId: z.string(),
    ok: z.boolean(),
    stopped: z.boolean(),
    error: z.string().nullable(),
    durationMs: z.number(),
  }),
]);
export type ChatItem = z.infer<typeof ChatItemSchema>;

export const ChatStateSchema = z.object({
  conversationId: z.string().nullable(),
  claudeSessionId: z.string().nullable(),
  running: z.boolean(),
  turnId: z.string().nullable(),
  model: z.string(),
  startedAt: z.number().nullable(),
  turns: z.number(),
  /** Project-relative paths Claude edited in this conversation. */
  touched: z.array(z.string()),
  items: z.array(ChatItemSchema),
});
export type ChatState = z.infer<typeof ChatStateSchema>;

export const ChatSendSchema = z.object({
  text: z.string().min(1).max(20_000),
  planMode: z.boolean().default(false),
  model: z.enum(['sonnet', 'opus', 'haiku']).optional(),
});
export type ChatSend = z.infer<typeof ChatSendSchema>;

export const MODELS = [
  { id: 'sonnet', label: 'Sonnet' },
  { id: 'opus', label: 'Opus' },
  { id: 'haiku', label: 'Haiku' },
] as const;
