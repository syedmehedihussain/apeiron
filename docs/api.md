# Daemon API

Base URL: `http://127.0.0.1:4317`. All routes except `POST /api/session` need the session cookie
(ADR-0008). The WebSocket upgrade carries the same cookie. The `Host` and `Origin` checks apply
to both.

`POST /api/session` — body `{ "code": "…" }` (the login code from the link). Sets the cookie;
`401` if the code is wrong, used or expired. `DELETE /api/session` logs out this browser.

All bodies are JSON and validated with the zod schemas in `packages/shared`.
Errors use one shape:

```json
{ "error": { "code": "not_found", "message": "No project called atlas" } }
```

Project ids are folder names. The path guard rejects any id or file path that resolves outside
the projects folder (see `security.md`).

## System

| Method | Path | Returns |
| --- | --- | --- |
| GET | `/api/health` | `{ ok, version, claude: { found, loggedIn, version }, git, gh }` |
| POST | `/api/health/recheck` | same, after re-running checks ("Check again" button) |
| GET | `/api/config` | config.json |
| PATCH | `/api/config` | updated config |

## Projects

| Method | Path | Returns / does |
| --- | --- | --- |
| GET | `/api/projects` | `ProjectCard[]` sorted by last worked |
| POST | `/api/projects/rescan` | starts a rescan; results arrive as events |
| GET | `/api/projects/:id` | `ProjectDetail` (card + status + docs list + git) |
| GET | `/api/projects/:id/tree?path=` | one directory level with git status per entry |
| GET | `/api/projects/:id/file?path=` | `{ path, language, size, content, truncated }` (max 1 MB) |
| GET | `/api/projects/:id/diff?path=` | unified diff vs HEAD |
| GET | `/api/projects/:id/docs` | grouped docs list |
| GET | `/api/projects/:id/status` | parsed STATUS.md |
| GET | `/api/projects/:id/tasks` | tasks.json |
| PATCH | `/api/projects/:id/tasks/:taskId` | update a task status |
| GET / PUT | `/api/projects/:id/notes` | notes.md (the only file the UI writes directly — it is the user's own notes) |
| POST | `/api/projects/:id/open-in-editor` | `{ path }` → runs `$EDITOR` / `code` |

## Git and GitHub

| Method | Path | Does |
| --- | --- | --- |
| GET | `/api/projects/:id/git` | `{ branch, ahead, behind, changes, commits[3], remote, repo, visibility, openPRs }` |
| POST | `/api/projects/:id/git/pull` | `git pull --ff-only` |
| POST | `/api/projects/:id/git/push` | creates a `push` approval first (title, command, commits); runs `git push` (never forced) only after Allow; returns `{ approvalId }` |
| GET | `/api/projects/:id/git/prs` | `{ prs: [{ number, title, url, author, branch, draft, updatedAt }], error }` from `gh pr list` |

## Chat

| Method | Path | Does |
| --- | --- | --- |
| GET | `/api/projects/:id/chat` | current session meta + last 200 transcript events |
| POST | `/api/projects/:id/chat` | `{ text, planMode?, model?, attachments? }` → starts a turn; attachments are upload ids, listed for Claude to Read |
| POST | `/api/projects/:id/chat/stop` | interrupts the running turn |
| POST | `/api/projects/:id/chat/new` | starts a fresh session |
| POST | `/api/decisions/:cardId` | `{ optionId? , custom? }` answer a decision card |

## Approvals

| Method | Path | Does |
| --- | --- | --- |
| GET | `/api/approvals?status=pending` | all pending approvals (for toasts) |
| POST | `/api/projects/:id/uploads?name=` | raw file as the body (≤ 10 MB) → `{ id, name, size }`; stored in the project's `apeiron/uploads/`, and `apeiron/` is added to its `.gitignore` |
| DELETE | `/api/projects/:id/uploads/:file` | deletes an upload that was never sent (409 once it is in a message) |
| GET | `/api/projects/:id/uploads/:file` | the stored file; png/jpeg/gif/webp inline, everything else as a download (`nosniff`, sandbox CSP) |
| POST | `/api/approvals/:id` | `{ answer: "allow" \| "allow_session" \| "deny", reason? }` |

## Survey

| Method | Path | Does |
| --- | --- | --- |
| POST | `/api/survey` | `{ name, idea, quick }` → creates the draft folder with only `_project/survey.json`, returns the survey state (id = folder name) |
| GET | `/api/survey/:id` | survey state |
| POST | `/api/survey/:id/next` | `{ fresh? }` asks Claude to draft the current card (or the files at review); `fresh` drops the kept draft |
| POST | `/api/survey/:id/answer` | `{ step, optionId? , custom? }`, or `{ step: 1, idea, quick }` |
| POST | `/api/survey/:id/change` | `{ step }` reopen a step |
| POST | `/api/survey/:id/create` | `{ createRepo }` writes every proposed file, `git init`, first commit, optional `gh repo create --private` |

The survey state (`GET /api/survey/:id`) carries the current card, the drafting flag, the
proposal and the create progress, and is pushed as `survey.updated` on every change.

## Calibration

| Method | Path | Does |
| --- | --- | --- |
| POST | `/api/projects/:id/calibrate` | starts the scan (read-only session) |
| POST | `/api/projects/:id/calibrate/cancel` | stops it, writes nothing |
| POST | `/api/projects/:id/calibrate/answer` | answer a question card |
| GET | `/api/projects/:id/calibrate/proposal` | `{ files: [{ path, action: "create"\|"append", diff }] }` |
| POST | `/api/projects/:id/calibrate/write` | `{ paths: string[] }` writes only the ticked files |

## Agents

| Method | Path | Does |
| --- | --- | --- |
| GET | `/api/projects/:id/agents` | agent list |
| POST | `/api/projects/:id/agents` | `{ task, model }` → the agent (queued when all slots are busy) |
| GET | `/api/agents/:agentId/diff` | `{ files: [{ path, isNew, added, removed, lines }] }`, agent branch vs where it started |
| POST | `/api/agents/:agentId/accept` | `git merge --no-edit` into the current branch, then remove worktree and branch (ADR-0010) |
| POST | `/api/agents/:agentId/discard` | remove worktree + branch |
| POST | `/api/agents/:agentId/retry` | new run with the same task |
| POST | `/api/agents/:agentId/stop` | interrupt |

## Magnet

| Method | Path | Does |
| --- | --- | --- |
| GET | `/api/magnet` | profile files, read-only flag, stats and usage (Settings → Magnet) |
| PUT | `/api/magnet/files/:name` | save `MAGNET.md`, `me.md` or `work.md` |
| GET | `/api/magnet/chat` | `{ conversationId, running, items, readOnly, projects }` |
| POST | `/api/magnet/chat` | `{ text, projectId? }` |
| POST | `/api/magnet/chat/stop` · `/new` | stop the answer · start a new conversation |
| POST | `/api/magnet/actions/:id/approve` | runs the proposed action (ADR-0011), returns it with `result` and `href` |
| POST | `/api/magnet/actions/:id/cancel` | marks it cancelled |

## WebSocket events

One socket at `/ws`. Every event: `{ type, at, ...payload }`. The client subscribes to topics:

```json
{ "type": "subscribe", "topics": ["projects", "project:core", "approvals"] }
```

| Event | Payload | Topic |
| --- | --- | --- |
| `projects.updated` | `{ cards: ProjectCard[] }` | projects |
| `health.updated` | health object | projects |
| `chat.item` | `{ projectId, conversationId, item: ChatItem }` (upsert by `item.id`: user message, text, tool row, decision, approval, turn end) | project:id |
| `chat.delta` | `{ projectId, conversationId, itemId, turnId, text }` streamed text appended to a text item | project:id |
| `chat.state` | `{ projectId, conversationId, running, turnId, touched }` | project:id |
| `project.changed` | `{ projectId, paths }` files changed on disk | project:id |
| `approval.requested` | `{ approval }` | approvals + project:id |
| `approval.resolved` | `{ approval }` (with its final status) | approvals + project:id |
| `git.result` | `{ projectId, action: pull\|push, ok, message }` | project:id |
| `tree.changed` | `{ paths: string[] }` | project:id |
| `agent.updated` | `{ projectId, agent }` (status, last timeline rows, waiting approval, change size) | project:id |
| `survey.updated` | `{ projectId, state }` (full survey state) | project:id |
| `calibrate.progress` | `{ step, rows, found }` | project:id |
| `calibrate.proposal` | proposal | project:id |
| `magnet.item` / `magnet.delta` / `magnet.state` | Magnet's conversation (items include `projects` and `action`) | magnet |

On reconnect the client re-subscribes and re-fetches state with GET calls. Events are not replayed.
