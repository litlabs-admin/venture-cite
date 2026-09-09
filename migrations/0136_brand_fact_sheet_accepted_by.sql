-- accepted_at records when a fact was approved but not by whom, so an award has no actor.
-- SET NULL rather than CASCADE: the approval remains true after the user is deleted.
ALTER TABLE public.brand_fact_sheet
  ADD COLUMN IF NOT EXISTS accepted_by varchar
  REFERENCES public.users (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS brand_fact_sheet_accepted_by_idx
  ON public.brand_fact_sheet (accepted_by);
