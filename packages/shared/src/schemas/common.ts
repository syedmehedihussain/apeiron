import { z } from 'zod';

export const APP_NAME = 'apeiron';
export const DEFAULT_PORT = 4317;
export const DEV_WEB_PORT = 5173;
export const LOOPBACK_HOST = '127.0.0.1';

export const PHASES = ['plan', 'design', 'preparation', 'development', 'deployment'] as const;
export const PhaseSchema = z.enum(PHASES);
export type Phase = z.infer<typeof PhaseSchema>;

export const PHASE_LABEL: Record<Phase, string> = {
  plan: 'Plan',
  design: 'Design',
  preparation: 'Preparation',
  development: 'Development',
  deployment: 'Deployment',
};

/** One error shape for every API failure (docs/api.md). */
export const ApiErrorSchema = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;
