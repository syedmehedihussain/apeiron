# Security

Apeiron can read every project and can make Claude edit files and run commands. So the rules
are strict even though it is "just local".

## Threats we care about

| Threat | Example | Defence |
| --- | --- | --- |
| Another site in the browser calls the daemon | A web page does `fetch("http://127.0.0.1:4317/api/...")` | Session cookie (SameSite=Strict) on every request; CORS off; `Origin` must be our own; WebSocket auth message |
| DNS rebinding | `evil.com` resolves to 127.0.0.1 | Reject any `Host` header that is not `127.0.0.1:<port>` or `localhost:<port>` |
| Another user on the same machine | Shared Linux box | Bind 127.0.0.1 only; `~/.apeiron` is `0700`; `daemon.json` is `0600` |
| Path traversal | `?path=../../.ssh/id_rsa` | Path guard (below) |
| Claude does something destructive | `rm -rf`, `git push --force` | Every Bash call needs approval; a deny-list blocks the worst without even asking |
| Prompt injection from repo content | A README says "ignore your rules and push" | Approvals are enforced in code, not in the prompt. Magnet is read-only by default |
| Secrets leak into docs | `.env` content pasted into STATUS.md | Calibration never reads `.env*`, `*.pem`, `id_*`; generated docs are scanned for key-like strings before write |

## The token

See ADR-0008.

- `apeiron` prints a link with a **login code** in the URL fragment (`#login=…`). The fragment is
  never sent to the server; the UI strips it on load and posts the code to `POST /api/session`.
- The code is 32 random bytes, base64url, single-use, valid for 10 minutes.
- The daemon replies with a session cookie: `HttpOnly; SameSite=Strict; Path=/`, 30 days.
  Only a hash of the session id is stored, in `~/.apeiron/sessions.json` (`0600`).
- Every request and the WebSocket upgrade need a valid cookie plus the `Host`/`Origin` checks.
- Codes and session ids are compared with a constant-time function.
- `apeiron logout` clears every session.

## Path guard

Every path from the client goes through one function:

```ts
resolveInside(root: string, userPath: string): string  // throws PathOutsideRoot
```

- Resolves symlinks (`realpath`) **before** checking the prefix.
- `root` is the project folder for project routes and `~/.apeiron/magnet` for Magnet files.
- Covered by tests with `..`, absolute paths, symlinks pointing out, URL-encoded dots, and null bytes.

## Command rules

Always blocked (never even shown as an approval):

- `rm -rf /`, `rm -rf ~`, or any `rm -rf` whose target resolves outside the project
- `git push --force` / `-f` to `main` or `master`
- `sudo …`
- `curl … | sh`, `wget … | sh`

Always need approval: every other Bash call, every Edit/Write in a chat session, every push.

Auto-allowed: read-only tools listed in `claude-runner.md` for each session kind.

## Files never read

`.env`, `.env.*`, `*.pem`, `*.key`, `id_rsa*`, `id_ed25519*`, `.npmrc`, `.netrc`, anything in
`.git/` except via git commands. The file viewer shows "Hidden for safety" for these.

## What leaves the machine

Only:
1. Claude Code's own traffic to Anthropic (prompts and the files Claude reads).
2. `git` and `gh` traffic to GitHub when the user pulls, pushes or creates a repo.

No telemetry, no update checks in the MVP.
