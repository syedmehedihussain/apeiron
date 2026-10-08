# 0005 — Loopback only, per-run token on every request

- **Status:** Accepted; token handling superseded by 0008
- **Date:** 2026-10-07
- **Decided by:** Meddy

## Context

The daemon can make Claude edit files and run commands. Any web page in the browser can send
requests to `127.0.0.1`.

## Decision

Bind `127.0.0.1` only. A random token per daemon run, passed in the URL fragment, kept in
memory, required on every HTTP request and as the WebSocket's first message. Reject unknown
`Host` and `Origin` headers. Remote access (Tailscale) is out of the MVP.

## Consequences

- Good: other sites and other machines cannot drive the daemon.
- Cost: a page reload loses the token; the UI asks you to run `apeiron open` (or the CLI prints a fresh link).
