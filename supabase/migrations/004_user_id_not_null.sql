-- ============================================================================
-- Migration 004 — tighten user_id to NOT NULL
-- ============================================================================
--
-- Pass 2 of the per-user isolation rollout (see 003_per_user_isolation.sql).
-- Migration 003 added user_id with a DEFAULT of the founding user and backfilled
-- every existing row. The DEFAULT is now a safety net for background cron /
-- startup code paths that lack a request context (see server.js cron handlers,
-- jobs.js:runReclassifyUnclassified, etc.).
--
-- This migration:
--   1. Asserts user_id IS NOT NULL across every scoped table.
--   2. Keeps the DEFAULT in place — do NOT drop it yet. When those background
--      paths are refactored to accept an explicit userId, a follow-up migration
--      005 can drop the DEFAULT so forgotten INSERTs fail loudly.
--
-- Why not drop DEFAULT now? If any route/service still forgets to pass
-- user_id, dropping DEFAULT makes the INSERT fail (NULL violates NOT NULL).
-- That's the correct long-term state, but we have 5 TODO(auth) markers in
-- the codebase that still rely on the DEFAULT to succeed. Fix those first,
-- then drop the DEFAULT.
--
-- Safe to re-run (all operations are idempotent via NOT NULL alterations that
-- no-op if already enforced).
-- ============================================================================

BEGIN;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'jobs','companies','contacts','outreach','job_contacts','prospects',
    'evaluations','activity_log','roles','company_applications','documents',
    'user_profile','meta'
  ]) LOOP
    -- Safety: fail the migration (not silently skip) if any row is still NULL.
    -- Migration 003 backfilled, but if you've run 003 partially and then
    -- applied 004 before re-checking, we want a clear error rather than
    -- corrupting the schema.
    EXECUTE format(
      'DO $inner$ BEGIN
         IF EXISTS (SELECT 1 FROM public.%I WHERE user_id IS NULL) THEN
           RAISE EXCEPTION ''%% has rows with NULL user_id — re-run migration 003 backfill before applying 004'', ''%I'';
         END IF;
       END $inner$;',
      t, t
    );

    -- Apply NOT NULL. Idempotent — a second run is a no-op.
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN user_id SET NOT NULL', t);
  END LOOP;
END $$;

COMMIT;

-- ============================================================================
-- Post-migration sanity:
--   SELECT table_name, is_nullable FROM information_schema.columns
--    WHERE column_name = 'user_id' AND table_schema = 'public';
--   -- expect is_nullable = 'NO' on every row.
-- ============================================================================
