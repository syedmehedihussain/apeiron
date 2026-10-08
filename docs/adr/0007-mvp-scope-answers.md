# 0007 — Answers to the MVP open questions

- **Status:** Accepted
- **Date:** 2026-10-08
- **Decided by:** Meddy

## Context

The plan left ten questions open (product scope, relation to other tools, license, design gaps).
They were answered together before M0. One file records them all so the decisions are not
spread across many small ADRs. The login question has its own ADR (0008).

## Decision

| # | Question | Answer |
| --- | --- | --- |
| 1 | Docs in git | Commit `docs/`; keep `_project/` out of git via `.git/info/exclude` (as in `project-standard.md`). |
| 2 | Which `~/Projects` | The one on the machine where `apeiron` runs. The folder can be changed in Settings → General. |
| 3 | Relation to cctop | Live beside it. Both read and write the same `_project/` files; cctop keeps its Projects tab. |
| 4 | Relation to Core | Magnet lives in Apeiron (`~/.apeiron/magnet/`). Core may read those files later. |
| 5 | Survey depth | Step 1 gets a **Quick** toggle that skips step 5 (Data) and step 6 (Quality bar). |
| 6 | Magnet's permissions | Magnet never starts agents on its own; every action is a proposed-action card you approve. |
| 7 | Runner | Still decided by the M3 spike (ADR-0004). |
| 8 | License | MIT. |
| 9 | Logo | A placeholder circle mark until before a public release. |
| 10 | Notes & Tasks tab, calibration step C | Not designed. Build them from the component sheet, then review in the browser. |
| — | App window | Browser only. No desktop wrapper; users can "install" the page from the browser if they want a window. |

## Consequences

- Good: M0 and M1 are unblocked; no undecided items remain except the M3 spike.
- Cost: cctop and Apeiron must stay compatible on the `STATUS.md` format (ADR-0002).
