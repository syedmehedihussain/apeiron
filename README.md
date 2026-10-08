# Apeiron

> Anaximander said everything comes from the *apeiron*, the boundless.
> Apeiron is where every project of yours begins.

Apeiron is a local workspace where Claude Code plans, documents and builds software the way a
software engineer would: **survey first, decide, document, then build.** It runs on your own
computer at `127.0.0.1`, reads your `~/Projects` folder, and drives your local `claude` CLI.

It is not a code editor and not a vibe-coding tool. You read code and docs here, you make the
decisions here, and Claude does the typing — only after you approve.

**Status:** M0 and M1 done: `apeiron` starts the daemon and Home lists your projects.
See [`docs/roadmap.md`](docs/roadmap.md).

## Names

| Thing | Name |
| --- | --- |
| App | Apeiron |
| Command | `apeiron` (published on npm as `apeiron-cli`) |
| Repo | `syedmehedihussain/apeiron` |
| Assistant | Magnet |
| Config folder | `~/.apeiron/` |
| License | MIT |

## Where to start reading

1. [`CLAUDE.md`](CLAUDE.md) — the short front door for Claude Code (and for you).
2. [`docs/README.md`](docs/README.md) — the map of every document and what it is for.
3. [`docs/roadmap.md`](docs/roadmap.md) — what to build, in what order, and how we know a
   milestone is done.

## Quick start (once milestone 1 exists)

```bash
pnpm install
pnpm dev            # daemon on 127.0.0.1:4317 + web UI with hot reload
pnpm apeiron        # the real CLI: start the daemon, print the link, open the browser
```

## Install the `apeiron` command

```bash
mise install             # Node 22 + pnpm from mise.toml
pnpm install
./scripts/install-cli.sh # puts `apeiron` in ~/.local/bin
apeiron                  # start, print the login link, open the browser
```
