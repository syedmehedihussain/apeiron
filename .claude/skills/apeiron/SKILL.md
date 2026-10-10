---
name: apeiron
description: How to install, run, use and drive Apeiron, the local web workspace (127.0.0.1) where Claude Code plans, documents and builds the projects in ~/Projects. Use when the user mentions Apeiron or the `apeiron` command; asks to start, stop or open it; wants a project calibrated, surveyed, chatted with, scanned (security, tests, code health, dependencies) or handed to a background agent; asks for a scan report or what an agent did; wants to write a custom scan agent (~/.apeiron/agents/*.md); edits _project/ notes the Apeiron UI shows; or hits an Apeiron problem (white screen, port 4317/5173 in use, 401, "Claude Code not found").
---

# Apeiron

Apeiron is a local workspace where Claude Code works on the user's projects the way an engineer
would: survey first, decide, document, then build. A daemon (Fastify, `127.0.0.1:4317`) drives
the local `claude` CLI; a React UI talks to it. Nothing listens beyond loopback.

Two ways to help with it:

- **Tell the user what to do in the UI**: the sections below say where everything is.
- **Drive the running app yourself** through its API with `scripts/api.sh` (next to this file).
  Use this to start scans and agents, read reports, and check state. Never use it to answer
  approvals or decisions; those are the user's (see Safety).

## Install and run

Needs Node 22, pnpm, git, and Claude Code signed in (`claude auth status`). `gh` is optional
(GitHub box, Push, new repos). The repo pins Node and pnpm in `mise.toml`.

```bash
git clone https://github.com/syedmehedihussain/apeiron && cd apeiron
mise install && pnpm install
./scripts/install-cli.sh   # puts `apeiron` in ~/.local/bin
apeiron                    # start, print a login link, open the browser
```

| Command | Does |
| --- | --- |
| `apeiron` / `apeiron up` | start the daemon (builds the UI if stale) and open the login link; `--no-open` only prints it |
| `apeiron down` / `status` | stop it / say if it runs, how many projects, Claude status |
| `apeiron open <project>` | open that project's workspace |
| `apeiron doctor` | check Node, git, gh and claude |
| `apeiron logout` | end every browser (and api.sh) session |
| `apeiron install-service` | start at login (systemd user service) |

Working on Apeiron's own code: `pnpm dev` runs the daemon on 4317 and Vite on
`http://127.0.0.1:5173` with live reload. It and `apeiron` cannot run at the same time (same port,
same `~/.apeiron`); run `apeiron down` first. The repo's `CLAUDE.md` has the dev rules.

## Where things live

| Path | What |
| --- | --- |
| `~/Projects/<name>/` | one project per folder (the folder name is the project id); `projectsDir` in config changes the root |
| `<project>/_project/` | personal notes, git-excluded: `STATUS.md` (where we left off, next steps), `project.json` (phase, stack), `tasks.json`, `notes.md`, `survey.json`, `decisions.md` |
| `<project>/CLAUDE.md`, `docs/` | committed docs; the Docs tab lists them (ADRs in `docs/adr/`) |
| `<project>/apeiron/` | git-ignored: `uploads/` (chat attachments), `reports/<agent>/<date>.md` (scan reports) |
| `~/.apeiron/config.json` | projects folder, default model, agent limits |
| `~/.apeiron/agents/*.md` | custom scan agents |
| `~/.apeiron/magnet/` | Magnet's profile: `MAGNET.md`, `me.md`, `work.md`, generated `projects.md` |
| `~/.apeiron/run/daemon.json` | port, pid and CLI secret of the running daemon (0600) |
| `<projectsDir>/.apeiron-worktrees/` | git worktrees of background agents |

## The UI

**Home** lists projects by last worked, with state (Ready, cctop notes only, Not calibrated),
phase and git. The prompt box starts a **new project survey** (seven steps, each a decision card,
then it writes CLAUDE.md, PRD, ADRs, STATUS and the first commit) or asks **Magnet**.

**Calibration** (on a project that is not Ready): Claude reads the project read-only, asks a
few questions, then proposes files. Nothing is written until the user ticks the files; existing
files only get additions.

**Workspace** (`/p/<project>`), three columns:

- Left: file tree with git letters (M, A, U, D) and coloured type tags; "Claude touched" filter.
- Centre tabs: **Chat**, **Docs** (reader for CLAUDE.md, docs/ and ADRs), **Notes & Tasks**, the
  open **file** (read-only, diff vs HEAD), and an open **report** (`/p/<id>/reports/<agent>`).
  The **Status** notch shows STATUS.md and can ask Claude to update it.
- Right views: **Overview**, **GitHub** (branch, pull, push, PRs), **Agents**, **Magnet**, **Notes**.

**Chat composer**: attach files (paperclip, drop or paste, max 8 x 10 MB), **Plan mode** (Claude
plans, no edits), model (Sonnet, Opus, Haiku), **Effort** (Default, Low to Max; hidden for
Haiku). Every edit and command shows an **approval card**: Allow, Allow for this session, Deny.
Claude may ask a **decision card** with options and a recommendation.

**Agents view**:

- **Scans**: one-click read-only agents that write a report. Built in: Security review (Opus),
  Test runner, Code health, Dependency audit (Sonnet). They never ask anything: read tools run,
  edits and the web are off, and only the agent's own commands run (test/lint/typecheck for the
  Test runner, audit/outdated for Dependency audit, read-only git for all). The report opens in
  the centre with the history of earlier runs. Dependency audit contacts the package registry.
- **Tasks**: a background agent gets a free-text task and works in its own worktree on
  `agent/<slug>`. Edits there need no approval; commands do. When done: Review diff, then Accept
  (merges into the current branch) or Discard. Needs a git repo with one commit.

**Magnet** is the cross-project assistant: read-only across all projects; it can propose actions
(start an agent, calibrate, new project) that run only after the user approves.

## Driving Apeiron with scripts/api.sh

`scripts/api.sh METHOD PATH [JSON]` prints the JSON response; exit 1 on an HTTP error, 2 when
Apeiron is not running. It signs in with the CLI secret and keeps a cookie in
`~/.apeiron/run/skill-cookies.txt`. Run it by its full path, e.g.
`.claude/skills/apeiron/scripts/api.sh` inside the repo or `~/.claude/skills/apeiron/scripts/api.sh`
when installed for the user.

```bash
api.sh GET  /api/health                          # Claude found and signed in?
api.sh GET  /api/projects                        # project cards (id, state, phase, next step)
api.sh GET  /api/projects/<id>                   # card, STATUS.md, docs, git
api.sh GET  /api/projects/<id>/scans             # scan agents, running run, last report
api.sh POST /api/projects/<id>/scans/security/run
api.sh GET  /api/projects/<id>/reports/security  # history, newest first
api.sh GET  /api/projects/<id>/reports/security/<reportId>   # { meta, markdown }
api.sh POST /api/projects/<id>/agents '{"task":"Write tests for the streak service","model":"sonnet"}'
api.sh GET  /api/projects/<id>/agents            # status, summary, waiting approval
api.sh GET  /api/agents/<agentId>/diff
api.sh GET  /api/approvals?status=pending
api.sh GET  /api/projects/<id>/chat              # transcript of the current chat
```

A scan takes one to several minutes. Poll `GET .../scans` until that agent's `run` is `null`,
then read `last` and fetch the report. Reports are also plain files under
`<project>/apeiron/reports/`, so reading them from disk works too. The full API is in the repo's
`docs/api.md`; request bodies are the zod schemas in `packages/shared/src/schemas/`.

## Safety

The approval cards are the user's control over what Claude does to their files. When driving
the API:

- **Never** `POST /api/approvals/:id`, `POST /api/decisions/:id`, `.../calibrate/write`,
  `/api/agents/:id/accept`, `.../git/push` or `/api/magnet/actions/:id/approve` unless the user
  explicitly asked for that exact action in this conversation. Tell them what is waiting and
  where to click instead.
- Starting a scan, reading reports, and reading state are fine when they fit the request.
  Starting a background agent or a chat turn uses the user's Claude plan: say so first.
- Do not `PATCH /api/config` or edit `~/.apeiron/` without asking.
- Never print `daemon.json` or the cookie file; they are credentials.

## Writing a custom scan agent

Create `~/.apeiron/agents/<id>.md` (the file name is the id; an id equal to a built-in replaces
it). It shows up under Scans with a "custom" tag; a broken file shows its error there.

```markdown
---
name: Accessibility check
description: Labels, alt text, keyboard traps and contrast
icon: shield            # shield | flask | heart | package | bot
model: sonnet           # sonnet | opus | haiku
commands: pnpm lint, pnpm test   # optional; exact command or it plus arguments
---
What to look for, in what order, and how to rate severity (critical, high, medium, low).
Apeiron adds the read-only rules and the report format (Summary, Findings, What to do next).
```

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `Port 5173 is already in use` / `4317` | another `pnpm dev` or `apeiron` runs: `apeiron down`, or find it with `ss -ltnp \| grep -E '4317\|5173'` and stop that process |
| White screen in dev, console says a module "does not provide an export" | Vite cached a half-written file (often after a bulk `prettier --write`); `touch` that file and reload |
| `401 unauthorized` in the browser | run `apeiron` and open the link it prints (codes are single-use, 10 minutes) |
| "Claude Code not found" / not signed in | install Claude Code, run `claude auth login`, then "Check again" or `apeiron doctor` |
| Agent: "Agents need a git repository" / "Make a first commit" | `git init` and commit once in the project |
| Scan ends "Did not finish" | open the report for the error; usually Claude sign-in or a stop; run it again |
| Project missing on Home | it must be a folder directly in the projects folder; Home rescans on changes |
