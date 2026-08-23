CREATE TABLE IF NOT EXISTS problem_statements (
  ps_number TEXT PRIMARY KEY,
  sno INTEGER NOT NULL,
  title TEXT NOT NULL,
  org TEXT NOT NULL,
  category TEXT NOT NULL,
  theme TEXT NOT NULL,
  summary TEXT NOT NULL,
  innovation TEXT NOT NULL,
  effort TEXT NOT NULL,
  verdict TEXT NOT NULL,
  verdict_score INTEGER NOT NULL DEFAULT 0,
  competition_score INTEGER NOT NULL DEFAULT 9,
  has_dataset BOOLEAN NOT NULL DEFAULT FALSE,
  search_text TSVECTOR NOT NULL,
  data JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS problem_statements_search_idx ON problem_statements USING GIN (search_text);
CREATE INDEX IF NOT EXISTS problem_statements_filters_idx ON problem_statements (category, theme, effort, innovation, verdict);

CREATE TABLE IF NOT EXISTS browse_sessions (
  id UUID PRIMARY KEY,
  refresh_hash TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  rotated_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  ip_hash TEXT NOT NULL,
  user_agent TEXT NOT NULL,
  group_key TEXT
);

ALTER TABLE browse_sessions ADD COLUMN IF NOT EXISTS group_key TEXT;

CREATE TABLE IF NOT EXISTS api_rate_buckets (
  session_id UUID NOT NULL REFERENCES browse_sessions(id) ON DELETE CASCADE,
  route TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  request_count INTEGER NOT NULL,
  PRIMARY KEY (session_id, route, window_start)
);

CREATE INDEX IF NOT EXISTS browse_sessions_expiry_idx ON browse_sessions (expires_at);

CREATE TABLE IF NOT EXISTS group_comments (
  id BIGSERIAL PRIMARY KEY,
  group_key TEXT NOT NULL,
  ps_number TEXT NOT NULL REFERENCES problem_statements(ps_number) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS group_comments_lookup_idx ON group_comments (group_key, ps_number, created_at DESC);

CREATE TABLE IF NOT EXISTS statement_accesses (
  session_id UUID NOT NULL REFERENCES browse_sessions(id) ON DELETE CASCADE,
  ps_number TEXT NOT NULL REFERENCES problem_statements(ps_number) ON DELETE CASCADE,
  first_accessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (session_id, ps_number)
);
