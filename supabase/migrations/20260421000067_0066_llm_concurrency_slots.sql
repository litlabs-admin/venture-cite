-- Source: migrations/0066_llm_concurrency_slots.sql
-- SHA256: 5202118504da813d53919626096738849b501d65888bbd438a99ef47b90bfd8a

CREATE TABLE IF NOT EXISTS llm_concurrency_slots (
  slot_id     TEXT PRIMARY KEY,
  provider    TEXT NOT NULL
    CHECK (provider IN ('openai','anthropic','perplexity','gemini')),
  acquired_at TIMESTAMP NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMP NOT NULL,
  run_id      VARCHAR
);

CREATE INDEX IF NOT EXISTS llm_concurrency_slots_provider_expires_idx
  ON llm_concurrency_slots (provider, expires_at);
