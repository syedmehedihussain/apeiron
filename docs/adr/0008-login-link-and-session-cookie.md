# 0008 — Login link once, then a session cookie

- **Status:** Accepted (supersedes the token handling in 0005)
- **Date:** 2026-10-08
- **Decided by:** Meddy

## Context

ADR-0005 kept the token in browser memory, so a page reload or a bookmark lost it and you had to
run `cherry` again. Cherry is used all day in a browser tab, so it must survive reloads and
bookmarks without becoming open to other sites or other machines.

## Options

1. **Token in memory only** (0005) — strictest. Trade-off: every reload needs a new link.
2. **Login link once, then a cookie** — the link logs you in and a cookie keeps you logged in. Trade-off: one more secret stored on disk.

## Decision

Option 2.

- `cherry` prints `http://127.0.0.1:4317/#login=<code>`. The code is single-use and expires
  after 10 minutes.
- The UI posts the code to `POST /api/session`. The daemon answers with a cookie:
  `HttpOnly; SameSite=Strict; Path=/`, valid for 30 days, holding a random session id.
- The daemon stores only a hash of the session id in `~/.cherry/sessions.json` (mode `0600`),
  so sessions survive daemon restarts and bookmarks keep working.
- Every HTTP request and the WebSocket upgrade must carry a valid cookie **and** pass the
  `Host` and `Origin` checks from 0005. Loopback binding stays.
- `cherry logout` (and Settings → About) clears all sessions.

## Consequences

- Good: refresh and bookmarks just work; other sites still cannot call the daemon (SameSite,
  Origin check, no CORS), and other machines still cannot reach it (loopback).
- Cost: a stolen cookie works until it expires; it lives in the browser profile, which already
  holds more sensitive logins.
