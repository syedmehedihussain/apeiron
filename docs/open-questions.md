# Open questions

Answer these before the milestone named. Each answer becomes an ADR.

| # | Question | Needed by | Current default |
| --- | --- | --- | --- |
| 1 | **Docs in git.** Commit `docs/`, keep `_project/` out of git (cctop's rule). Is that the split you want? | M1 | Yes, as in `project-standard.md` |
| 2 | **Projects folder.** `~/Projects` on which machine — the Linux machine or the Mac Ubuntu server? | M1 | Whatever machine `apeiron up` runs on; folder set in config |
| 3 | **Relation to cctop.** Replace cctop's Projects tab, or live beside it and share files? | M1 | Live beside it, share files |
| 4 | **Relation to Core.** Does Core link to Apeiron, or does Magnet move here and Core reads from it? | M8 | Magnet lives in Apeiron; Core can read `~/.apeiron/magnet/` later |
| 5 | **Survey depth.** Keep 7 steps for small projects, or add a short mode (name, idea, scope, stack)? | M5 | Add a "Quick" toggle on step 1 that skips Data and Quality |
| 6 | **Magnet's permissions.** May Magnet start background agents without asking each time? | M8 | No — always a proposed action |
| 7 | **Runner.** Claude Agent SDK or raw CLI? | M3 | Agent SDK, decided by the spike (ADR-0004) |
| 8 | **License.** MIT or Apache-2.0? | M0 | MIT |
| 9 | **Logo.** Apeiron mark to replace the "H" in the designs. | before public release | placeholder circle mark |
| 10 | **Notes & Tasks tab** and **calibration step C** were not designed. Design first, or build from the component sheet? | M4 / M5 | Build from components, review after |
