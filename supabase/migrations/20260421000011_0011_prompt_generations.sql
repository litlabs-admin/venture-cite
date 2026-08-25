-- Source: migrations/0011_prompt_generations.sql
-- SHA256: 5f6453f29f41fb8313ff345ddb110b9e802a37881ac19f595980d0a9baa8484b

-- Prompt versioning: track each batch of prompts generated for a brand.
-- Old prompts are soft-archived (is_active=0) instead of deleted.

CREATE TABLE IF NOT EXISTS prompt_generations (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id VARCHAR NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  generation_number INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS prompt_generations_brand_id_idx ON prompt_generations(brand_id);

-- Add generation tracking and soft-archive to brand_prompts
ALTER TABLE brand_prompts ADD COLUMN IF NOT EXISTS generation_id VARCHAR REFERENCES prompt_generations(id) ON DELETE SET NULL;
ALTER TABLE brand_prompts ADD COLUMN IF NOT EXISTS is_active INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS brand_prompts_generation_id_idx ON brand_prompts(generation_id);
