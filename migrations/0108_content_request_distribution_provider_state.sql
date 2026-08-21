-- Allow the restricted content request role to record provider post state.

GRANT UPDATE (platform_post_id)
  ON public.distributions TO venturecite_content_request;
