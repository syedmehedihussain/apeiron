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
| POST | `/api/projects/:id/git/push` | creates a `push` approval first; pushes only after Allow |

## Chat

| Method | Path | Does |
| --- | --- | --- |
| GET | `/api/projects/:id/chat` | current session meta + last 200 transcript events |
| POST | `/api/projects/:id/chat` | `{ text, planMode?, model? }` → starts a turn |
| POST | `/api/projects/:id/chat/stop` | interrupts the running turn |
| POST | `/api/projects/:id/chat/new` | starts a fresh session |
| POST | `/api/decisions/:cardId` | `{ optionId? , custom? }` answer a decision card |

## Approvals

| Method | Path | Does |
| --- | --- | --- |
| GET | `/api/approvals?status=pending` | all pending approvals (for toasts) |
| POST | `/api/approvals/:id` | `{ answer: "allow" \| "allow_session" \| "deny", reason? }` |

## Survey

| Method | Path | Does |
| --- | --- | --- |
| POST | `/api/survey` | `{ name, idea }` → creates the draft folder `_project/survey.json`, returns survey id = project id |
| GET | `/api/survey/:id` | survey state |
| POST | `/api/survey/:id/next` | asks Claude to draft the next card (events: `survey.drafting`, `survey.card`) |
| POST | `/api/survey/:id/answer` | `{ step, optionId? , custom? }` |
| POST | `/api/survey/:id/change` | `{ step }` reopen a step |
| GET | `/api/survey/:id/proposal` | files to be created with content |
| POST | `/api/survey/:id/create` | `{ files: string[], createRepo: boolean }` write and finish |

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
| POST | `/api/projects/:id/agents` | `{ task, model }` |
| GET | `/api/agents/:agentId/diff` | diff of the agent branch vs base |
| POST | `/api/agents/:agentId/accept` | merge |
| POST | `/api/agents/:agentId/discard` | remove worktree + branch |
| POST | `/api/agents/:agentId/retry` | new run with the same task |
| POST | `/api/agents/:agentId/stop` | interrupt |

## Magnet

| Method | Path | Does |
| --- | --- | --- |
| GET | `/api/magnet` | profile files + stats |
| PUT | `/api/magnet/files/:name` | save `MAGNET.md`, `me.md` or `work.md` |
| POST | `/api/magnet/chat` | `{ text, projectId? }` |

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
| `git.updated` | git object | project:id |
| `tree.changed` | `{ paths: string[] }` | project:id |
| `agent.updated` | agent object (status, activity tail) | project:id |
| `agent.activity` | `{ agentId, row }` | project:id |
| `survey.drafting` / `survey.card` / `survey.updated` | survey payloads | project:id |
| `calibrate.progress` | `{ step, rows, found }` | project:id |
| `calibrate.proposal` | proposal | project:id |
| `magnet.text.delta` / `magnet.action` | Magnet payloads | magnet |

On reconnect the client re-subscribes and re-fetches state with GET calls. Events are not replayed.
