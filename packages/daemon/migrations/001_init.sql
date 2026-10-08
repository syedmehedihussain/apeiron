-- Initial schema (docs/data-model.md §7). Everything here can be rebuilt from disk
-- except usage_days.
CREATE TABLE projects (
  id            TEXT PRIMARY KEY,
  path          TEXT NOT NULL UNIQUE,
  card_json     TEXT NOT NULL,
  last_worked   INTEGER,
  scanned_at    INTEGER NOT NULL
);

CREATE TABLE sessions (
  id            TEXT PRIMARY KEY,
  project_id    TEXT NOT NULL,
  kind          TEXT NOT NULL,
  title         TEXT,
  model         TEXT,
  started_at    INTEGER NOT NULL,
  ended_at      INTEGER,
  transcript    TEXT NOT NULL
);

CREATE TABLE agents (
  id            TEXT PRIMARY KEY,
  project_id    TEXT NOT NULL,
  session_id    TEXT,
  task          TEXT NOT NULL,
  model         TEXT NOT NULL,
  branch        TEXT NOT NULL,
  base_branch   TEXT NOT NULL,
  worktree      TEXT NOT NULL,
  status        TEXT NOT NULL,
  summary       TEXT,
  error         TEXT,
  activity_json TEXT NOT NULL DEFAULT '[]',
  started_at    INTEGER NOT NULL,
  ended_at      INTEGER
);

CREATE TABLE approvals (
  id            TEXT PRIMARY KEY,
  session_id    TEXT NOT NULL,
  project_id    TEXT,
  kind          TEXT NOT NULL,
  payload_json  TEXT NOT NULL,
  status        TEXT NOT NULL,
  created_at    INTEGER NOT NULL,
  answered_at   INTEGER
);

CREATE TABLE usage_days (
  day           TEXT PRIMARY KEY,
  sessions      INTEGER NOT NULL DEFAULT 0,
  longest_ms    INTEGER NOT NULL DEFAULT 0
);
