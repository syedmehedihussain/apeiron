# Components

Every reusable UI part, with props and states. All states are drawn on the **Component sheet**
artboard (`design/screens/Components.dc.html`). Build each one in `packages/web/src/components/`
with a test per state.

## Shell

### `TopBar`
Props: `crumbs: {label, href?}[]`, `phase?: Phase`, `status?: "approval" | "working" | "calibrating" | …`
- Left: logo → Home, then `/`-separated crumbs. Last crumb is `--t1` 500.
- Centre (workspace only): `PhaseBar` full variant.
- Optional status pill after crumbs ("Approval needed" amber, "Claude is working" blue pulse).
- Right: `ClaudeStatus`, Settings icon button, Magnet avatar button.

### `ClaudeStatus`
States: **ok** (green dot + glow), **working** (green dot pulsing), **missing** (red dot,
"Claude Code not found", links to the fix).

### `ThreeColumn`
`left` 280 / `centre` / `right` 360. Each column scrolls independently. Column borders `--b`.

## Status and labels

### `StatePill` — project state
`ready` (green), `cctop` (blue), `uncalibrated` (amber, label "Not calibrated").
22 px high, 11.5 px, 500, pill.

### `RunPill` — agent / approval state
`running` (blue, spinner dot), `waiting` (amber dot), `done` (green), `failed` (red),
`recommended` (blue text on accent fill, no dot).

### `GitChip`
Mono 11.5 px, 6 px radius. Tone by content: `clean` green · `N ahead` blue · `N behind`,
`N changes` amber · `No remote` neutral.

### `GitLetter`
Single letter in the file tree: `M` amber (modified), `A` green (added), `U` green-grey
(untracked), `D` red (deleted, name struck through).

### `PhaseBar`
Variants:
- **full** (top bar): five pills. Done = `--s3` fill with check icon. Current = accent fill +
  accent border + dot. Future = dashed `--bs` border, `--t3` text.
- **compact** (cards, tables): five 6 px segments with 3 px gaps. Done `--phase-done`, current
  `--accent`, future = 1 px inset outline. Label under it ("Development", "Unknown").

## Chat

### `TimelineRow`
Grid `20px auto 1fr auto`, 32 px high. Props: `kind`, `verb`, `target`, `meta`.

| kind | icon circle | verb | meta |
| --- | --- | --- | --- |
| read | neutral | Read | `212 lines` / `2 min ago` |
| edit | edited (purple) | Edited | `+12 −3` in diff colours |
| ran | success | Ran | `3.1s` or `✓ 24 passed` |
| running | accent + spinner | Running | live timer |
| waiting | warning | Waiting | `needs approval` |
| failed | danger | Failed | reason (`timed out`) |

A thin vertical rail (`--b-faint`) connects rows. `TimelineGroup` collapses 3+ reads into
"Read N files" with a chevron.

### `DecisionCard`
The most important component. Props: `card: DecisionCard`, `state`, `onConfirm(optionId|custom)`.

Layout (14 px radius, `--s1`, `--bs` border):
1. Header row: accent icon + "Decision · {topic}" (12 px `--t2`) · right: status pill.
2. Question (16 px 600) + context line (13 px `--t2`, starts "You said: …").
3. Options: full-width buttons, 10 px radius, radio circle left. Title 14/500 + **Recommended**
   badge, benefit line 13 `--t2`, "Trade-off: …" 12.5 `--t3`. Selected = accent border +
   accent-weak fill + filled radio.
4. "Something else…" row: dashed border, empty radio, inline text input.
5. Optional "why" box (`--s2`, 10 px radius) — toggled by **Why Claude recommends it**.
6. Footer (top border): ghost "Why Claude recommends it" · ghost "Answer in chat" · primary **Confirm**
   (disabled until an option is picked or custom text typed).

States:
- **drafting** — header + 3 shimmer option rows, label "Drafting options…".
- **open** — status "Waiting for you" (amber).
- **selected** — one option highlighted, Confirm enabled.
- **confirmed** — collapses to one line: `{Topic}: {answer}` + ghost **Change**, green check.
- **stale** (survey) — amber note "An earlier answer changed. Check this again."

### `ApprovalCard`
Props: `approval`, `onAnswer`.
- **Edit variant**: header "Claude wants to edit N files" + "Waiting for approval" pill. One
  block per file: path (mono), "New file" tag or `+a −r`, diff preview (first ~12 lines,
  "N more lines · Show all").
- **Command variant**: header "Claude wants to run a command". Mono box `$ npm install zod`,
  then "in ~/Projects/core".
- Footer: primary **Allow** · secondary **Allow for this session** · "Runs in ~/path" hint ·
  danger-ghost **Deny** (opens an optional reason input).
- Answered states collapse to one line: **Allowed** (green) "Edit 2 files · streaks.ts, index.ts · 1 min ago"
  or **Denied** (red) "Run `rm -rf drizzle/` · just now".

### `ApprovalToast`
Bottom-right, `--s1`, shadow. "Claude wants to run a command · now", mono command,
**Review** (primary small) and **Deny**. Clicking Review jumps to the chat card.

### `Composer`
Textarea "Message Claude", footer: **Plan mode** toggle chip, model chip (`Sonnet`), send button
(white circle, arrow up). While running, send turns into **Stop** (square icon). Hint above:
"Claude reads `CLAUDE.md` and `STATUS.md` first."

### `AssistantMessage`
"Claude" label 12 px 500, text 14/1.65, inline `code` in mono on `--s2`.

### `UserMessage`
Right-aligned bubble, `--s2`, 12 px radius, max 80 %.

## Project

### `FileTree`
Rows 28–30 px, indent 16 px per level with `--b-faint` guide lines. Left: chevron (folders) or
type tag (`TS`, `MD`, `JS`, `JSON` — 10 px mono, `--s2`, 4 px radius). Right: `GitLetter`.
States: default, hover (`--s2`), selected (`--s3`), ignored (`node_modules` 50 % opacity,
never expanded by default), deleted (strike-through). Header: "Project files" + filter
chips "M 3 modified", "A 1 added", "Claude touched".

### `StatusNotch`
A small pill in the centre tab row, centred between the tabs and the session meta, that just
says **Status** with a dot: green = STATUS.md is there, blue (pulsing) = it just changed, red =
there is no STATUS.md, grey = loading. Click opens a popover with
"Where we left off", "Next steps" (first 5), "Updated 2 h ago" and **Update status**; Esc or a
click outside closes it. When STATUS.md changes while you watch, the notch turns blue for six
seconds. It takes no vertical space from the chat.

### `GitHubBox`
Card: repo link + Private/Public tag; branch chip, `↑ 0 ↓ 0`, "3 uncommitted"; the latest commit on one
line (message, relative time, mono short hash) with a chevron that shows the last 3; kept compact
so the Agents panel below gets the room; "0 open pull requests"; footer **Pull** (secondary),
**Push** (secondary, opens a push approval).

### `AgentCard`
Title (task), `RunPill`, meta row "Sonnet · 3m 12s · `agent/tests-streaks`", then:
- running: last 3 timeline rows.
- waiting: "Wants to run `npm install -D vitest`" + **Review**.
- done: summary line + **Review diff** · **Accept** (primary) · **Discard** (danger ghost).
- failed: failing row + **Try again**.

### `DocsList` / `DocReader`
List groups: Project (STATUS.md, CLAUDE.md), Engineering (PRD, Architecture, Data model),
Decisions (ADR number in mono + title, "New" tag for unread). Reader: title, path · "Last
changed by Claude · 3 h ago", actions **Ask Claude about this doc** and **Open in editor**,
rendered Markdown (tables, code, ADR reference chips like `ADR-0003` that link).

### `FileViewer`
Breadcrumb (`lib / services / streaks.ts`), "Read-only" tag, "29 lines · TypeScript",
**Show changes** toggle with `+2 −2`, **Open in editor**. Line numbers in `--t3`. With changes on,
added lines get `--diff-add-bg`, removed lines are shown inline with `--diff-del-bg`.

## Home

### `ProjectCard`
196 px min height, 12 px radius. Name 16/600 + `StatePill`; summary; compact `PhaseBar`;
"Next: …" (top border); `GitChip` + "Last worked 2 h ago". Hover: border `--bs`, `--s2`
background.

### `ProjectTable`
Columns `1.9fr 140px 170px 1fr 110px 110px 104px`: Project (name + summary), State, Phase,
Stack tags, Last worked, Git, action (**Calibrate** for uncalibrated). Scrolls horizontally
below 900 px.

### `PromptBox`
760 px max, 16 px radius, `--bs` border. Textarea 15 px. Chips: **New project** (selected),
**Calibrate a folder**, **Ask Magnet**. White circular send button.

### `Banner`
First run: amber icon, "Claude Code not found", one line why, **How to fix** (primary),
**Check again** (secondary).

## Survey and calibration

### `StepRail`
Vertical list of steps with number circles: done (check, `--t2`), current (accent), future
(`--t3`). Header "New project survey · 3 of 7 answered".

### `KnownSoFar`
Right rail: "What we know so far" + "Live" pill, list of answered summaries, each "Step N ·
Topic" label.

### `ScanProgress`
Activity rows (Read package.json · "Node 20 · Express · React"), current row with spinner and
counter ("24 / 38 files"), indeterminate bar, "Then: 2 A few questions · 3 Review proposed
files", "Started 22 s ago", **Cancel**. Right: "Found so far" tags (amber for gaps like
"no tests").

### `ProposalList`
Rows with a checkbox, path, "New" or "Append" tag, size. Selected row shows the file preview on
the right. Footer: **Discard** · primary **Write N selected files** + note "Your existing files
stay as they are."

## Magnet

### `MagnetPanel`
Header: avatar 24 + "Magnet" + "Read-only · knows N projects". Messages; project mentions are
links in mono. Inline project mini-cards ("torongo · Not calibrated · 2 behind"). Proposed
action card: "Magnet wants to start calibration in torongo", what it will do, "Nothing is
written until you approve the files.", **Approve** / **Cancel**. Suggestion chips at the bottom
and an "Ask Magnet" input.

### `MagnetAvatar`
Props `size: 96 | 48 | 24 | 16`. 16 uses the mono glyph.
