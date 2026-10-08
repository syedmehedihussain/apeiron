# Screens

Each screen below names its artboard in [`design/screens/`](design/screens/). Open the artboard
in a browser for layout; the artboards use sample data from Meddy's real projects.

Routes are hash-free client routes served by the daemon.

| Route | Screen | Artboards |
| --- | --- | --- |
| `/` | Home | `Home`, `Home-Empty`, `Home-Magnet` |
| `/new` , `/new/:id` | New project survey | `Survey-Stack`, `Survey-Review` |
| `/p/:id/calibrate` | Calibration | `Calibrate-Prompt`, `Calibrate-Scan`, `Calibrate-Review` |
| `/p/:id` | Workspace — Chat | `Main`, `Workspace-Approval`, `Workspace-Working` |
| `/p/:id/docs/*` | Workspace — Docs | `Workspace-Docs` |
| `/p/:id/files/*` | Workspace — File viewer | `Workspace-File` |
| `/p/:id/notes` | Workspace — Notes & Tasks | *not designed; build from `Components`* |
| `/settings/:section` | Settings | `Settings` |

---

## 1. Home — `Home.dc.html`

- Top bar: logo, Claude Code status, Settings, Magnet.
- Soft blue glow at the top. Centred: "Good evening, Meddy" (time-aware, name from `me.md`)
  and **What are we building?**
- `PromptBox` with chips. **Start project** (white, 44 px) + hint "A short survey first. Claude
  drafts the plan before any code."
- **Recent**: 4 `ProjectCard`s, auto-fit grid, min 240 px.
- **All projects**: header "7 folders in `~/Projects`", sort button, search input,
  `ProjectTable`.

Behaviour
- Typing in the prompt with **New project** selected and pressing send = start the survey with
  that text as the idea. **Ask Magnet** sends it to Magnet (opens the panel). **Calibrate a
  folder** opens a folder picker limited to the projects folder.
- Clicking a card: Ready/cctop → workspace. Not calibrated → calibration prompt.

States
- **Loading**: cards as skeletons, table with 5 shimmer rows.
- **First run, Claude missing** — `Home-Empty.dc.html`: amber banner at the top; prompt and
  Start project disabled with tooltip; projects still listed.
- **Empty folder** — same artboard: "Your `~/Projects` folder is empty" with **Start project**
  and **Choose another folder**.
- **Magnet open** — `Home-Magnet.dc.html`: Home dims slightly, `MagnetPanel` slides in from the
  right (~420 px).

## 2. New project survey — `Survey-Stack.dc.html`, `Survey-Review.dc.html`

Top bar: crumbs `Projects / review-qr`, "New" pill, phase bar on Plan, "Draft saved · 25 min
ago", **Save and exit**.

Grid 240 | centre | 300.
- Left: `StepRail` (7 steps).
- Centre: "Step 4 of 7 · Stack", the `DecisionCard` for the step, **Back** and **Confirm**. Below:
  "Answered" one-liners for earlier steps with **Change**.
- Right: `KnownSoFar`.

Step 1 is a simple form (name — validated as a folder name — and a one-paragraph idea) with a
**Quick** toggle that skips Data and Quality bar; the rail then shows 5 steps.

Step 7 Review (`Survey-Review`): grid 240 | centre | 380.
- Centre: "Ready to create review-qr", answer summary table (`120px | answer | Change`),
  "Files to be created · 7 files · nothing is overwritten" with **Preview** per file, GitHub
  toggle "Create a private GitHub repository `syedmehedihussain/review-qr`", **Back** and
  primary **Create project**.
- Right: preview of the selected file (CLAUDE.md shown by default), "New · 1.8 KB".

After **Create project**: progress list (Writing files → git init → Creating repo), then go to
the workspace with phase = Design.

## 3. Calibration — `Calibrate-*.dc.html`

Uses the workspace shell (280 | centre | 360) so the user sees it is the same project.

**A. Prompt** (`Calibrate-Prompt`): "torongo isn't set up for Apeiron yet." Two boxes: **What
calibration does** (3 numbered steps) and **What it will not do** (never overwrites, reads only
until you approve). **Calibrate** (primary) · **Not now** · "Usually under 2 minutes". Right
column: GitHub box (works already) and "No agents yet — available after calibration".

**B. Scan** (`Calibrate-Scan`): "Calibrating torongo · step 1 of 3 — Reading the project".
Reassurance line "Nothing is being written." `ScanProgress`. Right: "Found so far" tags.

**C. Questions** — *not designed as a full screen.* Build it like a survey step: one
`DecisionCard` at a time in the centre, with the scan summary on the left.

**D. Review** (`Calibrate-Review`): left 280 = steps + "Your answers" (Phase: Development, Users:
Clinics in Bangladesh) + **Change answers**. Then `ProposalList` (400) and the preview pane.
"5 new files and 1 change to README.md. Untick anything you don't want."

## 4. Project workspace

Top bar: crumbs, `PhaseBar` (full), status pill when needed, Claude status, Settings, Magnet.

**Left (280):** `FileTree` with header and filter chips, then `StatusBlock` pinned at the bottom.

**Centre:** tabs **Chat · Docs · Notes & Tasks**, session meta right ("session 14 · 38 min").

**Right (360):** `GitHubBox`, then tabs **Agents (3) · Magnet**, **New agent**, `AgentCard`s.

Artboards:
- `Main.dc.html` — **decision waiting**: user message, Claude text, collapsed "Read 3 files",
  `DecisionCard` open with one recommended option.
- `Workspace-Approval.dc.html` — **approval waiting**: confirmed decision line, Claude text,
  edit `ApprovalCard` for 2 files with diff; top bar "Approval needed"; composer shows the paused
  hint. Agent card in **waiting** state.
- `Workspace-Working.dc.html` — **Claude working**: "Allowed" collapsed line, timeline (Edited,
  Edited, Ran ✓, Running), streaming text with cursor; composer shows **Stop**; the right
  column shows a compact GitHub box and the **Magnet** tab open with a proposed action.
- `Workspace-Docs.dc.html` — **Docs tab**: `DocsList` (210 px) + `DocReader` showing
  `architecture.md`; `ApprovalToast` bottom right.
- `Workspace-File.dc.html` — **file viewer** for `streaks.ts` with **Show changes** on.

Notes & Tasks (*not designed*): two columns — `notes.md` as a simple Markdown editor (the only
place the user types free text into a file) and the `tasks.json` list grouped by phase with
status checkboxes. Use the same card and list styles.

## 5. Settings — `Settings.dc.html`

Grid 260 | content. Nav groups as in `components.md`. Magnet page (designed): 96 px avatar,
title, one-line description, **Read-only mode** switch; stat row (Projects tracked, Sessions this
week, Agents run); **What Magnet knows** — three editable Markdown cards (`MAGNET.md`, `me.md`,
`work.md`) with "Plain Markdown in `~/.apeiron/magnet/`"; **Usage** — four stats and the
Daily/Weekly heatmap.

Other sections (not designed, simple forms): General (projects folder, port), Appearance (dark
only — show as info), Shortcuts (list), Projects folder, Claude Code (path, version, login
state, default model), GitHub (gh status), About (version, license, links).

## Global states

- **Daemon unreachable**: full-page message "Apeiron isn't running. Run `apeiron`." with retry.
- **WebSocket reconnecting**: small amber pill in the top bar, auto-retry with backoff.
- **Project folder gone**: workspace placeholder with link Home.
