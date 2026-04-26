-- ============================================================================
-- Migration 003 — per-user data isolation
-- ============================================================================
--
-- Converts the shared-workspace schema (everyone sees everyone's data) into a
-- multi-tenant one where each row is owned by exactly one auth user.
--
-- Deployed in two passes:
--   * PASS 1 (this file): add user_id columns as NULLABLE with a default of
--     the founding user, backfill existing rows, add indexes, add RLS policies
--     that scope by auth.uid(). Backend code can still work without knowing
--     about user_id yet — the default takes care of new writes.
--   * PASS 2 (in migration 004 after code lands): drop the default, set
--     user_id NOT NULL, tighten RLS. Until PASS 2 lands, a bug in the backend
--     can still write rows "owned" by the founding user — low risk but the
--     eventual tightening is intentional.
--
-- Founding user (all existing rows attributed here):
--   70df2946-a46e-4b63-832c-2822cda4cf4b  (lakshmisravyar@gmail.com)
-- ============================================================================

BEGIN;

-- ── helper: owning user for pre-existing rows ──────────────────────────────
-- Using a DO block lets us parameterize easily if we later want to rerun.
DO $$
DECLARE
  founding_user UUID := '70df2946-a46e-4b63-832c-2822cda4cf4b';
  t TEXT;
BEGIN
  -- Add user_id to every tracked table. Nullable + default = founding_user
  -- so any INSERT that forgets user_id still attributes to the founder
  -- during the rollout window. We tighten in migration 004.
  FOR t IN SELECT unnest(ARRAY[
    'jobs','companies','contacts','outreach','job_contacts','prospects',
    'evaluations','activity_log','roles','company_applications','documents'
  ]) LOOP
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT %L REFERENCES auth.users(id) ON DELETE CASCADE',
      t, founding_user
    );
    -- Backfill any rows still NULL (e.g. column just added).
    EXECUTE format('UPDATE public.%I SET user_id = %L WHERE user_id IS NULL', t, founding_user);
    -- Index for the most common query pattern (SELECT … WHERE user_id = $1).
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_user_id ON public.%I(user_id)', t, t);
  END LOOP;
END $$;


-- ── user_profile: switch from singleton (id=1) to per-user row ──────────────
-- The old design had a single row with PK id=1. We keep id (now BIGSERIAL) so
-- existing FKs (if any) don't break, and add user_id UNIQUE so there's one
-- profile per user.
ALTER TABLE public.user_profile
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Backfill the founder's existing singleton row (id=1) to their user_id.
UPDATE public.user_profile
SET    user_id = '70df2946-a46e-4b63-832c-2822cda4cf4b'
WHERE  id = 1 AND user_id IS NULL;

-- Relax the old CHECK (id = 1) so we can have multiple rows going forward.
-- We keep `id` as the primary key for backward compatibility but drop the
-- single-row constraint. New rows get id via a sequence.
ALTER TABLE public.user_profile DROP CONSTRAINT IF EXISTS user_profile_id_check;
-- Convert id from INT to BIGSERIAL semantics (ensure a sequence exists).
-- Supabase Postgres supports this pattern:
CREATE SEQUENCE IF NOT EXISTS public.user_profile_id_seq OWNED BY public.user_profile.id;
ALTER TABLE public.user_profile ALTER COLUMN id SET DEFAULT nextval('public.user_profile_id_seq');
-- Ensure the sequence is advanced past any existing id so new inserts don't collide.
SELECT setval('public.user_profile_id_seq', COALESCE((SELECT MAX(id) FROM public.user_profile), 1));

-- One profile per user.
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_profile_user_id_unique ON public.user_profile(user_id) WHERE user_id IS NOT NULL;


-- ── meta: key/value app-level state. Make it per-user. ─────────────────────
-- Old PK was (key). New composite key is (user_id, key). Backfill attributes
-- existing rows to the founder.
ALTER TABLE public.meta
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

UPDATE public.meta
SET    user_id = '70df2946-a46e-4b63-832c-2822cda4cf4b'
WHERE  user_id IS NULL;

-- Drop old single-column PK, add composite PK. The DROP can fail if no PK
-- exists or if name differs; wrap in a DO block.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.meta'::regclass AND contype = 'p') THEN
    EXECUTE (SELECT 'ALTER TABLE public.meta DROP CONSTRAINT ' || conname FROM pg_constraint WHERE conrelid = 'public.meta'::regclass AND contype = 'p');
  END IF;
END $$;

-- Ensure user_id is NOT NULL before making it part of PK (backfill above handled it).
ALTER TABLE public.meta ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.meta ADD PRIMARY KEY (user_id, key);


-- ── RLS: scope every table by auth.uid() ────────────────────────────────────
-- The backend uses the service-role key so it bypasses RLS. But RLS serves as
-- defense-in-depth against frontend-direct queries or misconfigured clients.
-- Each policy replaces the old "authenticated users see everything" policy.

DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'jobs','companies','contacts','outreach','job_contacts','prospects',
    'evaluations','activity_log','roles','company_applications','documents',
    'user_profile','meta'
  ]) LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "authenticated_all_%s" ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "owner_all_%s" ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY "owner_all_%s" ON public.%I FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())',
      t, t
    );
  END LOOP;
END $$;


-- ── Storage bucket RLS: scope resume objects to their owner ────────────────
-- Objects in the 'resumes' bucket should live under a path like:
--   <user_id>/resume.pdf
-- Keep existing policies for reading own files, writing own files, etc.
-- The frontend is already using this prefix pattern; the policy below just
-- restricts access to it.

DROP POLICY IF EXISTS "authenticated_read_resumes"   ON storage.objects;
DROP POLICY IF EXISTS "authenticated_write_resumes"  ON storage.objects;
DROP POLICY IF EXISTS "authenticated_update_resumes" ON storage.objects;
DROP POLICY IF EXISTS "authenticated_delete_resumes" ON storage.objects;

CREATE POLICY "owner_read_resumes" ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id = 'resumes'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
CREATE POLICY "owner_write_resumes" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'resumes'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
CREATE POLICY "owner_update_resumes" ON storage.objects
  FOR UPDATE TO authenticated USING (
    bucket_id = 'resumes'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
CREATE POLICY "owner_delete_resumes" ON storage.objects
  FOR DELETE TO authenticated USING (
    bucket_id = 'resumes'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

COMMIT;

-- ============================================================================
-- Post-migration sanity checks (run manually after applying):
-- ============================================================================
-- SELECT COUNT(*) FROM jobs                  WHERE user_id IS NULL;  -- expect 0
-- SELECT COUNT(*) FROM evaluations           WHERE user_id IS NULL;  -- expect 0
-- SELECT COUNT(*) FROM job_contacts          WHERE user_id IS NULL;  -- expect 0
-- SELECT COUNT(*) FROM user_profile          WHERE user_id IS NULL;  -- expect 0
-- SELECT user_id, COUNT(*) FROM jobs GROUP BY user_id;
--   -- expect single row with founder UUID and your total company count.
