# Apeiron docs — map

Read this page, then open only what your task needs.

## Product

| File | What it answers |
| --- | --- |
| [`prd.md`](prd.md) | What are we building, for whom, what is in and out of the MVP? |
| [`screens.md`](screens.md) | What does each screen do, which design artboard shows it, what are its states? |
| [`roadmap.md`](roadmap.md) | In what order do we build, and when is each milestone done? |
| [`open-questions.md`](open-questions.md) | What is still undecided? |

## Engineering

| File | What it answers |
| --- | --- |
| [`architecture.md`](architecture.md) | How do the CLI, daemon, web UI and local tools fit together? |
| [`project-standard.md`](project-standard.md) | What does a project folder look like? How are folders sorted into states? |
| [`data-model.md`](data-model.md) | Exact shapes of `project.json`, `survey.json`, `tasks.json`, the SQLite cache, Magnet's folder. |
| [`api.md`](api.md) | The daemon's HTTP routes and WebSocket events. |
| [`claude-runner.md`](claude-runner.md) | How we spawn `claude`, read its stream, handle approvals and decision cards. |
| [`security.md`](security.md) | Threat model, token, path rules, what Claude may do without asking. |
| [`testing.md`](testing.md) | What we test, how, and the fake `claude` binary. |
| [`adr/`](adr/) | Every real decision, one file each. |

## Design

| File | What it answers |
| --- | --- |
| [`design-system.md`](design-system.md) | Colours, type, spacing, radius, icons, motion. |
| [`components.md`](components.md) | Every reusable part, its props and states. |
| [`design/tokens.css`](design/tokens.css) | The tokens as CSS variables. Import this; never hard-code hex. |
| [`design/screens/`](design/screens/) | The design artboards (`*.dc.html`) exported from the canvas. Source of truth for layout. |
| [`design/canvas.html`](design/canvas.html) | The whole canvas as one self-contained page. Open it in a browser to see every screen rendered. |

## Archive

| File | What it is |
| --- | --- |
| [`archive/harness-brief/`](archive/harness-brief/) | The original brief given to Claude Design. Superseded by `prd.md` and `screens.md`; kept for history only. |

## Note on the design files

The artboards were made in Claude Design while the app was still called **Harness**. Wherever
they say "Harness" or `~/.harness/`, build it as **Apeiron** and `~/.apeiron/`. The artboards
also use a small runtime (`support.js`) that is not included; read them as HTML/CSS reference,
not as code to ship.
