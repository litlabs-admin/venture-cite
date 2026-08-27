-- Source: migrations/0067_system_state.sql
-- SHA256: be1215621b2866e8dcad5449a139cbbb44271a194808a357d78b625d475cd865

CREATE TABLE IF NOT EXISTS system_state (
  key        TEXT PRIMARY KEY,
  value_json JSONB NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
