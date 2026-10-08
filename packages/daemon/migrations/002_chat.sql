-- Chat conversations: our id is the transcript key; claude_session_id is what we resume.
ALTER TABLE sessions ADD COLUMN claude_session_id TEXT;
CREATE INDEX sessions_project_kind ON sessions (project_id, kind, started_at);
