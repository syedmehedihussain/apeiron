import { createSdkMcpServer, query, tool, type SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import path from 'node:path';
import { z } from 'zod';
import { isSecretFile } from '../paths.ts';

/** The internal event stream every runner produces (claude-runner.md). */
export type RunnerEvent =
  | { t: 'session'; sessionId: string }
  | { t: 'text_start'; blockId: string }
  | { t: 'text'; blockId: string; delta: string }
  | { t: 'tool_start'; id: string; name: string; input: Record<string, unknown> }
  | { t: 'tool_end'; id: string; ok: boolean; output: string }
  | {
      t: 'result';
      ok: boolean;
      stopped: boolean;
      error: string | null;
      durationMs: number;
      costUsd: number | null;
    };

/** An extra in-process tool (served as mcp__apeiron__<name>). */
export interface CustomTool {
  name: string;
  description: string;
  shape: Record<string, z.ZodType>;
  handler(args: unknown): Promise<{ ok: boolean; text: string }>;
}

export const customToolName = (name: string) => `mcp__apeiron__${name}`;

export type PermissionAnswer =
  { allow: true; input?: Record<string, unknown> } | { allow: false; message: string };
export type DecisionReply = { ok: true; text: string } | { ok: false; error: string };

export interface RunRequest {
  cwd: string;
  prompt: string;
  /** Claude session id to continue, if any. */
  resume: string | null;
  model: string;
  planMode: boolean;
  appendSystemPrompt: string;
  /** Tools that run without asking (read-only ones). */
  allowedTools: string[];
  /** Tools Claude may not use at all. */
  disallowedTools?: string[];
  additionalDirectories?: string[];
  /** Offer the ask_decision tool. */
  decisions: boolean;
  /** More in-process tools (calibration's note_found / propose_files). */
  extraTools?: CustomTool[];
  /**
   * Runs before every tool call, whatever the permission mode (PreToolUse hook). Return a reason
   * to refuse the call. Secret files are always refused on top of this.
   */
  guard?(tool: string, input: Record<string, unknown>): string | null;
  onPermission(
    tool: string,
    input: Record<string, unknown>,
    toolUseId: string,
  ): Promise<PermissionAnswer>;
  onDecision(input: unknown): Promise<DecisionReply>;
  onEvent(event: RunnerEvent): void;
}

export interface RunHandle {
  /** Resolves when the turn has finished (a `result` event was sent). */
  done: Promise<void>;
  interrupt(): Promise<void>;
}

export type Runner = (req: RunRequest) => RunHandle;

export const DECISION_TOOL = 'mcp__apeiron__ask_decision';

/** Refuses tools that would read a secret file (docs/security.md → Files never read). */
export function secretGuard(
  cwd: string,
  tool: string,
  input: Record<string, unknown>,
): string | null {
  const candidates = ['file_path', 'notebook_path', 'path']
    .map((k) => input[k])
    .filter((v): v is string => typeof v === 'string');
  for (const p of candidates) {
    const rel = path.relative(cwd, path.resolve(cwd, p));
    if (isSecretFile(rel))
      return `Apeiron never lets Claude read secret files like ${path.basename(p)}.`;
  }
  if (
    tool === 'Grep' &&
    typeof input.glob === 'string' &&
    /\.env|\.pem|\.key|id_rsa|id_ed25519/.test(input.glob)
  ) {
    return 'Apeiron never lets Claude search secret files.';
  }
  return null;
}
export const READ_TOOLS = ['Read', 'Glob', 'Grep', 'LS', 'TodoWrite'];

/** Loose input shape for the tool; the strict card schema is checked by the caller. */
const decisionShape = {
  topic: z.string().describe('Short topic, e.g. "Data model" or "Stack"'),
  question: z.string(),
  context: z
    .string()
    .optional()
    .describe('One line that starts "You said: …" when it builds on the user\'s words'),
  options: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        detail: z.string().optional(),
        tradeoff: z.string(),
        recommended: z.boolean().optional(),
      }),
    )
    .describe('2 to 4 options; exactly one has recommended: true; every option has a trade-off'),
  why: z.string().optional().describe('Why you recommend that option, 2-4 sentences'),
  allowCustom: z.boolean().optional(),
};

function textOf(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((c) =>
        c && typeof c === 'object' && 'text' in c ? String((c as { text: unknown }).text) : '',
      )
      .join('\n');
  }
  return '';
}

/** Drives Claude Code through the Claude Agent SDK (ADR-0004). */
export const sdkRunner: Runner = (req) => {
  const extra = (req.extraTools ?? []).map((t) =>
    tool(t.name, t.description, t.shape, async (args) => {
      const r = await t.handler(args);
      return { content: [{ type: 'text', text: r.text }], ...(r.ok ? {} : { isError: true }) };
    }),
  );
  const server =
    req.decisions || extra.length
      ? createSdkMcpServer({
          name: 'apeiron',
          tools: [
            ...extra,
            ...(req.decisions
              ? [
                  tool(
                    'ask_decision',
                    'Ask the user to choose between 2-4 options. Use it for every real choice instead of picking yourself. The call waits until the user answers and returns their choice.',
                    decisionShape,
                    async (args) => {
                      const reply = await req.onDecision(args);
                      return reply.ok
                        ? { content: [{ type: 'text', text: reply.text }] }
                        : { content: [{ type: 'text', text: reply.error }], isError: true };
                    },
                  ),
                ]
              : []),
          ],
        })
      : null;

  const q = query({
    prompt: req.prompt,
    options: {
      cwd: req.cwd,
      model: req.model,
      ...(req.resume ? { resume: req.resume } : {}),
      includePartialMessages: true,
      permissionMode: req.planMode ? 'plan' : 'default',
      allowedTools: [
        ...req.allowedTools,
        ...(req.decisions ? [DECISION_TOOL] : []),
        ...(req.extraTools ?? []).map((t) => customToolName(t.name)),
      ],
      ...(req.disallowedTools ? { disallowedTools: req.disallowedTools } : {}),
      ...(req.additionalDirectories ? { additionalDirectories: req.additionalDirectories } : {}),
      ...(server ? { mcpServers: { apeiron: server } } : {}),
      // No settings files: their allow rules would bypass Apeiron's approvals (ADR-0004).
      settingSources: [],
      systemPrompt: { type: 'preset', preset: 'claude_code', append: req.appendSystemPrompt },
      hooks: {
        PreToolUse: [
          {
            hooks: [
              async (hookInput) => {
                if (hookInput.hook_event_name !== 'PreToolUse') return {};
                const input = (hookInput.tool_input ?? {}) as Record<string, unknown>;
                const reason =
                  secretGuard(req.cwd, hookInput.tool_name, input) ??
                  req.guard?.(hookInput.tool_name, input) ??
                  null;
                return reason
                  ? {
                      hookSpecificOutput: {
                        hookEventName: 'PreToolUse',
                        permissionDecision: 'deny',
                        permissionDecisionReason: reason,
                      },
                    }
                  : {};
              },
            ],
          },
        ],
      },
      canUseTool: async (name, input, { toolUseID }) => {
        const answer = await req.onPermission(name, input, toolUseID);
        return answer.allow
          ? { behavior: 'allow', updatedInput: answer.input ?? input }
          : { behavior: 'deny', message: answer.message };
      },
      stderr: () => undefined,
    },
  });

  let messageId = '';
  let sentResult = false;
  let stopped = false;
  const started = Date.now();

  const handle = (m: SDKMessage) => {
    if (m.type === 'system' && m.subtype === 'init') {
      req.onEvent({ t: 'session', sessionId: m.session_id });
    } else if (m.type === 'stream_event') {
      if (m.parent_tool_use_id) return;
      const ev = m.event;
      if (ev.type === 'message_start') messageId = ev.message.id;
      else if (ev.type === 'content_block_start' && ev.content_block.type === 'text') {
        req.onEvent({ t: 'text_start', blockId: `${messageId}:${ev.index}` });
      } else if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') {
        req.onEvent({ t: 'text', blockId: `${messageId}:${ev.index}`, delta: ev.delta.text });
      }
    } else if (m.type === 'assistant') {
      if (m.parent_tool_use_id) return;
      for (const block of m.message.content) {
        if (block.type === 'tool_use') {
          req.onEvent({
            t: 'tool_start',
            id: block.id,
            name: block.name,
            input: (block.input ?? {}) as Record<string, unknown>,
          });
        }
      }
    } else if (m.type === 'user') {
      if (m.parent_tool_use_id) return;
      const content = m.message.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === 'tool_result') {
            req.onEvent({
              t: 'tool_end',
              id: block.tool_use_id,
              ok: !block.is_error,
              output: textOf(block.content),
            });
          }
        }
      }
    } else if (m.type === 'result') {
      sentResult = true;
      const ok = m.subtype === 'success' && !m.is_error;
      const error = ok
        ? null
        : stopped
          ? null
          : 'result' in m && typeof m.result === 'string' && m.result
            ? m.result
            : (m as { errors?: string[] }).errors?.join('; ') || m.subtype;
      req.onEvent({
        t: 'result',
        ok,
        stopped,
        error,
        durationMs: m.duration_ms,
        costUsd: m.total_cost_usd ?? null,
      });
    }
  };

  const done = (async () => {
    try {
      for await (const m of q) handle(m);
    } catch (e) {
      if (!sentResult) {
        sentResult = true;
        req.onEvent({
          t: 'result',
          ok: false,
          stopped,
          error: stopped ? null : (e as Error).message,
          durationMs: Date.now() - started,
          costUsd: null,
        });
      }
    }
    if (!sentResult)
      req.onEvent({
        t: 'result',
        ok: !stopped,
        stopped,
        error: null,
        durationMs: Date.now() - started,
        costUsd: null,
      });
  })();

  return {
    done,
    async interrupt() {
      stopped = true;
      try {
        await q.interrupt();
      } catch {
        q.close();
      }
    },
  };
};
