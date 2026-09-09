-- Source: migrations/0131_work_domain.sql
-- SHA256: 56f6a702b594dba44e882722302f8078aeb311071b1d133f4bb3870b833eba15

-- Work domain foundation.
--
-- These tables hold customer-owned goals, durable work, evidence, immutable
-- history, and later business-result observations. Brand-owned records use
-- ON DELETE CASCADE because account retention deletes the brand graph.
-- Actor links use ON DELETE SET NULL where the audit row must survive a user
-- deletion. The request role receives only the fields in this projection.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname = 'venturecite_request'
  ) THEN
    RAISE EXCEPTION 'venturecite_request must be created by migration 0096 first';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_roles
    WHERE rolname = 'venturecite_request'
      AND (
        rolcanlogin
        OR rolinherit
        OR rolsuper
        OR rolcreatedb
        OR rolcreaterole
        OR rolreplication
        OR rolbypassrls
      )
  ) THEN
    RAISE EXCEPTION 'venturecite_request has unsafe role attributes';
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.brand_goals (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id VARCHAR NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  user_id VARCHAR NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  goal_key TEXT NOT NULL,
  goal_kind TEXT NOT NULL DEFAULT 'visibility_improvement',
  title TEXT NOT NULL,
  statement TEXT NOT NULL,
  desired_outcome TEXT NOT NULL,
  owner_id VARCHAR REFERENCES public.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active',
  revision INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT brand_goals_brand_key_uq UNIQUE (brand_id, goal_key),
  CONSTRAINT brand_goals_id_brand_user_uq UNIQUE (id, brand_id, user_id),
  CONSTRAINT brand_goals_status_check
    CHECK (status IN ('active', 'completed', 'archived')),
  CONSTRAINT brand_goals_revision_check CHECK (revision >= 0)
);

CREATE TABLE IF NOT EXISTS public.work_tasks (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id VARCHAR NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  user_id VARCHAR NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  goal_id VARCHAR,
  task_key TEXT NOT NULL,
  task_version INTEGER NOT NULL DEFAULT 1,
  task_type TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'suggested',
  rule_version INTEGER NOT NULL DEFAULT 1,
  revision INTEGER NOT NULL DEFAULT 0,
  title TEXT NOT NULL,
  desired_result TEXT NOT NULL,
  buyer_need TEXT,
  recommended_change TEXT NOT NULL,
  reason TEXT,
  confidence NUMERIC(3, 2),
  effort INTEGER,
  points INTEGER NOT NULL DEFAULT 0,
  owner_id VARCHAR REFERENCES public.users(id) ON DELETE SET NULL,
  completion_rule JSONB NOT NULL DEFAULT '{}'::jsonb,
  verification_method JSONB,
  measurement_scope JSONB,
  next_check_at TIMESTAMPTZ,
  source_recommendation_id VARCHAR,
  blocked_reason TEXT,
  dismissal_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT work_tasks_brand_key_version_uq
    UNIQUE (brand_id, task_key, task_version),
  CONSTRAINT work_tasks_id_brand_user_version_uq
    UNIQUE (id, brand_id, user_id, task_version),
  CONSTRAINT work_tasks_goal_brand_fk
    FOREIGN KEY (goal_id, brand_id, user_id)
    REFERENCES public.brand_goals(id, brand_id, user_id),
  CONSTRAINT work_tasks_task_type_check CHECK (
    task_type IN (
      'approve_essential_brand_facts',
      'approve_buyer_question_set',
      'establish_measurement_baseline',
      'repair_confirmed_access_or_factual_fault',
      'improve_page_for_buyer_need',
      'complete_earned_media_or_community_work',
      'review_results_and_record_decision',
      'complete_visibility_experiment'
    )
  ),
  CONSTRAINT work_tasks_state_check CHECK (
    state IN (
      'suggested',
      'accepted',
      'in_progress',
      'submitted',
      'verified',
      'waiting_for_observation',
      'dismissed',
      'not_applicable',
      'reopened'
    )
  ),
  CONSTRAINT work_tasks_version_check CHECK (task_version > 0),
  CONSTRAINT work_tasks_rule_version_check CHECK (rule_version > 0),
  CONSTRAINT work_tasks_revision_check CHECK (revision >= 0),
  CONSTRAINT work_tasks_confidence_check
    CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1),
  CONSTRAINT work_tasks_effort_check CHECK (effort IS NULL OR effort >= 0),
  CONSTRAINT work_tasks_points_check CHECK (points >= 0)
);

CREATE TABLE IF NOT EXISTS public.work_task_evidence (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id VARCHAR NOT NULL,
  brand_id VARCHAR NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  user_id VARCHAR NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  task_version INTEGER NOT NULL,
  evidence_version INTEGER NOT NULL DEFAULT 1,
  role TEXT NOT NULL,
  kind TEXT NOT NULL,
  source_table TEXT,
  source_id VARCHAR,
  source_url TEXT,
  final_url TEXT,
  canonical_url TEXT,
  retrieved_at TIMESTAMPTZ,
  observed_at TIMESTAMPTZ,
  content_version TEXT,
  provider TEXT,
  prompt_id VARCHAR,
  prompt_version TEXT,
  prompt_scope JSONB,
  excerpt TEXT,
  structured_finding JSONB,
  status TEXT NOT NULL DEFAULT 'submitted',
  extractor_version TEXT,
  submitted_by VARCHAR REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT work_task_evidence_task_scope_fk
    FOREIGN KEY (task_id, brand_id, user_id, task_version)
    REFERENCES public.work_tasks(id, brand_id, user_id, task_version)
    ON DELETE CASCADE,
  CONSTRAINT work_task_evidence_role_check
    CHECK (role IN ('trigger', 'submission', 'verification', 'result')),
  CONSTRAINT work_task_evidence_kind_check
    CHECK (
      kind IN (
        'source',
        'artifact',
        'measurement',
        'fault_repair',
        'content_change',
        'authored_work',
        'confirmation',
        'decision',
        'experiment'
      )
    ),
  CONSTRAINT work_task_evidence_status_check
    CHECK (status IN ('submitted', 'verified', 'rejected', 'unavailable', 'failed')),
  CONSTRAINT work_task_evidence_version_check
    CHECK (task_version > 0 AND evidence_version > 0)
);

CREATE TABLE IF NOT EXISTS public.work_task_events (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id VARCHAR NOT NULL,
  brand_id VARCHAR NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  user_id VARCHAR NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  task_version INTEGER NOT NULL,
  revision INTEGER NOT NULL,
  prior_state TEXT,
  next_state TEXT NOT NULL,
  actor_id VARCHAR REFERENCES public.users(id) ON DELETE SET NULL,
  actor_kind TEXT NOT NULL DEFAULT 'user',
  reason TEXT,
  verification_method JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT work_task_events_task_scope_fk
    FOREIGN KEY (task_id, brand_id, user_id, task_version)
    REFERENCES public.work_tasks(id, brand_id, user_id, task_version)
    ON DELETE CASCADE,
  CONSTRAINT work_task_events_prior_state_check CHECK (
    prior_state IS NULL OR prior_state IN (
      'suggested',
      'accepted',
      'in_progress',
      'submitted',
      'verified',
      'waiting_for_observation',
      'dismissed',
      'not_applicable',
      'reopened'
    )
  ),
  CONSTRAINT work_task_events_next_state_check CHECK (
    next_state IN (
      'suggested',
      'accepted',
      'in_progress',
      'submitted',
      'verified',
      'waiting_for_observation',
      'dismissed',
      'not_applicable',
      'reopened'
    )
  ),
  CONSTRAINT work_task_events_actor_kind_check
    CHECK (actor_kind IN ('user', 'system')),
  CONSTRAINT work_task_events_version_check
    CHECK (task_version > 0 AND revision >= 0)
);

CREATE TABLE IF NOT EXISTS public.work_award_events (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id VARCHAR NOT NULL,
  brand_id VARCHAR NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  user_id VARCHAR NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  task_version INTEGER NOT NULL,
  cycle_key TEXT NOT NULL,
  award_key TEXT NOT NULL,
  points INTEGER NOT NULL,
  rule_version INTEGER NOT NULL,
  evidence_version INTEGER NOT NULL,
  actor_id VARCHAR REFERENCES public.users(id) ON DELETE SET NULL,
  verification_method JSONB NOT NULL,
  reason TEXT NOT NULL,
  award_status TEXT NOT NULL DEFAULT 'awarded',
  reversal_reference VARCHAR,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT work_award_events_task_scope_fk
    FOREIGN KEY (task_id, brand_id, user_id, task_version)
    REFERENCES public.work_tasks(id, brand_id, user_id, task_version)
    ON DELETE CASCADE,
  CONSTRAINT work_award_events_id_brand_user_task_version_uq
    UNIQUE (id, brand_id, user_id, task_id, task_version),
  CONSTRAINT work_award_events_reversal_reference_fk
    FOREIGN KEY (reversal_reference, brand_id, user_id, task_id, task_version)
    REFERENCES public.work_award_events(id, brand_id, user_id, task_id, task_version),
  CONSTRAINT work_award_events_award_key_uq UNIQUE (award_key),
  CONSTRAINT work_award_events_status_check
    CHECK (award_status IN ('awarded', 'reversed', 'adjustment')),
  CONSTRAINT work_award_events_points_check CHECK (
    (
      award_status = 'awarded'
      AND points > 0
      AND reversal_reference IS NULL
    )
    OR (
      award_status = 'reversed'
      AND points < 0
      AND reversal_reference IS NOT NULL
    )
    OR (
      award_status = 'adjustment'
      AND points <> 0
      AND reversal_reference IS NULL
    )
  ),
  CONSTRAINT work_award_events_reversal_reference_check
    CHECK (reversal_reference IS NULL OR reversal_reference <> id),
  CONSTRAINT work_award_events_version_check
    CHECK (task_version > 0 AND rule_version > 0 AND evidence_version > 0)
);

CREATE TABLE IF NOT EXISTS public.brand_capability_events (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id VARCHAR NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  user_id VARCHAR NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  milestone TEXT NOT NULL,
  event_key TEXT NOT NULL,
  event_kind TEXT NOT NULL DEFAULT 'achieved',
  task_id VARCHAR,
  task_version INTEGER,
  evidence_version INTEGER,
  actor_id VARCHAR REFERENCES public.users(id) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT brand_capability_events_task_scope_fk
    FOREIGN KEY (task_id, brand_id, user_id, task_version)
    REFERENCES public.work_tasks(id, brand_id, user_id, task_version)
    ON DELETE CASCADE,
  CONSTRAINT brand_capability_events_brand_event_key_uq UNIQUE (brand_id, event_key),
  CONSTRAINT brand_capability_events_milestone_check
    CHECK (
      milestone IN (
        'goal_selected_and_queue_reviewed',
        'baseline_ready',
        'evidenced_changes_complete',
        'decision_recorded',
        'multi_period_maintenance'
      )
    ),
  CONSTRAINT brand_capability_events_kind_check
    CHECK (event_kind IN ('achieved', 'reversed')),
  CONSTRAINT brand_capability_events_version_check
    CHECK (task_version IS NULL OR task_version > 0),
  CONSTRAINT brand_capability_events_evidence_version_check
    CHECK (evidence_version IS NULL OR evidence_version > 0),
  CONSTRAINT brand_capability_events_task_version_required_check
    CHECK (
      (task_id IS NULL AND task_version IS NULL)
      OR (task_id IS NOT NULL AND task_version IS NOT NULL)
    )
);

CREATE TABLE IF NOT EXISTS public.business_result_events (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id VARCHAR NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  user_id VARCHAR NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  event_key TEXT NOT NULL,
  event_kind TEXT NOT NULL,
  value NUMERIC(18, 6),
  value_unit TEXT,
  source TEXT NOT NULL,
  attribution_method TEXT NOT NULL,
  confidence NUMERIC(3, 2),
  confirmation_state TEXT NOT NULL DEFAULT 'unconfirmed',
  confirmed_by VARCHAR REFERENCES public.users(id) ON DELETE SET NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT business_result_events_brand_event_key_uq UNIQUE (brand_id, event_key),
  CONSTRAINT business_result_events_id_brand_user_uq UNIQUE (id, brand_id, user_id),
  CONSTRAINT business_result_events_kind_check
    CHECK (event_kind IN ('referral_visit', 'inquiry', 'qualified_lead', 'retained_customer')),
  CONSTRAINT business_result_events_confidence_check
    CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1),
  CONSTRAINT business_result_events_confirmation_check
    CHECK (confirmation_state IN ('unconfirmed', 'confirmed', 'rejected'))
);

CREATE TABLE IF NOT EXISTS public.work_outcome_reviews (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id VARCHAR NOT NULL,
  brand_id VARCHAR NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  user_id VARCHAR NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  task_version INTEGER NOT NULL,
  cycle_key TEXT NOT NULL,
  measurement_scope JSONB NOT NULL,
  decision TEXT NOT NULL,
  notes TEXT,
  visibility_evidence_version INTEGER,
  business_result_event_id VARCHAR,
  next_check_at TIMESTAMPTZ,
  reviewed_by VARCHAR REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT work_outcome_reviews_task_scope_fk
    FOREIGN KEY (task_id, brand_id, user_id, task_version)
    REFERENCES public.work_tasks(id, brand_id, user_id, task_version)
    ON DELETE CASCADE,
  CONSTRAINT work_outcome_reviews_business_result_scope_fk
    FOREIGN KEY (business_result_event_id, brand_id, user_id)
    REFERENCES public.business_result_events(id, brand_id, user_id),
  CONSTRAINT work_outcome_reviews_decision_check
    CHECK (decision IN ('improvement', 'decline', 'no_material_change', 'unavailable')),
  CONSTRAINT work_outcome_reviews_version_check
    CHECK (
      task_version > 0
      AND (
        visibility_evidence_version IS NULL
        OR visibility_evidence_version > 0
      )
    )
  );

-- Add the cross-row integrity constraints when an earlier partial run already
-- created a work table. The guards keep this migration safe to retry.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'brand_goals_id_brand_user_uq'
      AND conrelid = 'public.brand_goals'::regclass
  ) THEN
    ALTER TABLE public.brand_goals
      ADD CONSTRAINT brand_goals_id_brand_user_uq UNIQUE (id, brand_id, user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'work_tasks_id_brand_user_version_uq'
      AND conrelid = 'public.work_tasks'::regclass
  ) THEN
    ALTER TABLE public.work_tasks
      ADD CONSTRAINT work_tasks_id_brand_user_version_uq
      UNIQUE (id, brand_id, user_id, task_version);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'work_tasks_goal_brand_fk'
      AND conrelid = 'public.work_tasks'::regclass
  ) THEN
    ALTER TABLE public.work_tasks
      ADD CONSTRAINT work_tasks_goal_brand_fk
      FOREIGN KEY (goal_id, brand_id, user_id)
      REFERENCES public.brand_goals(id, brand_id, user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'work_task_evidence_task_scope_fk'
      AND conrelid = 'public.work_task_evidence'::regclass
  ) THEN
    ALTER TABLE public.work_task_evidence
      ADD CONSTRAINT work_task_evidence_task_scope_fk
      FOREIGN KEY (task_id, brand_id, user_id, task_version)
      REFERENCES public.work_tasks(id, brand_id, user_id, task_version)
      ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'work_task_events_task_scope_fk'
      AND conrelid = 'public.work_task_events'::regclass
  ) THEN
    ALTER TABLE public.work_task_events
      ADD CONSTRAINT work_task_events_task_scope_fk
      FOREIGN KEY (task_id, brand_id, user_id, task_version)
      REFERENCES public.work_tasks(id, brand_id, user_id, task_version)
      ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'work_award_events_task_scope_fk'
      AND conrelid = 'public.work_award_events'::regclass
  ) THEN
    ALTER TABLE public.work_award_events
      ADD CONSTRAINT work_award_events_task_scope_fk
      FOREIGN KEY (task_id, brand_id, user_id, task_version)
      REFERENCES public.work_tasks(id, brand_id, user_id, task_version)
      ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'work_award_events_award_key_uq'
      AND conrelid = 'public.work_award_events'::regclass
  ) THEN
    ALTER TABLE public.work_award_events
      ADD CONSTRAINT work_award_events_award_key_uq UNIQUE (award_key);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'work_award_events_id_brand_user_task_version_uq'
      AND conrelid = 'public.work_award_events'::regclass
  ) THEN
    ALTER TABLE public.work_award_events
      ADD CONSTRAINT work_award_events_id_brand_user_task_version_uq
      UNIQUE (id, brand_id, user_id, task_id, task_version);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'work_award_events_reversal_reference_fk'
      AND conrelid = 'public.work_award_events'::regclass
  ) THEN
    ALTER TABLE public.work_award_events
      ADD CONSTRAINT work_award_events_reversal_reference_fk
      FOREIGN KEY (reversal_reference, brand_id, user_id, task_id, task_version)
      REFERENCES public.work_award_events(id, brand_id, user_id, task_id, task_version);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'brand_capability_events_task_scope_fk'
      AND conrelid = 'public.brand_capability_events'::regclass
  ) THEN
    ALTER TABLE public.brand_capability_events
      ADD CONSTRAINT brand_capability_events_task_scope_fk
      FOREIGN KEY (task_id, brand_id, user_id, task_version)
      REFERENCES public.work_tasks(id, brand_id, user_id, task_version)
      ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'work_outcome_reviews_task_scope_fk'
      AND conrelid = 'public.work_outcome_reviews'::regclass
  ) THEN
    ALTER TABLE public.work_outcome_reviews
      ADD CONSTRAINT work_outcome_reviews_task_scope_fk
      FOREIGN KEY (task_id, brand_id, user_id, task_version)
      REFERENCES public.work_tasks(id, brand_id, user_id, task_version)
      ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'business_result_events_id_brand_user_uq'
      AND conrelid = 'public.business_result_events'::regclass
  ) THEN
    ALTER TABLE public.business_result_events
      ADD CONSTRAINT business_result_events_id_brand_user_uq
      UNIQUE (id, brand_id, user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'work_outcome_reviews_business_result_scope_fk'
      AND conrelid = 'public.work_outcome_reviews'::regclass
  ) THEN
    ALTER TABLE public.work_outcome_reviews
      ADD CONSTRAINT work_outcome_reviews_business_result_scope_fk
      FOREIGN KEY (business_result_event_id, brand_id, user_id)
      REFERENCES public.business_result_events(id, brand_id, user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'brand_capability_events_brand_event_key_uq'
      AND conrelid = 'public.brand_capability_events'::regclass
  ) THEN
    ALTER TABLE public.brand_capability_events
      ADD CONSTRAINT brand_capability_events_brand_event_key_uq
      UNIQUE (brand_id, event_key);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'business_result_events_brand_event_key_uq'
      AND conrelid = 'public.business_result_events'::regclass
  ) THEN
    ALTER TABLE public.business_result_events
      ADD CONSTRAINT business_result_events_brand_event_key_uq
      UNIQUE (brand_id, event_key);
  END IF;
END
$$;

-- Keep signed awards and references in one valid state.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'work_award_events_points_check'
      AND conrelid = 'public.work_award_events'::regclass
  ) THEN
    ALTER TABLE public.work_award_events
      ADD CONSTRAINT work_award_events_points_check CHECK (
        (
          award_status = 'awarded'
          AND points > 0
          AND reversal_reference IS NULL
        )
        OR (
          award_status = 'reversed'
          AND points < 0
          AND reversal_reference IS NOT NULL
        )
        OR (
          award_status = 'adjustment'
          AND points <> 0
          AND reversal_reference IS NULL
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'work_award_events_reversal_reference_check'
      AND conrelid = 'public.work_award_events'::regclass
  ) THEN
    ALTER TABLE public.work_award_events
      ADD CONSTRAINT work_award_events_reversal_reference_check
      CHECK (reversal_reference IS NULL OR reversal_reference <> id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'brand_capability_events_task_version_required_check'
      AND conrelid = 'public.brand_capability_events'::regclass
  ) THEN
    ALTER TABLE public.brand_capability_events
      ADD CONSTRAINT brand_capability_events_task_version_required_check
      CHECK (
        (task_id IS NULL AND task_version IS NULL)
        OR (task_id IS NOT NULL AND task_version IS NOT NULL)
      );
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS brand_goals_brand_id_idx
  ON public.brand_goals (brand_id);
CREATE INDEX IF NOT EXISTS brand_goals_brand_status_idx
  ON public.brand_goals (brand_id, status);
CREATE INDEX IF NOT EXISTS brand_goals_user_id_idx
  ON public.brand_goals (user_id);

CREATE INDEX IF NOT EXISTS work_tasks_brand_id_idx
  ON public.work_tasks (brand_id);
CREATE INDEX IF NOT EXISTS work_tasks_brand_state_updated_idx
  ON public.work_tasks (brand_id, state, updated_at);
CREATE INDEX IF NOT EXISTS work_tasks_user_id_idx
  ON public.work_tasks (user_id);
CREATE INDEX IF NOT EXISTS work_tasks_owner_state_idx
  ON public.work_tasks (owner_id, state);
CREATE INDEX IF NOT EXISTS work_tasks_next_check_idx
  ON public.work_tasks (brand_id, next_check_at);

CREATE INDEX IF NOT EXISTS work_task_evidence_brand_id_idx
  ON public.work_task_evidence (brand_id);
CREATE INDEX IF NOT EXISTS work_task_evidence_brand_task_role_idx
  ON public.work_task_evidence (brand_id, task_id, role);
CREATE INDEX IF NOT EXISTS work_task_evidence_task_version_idx
  ON public.work_task_evidence (task_id, task_version);
CREATE INDEX IF NOT EXISTS work_task_evidence_brand_created_idx
  ON public.work_task_evidence (brand_id, created_at DESC);
CREATE INDEX IF NOT EXISTS work_task_evidence_user_id_idx
  ON public.work_task_evidence (user_id);

CREATE INDEX IF NOT EXISTS work_task_events_brand_id_idx
  ON public.work_task_events (brand_id);
CREATE INDEX IF NOT EXISTS work_task_events_task_created_idx
  ON public.work_task_events (task_id, created_at DESC);
CREATE INDEX IF NOT EXISTS work_task_events_brand_created_idx
  ON public.work_task_events (brand_id, created_at DESC);
CREATE INDEX IF NOT EXISTS work_task_events_actor_created_idx
  ON public.work_task_events (actor_id, created_at DESC);

CREATE INDEX IF NOT EXISTS work_award_events_brand_id_idx
  ON public.work_award_events (brand_id);
CREATE INDEX IF NOT EXISTS work_award_events_brand_occurred_idx
  ON public.work_award_events (brand_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS work_award_events_user_created_idx
  ON public.work_award_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS work_award_events_actor_created_idx
  ON public.work_award_events (actor_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS work_award_events_reversal_reference_uq
  ON public.work_award_events (reversal_reference)
  WHERE reversal_reference IS NOT NULL;

CREATE INDEX IF NOT EXISTS brand_capability_events_brand_id_idx
  ON public.brand_capability_events (brand_id);
CREATE INDEX IF NOT EXISTS brand_capability_events_brand_created_idx
  ON public.brand_capability_events (brand_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS brand_capability_events_user_created_idx
  ON public.brand_capability_events (user_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS work_outcome_reviews_brand_id_idx
  ON public.work_outcome_reviews (brand_id);
CREATE INDEX IF NOT EXISTS work_outcome_reviews_task_cycle_idx
  ON public.work_outcome_reviews (task_id, cycle_key);
CREATE INDEX IF NOT EXISTS work_outcome_reviews_brand_created_idx
  ON public.work_outcome_reviews (brand_id, created_at DESC);
CREATE INDEX IF NOT EXISTS work_outcome_reviews_user_created_idx
  ON public.work_outcome_reviews (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS business_result_events_brand_id_idx
  ON public.business_result_events (brand_id);
CREATE INDEX IF NOT EXISTS business_result_events_brand_occurred_idx
  ON public.business_result_events (brand_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS business_result_events_user_created_idx
  ON public.business_result_events (user_id, created_at DESC);

ALTER TABLE public.brand_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_task_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_task_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_award_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_capability_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_outcome_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_result_events ENABLE ROW LEVEL SECURITY;

GRANT USAGE ON SCHEMA public TO venturecite_request;

REVOKE ALL PRIVILEGES ON TABLE
  public.brand_goals,
  public.work_tasks,
  public.work_task_evidence,
  public.work_task_events,
  public.work_award_events,
  public.brand_capability_events,
  public.work_outcome_reviews,
  public.business_result_events
FROM venturecite_request;

GRANT SELECT, INSERT, UPDATE ON TABLE
  public.brand_goals,
  public.work_tasks,
  public.work_outcome_reviews,
  public.business_result_events
TO venturecite_request;

GRANT SELECT, INSERT ON TABLE
  public.work_task_evidence,
  public.work_task_events,
  public.work_award_events,
  public.brand_capability_events
TO venturecite_request;

DROP POLICY IF EXISTS brand_goals_request_select ON public.brand_goals;
CREATE POLICY brand_goals_request_select
  ON public.brand_goals
  FOR SELECT
  TO venturecite_request
  USING (
    user_id = nullif((select current_setting('venturecite.user_id', true)), '')
    AND EXISTS (
      SELECT 1
      FROM public.brands
      WHERE brands.id = brand_goals.brand_id
        AND brands.user_id = nullif((select current_setting('venturecite.user_id', true)), '')
        AND brands.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS brand_goals_request_insert ON public.brand_goals;
CREATE POLICY brand_goals_request_insert
  ON public.brand_goals
  FOR INSERT
  TO venturecite_request
  WITH CHECK (
    user_id = nullif((select current_setting('venturecite.user_id', true)), '')
    AND EXISTS (
      SELECT 1
      FROM public.brands
      WHERE brands.id = brand_goals.brand_id
        AND brands.user_id = nullif((select current_setting('venturecite.user_id', true)), '')
        AND brands.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS brand_goals_request_update ON public.brand_goals;
CREATE POLICY brand_goals_request_update
  ON public.brand_goals
  FOR UPDATE
  TO venturecite_request
  USING (
    user_id = nullif((select current_setting('venturecite.user_id', true)), '')
    AND EXISTS (
      SELECT 1
      FROM public.brands
      WHERE brands.id = brand_goals.brand_id
        AND brands.user_id = nullif((select current_setting('venturecite.user_id', true)), '')
        AND brands.deleted_at IS NULL
    )
  )
  WITH CHECK (
    user_id = nullif((select current_setting('venturecite.user_id', true)), '')
    AND EXISTS (
      SELECT 1
      FROM public.brands
      WHERE brands.id = brand_goals.brand_id
        AND brands.user_id = nullif((select current_setting('venturecite.user_id', true)), '')
        AND brands.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS work_tasks_request_select ON public.work_tasks;
CREATE POLICY work_tasks_request_select
  ON public.work_tasks
  FOR SELECT
  TO venturecite_request
  USING (
    user_id = nullif((select current_setting('venturecite.user_id', true)), '')
    AND EXISTS (
      SELECT 1
      FROM public.brands
      WHERE brands.id = work_tasks.brand_id
        AND brands.user_id = nullif((select current_setting('venturecite.user_id', true)), '')
        AND brands.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS work_tasks_request_insert ON public.work_tasks;
CREATE POLICY work_tasks_request_insert
  ON public.work_tasks
  FOR INSERT
  TO venturecite_request
  WITH CHECK (
    user_id = nullif((select current_setting('venturecite.user_id', true)), '')
    AND EXISTS (
      SELECT 1
      FROM public.brands
      WHERE brands.id = work_tasks.brand_id
        AND brands.user_id = nullif((select current_setting('venturecite.user_id', true)), '')
        AND brands.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS work_tasks_request_update ON public.work_tasks;
CREATE POLICY work_tasks_request_update
  ON public.work_tasks
  FOR UPDATE
  TO venturecite_request
  USING (
    user_id = nullif((select current_setting('venturecite.user_id', true)), '')
    AND EXISTS (
      SELECT 1
      FROM public.brands
      WHERE brands.id = work_tasks.brand_id
        AND brands.user_id = nullif((select current_setting('venturecite.user_id', true)), '')
        AND brands.deleted_at IS NULL
    )
  )
  WITH CHECK (
    user_id = nullif((select current_setting('venturecite.user_id', true)), '')
    AND EXISTS (
      SELECT 1
      FROM public.brands
      WHERE brands.id = work_tasks.brand_id
        AND brands.user_id = nullif((select current_setting('venturecite.user_id', true)), '')
        AND brands.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS work_task_evidence_request_select ON public.work_task_evidence;
CREATE POLICY work_task_evidence_request_select
  ON public.work_task_evidence
  FOR SELECT
  TO venturecite_request
  USING (
    user_id = nullif((select current_setting('venturecite.user_id', true)), '')
    AND EXISTS (
      SELECT 1
      FROM public.work_tasks AS task
      JOIN public.brands AS brand ON brand.id = task.brand_id
      WHERE task.id = work_task_evidence.task_id
        AND task.brand_id = work_task_evidence.brand_id
        AND task.user_id = work_task_evidence.user_id
        AND brand.user_id = nullif((select current_setting('venturecite.user_id', true)), '')
        AND brand.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS work_task_evidence_request_insert ON public.work_task_evidence;
CREATE POLICY work_task_evidence_request_insert
  ON public.work_task_evidence
  FOR INSERT
  TO venturecite_request
  WITH CHECK (
    user_id = nullif((select current_setting('venturecite.user_id', true)), '')
    AND EXISTS (
      SELECT 1
      FROM public.work_tasks AS task
      JOIN public.brands AS brand ON brand.id = task.brand_id
      WHERE task.id = work_task_evidence.task_id
        AND task.brand_id = work_task_evidence.brand_id
        AND task.user_id = work_task_evidence.user_id
        AND brand.user_id = nullif((select current_setting('venturecite.user_id', true)), '')
        AND brand.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS work_task_events_request_select ON public.work_task_events;
CREATE POLICY work_task_events_request_select
  ON public.work_task_events
  FOR SELECT
  TO venturecite_request
  USING (
    user_id = nullif((select current_setting('venturecite.user_id', true)), '')
    AND EXISTS (
      SELECT 1
      FROM public.work_tasks AS task
      JOIN public.brands AS brand ON brand.id = task.brand_id
      WHERE task.id = work_task_events.task_id
        AND task.brand_id = work_task_events.brand_id
        AND task.user_id = work_task_events.user_id
        AND brand.user_id = nullif((select current_setting('venturecite.user_id', true)), '')
        AND brand.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS work_task_events_request_insert ON public.work_task_events;
CREATE POLICY work_task_events_request_insert
  ON public.work_task_events
  FOR INSERT
  TO venturecite_request
  WITH CHECK (
    user_id = nullif((select current_setting('venturecite.user_id', true)), '')
    AND EXISTS (
      SELECT 1
      FROM public.work_tasks AS task
      JOIN public.brands AS brand ON brand.id = task.brand_id
      WHERE task.id = work_task_events.task_id
        AND task.brand_id = work_task_events.brand_id
        AND task.user_id = work_task_events.user_id
        AND brand.user_id = nullif((select current_setting('venturecite.user_id', true)), '')
        AND brand.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS work_award_events_request_select ON public.work_award_events;
CREATE POLICY work_award_events_request_select
  ON public.work_award_events
  FOR SELECT
  TO venturecite_request
  USING (
    user_id = nullif((select current_setting('venturecite.user_id', true)), '')
    AND EXISTS (
      SELECT 1
      FROM public.work_tasks AS task
      JOIN public.brands AS brand ON brand.id = task.brand_id
      WHERE task.id = work_award_events.task_id
        AND task.brand_id = work_award_events.brand_id
        AND task.user_id = work_award_events.user_id
        AND brand.user_id = nullif((select current_setting('venturecite.user_id', true)), '')
        AND brand.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS work_award_events_request_insert ON public.work_award_events;
CREATE POLICY work_award_events_request_insert
  ON public.work_award_events
  FOR INSERT
  TO venturecite_request
  WITH CHECK (
    user_id = nullif((select current_setting('venturecite.user_id', true)), '')
    AND EXISTS (
      SELECT 1
      FROM public.work_tasks AS task
      JOIN public.brands AS brand ON brand.id = task.brand_id
      WHERE task.id = work_award_events.task_id
        AND task.brand_id = work_award_events.brand_id
        AND task.user_id = work_award_events.user_id
        AND brand.user_id = nullif((select current_setting('venturecite.user_id', true)), '')
        AND brand.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS brand_capability_events_request_select ON public.brand_capability_events;
CREATE POLICY brand_capability_events_request_select
  ON public.brand_capability_events
  FOR SELECT
  TO venturecite_request
  USING (
    user_id = nullif((select current_setting('venturecite.user_id', true)), '')
    AND EXISTS (
      SELECT 1
      FROM public.brands
      WHERE brands.id = brand_capability_events.brand_id
        AND brands.user_id = nullif((select current_setting('venturecite.user_id', true)), '')
        AND brands.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS brand_capability_events_request_insert ON public.brand_capability_events;
CREATE POLICY brand_capability_events_request_insert
  ON public.brand_capability_events
  FOR INSERT
  TO venturecite_request
  WITH CHECK (
    user_id = nullif((select current_setting('venturecite.user_id', true)), '')
    AND EXISTS (
      SELECT 1
      FROM public.brands
      WHERE brands.id = brand_capability_events.brand_id
        AND brands.user_id = nullif((select current_setting('venturecite.user_id', true)), '')
        AND brands.deleted_at IS NULL
    )
    AND (
      task_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.work_tasks AS task
        WHERE task.id = brand_capability_events.task_id
          AND task.brand_id = brand_capability_events.brand_id
          AND task.user_id = brand_capability_events.user_id
      )
    )
  );

DROP POLICY IF EXISTS work_outcome_reviews_request_select ON public.work_outcome_reviews;
CREATE POLICY work_outcome_reviews_request_select
  ON public.work_outcome_reviews
  FOR SELECT
  TO venturecite_request
  USING (
    user_id = nullif((select current_setting('venturecite.user_id', true)), '')
    AND EXISTS (
      SELECT 1
      FROM public.work_tasks AS task
      JOIN public.brands AS brand ON brand.id = task.brand_id
      WHERE task.id = work_outcome_reviews.task_id
        AND task.brand_id = work_outcome_reviews.brand_id
        AND task.user_id = work_outcome_reviews.user_id
        AND brand.user_id = nullif((select current_setting('venturecite.user_id', true)), '')
        AND brand.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS work_outcome_reviews_request_insert ON public.work_outcome_reviews;
CREATE POLICY work_outcome_reviews_request_insert
  ON public.work_outcome_reviews
  FOR INSERT
  TO venturecite_request
  WITH CHECK (
    user_id = nullif((select current_setting('venturecite.user_id', true)), '')
    AND EXISTS (
      SELECT 1
      FROM public.work_tasks AS task
      JOIN public.brands AS brand ON brand.id = task.brand_id
      WHERE task.id = work_outcome_reviews.task_id
        AND task.brand_id = work_outcome_reviews.brand_id
        AND task.user_id = work_outcome_reviews.user_id
        AND brand.user_id = nullif((select current_setting('venturecite.user_id', true)), '')
        AND brand.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS work_outcome_reviews_request_update ON public.work_outcome_reviews;
CREATE POLICY work_outcome_reviews_request_update
  ON public.work_outcome_reviews
  FOR UPDATE
  TO venturecite_request
  USING (
    user_id = nullif((select current_setting('venturecite.user_id', true)), '')
    AND EXISTS (
      SELECT 1
      FROM public.work_tasks AS task
      JOIN public.brands AS brand ON brand.id = task.brand_id
      WHERE task.id = work_outcome_reviews.task_id
        AND task.brand_id = work_outcome_reviews.brand_id
        AND task.user_id = work_outcome_reviews.user_id
        AND brand.user_id = nullif((select current_setting('venturecite.user_id', true)), '')
        AND brand.deleted_at IS NULL
    )
  )
  WITH CHECK (
    user_id = nullif((select current_setting('venturecite.user_id', true)), '')
    AND EXISTS (
      SELECT 1
      FROM public.work_tasks AS task
      JOIN public.brands AS brand ON brand.id = task.brand_id
      WHERE task.id = work_outcome_reviews.task_id
        AND task.brand_id = work_outcome_reviews.brand_id
        AND task.user_id = work_outcome_reviews.user_id
        AND brand.user_id = nullif((select current_setting('venturecite.user_id', true)), '')
        AND brand.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS business_result_events_request_select ON public.business_result_events;
CREATE POLICY business_result_events_request_select
  ON public.business_result_events
  FOR SELECT
  TO venturecite_request
  USING (
    user_id = nullif((select current_setting('venturecite.user_id', true)), '')
    AND EXISTS (
      SELECT 1
      FROM public.brands
      WHERE brands.id = business_result_events.brand_id
        AND brands.user_id = nullif((select current_setting('venturecite.user_id', true)), '')
        AND brands.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS business_result_events_request_insert ON public.business_result_events;
CREATE POLICY business_result_events_request_insert
  ON public.business_result_events
  FOR INSERT
  TO venturecite_request
  WITH CHECK (
    user_id = nullif((select current_setting('venturecite.user_id', true)), '')
    AND EXISTS (
      SELECT 1
      FROM public.brands
      WHERE brands.id = business_result_events.brand_id
        AND brands.user_id = nullif((select current_setting('venturecite.user_id', true)), '')
        AND brands.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS business_result_events_request_update ON public.business_result_events;
CREATE POLICY business_result_events_request_update
  ON public.business_result_events
  FOR UPDATE
  TO venturecite_request
  USING (
    user_id = nullif((select current_setting('venturecite.user_id', true)), '')
    AND EXISTS (
      SELECT 1
      FROM public.brands
      WHERE brands.id = business_result_events.brand_id
        AND brands.user_id = nullif((select current_setting('venturecite.user_id', true)), '')
        AND brands.deleted_at IS NULL
    )
  )
  WITH CHECK (
    user_id = nullif((select current_setting('venturecite.user_id', true)), '')
    AND EXISTS (
      SELECT 1
      FROM public.brands
      WHERE brands.id = business_result_events.brand_id
        AND brands.user_id = nullif((select current_setting('venturecite.user_id', true)), '')
        AND brands.deleted_at IS NULL
    )
  );
