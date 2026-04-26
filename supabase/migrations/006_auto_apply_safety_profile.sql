-- ============================================================================
-- Migration 006 — Auto Apply profile and consent fields
-- ============================================================================

BEGIN;

ALTER TABLE public.user_profile
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS state_province TEXT,
  ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'US',
  ADD COLUMN IF NOT EXISTS postal_code TEXT,
  ADD COLUMN IF NOT EXISTS preferred_locations TEXT,
  ADD COLUMN IF NOT EXISTS work_location_preference TEXT DEFAULT 'any',
  ADD COLUMN IF NOT EXISTS willing_to_relocate INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS target_job_type TEXT DEFAULT 'intern',
  ADD COLUMN IF NOT EXISTS education_school TEXT,
  ADD COLUMN IF NOT EXISTS education_degree TEXT,
  ADD COLUMN IF NOT EXISTS education_major TEXT,
  ADD COLUMN IF NOT EXISTS graduation_date TEXT,
  ADD COLUMN IF NOT EXISTS gpa TEXT,
  ADD COLUMN IF NOT EXISTS certifications TEXT,
  ADD COLUMN IF NOT EXISTS current_company TEXT,
  ADD COLUMN IF NOT EXISTS current_title TEXT,
  ADD COLUMN IF NOT EXISTS years_experience TEXT,
  ADD COLUMN IF NOT EXISTS skills TEXT,
  ADD COLUMN IF NOT EXISTS projects TEXT,
  ADD COLUMN IF NOT EXISTS auto_apply_consent INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS demographic_consent INT DEFAULT 0;

COMMIT;
