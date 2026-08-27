-- Source: migrations/0095_site_health_finding_status.sql
-- SHA256: 1e9c519f282ded7d05b88be6ed7d7821544023f2485cd99eaf1641cf3ead3ce3

-- Per-finding work state for the Optimize page: "Mark in progress" / "Ignore"
-- / "Mark fixed" need somewhere real to persist, or those buttons lie about
-- what they do. One row per (brand, finding id) the user has touched -
-- findings never touched have no row and read as "untouched", not a
-- fabricated default status.
--
-- finding_id is the SiteHealthFinding.id string (e.g. "missing-robots-txt",
-- "content-meta-tags") - stable across scans since it's derived from the
-- check TYPE, not a specific run, so status survives a rescan.

CREATE TABLE IF NOT EXISTS public.site_health_finding_status (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id     VARCHAR NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  finding_id   TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'ignored', 'fixed')),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by   VARCHAR REFERENCES public.users(id) ON DELETE SET NULL,

  UNIQUE (brand_id, finding_id)
);

CREATE INDEX IF NOT EXISTS site_health_finding_status_brand_idx
  ON public.site_health_finding_status (brand_id);

ALTER TABLE public.site_health_finding_status ENABLE ROW LEVEL SECURITY;
