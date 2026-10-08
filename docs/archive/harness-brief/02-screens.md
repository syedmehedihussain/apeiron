# 02 — Screens

Seven screens and two overlays. Each section gives the layout, the parts, and the states to show.
Sizes are for a 1440 × 900 frame.

---

## Shared shell (used by every screen)

**Top bar, 56 px tall, full width.**

- Left: app mark + wordmark "Harness" (placeholder name — keep it simple and replaceable).
  On a project page, a breadcrumb follows: `Projects / core`.
- Centre (project pages only): the **phase bar** — five small segments
  `Plan · Design · Preparation · Development · Deployment`, the current one in the accent colour,
  done ones filled grey, future ones outlined.
- Right: Magnet button (his small avatar), settings icon, a connection dot (green = Claude Code
  found and logged in, red = not found).

There is no left app sidebar. Navigation is: Home → project → back to Home.

---

## Screen 1 — Home

Purpose: start a new project or jump back into one.

**Layout (top to bottom, centred column ~1040 px wide):**

1. **Greeting** — "Good evening, Meddy" small and quiet above a larger line:
   "What are we building?" (Reference 2 shows this idea.)
2. **Prompt box** — wide card. Placeholder: "Describe a new project, or ask Magnet anything…".
   Inside, bottom row: chips `New project`, `Calibrate a folder`, `Ask Magnet`; right side a round
   white send button.
3. **Start project** — a large clear button or card next to/under the prompt: "+ Start project".
   This begins the survey.
4. **Recent projects** — a row of 3–4 cards (the most recently worked on).
   Each card: project name, one-line summary, phase bar (mini), git state chip
   (`clean`, `2 ahead`, `1 behind`, `5 changes`), "Last worked 2 h ago", and the first line of
   "Next step".
5. **All projects** — a list/table below: name, state badge (Ready / cctop / Not calibrated),
   phase, stack tags, last worked, git state. Sort by last worked. A search field on the right.
   Not-calibrated rows show a small "Calibrate" button.

**Right edge:** Magnet can open as a slide-in panel (see Overlay B).

**States to show:**
- Normal (sample content from `05`).
- First run: no projects yet. Friendly empty state: "Your `~/Projects` folder is empty" + Start project.
- Claude Code not found: a quiet banner at the top with "Claude Code isn't installed or logged in" + "How to fix".

---

## Screen 2 — Project workspace (the main screen)

Purpose: everything about one project in one view. Design this first.

**Layout: three columns under the top bar.**

| Column | Width | Contents |
| --- | --- | --- |
| Left | 280 px | File tree |
| Centre | flexible | Status strip + tabs (Chat · Docs · Notes & Tasks) |
| Right | 360 px | GitHub box (top) + tabs Agents · Magnet (below) |

### Left — File tree (Reference 4)

- Header: project name and a small "…" menu.
- Tree with indent guide lines. Each row: chevron (folders), small file-type tag on the left in
  grey monospace (`TS`, `MD`, `JSON`, `PY`), file name, and on the right a git letter coloured by
  status: `M` amber (modified), `A` green (added), `U` blue (untracked), `D` red (deleted).
- Files Claude touched in the current session have a tiny accent dot.
- `CLAUDE.md`, `docs/` and `_project/` are pinned at the top under a small "Project files" group.
- Selected row has a soft highlight (Reference 4, "To Venus" row).
- Clicking a file opens a read-only viewer in the centre (see Screen 3).

### Centre — Status strip

A slim card across the top of the centre column (about 96 px):

- **Where we left off** — 1–2 sentences.
- **Next steps** — 2–3 checkbox items, first one emphasised.
- Right side: "Updated 2 h ago" and a small "Update status" text button.

### Centre — Tabs

**Chat tab (default)** — a Claude Code session in this project.

- Messages: user messages right-aligned in a subtle bubble; Claude's replies left, no bubble,
  plain readable text with code blocks.
- Tool activity shown inline as compact rows (Reference 1 timeline style): icon + verb + target,
  e.g. `Read  lib/services/project.ts`, `Ran  npm run test  ✓ 24 passed`, `Edited  app/page.tsx  +12 −3`.
  Collapsible.
- **Decision cards** and **Approval cards** appear inline in the stream (see `04-components.md`).
- Composer at the bottom: multiline input, chips for `Plan mode`, model name (`Sonnet`), attach
  file; send button on the right. Above it, a small line: "Claude reads CLAUDE.md and STATUS.md first."

**Docs tab** — like a reading app (see Screen 3).

**Notes & Tasks tab** — left: personal notes (Markdown, editable — notes are the only editable
text in the app). Right: the task list grouped by phase, each task with a checkbox, and a lock
icon if its dependency is not done yet ("Finish 'Define the data model' first").

### Right — GitHub box (Reference 1 "Amount" card)

- Repo name as a link (`syedmehedihussain/core`), visibility pill (`Public`/`Private`).
- Branch selector (`main`), ahead/behind counts.
- Uncommitted changes count.
- Last 3 commits: message, short hash in mono, time.
- Open PRs count.
- Buttons: `Pull` (secondary pill) and `Push` (white primary pill). Push asks first.

### Right — Agents tab

- "+ New agent" button at the top → opens a small form: task description, model, "Run in a
  separate copy (worktree)" — on by default.
- A list of **agent cards** (see `04-components.md`): running, finished, failed.

### Right — Magnet tab

See Overlay B; here it is docked instead of sliding in.

**States to show for the workspace:**
- Normal, with a chat in progress and one decision card waiting.
- An approval card waiting (Claude wants to edit two files).
- Claude is working (streaming text + a live activity row with spinner).
- Not on GitHub (GitHub box shows "No remote" + "Create repository on GitHub").

---

## Screen 3 — Docs and file viewer (Workspace, Docs tab active)

Like Claude Desktop's document view.

- Left inside the tab: list of documents grouped as **Project** (`STATUS.md`, `CLAUDE.md`),
  **Engineering** (`PRD`, `Architecture`, `Data model`), **Decisions** (`ADR-0001 …`, numbered).
- Right: the rendered document, max 760 px reading width, good heading hierarchy, tables, code
  blocks, checklists. Top of the doc: title, file path in mono, "Last changed by Claude · 3 h ago".
- Buttons: "Ask Claude about this doc", "Open in editor" (opens the user's own editor).

File viewer (when a code file is clicked in the tree): same frame, monospace with syntax
colours, line numbers, a read-only badge, and the git diff toggle ("Show changes").

---

## Screen 4 — New project survey

Purpose: the plan phase as a guided series of decisions. Full page, not a modal.

**Layout:**

- Left rail (240 px): the seven steps as a vertical list with check marks —
  1 Idea · 2 Problem & users · 3 Scope · 4 Stack · 5 Data · 6 Quality bar · 7 Review.
  Current step highlighted, done steps ticked, later steps quiet.
- Centre (max 720 px): one **decision card** at a time, large.
- Right (300 px, optional): "What we know so far" — a live summary that grows: name, idea,
  users, chosen stack, entities… Each line links back to its step.

**Step 1 is different:** two text fields — Project name, and "Describe the idea in a few
sentences". Then "Start survey".

**Steps 2–6:** decision cards (see component). Example for Stack in `05-sample-content.md`.

**Step 7 — Review:** a summary of everything, plus the list of files that will be created
(`CLAUDE.md`, `docs/prd.md`, `docs/architecture.md`, `docs/data-model.md`,
`docs/adr/0001…`, `_project/STATUS.md`, `_project/project.json`) each with a "Preview" link,
a checkbox "Create a private GitHub repository", and the primary button "Create project".

**States:** a step in progress, Claude thinking ("Drafting options…" skeleton), the review step.

---

## Screen 5 — Calibration

Purpose: bring an existing folder that has no structure into Harness. Nothing is written until
the user approves.

**Step A — Prompt (inside the workspace, replacing the centre):**
"torongo isn't set up for Harness yet." What calibration will do (3 bullets), what it will **not**
do ("Never overwrites your files", "Reads only until you approve"), buttons `Calibrate` (primary)
and `Not now`.

**Step B — Scanning:** progress with a live activity list (Reading package.json, Reading README,
Reading git history — 214 commits…). A Cancel button.

**Step C — Questions:** 1–3 decision cards for what it could not work out (e.g. "What phase is
this project in?").

**Step D — Review proposal:** a list of proposed files, each a row with New/Changed tag, path,
and size. Selecting a row shows the full proposed content (or a diff for changed files) on the
right. Per-file checkbox. Buttons: `Write selected files` (primary), `Discard`.

---

## Screen 6 — Settings (Reference 3)

Grouped left sidebar with small icons: General, Projects folder, Claude Code, GitHub, Magnet,
Appearance, Shortcuts, About. Content area with simple rows of label + control.

The **Magnet** page shows his profile files (`MAGNET.md`, `me.md`, `work.md`) as editable cards,
and a small stats row: projects tracked, sessions this week, agents run.

A **Usage** block (like Reference 3): stats row (sessions, longest task, current streak) and an
activity heatmap of days worked across all projects.

---

## Overlay A — Approval prompt (focused version)

When the user is away from the chat tab and Claude needs approval, a toast appears bottom-right:
"Claude wants to run `npm install zod`" with `Review` and `Deny`. Review jumps to the card.

## Overlay B — Magnet panel

Slides in from the right (400 px) on Home; docked as a tab in the workspace.

- Header: Magnet's avatar, name, status ("Read-only · knows 12 projects").
- **Magnet's look:** an original, small, friendly one-wheeled robot butler. Simple shapes,
  works at 24 px and at 96 px. Not based on any existing character.
- Chat with Magnet, same styling as the project chat.
- Suggested prompts as chips: "What's stuck this week?", "Start a project", "Summarise today".
- When Magnet wants to do something (start an agent, create a project), he shows a
  **proposed action card**: what he will do, and `Approve` / `Cancel`.
