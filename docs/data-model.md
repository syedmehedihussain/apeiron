# Data model

All file shapes are defined as zod schemas in `packages/shared/src/schemas/`. This page is the
human-readable version. Every JSON file has a `schema` number so we can migrate later.

## 1. `_project/project.json`

```json
{
  "schema": 1,
  "name": "atlas-api",
  "summary": "REST API for mission tracking",
  "phase": "plan",
  "calibrated": "2026-10-07",
  "createdBy": "survey",
  "repo": "syedmehedihussain/atlas-api",
  "stack": ["Node 22", "Fastify", "SQLite"],
  "docs": {
    "prd": "docs/prd.md",
    "architecture": "docs/architecture.md",
    "dataModel": "docs/data-model.md",
    "adr": "docs/adr/"
  },
  "claude": {
    "model": "sonnet",
    "sessionId": null
  }
}
```

| Field | Type | Notes |
| --- | --- | --- |
| `schema` | `1` | required |
| `name` | string | folder name by default; shown on cards |
| `summary` | string ≤ 120 chars | one line |
| `phase` | `plan \| design \| preparation \| development \| deployment` | required |
| `calibrated` | ISO date | when the project became Ready |
| `createdBy` | `survey \| calibration \| manual` | |
| `repo` | `owner/name` or `null` | GitHub repo, if any |
| `stack` | string[] | tags on cards |
| `docs` | object of relative paths | all optional; missing = not shown |
| `claude.model` | string | default model for this project's chat |
| `claude.sessionId` | string or `null` | the main chat session to `--resume` |

## 2. `_project/survey.json`

Written after **every** confirmed answer so a survey can pause and resume.

```json
{
  "schema": 1,
  "status": "in_progress",
  "startedAt": "2026-10-08T12:40:00Z",
  "updatedAt": "2026-10-08T13:05:00Z",
  "step": 4,
  "answers": [
    {
      "step": 1,
      "topic": "name_idea",
      "kind": "typed",
      "value": { "name": "review-qr", "idea": "A printable QR code that opens a business's Google review page.", "quick": false }
    },
    {
      "step": 3,
      "topic": "scope",
      "kind": "decision",
      "card": { "id": "dc_7f2", "question": "What must v1 do?", "options": ["…"] },
      "chosen": "opt_a",
      "custom": null,
      "summary": "QR generator, per-business link, scan counter",
      "answeredAt": "2026-10-08T12:58:00Z"
    }
  ],
  "stale": []
}
```

- `status`: `in_progress | review | created | abandoned`.
- `stale`: steps that must be re-checked because an earlier answer changed (S-5).
- `card` is a full copy of the decision card shown, so the record still makes sense later.
- `quick` on the step-1 answer skips steps 5 and 6 (ADR-0009).

## 3. Decision card (shared shape)

Used by the survey, calibration questions, and inline chat questions. Claude returns this shape
as structured output (see `claude-runner.md`).

```json
{
  "id": "dc_7f2",
  "topic": "stack",
  "label": "Decision · Stack",
  "question": "Where should review-qr run?",
  "context": "You said: small UK businesses, one page per business, you host it.",
  "options": [
    {
      "id": "opt_a",
      "title": "Static pages + one small API on your home server",
      "detail": "One page per business, a single endpoint counts scans.",
      "tradeoff": "Your home server must stay online.",
      "recommended": true
    },
    {
      "id": "opt_b",
      "title": "Vercel + Supabase",
      "detail": "Managed hosting and database.",
      "tradeoff": "Free tier limits, another account to manage.",
      "recommended": false
    }
  ],
  "why": "Each business gets one small static page, so almost nothing runs on the server…",
  "allowCustom": true
}
```

Rules: 2–4 options, exactly one `recommended: true`, every option has a `tradeoff`.

## 4. `_project/tasks.json`

The phase task graph, seeded from Core's preset (`lib/services/project-presets.ts`).

```json
{
  "schema": 1,
  "tasks": [
    { "id": "t1", "phase": "plan", "title": "Write PRD", "status": "done", "dependsOn": [] },
    { "id": "t2", "phase": "plan", "title": "Record stack ADR", "status": "done", "dependsOn": ["t1"] },
    { "id": "t3", "phase": "design", "title": "Wireframe main screens", "status": "todo", "dependsOn": ["t1"] }
  ]
}
```

`status`: `todo | doing | done | skipped`. Shown in the Notes & Tasks tab.

## 5. `~/.apeiron/config.json`

```json
{
  "schema": 1,
  "projectsDir": "~/Projects",
  "port": 4317,
  "scan": { "ignore": ["archive", "scratch"] },
  "claude": { "bin": "claude", "defaultModel": "sonnet" },
  "agents": { "maxRunning": 3, "worktreeDir": "~/Projects/.apeiron-worktrees" },
  "magnet": { "readOnly": true }
}
```

`agents.worktreeDir` left at its default follows `projectsDir` (`<projectsDir>/.apeiron-worktrees`,
ADR-0010).

## 6. `~/.apeiron/magnet/`

```
~/.apeiron/magnet/
├── MAGNET.md     who Magnet is: tone, rules, what he may and may not do   (user writes)
├── me.md         the user: name, studies, roles, how they like to work    (user writes)
├── work.md       businesses, clients, websites, GitHub accounts           (user writes)
└── projects.md   one line per project from project.json + STATUS.md       (generated)
```

`projects.md` line format, rebuilt on every scan:

```
- core · Ready · development · Next.js, SQLite · git: 3 changes · last 2h ago · next: Build the Study Room floor
```

On first run the app writes starter versions of the three user files with short placeholder text.

## 7. SQLite cache — `~/.apeiron/cache.db`

Rebuildable from disk (except `usage_days`). Managed with plain SQL migrations in
`packages/daemon/migrations/`.

```sql
CREATE TABLE projects (
  id            TEXT PRIMARY KEY,       -- folder name
  path          TEXT NOT NULL UNIQUE,
  state         TEXT NOT NULL,          -- ready | cctop | uncalibrated
  phase         TEXT,
  summary       TEXT,
  stack_json    TEXT,
  next_step     TEXT,
  left_off      TEXT,
  git_json      TEXT,                   -- {branch, ahead, behind, changes, remote}
  last_worked   INTEGER,                -- unix ms, from sessions.json or git log
  scanned_at    INTEGER NOT NULL
);

CREATE TABLE sessions (
  id            TEXT PRIMARY KEY,       -- claude session id
  project_id    TEXT NOT NULL,
  kind          TEXT NOT NULL,          -- chat | agent | calibration | survey | magnet
  title         TEXT,
  model         TEXT,
  started_at    INTEGER NOT NULL,
  ended_at      INTEGER,
  transcript    TEXT NOT NULL           -- path to ~/.apeiron/transcripts/<id>.jsonl
);

CREATE TABLE agents (
  id            TEXT PRIMARY KEY,
  project_id    TEXT NOT NULL,
  session_id    TEXT,
  task          TEXT NOT NULL,
  model         TEXT NOT NULL,
  branch        TEXT NOT NULL,
  worktree      TEXT NOT NULL,
  status        TEXT NOT NULL,          -- running | waiting | done | failed | accepted | discarded
  summary       TEXT,
  error         TEXT,
  started_at    INTEGER NOT NULL,
  ended_at      INTEGER
);

CREATE TABLE approvals (
  id            TEXT PRIMARY KEY,
  session_id    TEXT NOT NULL,
  kind          TEXT NOT NULL,          -- edit | command | magnet_action | push
  payload_json  TEXT NOT NULL,
  status        TEXT NOT NULL,          -- pending | allowed | allowed_session | denied | cancelled
  created_at    INTEGER NOT NULL,
  answered_at   INTEGER
);

CREATE TABLE usage_days (
  day           TEXT PRIMARY KEY,       -- YYYY-MM-DD local
  sessions      INTEGER NOT NULL DEFAULT 0,
  longest_ms    INTEGER NOT NULL DEFAULT 0
);
```

Transcripts are stored as JSONL files (one event per line), not in SQLite, so they are easy to
read and delete.

## 8. Scan agents and reports (ADR-0012)

Custom scan agent, `~/.apeiron/agents/<id>.md` (the file name is the id):

```markdown
---
name: Accessibility check            # required
description: Labels, alt text and contrast
icon: shield                         # shield | flask | heart | package | bot (default bot)
model: sonnet                        # sonnet | opus | haiku (default sonnet)
commands: pnpm lint, pnpm test       # comma-separated; exact command or it plus arguments
---
What to look for and how to judge it. Apeiron adds the read-only rules and the report format.
```

Report, `<project>/apeiron/reports/<agentId>/<YYYY-MM-DD-HHmmss>.md` (git-ignored):

```markdown
---
agent: security
title: Security review
status: done                         # done | failed
verdict: warn                        # pass | warn | fail | none
summary: One high finding: the session token is written to the log.
critical: 0                          # the four counts are present only when given
high: 1
medium: 1
low: 0
model: opus
started: 2026-10-11T05:19:02.000Z
finished: 2026-10-11T05:21:40.000Z
---
## Summary
...
## Findings
### High · Session token in the log
...
## What to do next
...
```
