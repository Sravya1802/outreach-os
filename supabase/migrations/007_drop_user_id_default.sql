-- ============================================================================
-- Migration 007 — drop the founder UUID DEFAULT on user_id columns
-- ============================================================================
--
-- Final pass of the per-user isolation rollout (see 003 / 004).
--
-- Migration 003 added user_id with DEFAULT '70df2946-…' (founding user) so
-- legacy inserts that didn't pass user_id still attributed to the founder.
-- Migration 004 set user_id NOT NULL but left the DEFAULT in place as a
-- safety net while background paths still lacked an explicit userId.
--
-- All known INSERT statements in the codebase now pass user_id explicitly
-- (verified: 53/53 INSERTs across routes + services include user_id in
-- their column list). Background paths (daily refresh, startup reclassify,
-- nightly cron) either pass an explicit userId or skip per-user writes.
-- This migration removes the safety net so any future INSERT that forgets
-- user_id fails loudly with a NOT NULL violation, instead of silently
-- attributing the row to the founder.
--
-- Idempotent: DROP DEFAULT is a no-op if no DEFAULT exists.
--
-- Roll back (if a forgotten INSERT path surfaces):
--   ALTER TABLE public.<t> ALTER COLUMN user_id
--     SET DEFAULT '70df2946-a46e-4b63-832c-2822cda4cf4b';
-- ============================================================================

BEGIN;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'jobs','companies','contacts','outreach','job_contacts','prospects',
    'evaluations','activity_log','roles','company_applications','documents'
  ]) LOOP
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN user_id DROP DEFAULT', t);
  END LOOP;
END $$;

COMMIT;

-- ============================================================================
-- Post-migration sanity:
--   SELECT table_name, column_name, column_default, is_nullable
--     FROM information_schema.columns
--    WHERE column_name = 'user_id' AND table_schema = 'public'
--    ORDER BY table_name;
--   -- expect: column_default IS NULL, is_nullable = 'NO' on every row
--   -- for the 11 tables above.
-- ============================================================================
