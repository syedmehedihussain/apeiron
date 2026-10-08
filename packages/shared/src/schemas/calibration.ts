import { z } from 'zod';
import { ChatItemSchema } from './chat.ts';
import { PhaseSchema } from './common.ts';
import { DiffLineSchema } from './workspace.ts';

export const FoundTagSchema = z.object({ label: z.string().max(60), gap: z.boolean() });
export type FoundTag = z.infer<typeof FoundTagSchema>;

export const ProposedFileSchema = z.object({
  path: z.string(),
  action: z.enum(['create', 'append']),
  /** Whole file for create; the section to add for append. */
  content: z.string(),
  /** What the file will look like: all + for create, existing tail + added lines for append. */
  lines: z.array(DiffLineSchema),
  size: z.number(),
  /** One-line purpose shown next to the preview ("Instructions Claude reads first"). */
  note: z.string(),
  /** Set when the file looks like it contains a secret; it cannot be written. */
  warning: z.string().nullable(),
});
export type ProposedFile = z.infer<typeof ProposedFileSchema>;

export const ProposalSchema = z.object({
  summary: z.string(),
  phase: PhaseSchema,
  stack: z.array(z.string()),
  files: z.array(ProposedFileSchema),
});
export type Proposal = z.infer<typeof ProposalSchema>;

export const CalibrationStatusSchema = z.enum([
  'idle',
  'scanning',
  'questions',
  'drafting',
  'proposal',
  'writing',
  'done',
  'failed',
]);
export type CalibrationStatus = z.infer<typeof CalibrationStatusSchema>;

export const CalibrationStateSchema = z.object({
  projectId: z.string(),
  status: CalibrationStatusSchema,
  /** cctop projects get a light calibration that keeps STATUS.md. */
  light: z.boolean(),
  startedAt: z.number().nullable(),
  model: z.string().nullable(),
  /** Files in the project (for "24 / 38 files"). */
  fileCount: z.number(),
  items: z.array(ChatItemSchema),
  found: z.array(FoundTagSchema),
  answers: z.array(z.object({ topic: z.string(), answer: z.string() })),
  proposal: ProposalSchema.nullable(),
  error: z.string().nullable(),
  written: z.array(z.string()),
});
export type CalibrationState = z.infer<typeof CalibrationStateSchema>;

export const CalibrateWriteSchema = z.object({ paths: z.array(z.string().max(500)).max(50) });

/** What Claude passes to propose_files. Checked strictly by the daemon. */
export const ProposeFilesInputSchema = z.object({
  summary: z.string().min(1).max(120),
  phase: PhaseSchema,
  stack: z.array(z.string().max(30)).max(12).default([]),
  files: z
    .array(
      z.object({
        path: z.string().min(1).max(200),
        action: z.enum(['create', 'append']),
        content: z.string().min(1).max(60_000),
      }),
    )
    .min(1)
    .max(12),
});
export type ProposeFilesInput = z.infer<typeof ProposeFilesInputSchema>;
