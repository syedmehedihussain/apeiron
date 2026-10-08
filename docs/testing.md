# Testing

## Layers

| Layer | Tool | What |
| --- | --- | --- |
| Unit | Vitest | parsers (STATUS.md, stream events), schemas, path guard, classifier, command rules |
| Integration | Vitest + temp dirs | daemon services against real git repos made in `os.tmpdir()` |
| API | Vitest + Fastify `inject` | every route: auth, validation, happy path, errors |
| UI components | Vitest + Testing Library | decision card, approval card, file tree, timeline rows — all states from `components.md` |
| End to end | Playwright | the five flows below, against the daemon + fake Claude |

## The fake Claude

`packages/daemon/test/fake-claude/` exposes the same interface as the real runner, driven by
scripts:

```yaml
# scripts/edit-with-approval.yaml
- session: sess_test_1
- text: "I'll add the streak service."
- tool: { name: Edit, input: { file_path: lib/services/streaks.ts, old_string: "", new_string: "export…" } }
- expect_permission: allow        # test fails if the runner did not stop here
- tool_end: { ok: true }
- result: { ok: true }
```

Scripts can also be **recorded** from a real session (`APEIRON_RECORD=1`) and replayed.

## Must-pass safety tests

These run in CI and block merges:

1. No file under a project changes during calibration until `calibrate/write` is called.
2. `calibrate/write` with an existing `CLAUDE.md` appends, never replaces.
3. Survey `create` refuses if the target folder exists and is not empty.
4. A denied edit leaves the file byte-for-byte unchanged.
5. Requests without a valid session cookie → 401; a used or expired login code → 401. Wrong `Host` → 403. Wrong `Origin` → 403.
6. Path guard rejects every traversal case.
7. Blocked commands never reach an approval and are denied with a reason.
8. Agent **Discard** removes the worktree and branch and leaves the main checkout unchanged.

## E2E flows

1. Home lists a fixture `~/Projects` with one project in each state.
2. Calibrate the not-calibrated fixture → review → write 3 of 4 files → it becomes Ready.
3. Survey a new project to the end → files exist → git repo initialised.
4. Chat: send message → approval → allow → timeline shows Edited +n.
5. Agent: start → done → accept → commit on main branch.

## Commands

```bash
pnpm test            # unit + integration + API + components
pnpm test:e2e        # Playwright (uses the preinstalled Chromium)
pnpm test:safety     # only the must-pass list
```
