# Roadmap

Each milestone ends with something you can use. Do them in order. A milestone is done only when
every box in its **Done when** list is ticked and `pnpm test` passes.

## M0 — Preparation (repo setup)

- [x] Create `syedmehedihussain/apeiron`, push these docs (MIT, ADR-0007).
- [x] pnpm workspace with `cli`, `daemon`, `web`, `shared`; TS strict; ESLint + Prettier.
- [x] Vitest in every package; Playwright set up with the preinstalled Chromium.
- [x] GitHub Actions: lint, typecheck, test on push and PR.
- [x] `packages/web` imports `docs/design/tokens.css`; Geist fonts load.
- [x] Extract Magnet SVGs and the app mark into `packages/web/src/assets/`.
- [x] `_project/` created and excluded; `STATUS.md` filled.

**Done when:** `pnpm dev` shows an empty dark page with the top bar, and CI is green.

## M1 — Daemon and Home

- [x] `apeiron` (= `up`) / `down` / `status` / `logout`, `daemon.json`, login link + session cookie (ADR-0008), Host/Origin checks.
- [x] `ProjectScanner`: classify folders, parse `project.json` + `STATUS.md`, git summary.
- [x] SQLite cache + migrations; `projects.md` generator for Magnet.
- [x] `GET /api/projects`, `/api/health`, WebSocket with `projects.updated`.
- [x] Home: prompt box (UI only), Recent cards, All projects table, search, sort.
- [x] Claude Code check + first-run banner; empty folder state.
- [x] File watcher → live updates.

**Done when:** `apeiron` opens Home listing your real `~/Projects` with correct badges, phases
and git chips, in under 2 s.

## M2 — Workspace, read-only

- [x] Workspace shell (top bar with phase bar, 280 | centre | 360).
- [x] File tree with git letters, filters, ignored folders.
- [x] File viewer with syntax highlight (Shiki) and **Show changes**.
- [x] Docs tab: grouped list + Markdown reader (with ADR links).
- [x] Status block from `STATUS.md`.
- [x] GitHub box (read only: branch, ahead/behind, commits, PR count).
- [x] **Open in editor**.

**Done when:** you can browse any Ready or cctop project's files and docs without a terminal.

## M3 — Claude chat

- [x] **Spike (1 day):** confirm CLI flags / Agent SDK API, write ADR-0004 as Accepted.
- [x] ClaudeRunner + fake Claude + recorded scripts.
- [x] SessionManager with resume; transcripts as JSONL.
- [x] Chat UI: messages, timeline rows, grouping, streaming, Stop.
- [x] ApprovalBroker + `ApprovalCard` (edit and command) + toast.
- [x] `ask_decision` tool + inline `DecisionCard`.
- [x] Command rules and the must-pass safety tests.

**Done when:** you can ask Claude to make a change in a real project, see the diff, Allow it, and
the file changes — and a Deny leaves it untouched.

## M4 — Calibration

- [x] Prompt, scan (read-only session), questions, proposal, write-selected.
- [x] Append-only rule for existing `CLAUDE.md` / `README.md`.
- [x] Light calibration for cctop projects.

**Done when:** torongo goes from Not calibrated to Ready, and `git status` shows only the files
you ticked.

## M5 — New project survey

- [x] Seven steps, `survey.json` saved per answer, resume, change + stale marking.
- [x] Doc generation: `CLAUDE.md`, PRD, ADRs from decisions, architecture, data model, STATUS,
      `project.json`, `tasks.json` (Core preset).
- [x] Create folder, `git init`, exclude `_project/`, optional `gh repo create --private`.

**Done when:** a new project created from Home has all docs, a first commit, and opens in the
workspace at phase Design.

## M6 — GitHub actions

- [x] Pull (`--ff-only`), Push behind an approval, open PRs list via `gh`.

## M7 — Background agents

- [x] Worktrees, AgentManager, agent cards, approvals from agents, diff review, accept/discard,
      retry, max running.

**Done when:** "write tests for X" runs on the side while you chat, and Accept lands it on your
branch.

## M8 — Magnet

- [x] `~/.apeiron/magnet/` with starter files; Settings → Magnet page.
- [x] Magnet session (read-only tools across projects), panel on Home and workspace.
- [x] Proposed-action cards that call real routes after Approve.
- [x] Suggestion chips.

**Done when:** "What's stuck this week?" gives a correct answer from your real projects.

## After the MVP: scan agents

- [x] Ready-made scan agents (Security review, Test runner, Code health, Dependency audit),
      custom ones from `~/.apeiron/agents/`, reports in `apeiron/reports/` read in the centre
      (ADR-0012).

**Done when:** one click on Run in the Agents view scans the project without asking anything,
and Report opens the result in its own centre tab with the history of earlier runs.

## After the MVP

Notes & Tasks polish · usage heatmap · terminal tab · Tailscale access · light theme · runner
adapters for other agent CLIs (ADR-0006) · npm publish as `apeiron-cli`.
