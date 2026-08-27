-- Source: migrations/0100_outbox_kind_claim_indexes.sql
-- SHA256: c827a495aa298149af67a605c35119465e66f6b152a128ddc6ea6f3a77a31038

-- Kind-first partial indexes keep a bounded adapter drain away from unrelated commands.

CREATE INDEX IF NOT EXISTS outbox_commands_kind_claimable_idx
  ON public.outbox_commands (kind, available_at, created_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS outbox_commands_kind_expired_lease_idx
  ON public.outbox_commands (kind, lease_expires_at, created_at)
  WHERE status = 'processing';
