// ADR-0004 spike: checks the Claude Agent SDK features Cherry depends on, against the real
// `claude` login. Re-run after every SDK upgrade: `pnpm --filter @cherry/daemon spike`.
// Uses Haiku in a throwaway folder; costs a few cents of usage.
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createSdkMcpServer, query, tool, type SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';

const cwd = mkdtempSync(path.join(tmpdir(), 'cherry-spike-'));
writeFileSync(path.join(cwd, 'notes.txt'), 'hello\n');
const results: Record<string, boolean | string> = {};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const model = 'haiku';

const decisions = createSdkMcpServer({
  name: 'cherry',
  tools: [
    tool(
      'ask_decision',
      'Ask the user to choose between options. Use for any real choice.',
      { question: z.string(), options: z.array(z.object({ id: z.string(), title: z.string() })) },
      async (args) => {
        await sleep(4000); // a human thinking
        results.decisionHeld = true;
        return {
          content: [
            {
              type: 'text',
              text: `User chose: ${args.options[1]?.title ?? args.options[0]?.title}`,
            },
          ],
        };
      },
    ),
  ],
});

async function run(prompt: string, extra: Record<string, unknown> = {}) {
  const events: SDKMessage[] = [];
  const q = query({
    prompt,
    options: {
      cwd,
      model,
      permissionMode: 'default',
      includePartialMessages: true,
      allowedTools: ['Read', 'Glob', 'Grep', 'mcp__cherry__ask_decision'],
      stderr: () => undefined,
      mcpServers: { cherry: decisions },
      settingSources: [],
      canUseTool: async (name, input) => {
        results[`asked:${name}`] = true;
        await sleep(5000); // waits for a human without timing out
        if (name === 'Write' || name === 'Edit') return { behavior: 'allow', updatedInput: input };
        return { behavior: 'deny', message: 'The user denied this.' };
      },
      ...extra,
    },
  });
  try {
    for await (const m of q) events.push(m);
  } catch (e) {
    results[`error:${prompt.slice(0, 20)}`] = (e as Error).message.slice(0, 160);
  }
  return events;
}

const sessionOf = (ev: SDKMessage[]) =>
  ev.find((e) => e.type === 'system' && 'session_id' in e)?.session_id;

// 1. login, streaming, approvals that wait, file write after allow
const first = await run(
  'Create a file called out.txt containing exactly the word CHERRY. Use the Write tool.',
);
const init = first.find((e) => e.type === 'system' && e.subtype === 'init');
results.usesClaudeLogin = !!init && (init as { apiKeySource?: string }).apiKeySource === 'none';
results.streamDeltas = first.some((e) => e.type === 'stream_event');
results.approvalWaited = !!results['asked:Write'];
try {
  results.fileWritten = readFileSync(path.join(cwd, 'out.txt'), 'utf8').includes('CHERRY');
} catch {
  results.fileWritten = false;
}
const sessionId = sessionOf(first);

// 2. resume by id (new query = new process)
const second = await run(
  'What word did you write into out.txt a moment ago? Answer in one word, without using tools.',
  { resume: sessionId },
);
const text = second
  .filter((e) => e.type === 'assistant')
  .flatMap((e) => (e.type === 'assistant' ? e.message.content : []))
  .map((b) => (b.type === 'text' ? b.text : ''))
  .join('');
results.resumeKeepsContext = /CHERRY/i.test(text);

// 3. custom tool held open until "the user" answers
await run(
  'Call the ask_decision tool with question "Which colour?" and options red (id r) and blue (id b), then tell me the answer.',
);

// 4. interrupt mid-turn
const q = query({
  prompt: 'Count slowly from 1 to 200, one number per line.',
  options: { cwd, model, includePartialMessages: true, settingSources: [] },
});
let interrupted = false;
const started = Date.now();
try {
  for await (const m of q) {
    if (!interrupted && m.type === 'stream_event') {
      interrupted = true;
      await q.interrupt();
    }
    if (m.type === 'result') results.interruptResult = m.subtype;
  }
} catch (e) {
  results.interruptThrew = (e as Error).message.slice(0, 160);
}
results.interruptFast = Date.now() - started < 20_000;

// 5. a PreToolUse hook refuses a read even though reads need no permission
writeFileSync(path.join(cwd, '.env'), 'SECRET=hunter2\n');
const guarded = query({
  prompt: 'Read the file .env with the Read tool and tell me what it says.',
  options: {
    cwd,
    model,
    settingSources: [],
    allowedTools: ['Read'],
    stderr: () => undefined,
    hooks: {
      PreToolUse: [
        {
          hooks: [
            async (input) =>
              input.hook_event_name === 'PreToolUse' &&
              JSON.stringify(input.tool_input).includes('.env')
                ? {
                    hookSpecificOutput: {
                      hookEventName: 'PreToolUse',
                      permissionDecision: 'deny',
                      permissionDecisionReason: 'Secret file.',
                    },
                  }
                : {},
          ],
        },
      ],
    },
  },
});
let leaked = false;
try {
  for await (const m of guarded) {
    if (m.type === 'assistant')
      for (const b of m.message.content)
        if (b.type === 'text' && b.text.includes('hunter2')) leaked = true;
  }
} catch {
  // ignore
}
results.hookBlocksSecretRead = !leaked;

console.log(JSON.stringify({ sessionId, results }, null, 2));
