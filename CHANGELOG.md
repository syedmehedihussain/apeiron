# Changelog

All notable changes to Apeiron. Versions follow [Semantic Versioning](https://semver.org).

## 1.0.0 — unreleased

The first release. Linux only; install from a clone with `./scripts/install-cli.sh`
(ADR-0013).

### The app

- `apeiron` command: start, stop, status, open a project, doctor, logout, systemd user service.
  Loopback-only daemon with a one-time login link and session cookie (ADR-0005, ADR-0008).
- **Home**: every project in your projects folder with state, phase, git and next step; search
  and sort; live updates when files change.
- **New project survey**: seven decision cards, then CLAUDE.md, PRD, ADRs, architecture,
  data model, STATUS, `project.json`, `tasks.json`, `git init`, a first commit and an optional
  private GitHub repo.
- **Calibration** for existing projects: read-only scan, questions, a proposal you tick file by
  file; existing files only get additions.
- **Workspace**: file tree with git letters and coloured type tags, read-only file viewer with
  diffs, Docs reader with ADR links, Notes & Tasks, Status notch, and Open in editor.
- **Chat with Claude**: streaming, plan mode, model and effort pickers, file and image
  attachments, approval cards for every edit and command, decision cards, Stop, resume.
- **Scan agents**: one-click read-only Security review, Test runner, Code health and
  Dependency audit with reports in the centre and a history per agent; custom agents from
  `~/.apeiron/agents/` (ADR-0012).
- **Background agents**: tasks in their own git worktree and branch, approvals for commands,
  diff review, Accept (merge) or Discard, retry, a running limit (ADR-0010).
- **GitHub**: branch, ahead/behind, recent commits, pull, push after approval, open PRs.
- **Magnet**: a read-only assistant across all projects with proposed actions you approve
  (ADR-0011).
- **Claude Code skill** in `.claude/skills/apeiron`, with `scripts/api.sh` to drive a running
  Apeiron.

### Safety

- Every chat edit and command needs approval; `sudo`, force pushes to main or master,
  `curl | sh` and `rm -rf` outside the project are blocked outright.
- Secret files (`.env`, keys) are never read; a path guard with symlink resolution protects
  every file route.
