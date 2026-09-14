-- v2 notifications inbox: read state ledger.
--
-- The inbox itself has no dedicated event table. It is composed at read time
-- (server/routes/v2Notifications.ts) from four sources that already record
-- real product events: alert_history, citation_runs, brand_fact_sheet
-- conflicts, and work_tasks / work_award_events. This table is the one thing
-- those sources cannot provide: which of those composed items a given user
-- has already seen. notification_key is a stable id the route derives per
-- source row (e.g. "alert:<uuid>", "fact_conflict:<a>:<b>") - not a foreign
-- key, since the source tables span unrelated domains and none of them
-- carries a per-user "read" flag of its own.

CREATE TABLE public.v2_notification_reads (
  user_id varchar NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  notification_key text NOT NULL,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, notification_key)
);

CREATE INDEX v2_notification_reads_user_idx ON public.v2_notification_reads (user_id);

-- RLS + venturecite_request grants, matching the read-only defence-in-depth
-- shape of migrations 0132/0139/0140. The application reads and writes this
-- table over the owner-equivalent DATABASE_URL connection (which bypasses
-- RLS regardless of policy - see 0124's rationale), so this policy is
-- dormant today. It exists so Supabase's "every public table has RLS" check
-- passes, and so a future actor-bound repository has a real second layer to
-- land on.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname = 'venturecite_request'
  ) THEN
    RAISE EXCEPTION 'venturecite_request must be created by migration 0096 first';
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO venturecite_request;

GRANT SELECT (
  user_id, notification_key, read_at
) ON public.v2_notification_reads TO venturecite_request;

ALTER TABLE public.v2_notification_reads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS v2_notification_reads_select ON public.v2_notification_reads;
CREATE POLICY v2_notification_reads_select
  ON public.v2_notification_reads
  FOR SELECT
  TO venturecite_request
  USING (
    user_id = nullif(
      coalesce(
        nullif((select current_setting('app.user_id', true)), ''),
        nullif((select current_setting('venturecite.user_id', true)), '')
      ),
      ''
    )
  );
