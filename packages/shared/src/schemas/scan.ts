import { z } from 'zod';
import { ChatItemSchema } from './chat.ts';

/** Icons a scan agent may use (the web maps each to a lucide icon). */
export const SCAN_ICONS = ['shield', 'flask', 'heart', 'package', 'bot'] as const;

export const ScanVerdictSchema = z.enum(['pass', 'warn', 'fail', 'none']);
export type ScanVerdict = z.infer<typeof ScanVerdictSchema>;

/** Finding counts by severity, when the report has findings. */
export const ScanCountsSchema = z.object({
  critical: z.number().int().min(0),
  high: z.number().int().min(0),
  medium: z.number().int().min(0),
  low: z.number().int().min(0),
});
export type ScanCounts = z.infer<typeof ScanCountsSchema>;

/** One saved report: `cherry/reports/<agent>/<id>.md` in the project (ADR-0012). */
export const ReportMetaSchema = z.object({
  id: z.string(),
  agentId: z.string(),
  title: z.string(),
  status: z.enum(['done', 'failed']),
  verdict: ScanVerdictSchema,
  summary: z.string(),
  counts: ScanCountsSchema.nullable(),
  model: z.string(),
  startedAt: z.number(),
  endedAt: z.number(),
  /** Project-relative path of the Markdown file. */
  path: z.string(),
});
export type ReportMeta = z.infer<typeof ReportMetaSchema>;

export const ReportSchema = z.object({ meta: ReportMetaSchema, markdown: z.string() });
export type Report = z.infer<typeof ReportSchema>;

/** A scan that is running now (kept in memory; a restart drops it). */
export const ScanRunSchema = z.object({
  id: z.string(),
  agentId: z.string(),
  startedAt: z.number(),
  /** The last few tool rows, newest last. */
  activity: z.array(ChatItemSchema),
});
export type ScanRun = z.infer<typeof ScanRunSchema>;

/** A ready-made agent that scans the project read-only and writes a report. */
export const ScanAgentSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  icon: z.enum(SCAN_ICONS),
  /** Built into Cherry, or a file in ~/.cherry/agents/. */
  source: z.enum(['builtin', 'custom']),
  model: z.string(),
  /** Commands it may run without asking (exact command or that command plus arguments). */
  commands: z.array(z.string()),
  run: ScanRunSchema.nullable(),
  last: ReportMetaSchema.nullable(),
});
export type ScanAgent = z.infer<typeof ScanAgentSchema>;

export const ScanAgentListSchema = z.object({
  agents: z.array(ScanAgentSchema),
  /** Custom agent files that could not be read, so the user can fix them. */
  problems: z.array(z.object({ file: z.string(), error: z.string() })),
});
export type ScanAgentList = z.infer<typeof ScanAgentListSchema>;

export const ReportListSchema = z.object({ reports: z.array(ReportMetaSchema) });
export type ReportList = z.infer<typeof ReportListSchema>;
