-- Run once in Supabase Dashboard -> SQL Editor.
-- Vercel functions use the private transaction-pooler DATABASE_URL.
CREATE TABLE IF NOT EXISTS problem_statements (
  ps_number TEXT PRIMARY KEY, sno INTEGER NOT NULL, title TEXT NOT NULL, org TEXT NOT NULL,
  category TEXT NOT NULL, theme TEXT NOT NULL, summary TEXT NOT NULL, innovation TEXT NOT NULL,
  effort TEXT NOT NULL, verdict TEXT NOT NULL, verdict_score INTEGER NOT NULL DEFAULT 0,
  competition_score INTEGER NOT NULL DEFAULT 9, has_dataset BOOLEAN NOT NULL DEFAULT FALSE,
  search_text TSVECTOR NOT NULL, data JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS problem_statements_search_idx ON problem_statements USING GIN (search_text);
CREATE INDEX IF NOT EXISTS problem_statements_filters_idx ON problem_statements (category, theme, effort, innovation, verdict);

CREATE TABLE IF NOT EXISTS browse_sessions (
  id UUID PRIMARY KEY, refresh_hash TEXT UNIQUE NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  rotated_at TIMESTAMPTZ, expires_at TIMESTAMPTZ NOT NULL, revoked_at TIMESTAMPTZ,
  ip_hash TEXT NOT NULL, user_agent TEXT NOT NULL, group_key TEXT, display_name TEXT
);
ALTER TABLE browse_sessions ADD COLUMN IF NOT EXISTS display_name TEXT;

-- A team's members are the live browse_sessions whose group_key is the team id.
CREATE TABLE IF NOT EXISTS teams (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, name_key TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL, leader_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS browse_sessions_group_idx ON browse_sessions (group_key);
CREATE TABLE IF NOT EXISTS api_rate_buckets (
  session_id UUID NOT NULL REFERENCES browse_sessions(id) ON DELETE CASCADE, route TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL, request_count INTEGER NOT NULL,
  PRIMARY KEY (session_id, route, window_start)
);
CREATE TABLE IF NOT EXISTS group_comments (
  id BIGSERIAL PRIMARY KEY, group_key TEXT NOT NULL,
  ps_number TEXT NOT NULL REFERENCES problem_statements(ps_number) ON DELETE CASCADE,
  display_name TEXT NOT NULL, body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS statement_accesses (
  session_id UUID NOT NULL REFERENCES browse_sessions(id) ON DELETE CASCADE,
  ps_number TEXT NOT NULL REFERENCES problem_statements(ps_number) ON DELETE CASCADE,
  first_accessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY (session_id, ps_number)
);
CREATE INDEX IF NOT EXISTS browse_sessions_expiry_idx ON browse_sessions (expires_at);
CREATE INDEX IF NOT EXISTS group_comments_lookup_idx ON group_comments (group_key, ps_number, created_at DESC);

ALTER TABLE problem_statements ENABLE ROW LEVEL SECURITY;
ALTER TABLE browse_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_rate_buckets ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE statement_accesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON problem_statements, browse_sessions, api_rate_buckets, group_comments, statement_accesses, teams FROM anon, authenticated;
REVOKE ALL ON SEQUENCE group_comments_id_seq FROM anon, authenticated;
