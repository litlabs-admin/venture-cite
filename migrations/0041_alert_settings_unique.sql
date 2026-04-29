-- Wave 9.3: enforce one alert_settings row per (brand_id, alert_type).
-- Historically the schema only had a brand_id index, so double-clicking
-- the create button (or two browser tabs racing) produced duplicate
-- rows that each fired their own notification on every event.
--
-- (a) Collapse legacy duplicates. Keep the oldest row per
--     (brand_id, alert_type) so any user-edited threshold/channel
--     settings on the original row survive.
-- (b) Add the unique constraint to prevent recurrence.
-- (c) Reuse the existing brand_id index for lookups by brand.

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY brand_id, alert_type
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM alert_settings
)
DELETE FROM alert_settings
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

CREATE UNIQUE INDEX IF NOT EXISTS alert_settings_brand_id_alert_type_uniq
  ON alert_settings (brand_id, alert_type);
