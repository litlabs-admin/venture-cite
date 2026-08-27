-- Source: migrations/0108_content_request_distribution_provider_state.sql
-- SHA256: 96bea95e430f9ee58a341bdd268aecb89d078175aba27643f0aeb63998bffff1

-- Allow the restricted content request role to record provider post state.

GRANT UPDATE (platform_post_id)
  ON public.distributions TO venturecite_content_request;
