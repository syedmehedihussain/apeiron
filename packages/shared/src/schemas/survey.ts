import { z } from 'zod';
import { DecisionCardSchema } from './chat.ts';

/** The seven survey steps (prd.md S-1). Quick skips Data and Quality bar. */
export const SURVEY_STEPS = [
  { step: 1, topic: 'name_idea', label: 'Idea' },
  { step: 2, topic: 'problem_users', label: 'Problem & users' },
  { step: 3, topic: 'scope', label: 'Scope' },
  { step: 4, topic: 'stack', label: 'Stack' },
  { step: 5, topic: 'data', label: 'Data' },
  { step: 6, topic: 'quality', label: 'Quality bar' },
  { step: 7, topic: 'review', label: 'Review' },
] as const;
export const QUICK_SKIPS = [5, 6];
export const REVIEW_STEP = 7;

/** A folder name for a new project: lower case, digits, dot, dash, underscore. */
export const ProjectNameSchema = z
  .string()
  .trim()
  .min(1, 'Give the project a name.')
  .max(64, 'Keep the name under 64 characters.')
  .regex(
    /^[a-z0-9][a-z0-9._-]*$/,
    'Use lower-case letters, digits, dots, dashes or underscores, starting with a letter or digit.',
  );

export const NameIdeaSchema = z.object({
  name: ProjectNameSchema,
  idea: z.string().trim().min(1, 'Describe the idea in a sentence or two.').max(2000),
  quick: z.boolean().default(false),
});
export type NameIdea = z.infer<typeof NameIdeaSchema>;

const TypedAnswerSchema = z.object({
  step: z.literal(1),
  topic: z.literal('name_idea'),
  kind: z.literal('typed'),
  value: NameIdeaSchema,
  answeredAt: z.string().optional(),
});

const DecisionAnswerEntrySchema = z.object({
  step: z.number().int().min(2).max(6),
  topic: z.string(),
  kind: z.literal('decision'),
  card: DecisionCardSchema,
  chosen: z.string().nullable(),
  custom: z.string().nullable(),
  summary: z.string(),
  answeredAt: z.string(),
});
export type SurveyDecisionAnswer = z.infer<typeof DecisionAnswerEntrySchema>;

export const SurveyAnswerSchema = z.discriminatedUnion('kind', [
  TypedAnswerSchema,
  DecisionAnswerEntrySchema,
]);
export type SurveyAnswer = z.infer<typeof SurveyAnswerSchema>;

/** `_project/survey.json` (docs/data-model.md §2). */
export const SurveyFileSchema = z.object({
  schema: z.literal(1),
  status: z.enum(['in_progress', 'review', 'created', 'abandoned']),
  startedAt: z.string(),
  updatedAt: z.string(),
  step: z.number().int().min(1).max(7),
  answers: z.array(SurveyAnswerSchema),
  stale: z.array(z.number().int()),
});
export type SurveyFile = z.infer<typeof SurveyFileSchema>;

export const SurveyFileEntrySchema = z.object({
  path: z.string(),
  content: z.string(),
  size: z.number(),
  note: z.string(),
  warning: z.string().nullable(),
});
export type SurveyFileEntry = z.infer<typeof SurveyFileEntrySchema>;

export const SurveyProposalSchema = z.object({
  summary: z.string(),
  stack: z.array(z.string()),
  files: z.array(SurveyFileEntrySchema),
});
export type SurveyProposal = z.infer<typeof SurveyProposalSchema>;

export const CreateStageSchema = z.enum(['writing', 'git', 'repo', 'done', 'failed']);

export const SurveyStateSchema = z.object({
  id: z.string(),
  path: z.string(),
  status: SurveyFileSchema.shape.status,
  name: z.string(),
  idea: z.string(),
  quick: z.boolean(),
  step: z.number().int(),
  /** Steps that are part of this survey (Quick leaves out 5 and 6). */
  steps: z.array(z.number().int()),
  answers: z.array(SurveyAnswerSchema),
  stale: z.array(z.number().int()),
  /** The card for the current step: a fresh draft, or the saved one when changing a step. */
  card: DecisionCardSchema.nullable(),
  /** Claude is drafting the current card or the files. */
  drafting: z.boolean(),
  error: z.string().nullable(),
  proposal: SurveyProposalSchema.nullable(),
  create: z
    .object({
      stage: CreateStageSchema,
      error: z.string().nullable(),
      repo: z.string().nullable(),
      repoError: z.string().nullable(),
    })
    .nullable(),
  updatedAt: z.string(),
  /** `owner/name` the GitHub toggle would create, when gh is logged in. */
  repoName: z.string().nullable(),
});
export type SurveyState = z.infer<typeof SurveyStateSchema>;

export const SurveyStartSchema = NameIdeaSchema;
export const SurveyAnswerInputSchema = z.union([
  z.object({
    step: z.literal(1),
    idea: z.string().trim().min(1).max(2000),
    quick: z.boolean(),
  }),
  z
    .object({
      step: z.number().int().min(2).max(6),
      optionId: z.string().max(40).optional(),
      custom: z.string().max(2000).optional(),
    })
    .refine((a) => !!a.optionId !== !!a.custom?.trim(), {
      message: 'Pick an option or type an answer.',
    }),
]);
export type SurveyAnswerInput = z.infer<typeof SurveyAnswerInputSchema>;
export const SurveyCreateSchema = z.object({ createRepo: z.boolean() });

/** What Claude passes to propose_docs. Checked strictly by the daemon. */
export const ProposeDocsInputSchema = z.object({
  summary: z.string().min(1).max(120),
  stack: z.array(z.string().max(30)).max(12).default([]),
  files: z
    .array(z.object({ path: z.string().min(1).max(200), content: z.string().min(1).max(60_000) }))
    .min(1)
    .max(14),
});
