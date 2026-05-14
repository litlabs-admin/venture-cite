CREATE TABLE IF NOT EXISTS system_state (
  key        TEXT PRIMARY KEY,
  value_json JSONB NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
