import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { secretGuard, type RunHandle, type Runner, type RunRequest } from './runner.ts';

/** One step of a fake Claude script (docs/testing.md → The fake Claude). */
export type Step =
  | { text: string }
  | { tool: { name: string; input: Record<string, unknown> }; output?: string; fail?: boolean }
  | { decision: unknown }
  | { call: { name: string; input: unknown } }
  | { wait: number };

export interface FakeLog {
  requests: RunRequest[];
  permissions: { tool: string; allowed: boolean; message?: string }[];
  decisions: { ok: boolean; text: string }[];
  calls?: { name: string; ok: boolean; text: string }[];
}

const NEEDS_PERMISSION = new Set(['Edit', 'Write', 'MultiEdit', 'Bash', 'WebFetch']);

/**
 * Same interface as the real runner, driven by a script. Write/Edit really change files when
 * allowed, so tests can check that a denied edit leaves the file untouched.
 */
export function fakeRunner(
  script: Step[] | ((req: RunRequest, n: number) => Step[]),
  log?: FakeLog,
): Runner {
  let n = 0;
  return (req: RunRequest): RunHandle => {
    const steps = typeof script === 'function' ? script(req, n) : script;
    n++;
    log?.requests.push(req);
    let stopped = false;
    const sessionId = req.resume ?? `fake_session_${n}`;
    const started = Date.now();
    const done = (async () => {
      req.onEvent({ t: 'session', sessionId });
      let i = 0;
      for (const step of steps) {
        if (stopped) break;
        i++;
        if ('text' in step) {
          const blockId = `msg_${n}:${i}`;
          req.onEvent({ t: 'text_start', blockId });
          for (const chunk of step.text.match(/.{1,12}/gs) ?? [])
            req.onEvent({ t: 'text', blockId, delta: chunk });
        } else if ('wait' in step) {
          await new Promise((r) => setTimeout(r, step.wait));
        } else if ('call' in step) {
          const custom = req.extraTools?.find((x) => x.name === step.call.name);
          const id = `toolu_call_${n}_${i}`;
          req.onEvent({
            t: 'tool_start',
            id,
            name: `mcp__apeiron__${step.call.name}`,
            input: step.call.input as Record<string, unknown>,
          });
          const r = custom
            ? await custom.handler(step.call.input)
            : { ok: false, text: `No tool ${step.call.name}` };
          log?.calls?.push({ name: step.call.name, ...r });
          req.onEvent({ t: 'tool_end', id, ok: r.ok, output: r.text });
        } else if ('decision' in step) {
          const id = `toolu_dec_${n}_${i}`;
          req.onEvent({
            t: 'tool_start',
            id,
            name: 'mcp__apeiron__ask_decision',
            input: step.decision as Record<string, unknown>,
          });
          const reply = await req.onDecision(step.decision);
          log?.decisions.push(
            reply.ok ? { ok: true, text: reply.text } : { ok: false, text: reply.error },
          );
          req.onEvent({
            t: 'tool_end',
            id,
            ok: reply.ok,
            output: reply.ok ? reply.text : reply.error,
          });
        } else {
          const id = `toolu_${n}_${i}`;
          const { name, input } = step.tool;
          req.onEvent({ t: 'tool_start', id, name, input });
          const refused = secretGuard(req.cwd, name, input) ?? req.guard?.(name, input) ?? null;
          if (refused) {
            log?.permissions.push({ tool: name, allowed: false, message: refused });
            req.onEvent({ t: 'tool_end', id, ok: false, output: refused });
            continue;
          }
          let allowed = !NEEDS_PERMISSION.has(name) || req.allowedTools.includes(name);
          if (!allowed) {
            const answer = await req.onPermission(name, input, id);
            allowed = answer.allow;
            log?.permissions.push({
              tool: name,
              allowed,
              ...(answer.allow ? {} : { message: answer.message }),
            });
            if (!answer.allow) {
              req.onEvent({ t: 'tool_end', id, ok: false, output: answer.message });
              continue;
            }
          }
          if (stopped) break;
          const file =
            typeof input.file_path === 'string' ? path.resolve(req.cwd, input.file_path) : null;
          if (name === 'Write' && file) {
            mkdirSync(path.dirname(file), { recursive: true });
            writeFileSync(file, String(input.content ?? ''));
          } else if (name === 'Edit' && file) {
            const text = readFileSync(file, 'utf8');
            writeFileSync(file, text.replace(String(input.old_string), String(input.new_string)));
          }
          req.onEvent({
            t: 'tool_end',
            id,
            ok: !step.fail,
            output: step.output ?? (name === 'Read' ? '     1→x\n     2→y' : 'ok'),
          });
        }
      }
      req.onEvent({
        t: 'result',
        ok: !stopped,
        stopped,
        error: null,
        durationMs: Date.now() - started,
        costUsd: 0,
      });
    })();
    return {
      done,
      async interrupt() {
        stopped = true;
      },
    };
  };
}

/**
 * `APEIRON_FAKE_CLAUDE=<file.json>` makes the daemon use this fake (e2e tests). The file holds
 * `[{ "match": "regex", "steps": [...] }]`; the first entry whose regex matches the prompt runs.
 */
export function fakeRunnerFromFile(file: string): Runner {
  const entries = JSON.parse(readFileSync(file, 'utf8')) as { match: string; steps: Step[] }[];
  return fakeRunner(
    (req) =>
      entries.find((e) => new RegExp(e.match, 'i').test(req.prompt))?.steps ?? [
        { text: 'I have no script for that.' },
      ],
  );
}
