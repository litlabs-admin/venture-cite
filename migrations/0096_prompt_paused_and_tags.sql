-- Prompts rebuild, phase 1: the ON/OFF toggle + Tags entity.
--
-- `paused` is orthogonal to brand_prompts.status (tracked/suggested/archived):
-- a paused prompt is still tracked (still counts against the 10-prompt cap,
-- still shows in the tracked list) but the next citation run skips it. This
-- keeps archive/restore semantics (already implemented client + server)
-- completely untouched - pausing is a new, separate concept, not a fourth
-- status value.
ALTER TABLE public.brand_prompts
  ADD COLUMN IF NOT EXISTS paused BOOLEAN NOT NULL DEFAULT false;

-- Tags are a real entity + join table, not a text[] column on brand_prompts -
-- the Tags tab renames/recolors/deletes a tag across every prompt that uses
-- it, which a bare array column can't do without rewriting every row.
CREATE TABLE IF NOT EXISTS public.prompt_tags (
  id          VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id    VARCHAR NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  color       TEXT,
  created_at  TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS prompt_tags_brand_id_idx ON public.prompt_tags (brand_id);

-- Case-insensitive uniqueness per brand so "Create tag" can't silently
-- produce two tags that differ only by case.
CREATE UNIQUE INDEX IF NOT EXISTS prompt_tags_brand_name_uq
  ON public.prompt_tags (brand_id, lower(name));

CREATE TABLE IF NOT EXISTS public.brand_prompt_tags (
  id               VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_prompt_id  VARCHAR NOT NULL REFERENCES public.brand_prompts(id) ON DELETE CASCADE,
  tag_id           VARCHAR NOT NULL REFERENCES public.prompt_tags(id) ON DELETE CASCADE,
  created_at       TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS brand_prompt_tags_prompt_id_idx ON public.brand_prompt_tags (brand_prompt_id);
CREATE INDEX IF NOT EXISTS brand_prompt_tags_tag_id_idx ON public.brand_prompt_tags (tag_id);
CREATE UNIQUE INDEX IF NOT EXISTS brand_prompt_tags_prompt_tag_uq
  ON public.brand_prompt_tags (brand_prompt_id, tag_id);

ALTER TABLE public.prompt_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_prompt_tags ENABLE ROW LEVEL SECURITY;
