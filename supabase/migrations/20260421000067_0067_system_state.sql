-- Source: migrations/0067_system_state.sql
-- SHA256: 87673a129494c9b1577ddacc39fb2014d677dbeefbe59980f5a82ab805c9cbf5

CREATE TABLE IF NOT EXISTS system_state (
  key        TEXT PRIMARY KEY,
  value_json JSONB NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
