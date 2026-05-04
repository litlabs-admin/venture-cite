-- Multi-thread chatbot. Adds chatbot_threads table and thread_id FK on
-- chatbot_messages. Backfills existing messages into one "Earlier
-- conversation" thread per user so no history is lost. Idempotent.

CREATE TABLE IF NOT EXISTS chatbot_threads (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     VARCHAR      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  brand_id    VARCHAR      REFERENCES brands(id) ON DELETE SET NULL,
  title       TEXT         NOT NULL DEFAULT 'New chat',
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  archived_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS chatbot_threads_user_updated_idx
  ON chatbot_threads(user_id, updated_at DESC)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS chatbot_threads_archived_idx
  ON chatbot_threads(archived_at)
  WHERE archived_at IS NOT NULL;

ALTER TABLE chatbot_messages
  ADD COLUMN IF NOT EXISTS thread_id UUID REFERENCES chatbot_threads(id) ON DELETE CASCADE;

-- Backfill: one thread per user holding all their pre-existing messages.
INSERT INTO chatbot_threads (user_id, title, created_at, updated_at)
SELECT user_id, 'Earlier conversation', MIN(created_at), MAX(created_at)
FROM chatbot_messages
WHERE thread_id IS NULL
GROUP BY user_id
ON CONFLICT DO NOTHING;

UPDATE chatbot_messages m
SET thread_id = t.id
FROM chatbot_threads t
WHERE m.thread_id IS NULL
  AND t.user_id = m.user_id
  AND t.title = 'Earlier conversation';

-- Now that backfill is complete, enforce NOT NULL.
ALTER TABLE chatbot_messages ALTER COLUMN thread_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS chatbot_messages_thread_created_idx
  ON chatbot_messages(thread_id, created_at);
