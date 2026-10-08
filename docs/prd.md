# PRD — Apeiron MVP

| | |
| --- | --- |
| Owner | Meddy (Syed Mehedi Hussain) |
| Status | Approved for build |
| Phase | Plan → Preparation |
| Last updated | 2026-10-08 |

## 1. Problem

Meddy runs many projects at once (core, cctop, sysdash, hunch, torongo, client work…) and uses
Claude Code every day. Today:

- Each project lives in its own terminal and editor. There is no single place that shows
  **where each project stopped and what is next**.
- New projects start as a prompt and turn into code too fast. Decisions are lost in chat history,
  so later sessions repeat or undo them.
- Claude Code in a terminal either asks about everything or, with permissions relaxed, edits
  freely. There is no calm, visual way to approve or deny.
- Small side jobs ("write tests for auth") block the main session.

## 2. Users

One user: the owner of the machine. A developer who uses Claude Code daily, works across many
repos, and wants engineering discipline without the paperwork.

Because Apeiron is open source, other developers with the same setup (a `~/Projects` folder and
a logged-in `claude` CLI) are the secondary audience. Nothing in the MVP may assume Meddy's
personal data; personal content lives only in `~/.apeiron/magnet/`.

## 3. Goals

1. See every project in one place with state, phase, git status, and "next step".
2. Start a new project through a **survey of decision cards** that produces a PRD, ADRs, an
   architecture and a data model **before any code**.
3. Bring an existing messy folder up to the same standard (**calibration**) without risk.
4. Talk to Claude about one project with **approve / deny** for every edit and command.
5. Run **background agents** in their own git worktrees and accept or discard their diff.
6. Have **Magnet**, an assistant who knows all projects, answer cross-project questions and
   propose actions.

## 4. Non-goals (MVP)

- Editing code by hand inside Apeiron (read-only viewer only).
- A built-in terminal tab.
- Multiple users, login, or access from outside `127.0.0.1` (Tailscale later).
- Cloud storage or sync.
- Mobile layout. Desktop only: designed at 1440 × 900, must work 1366 → 1920 wide.
- Light theme.
- Agents other than Claude Code (an adapter layer may come later, see ADR-0006).

## 5. Requirements

Priority: **P0** = MVP cannot ship without it. **P1** = MVP should have it. **P2** = nice to have.

### Home

| ID | Requirement | Pri |
| --- | --- | --- |
| H-1 | Scan the projects folder (default `~/Projects`) and list every direct sub-folder as a project. | P0 |
| H-2 | Sort each folder into **Ready**, **cctop**, or **Not calibrated** (rules in `project-standard.md`). | P0 |
| H-3 | **Recent** section: 4 cards by last session, each with name, summary, state badge, phase bar, "Next:", git chip, "Last worked …". | P0 |
| H-4 | **All projects** table: project, state, phase, stack tags, last worked, git, and a **Calibrate** button for not-calibrated rows. | P0 |
| H-5 | Search and sort (by last worked, name). | P1 |
| H-6 | Prompt box with chips **New project / Calibrate a folder / Ask Magnet**, and a **Start project** button. | P0 |
| H-7 | Top bar shows Claude Code status (green dot = found and logged in). | P0 |
| H-8 | First run: if `claude` is missing or logged out, show the "Claude Code not found" banner with **How to fix** and **Check again**. Projects stay readable. | P0 |
| H-9 | Empty folder state with **Start project** and **Choose another folder**. | P1 |
| H-10 | Rescan on folder changes (file watcher) without a page reload. | P1 |

### New project survey

| ID | Requirement | Pri |
| --- | --- | --- |
| S-1 | Seven steps: 1 Name & idea (typed), 2 Problem & users, 3 Scope, 4 Stack, 5 Data, 6 Quality bar, 7 Review. A **Quick** toggle on step 1 skips steps 5 and 6. | P0 |
| S-2 | Steps 2–6 are **decision cards**: question, 2–4 options, one marked **Recommended**, a trade-off line per option, "Why Claude recommends it", and "Something else…". | P0 |
| S-3 | Each answer is saved to `_project/survey.json` the moment it is confirmed. Survey can be paused ("Save and exit") and resumed. | P0 |
| S-4 | Left rail shows steps and answered count; right rail shows "What we know so far". | P1 |
| S-5 | Answered steps can be changed; later steps that depended on them are marked for re-check. | P1 |
| S-6 | Review step lists every file to be created with a preview, and an optional **Create a private GitHub repository** toggle. | P0 |
| S-7 | **Create project** writes `CLAUDE.md`, `docs/`, `_project/`, the task graph, runs `git init`, and creates the repo if asked. Never overwrites. | P0 |
| S-8 | "Drafting options…" loading state while Claude prepares a card. | P0 |

### Calibration

| ID | Requirement | Pri |
| --- | --- | --- |
| C-1 | Prompt screen explains what calibration does and does not do. Nothing runs before **Calibrate** is clicked. | P0 |
| C-2 | Step 1, scan: a **read-only** Claude session reads code, README, package files, git history. Live activity list and "Found so far" tags. Cancel works at any time. | P0 |
| C-3 | Step 2, questions: decision cards for what cannot be inferred (goal, users, phase). | P0 |
| C-4 | Step 3, review: proposed files as diffs with a tick box each. **Write N selected files** / **Discard**. | P0 |
| C-5 | Existing files are never replaced. An existing `CLAUDE.md` or `README.md` only gets a proposed section appended. | P0 |
| C-6 | A **cctop** project gets a light calibration (adds `project.json`, `docs/`, task graph; keeps `STATUS.md`). | P1 |

### Project workspace

| ID | Requirement | Pri |
| --- | --- | --- |
| W-1 | Layout: top bar with breadcrumb and phase bar; left 280 px; centre flexible; right 360 px. | P0 |
| W-2 | Left: file tree with indent guides, type tags, git letters (M, A, U, D), "Claude touched" filter, change counts. | P0 |
| W-3 | Left bottom: **Where we left off** and **Next steps** from `STATUS.md`, with **Update status**. | P0 |
| W-4 | Centre tabs: **Chat**, **Docs**, **Notes & Tasks**. | P0 (Notes & Tasks P1) |
| W-5 | Chat streams Claude's text and a tool timeline (Read, Edited +/−, Ran, Running, Waiting, Failed). Groups of reads collapse ("Read 3 files"). | P0 |
| W-6 | Approval card for edits (diff preview) and commands (`$ cmd in ~/path`): **Allow**, **Allow for this session**, **Deny**. Chat shows "Claude is paused until you answer". | P0 |
| W-7 | Decision cards appear inline in chat when Claude asks a structured question. | P0 |
| W-8 | Composer: "Message Claude", **Plan mode** toggle, model chip, **Stop** while running. | P0 |
| W-9 | Session resumes across page reloads and daemon restarts. | P0 |
| W-10 | Docs tab: grouped list (Project / Engineering / Decisions) and a rendered Markdown reader with **Ask Claude about this doc** and **Open in editor**. | P0 |
| W-11 | File viewer: read-only, syntax highlighted, breadcrumb, **Show changes** (inline diff vs HEAD), **Open in editor**. | P0 |
| W-12 | GitHub box: repo, visibility, branch, ↑ahead ↓behind, uncommitted count, last 3 commits, open PR count, **Pull** and **Push** (push asks first). | P0 |
| W-13 | Right panel tabs: **Agents** (with count) and **Magnet**. | P0 |
| W-14 | Toast for approvals that arrive while you are on another tab. | P1 |

### Background agents

| ID | Requirement | Pri |
| --- | --- | --- |
| A-1 | **New agent** with a task and model. Each agent runs headless in its own git worktree on branch `agent/<slug>`. | P0 |
| A-2 | Agent card: title, status pill (Running, Waiting, Done, Failed), model, elapsed time, branch, live activity. | P0 |
| A-3 | Waiting agents raise an approval ("Wants to run `npm install -D vitest`" → **Review**). | P0 |
| A-4 | Done: summary line, **Review diff**, **Accept** (merge into the current branch), **Discard** (remove worktree and branch). | P0 |
| A-5 | Failed: the failing step and **Try again**. | P1 |
| A-6 | Limit of 3 running agents at once (setting). | P1 |

### Magnet

| ID | Requirement | Pri |
| --- | --- | --- |
| M-1 | Panel available on Home (slide-in) and in the workspace (right tab). | P0 |
| M-2 | Knowledge in `~/.apeiron/magnet/`: `MAGNET.md`, `me.md`, `work.md` (written by the user), `projects.md` (generated on every scan). | P0 |
| M-3 | Read-only by default. Any write, agent start or push is a **proposed action** card with **Approve / Cancel**. | P0 |
| M-4 | Suggestion chips: "What's stuck this week?", "Start a project", "Summarise today". | P1 |
| M-5 | Settings page: Magnet profile, read-only switch, editable knowledge files, stats. | P1 |

### Settings

| ID | Requirement | Pri |
| --- | --- | --- |
| G-1 | Sidebar groups: App (General, Appearance, Shortcuts), Connections (Projects folder, Claude Code, GitHub), Assistant (Magnet), About. | P1 |
| G-2 | Usage: sessions this month, longest task, current and longest streak, daily/weekly heatmap. | P2 |

## 6. Success measures

- Meddy opens Apeiron instead of a bare terminal for **5 of 7 days** in the first month.
- Every project in `~/Projects` is Ready or cctop within two weeks of milestone 4.
- No file is ever written without an approval (verified by tests, see `testing.md`).
- Cold start (`apeiron` → Home rendered) under **2 seconds** with 30 projects.

## 7. Dependencies

- `claude` CLI installed and logged in (Claude Code).
- `git` 2.40+ (worktrees).
- `gh` CLI, optional, for repo creation and PRs. Without it the GitHub box shows git data only.
