-- ─────────────────────────────────────────────────────────────────────────────
-- OutreachOS schema — run once in Supabase SQL Editor.
-- Safe to re-run: all statements use CREATE IF NOT EXISTS / ALTER ADD IF NOT EXISTS.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Key/value meta table (resume text, last refresh, etc.) ───────────────────
CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Singleton user_profile row (id=1) for auto-apply form fields ─────────────
CREATE TABLE IF NOT EXISTS user_profile (
  id                 INT PRIMARY KEY DEFAULT 1,
  first_name         TEXT,
  last_name          TEXT,
  email              TEXT,
  phone              TEXT,
  linkedin_url       TEXT,
  github_url         TEXT,
  portfolio_url      TEXT,
  location           TEXT,
  work_authorization TEXT,
  needs_sponsorship  BOOLEAN,
  gender             TEXT,
  race               TEXT,
  veteran_status     TEXT,
  disability_status  TEXT,
  resume_dir         TEXT,
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at         TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure the singleton row exists
INSERT INTO user_profile (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ── Evaluations (job-fit reports from Career Ops) ────────────────────────────
CREATE TABLE IF NOT EXISTS evaluations (
  id            BIGSERIAL PRIMARY KEY,
  job_url       TEXT,
  job_title     TEXT,
  company_name  TEXT,
  grade         TEXT,
  score         NUMERIC,
  report_json   TEXT,
  pdf_path      TEXT,
  apply_status  TEXT DEFAULT 'not_started',
  apply_mode    TEXT DEFAULT 'manual',
  applied_at    TIMESTAMPTZ,
  source        TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Additive migrations (run even on existing installs)
ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS apply_status TEXT DEFAULT 'not_started';
ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS apply_mode   TEXT DEFAULT 'manual';
ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS applied_at   TIMESTAMPTZ;
ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS pdf_path     TEXT;

-- ── Storage bucket for resumes ───────────────────────────────────────────────
-- Run this ONLY if the bucket doesn't already exist:
--   Supabase Dashboard → Storage → New bucket → name "resumes", public: OFF

-- ── Row-level security ───────────────────────────────────────────────────────
-- Enable RLS and allow any authenticated user full access (4-user shared workspace).
-- Adjust to per-user rows later by adding user_id columns + auth.uid() checks.

ALTER TABLE meta         ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE evaluations  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_all_meta"         ON meta;
DROP POLICY IF EXISTS "authenticated_all_user_profile" ON user_profile;
DROP POLICY IF EXISTS "authenticated_all_evaluations"  ON evaluations;

CREATE POLICY "authenticated_all_meta" ON meta
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_all_user_profile" ON user_profile
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_all_evaluations" ON evaluations
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── Storage RLS for resumes bucket ───────────────────────────────────────────
-- Allow authenticated users to read/write any file in the 'resumes' bucket.
-- Run these as-is; if the bucket doesn't exist yet, create it first (see above).

DROP POLICY IF EXISTS "authenticated_read_resumes"   ON storage.objects;
DROP POLICY IF EXISTS "authenticated_write_resumes"  ON storage.objects;
DROP POLICY IF EXISTS "authenticated_update_resumes" ON storage.objects;
DROP POLICY IF EXISTS "authenticated_delete_resumes" ON storage.objects;

CREATE POLICY "authenticated_read_resumes" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'resumes');

CREATE POLICY "authenticated_write_resumes" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'resumes');

CREATE POLICY "authenticated_update_resumes" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'resumes');

CREATE POLICY "authenticated_delete_resumes" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'resumes');
