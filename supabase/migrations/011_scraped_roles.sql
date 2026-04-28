-- ============================================================================
-- Migration 011 — Global scraped_roles catalog
-- ============================================================================
-- Shared across all users (no user_id). Populated by the 06:00 UTC cron from
-- Greenhouse / Lever / Ashby / LinkedIn / Wellfound / Jobspresso / Remote
-- Rocketship / ai.jobs / InternshipDaily. Each user "tracks" a role by
-- creating their own evaluations row pointing at it.

BEGIN;

CREATE TABLE IF NOT EXISTS public.scraped_roles (
  id              BIGSERIAL PRIMARY KEY,
  role_type       TEXT NOT NULL DEFAULT 'intern',         -- 'intern' | 'new_grad'
  title           TEXT NOT NULL,
  company_name    TEXT NOT NULL,
  location        TEXT,
  apply_url       TEXT NOT NULL UNIQUE,                   -- dedupe key
  source          TEXT NOT NULL,                          -- greenhouse | lever | ashby | linkedin | wellfound | jobspresso | remote_rocketship | ai_jobs | internshipdaily
  description     TEXT,
  salary_range    TEXT,                                   -- filled later from levels.fyi
  posted_at       TIMESTAMPTZ,                            -- best-effort; null when source doesn't expose it
  scraped_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),     -- bumped each cron run we still see it
  is_active       INT NOT NULL DEFAULT 1
);

-- Indexes for the listing UI
CREATE INDEX IF NOT EXISTS idx_scraped_roles_role_type_posted
  ON public.scraped_roles (role_type, posted_at DESC NULLS LAST, scraped_at DESC);

CREATE INDEX IF NOT EXISTS idx_scraped_roles_company_name
  ON public.scraped_roles (lower(company_name));

CREATE INDEX IF NOT EXISTS idx_scraped_roles_active
  ON public.scraped_roles (is_active);

-- This is a SHARED catalog. Allow authenticated users to SELECT from it.
-- Writes are server-side only (cron / admin), so no INSERT / UPDATE policy.
ALTER TABLE public.scraped_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "scraped_roles_read_all" ON public.scraped_roles;
CREATE POLICY "scraped_roles_read_all"
  ON public.scraped_roles
  FOR SELECT
  TO authenticated
  USING (true);

COMMIT;
