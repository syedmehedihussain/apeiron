# Claude runner

The ClaudeRunner is the heart of Apeiron. It starts Claude Code, streams what it does to the UI,
and stops Claude at every edit or command until the user answers.

> **Spike first.** Claude Code's flags and SDK change often. Milestone 3 starts with a one-day
> spike that confirms every flag and message type below against the installed version
> (`claude --version`, `claude --help`) and records the result in ADR-0004. Treat the details on
> this page as the plan, not as facts.

## Two ways to drive Claude Code

| | A. Raw CLI (sysdash style) | B. Claude Agent SDK (TypeScript) |
| --- | --- | --- |
| How | spawn `claude -p --output-format stream-json …`, parse JSON lines | `query()` from `@anthropic-ai/claude-agent-sdk`, which runs Claude Code for you |
| Approvals | needs a permission-prompt MCP tool that calls back into the daemon | a `canUseTool` callback: return allow / deny in code |
| Resume | `--resume <sessionId>` | `resume` option |
| Structured output | a JSON schema flag, as sysdash does | same, or a custom tool (`ask_decision`) |
| Reuse | sysdash code already works | new code, but approvals are much simpler |

**Plan:** use **B** for chat, agents, calibration and Magnet, because live approve/deny is the
main feature and `canUseTool` gives it to us directly. Keep the sysdash raw-CLI parser as a
fallback and for `apeiron doctor`. Decision recorded in ADR-0004 (Proposed until the spike).

Both paths produce the **same internal event stream**, so the rest of the daemon does not care
which one is used:

```ts
type RunnerEvent =
  | { t: "session"; sessionId: string }
  | { t: "text"; delta: string }
  | { t: "tool_start"; id: string; name: string; input: unknown }
  | { t: "tool_end"; id: string; ok: boolean; output?: string }
  | { t: "decision"; card: DecisionCard }
  | { t: "permission"; id: string; tool: string; input: unknown }   // waits for an answer
  | { t: "result"; ok: boolean; costUsd?: number; durationMs: number; error?: string };
```

## Session settings by kind

| Kind | cwd | Tools allowed without asking | Needs approval | Notes |
| --- | --- | --- | --- | --- |
| chat | project | Read, Glob, Grep, LS | Edit, Write, Bash, everything else | resumes `project.json → claude.sessionId` |
| agent | worktree | Read, Glob, Grep, LS | Edit/Write auto-allowed **inside the worktree only**; Bash needs approval | runs headless; approvals go to the agent card |
| calibration (scan) | project | Read, Glob, Grep, LS, `git log`, `git status` | nothing else is allowed — deny all writes | output is the proposal, not file edits |
| survey | draft folder | none (all built-ins disallowed) | none | one short turn per step; returns a card via `draft_card`, or the docs via `propose_docs` (ADR-0009) |
| magnet | `~/.apeiron/magnet` | Read of the magnet folder and the projects folder (`additionalDirectories`) | no commands; every action becomes a proposed-action card (ADR-0011) | read-only switch off: may edit its own notes after approval |

"Allow for this session" adds a rule (tool + exact command, or tool + file path) to the
session's allow list in memory. It is never saved to disk.

## Mapping tools to timeline rows

| Claude tool | Timeline row | Icon colour |
| --- | --- | --- |
| Read, Glob, Grep, LS | **Read** `path` · `N lines` | grey |
| Edit, Write, MultiEdit | **Edited** `path` · `+a −r` | purple (`--edited`) |
| Bash (running) | **Running** `cmd` · timer | accent, spinner |
| Bash (done ok) | **Ran** `cmd` · `3.1s` or "✓ 24 passed" | green |
| Bash (failed / timeout) | **Failed** `cmd` · reason | red |
| any, waiting on approval | **Waiting** `target` · "needs approval" | amber |

Three or more Read rows in a row collapse into **Read N files** with the first two names.

## Approvals

```
Claude asks to use Edit(file) ──► runner emits {t:"permission"} ──► ApprovalBroker
     ▲                                                                 │ saves row (pending)
     │                                                                 │ emits approval.requested
     │                                                       UI shows approval card
     │                                                                 │
     └──────── allow / deny (+ reason) ◄── POST /api/approvals/:id ◄───┘
```

- The edit approval card shows a **diff preview**. For Edit we build it from
  `old_string → new_string`; for Write from the current file (or empty) to the new content.
- Deny sends a reason back to Claude: the default is "The user denied this. Ask what they want
  instead." The user can type their own.
- No timeout. Claude waits. The chat shows "Claude is paused until you answer the approval above."
- If the session is stopped or the daemon exits, pending approvals become `cancelled`.

## Decision cards

Claude needs a way to ask a structured question in the middle of a chat. We give it a custom tool:

```ts
tool("ask_decision", "Ask the user to choose between 2–4 options. Use for any real choice.",
     DecisionCardInputSchema)
```

- When Claude calls `ask_decision`, the runner emits `{ t: "decision" }` and **holds the tool
  call open** until the user answers. The answer is returned as the tool result:
  `"User chose: Compute from activity at read time"` (or their custom text).
- The survey does not use this tool: each step is its own turn with `draft_card` (ADR-0009).
- The card is validated with zod. If invalid (e.g. no recommended option), the runner returns an
  error to Claude so it fixes the card. The user never sees a broken card.
- Every confirmed card in a **Ready** project also gets offered as an ADR ("Save as ADR-0005?")
  — a normal edit approval.

## System prompt additions

Appended to Claude Code's own system prompt for project chats:

```
You are working inside Apeiron, a workspace that follows a strict engineering process.
- Read CLAUDE.md and _project/STATUS.md before anything else.
- When there is a real choice to make, call ask_decision. Do not pick for the user.
- Keep answers short and plain. Name the file, then the change.
- Current phase: {{phase}}. Do not write production code in the plan or design phase.
```

## Stop, resume, errors

- **Stop** interrupts the current turn. Partial edits already approved stay; nothing else runs.
- The Claude session id is saved in the app cache (`sessions.claude_session_id`) after the first
  `session` event, so a reload or daemon restart resumes the same conversation. Apeiron does not
  write it into the project's files.
- If `claude` is not found or not logged in: health check flips to red, the composer is
  disabled with "Claude Code isn't available — How to fix".
- Rate limit / API error: a red row in the timeline with the message and **Retry**.

## Testing

A **fake Claude** (`packages/daemon/test/fake-claude`) replays recorded event scripts so all of the
above can be tested without the network. See `testing.md`.
