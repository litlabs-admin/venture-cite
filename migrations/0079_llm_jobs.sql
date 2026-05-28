-- Generic LLM job table for Vercel Hobby-compatible background work.
--
-- Why this exists:
-- One-shot LLM endpoints (keyword discovery, FAQ generation, hallucination
-- detection, prompt generation, etc.) currently run INLINE inside the
-- request handler. On Vercel Hobby (10s function ceiling, ~6.3s LLM
-- budget) any prompt that legitimately needs >6s gets aborted mid-call
-- and the user sees a 504. The work is genuinely lost.
--
-- Pattern (mirrors contentGenerationJobs.openai_response_id):
--   1. Client POSTs to the route handler.
--   2. Handler calls openai.responses.create({ background: true,
--      store: true }) which returns IMMEDIATELY with a response_id.
--      The LLM run happens on OpenAI's infrastructure, decoupled from
--      our function timeout.
--   3. Handler persists a row here with status='running' and
--      response_id, returns 202 + jobId to the client.
--   4. Client polls GET /api/llm-jobs/:id; the poll handler calls
--      openai.responses.retrieve(response_id) which is a fast HTTP
--      call. When status='completed', the route's kind-specific
--      finalize step parses the output and persists the real
--      product-side rows (keywords, faqs, etc.).
--   5. A cron drain step sweeps stragglers so a closed browser
--      doesn't orphan the work.
--
-- Distinct from content_generation_jobs because:
--   - content_generation_jobs is tightly tied to articles (article_id FK,
--     refundedAt for quota refunds, lastAdvanceStartedAt for slice locks).
--   - llm_jobs is the generic substrate every short-lived background LLM
--     call sits on top of. No article relationship, no per-row
--     advance lock; the client polls instead.
--
-- 2026-05-28.

CREATE TABLE IF NOT EXISTS llm_jobs (
  id              VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  -- "keyword_discovery" | "faq_generation" | "hallucination_detect" |
  -- "prompt_generation" | "suggestion_generation" | etc.
  -- The poll endpoint dispatches by kind to the right finalize handler.
  kind            TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'succeeded', 'failed', 'cancelled')),
  -- OpenAI Responses API id. NULL until kickoff lands.
  response_id     TEXT,
  -- Input params; persists across slices so the cron drain can finalize
  -- a job whose client never came back to poll.
  payload         JSONB NOT NULL,
  -- Final parsed product-side result. Shape depends on kind. Null on
  -- pending/running/failed/cancelled.
  result          JSONB,
  -- 'timeout' | 'api_error' | 'parse_error' | 'budget' | 'cancelled' |
  -- 'rate_limited'
  error_kind      TEXT,
  error_message   TEXT,
  user_id         VARCHAR REFERENCES users(id) ON DELETE SET NULL,
  brand_id        VARCHAR REFERENCES brands(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  -- GC: rows older than this are pruned by the daily cron. Default
  -- 24h gives users a full day to poll, with a backstop for orphans.
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours')
);

-- Find pending/running jobs the cron should drain. Partial index keeps
-- this small even when there are millions of completed rows.
CREATE INDEX IF NOT EXISTS llm_jobs_active_idx
  ON llm_jobs (created_at)
  WHERE status IN ('pending', 'running');

-- Per-brand history for the inspector.
CREATE INDEX IF NOT EXISTS llm_jobs_brand_idx
  ON llm_jobs (brand_id, created_at DESC);

-- Per-user history (rate-limit + UX).
CREATE INDEX IF NOT EXISTS llm_jobs_user_idx
  ON llm_jobs (user_id, created_at DESC);

-- Expiry sweep.
CREATE INDEX IF NOT EXISTS llm_jobs_expires_idx
  ON llm_jobs (expires_at);
