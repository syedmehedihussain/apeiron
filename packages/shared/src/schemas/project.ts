import { z } from 'zod';
import { PhaseSchema } from './common.ts';

export const ProjectStateSchema = z.enum(['ready', 'cctop', 'uncalibrated']);
export type ProjectState = z.infer<typeof ProjectStateSchema>;

/** `_project/project.json` (docs/data-model.md §1). */
export const ProjectJsonSchema = z.object({
  schema: z.literal(1),
  name: z.string().min(1),
  summary: z.string().max(120).default(''),
  phase: PhaseSchema,
  calibrated: z.string().optional(),
  createdBy: z.enum(['survey', 'calibration', 'manual']).optional(),
  repo: z.string().nullable().optional(),
  stack: z.array(z.string()).default([]),
  docs: z
    .object({
      prd: z.string().optional(),
      architecture: z.string().optional(),
      dataModel: z.string().optional(),
      adr: z.string().optional(),
    })
    .partial()
    .default({}),
  claude: z
    .object({ model: z.string().default('sonnet'), sessionId: z.string().nullable().default(null) })
    .default({ model: 'sonnet', sessionId: null }),
});
export type ProjectJson = z.infer<typeof ProjectJsonSchema>;

export const GitSummarySchema = z.object({
  branch: z.string().nullable(),
  ahead: z.number().int(),
  behind: z.number().int(),
  changes: z.number().int(),
  remote: z.boolean(),
});
export type GitSummary = z.infer<typeof GitSummarySchema>;

export const NextStepSchema = z.object({ text: z.string(), done: z.boolean() });
export type NextStep = z.infer<typeof NextStepSchema>;

/** Parsed `_project/STATUS.md`, cctop format with or without front matter. */
export const StatusDocSchema = z.object({
  summary: z.string().nullable(),
  leftOff: z.string().nullable(),
  nextSteps: z.array(NextStepSchema),
  doneRecently: z.array(z.string()),
  updated: z.string().nullable(),
});
export type StatusDoc = z.infer<typeof StatusDocSchema>;

export const ProjectCardSchema = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string(),
  state: ProjectStateSchema,
  phase: PhaseSchema.nullable(),
  summary: z.string(),
  stack: z.array(z.string()),
  nextStep: z.string().nullable(),
  leftOff: z.string().nullable(),
  git: GitSummarySchema.nullable(),
  lastWorked: z.number().nullable(),
  projectJsonError: z.boolean(),
});
export type ProjectCard = z.infer<typeof ProjectCardSchema>;

export const ProjectListSchema = z.object({
  projectsDir: z.string(),
  cards: z.array(ProjectCardSchema),
});
export type ProjectList = z.infer<typeof ProjectListSchema>;
