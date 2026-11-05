-- Align columns used by the provider sync and alert services with the schema
-- created by the earlier V0 migrations. Keep the legacy watermark column for
-- existing installations while the application reads the canonical name.
ALTER TABLE public.provider_sync_state
  ADD COLUMN IF NOT EXISTS last_ingested_bucket_end timestamptz;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'provider_sync_state'
      AND column_name = 'latest_bucket_end'
  ) THEN
    EXECUTE 'UPDATE public.provider_sync_state
             SET last_ingested_bucket_end = latest_bucket_end
             WHERE last_ingested_bucket_end IS NULL';
  END IF;
END;
$$;

ALTER TABLE public.alerts
  ADD COLUMN IF NOT EXISTS notification_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_notification_error text;
