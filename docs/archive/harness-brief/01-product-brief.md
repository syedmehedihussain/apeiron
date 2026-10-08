# 01 — Product brief

## One line

A local workspace where Claude Code plans, documents and builds projects like a software
engineer, and the owner stays in charge of every decision.

## The user

One person: Meddy, a computer science student and developer who runs several projects and small
businesses at once. He uses Claude Code every day. He wants:

- to see all his projects in one place, with **where he left off** and **what is next**;
- every new project to start with proper engineering work: requirements, decisions, architecture,
  data model — before any code;
- to approve what Claude does, not watch it run wild;
- to run small background jobs ("write tests for auth") while he keeps working;
- an assistant, **Magnet**, who knows him and all his work.

## What makes it different

| A vibe-coding tool | Harness |
| --- | --- |
| Type a prompt, get code | Answer a survey, get a plan, then code |
| Chat history is the only record | Every decision is saved as a document |
| Claude edits freely | Claude asks before editing files or running commands |
| You forget where you stopped | Each project shows "Where we left off" and "Next steps" |

## The main ideas the design must show

1. **Projects are folders.** Every folder in `~/Projects` is a project. A project card is a view
   of real files on disk.
2. **Three project states.** *Ready* (made or calibrated by Harness), *cctop project* (has basic
   notes), *Not calibrated* (no structure yet). Each needs a clear badge.
3. **Phases.** Every project moves through five phases: **Plan → Design → Preparation →
   Development → Deployment**. A phase bar appears on cards and in the workspace.
4. **Decisions, not chat.** When Claude needs an answer, it shows a **decision card**: the
   question, 2–4 options, its recommendation and why. The user clicks one.
5. **Approval.** When Claude wants to edit a file or run a command, it shows an **approval card**
   with the change. Allow or Deny.
6. **Documents are first-class.** PRD, decision records (ADRs), architecture, data model, status
   and notes are always one click away, rendered nicely like a reading app.
7. **Background agents.** Small jobs run on the side, each in its own card with live activity
   and a result to accept or discard.
8. **Magnet.** A butler assistant on every screen, who works across all projects.

## Feeling

Calm, quiet, precise. A tool for a professional. Dark, with soft cards, thin borders, lots of
breathing room, one accent colour, and colour used only for meaning (status, git state, phase).
Think "engineer's control room", not "AI magic".

## Out of scope for the MVP (do not design)

- A code editor, or typing code anywhere
- A terminal tab
- Login, multiple users, sharing
- Light theme
- Mobile layouts
