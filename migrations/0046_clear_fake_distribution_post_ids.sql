-- Direct-post-to-Buffer cleanup.
--
-- Before BYOK + direct posting shipped, the /api/distribute generation
-- handler pre-stamped distributions.platform_post_id with a synthetic
-- string of the form `<service>_<articleId>_<timestamp>` whenever
-- generation succeeded. The field was meant to hold a real third-party
-- post id; treating it as one made every generated row look like it
-- had been posted.
--
-- The new UI correctly treats a non-null platform_post_id as "this
-- distribution has been posted to Buffer" and renders a green
-- "Posted ✓" badge with a link to the Buffer queue. Pre-existing rows
-- with synthetic ids therefore show as posted when they were only
-- generated. Clear them so the UI reflects reality.
--
-- Real Buffer post ids do NOT match this pattern (they're opaque
-- alphanumeric strings, not service-prefixed UUID-suffixed-timestamps),
-- so this UPDATE preserves any legitimate posts the new flow has
-- already created.

UPDATE distributions
SET platform_post_id = NULL
WHERE platform_post_id ~ '^(linkedin|medium|reddit|quora|twitter|facebook|instagram)_[0-9a-f-]+_[0-9]+$';
