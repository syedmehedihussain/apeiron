# Roadmap

Each milestone ends with something you can use. Do them in order. A milestone is done only when
every box in its **Done when** list is ticked and `pnpm test` passes.

## M0 — Preparation (repo setup)

- [ ] Create `syedmehedihussain/apeiron`, push these docs.
- [ ] pnpm workspace with `cli`, `daemon`, `web`, `shared`; TS strict; ESLint + Prettier.
- [ ] Vitest in every package; Playwright set up with the preinstalled Chromium.
- [ ] GitHub Actions: lint, typecheck, test on push and PR.
- [ ] `packages/web` imports `docs/design/tokens.css`; Geist fonts load.
- [ ] Extract Magnet SVGs and the app mark into `packages/web/src/assets/`.
- [ ] `_project/` created and excluded; `STATUS.md` filled.

**Done when:** `pnpm dev` shows an empty dark page with the top bar, and CI is green.

## M1 — Daemon and Home

- [ ] `apeiron up / down / status`, `daemon.json`, token, Host/Origin checks.
- [ ] `ProjectScanner`: classify folders, parse `project.json` + `STATUS.md`, git summary.
- [ ] SQLite cache + migrations; `projects.md` generator for Magnet.
- [ ] `GET /api/projects`, `/api/health`, WebSocket with `projects.updated`.
- [ ] Home: prompt box (UI only), Recent cards, All projects table, search, sort.
- [ ] Claude Code check + first-run banner; empty folder state.
- [ ] File watcher → live updates.

**Done when:** `apeiron up` opens Home listing your real `~/Projects` with correct badges, phases
and git chips, in under 2 s.

## M2 — Workspace, read-only

- [ ] Workspace shell (top bar with phase bar, 280 | centre | 360).
- [ ] File tree with git letters, filters, ignored folders.
- [ ] File viewer with syntax highlight (Shiki) and **Show changes**.
- [ ] Docs tab: grouped list + Markdown reader (with ADR links).
- [ ] Status block from `STATUS.md`.
- [ ] GitHub box (read only: branch, ahead/behind, commits, PR count).
- [ ] **Open in editor**.

**Done when:** you can browse any Ready or cctop project's files and docs without a terminal.

## M3 — Claude chat

- [ ] **Spike (1 day):** confirm CLI flags / Agent SDK API, write ADR-0004 as Accepted.
- [ ] ClaudeRunner + fake Claude + recorded scripts.
- [ ] SessionManager with resume; transcripts as JSONL.
- [ ] Chat UI: messages, timeline rows, grouping, streaming, Stop.
- [ ] ApprovalBroker + `ApprovalCard` (edit and command) + toast.
- [ ] `ask_decision` tool + inline `DecisionCard`.
- [ ] Command rules and the must-pass safety tests.

**Done when:** you can ask Claude to make a change in a real project, see the diff, Allow it, and
the file changes — and a Deny leaves it untouched.

## M4 — Calibration

- [ ] Prompt, scan (read-only session), questions, proposal, write-selected.
- [ ] Append-only rule for existing `CLAUDE.md` / `README.md`.
- [ ] Light calibration for cctop projects.

**Done when:** torongo goes from Not calibrated to Ready, and `git status` shows only the files
you ticked.

## M5 — New project survey

- [ ] Seven steps, `survey.json` saved per answer, resume, change + stale marking.
- [ ] Doc generation: `CLAUDE.md`, PRD, ADRs from decisions, architecture, data model, STATUS,
      `project.json`, `tasks.json` (Core preset).
- [ ] Create folder, `git init`, exclude `_project/`, optional `gh repo create --private`.

**Done when:** a new project created from Home has all docs, a first commit, and opens in the
workspace at phase Design.

## M6 — GitHub actions

- [ ] Pull (`--ff-only`), Push behind an approval, open PRs list via `gh`.

## M7 — Background agents

- [ ] Worktrees, AgentManager, agent cards, approvals from agents, diff review, accept/discard,
      retry, max running.

**Done when:** "write tests for X" runs on the side while you chat, and Accept lands it on your
branch.

## M8 — Magnet

- [ ] `~/.apeiron/magnet/` with starter files; Settings → Magnet page.
- [ ] Magnet session (read-only tools across projects), panel on Home and workspace.
- [ ] Proposed-action cards that call real routes after Approve.
- [ ] Suggestion chips.

**Done when:** "What's stuck this week?" gives a correct answer from your real projects.

## After the MVP

Notes & Tasks polish · usage heatmap · terminal tab · Tailscale access · light theme · runner
adapters for other agent CLIs (ADR-0006) · npm publish as `apeiron-cli`.
