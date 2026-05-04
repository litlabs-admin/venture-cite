CREATE TABLE IF NOT EXISTS chatbot_messages (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       VARCHAR      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  brand_id      VARCHAR      REFERENCES brands(id) ON DELETE SET NULL,
  role          TEXT         NOT NULL CHECK (role IN ('user', 'assistant')),
  content       TEXT         NOT NULL,
  input_tokens  INTEGER,
  output_tokens INTEGER,
  model         TEXT,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS chatbot_messages_user_created_idx
  ON chatbot_messages(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS chatbot_token_usage (
  user_id       VARCHAR      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  usage_date    DATE         NOT NULL,
  input_tokens  INTEGER      NOT NULL DEFAULT 0,
  output_tokens INTEGER      NOT NULL DEFAULT 0,
  message_count INTEGER      NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, usage_date)
);
