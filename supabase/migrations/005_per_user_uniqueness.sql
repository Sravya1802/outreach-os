-- ============================================================================
-- Migration 005 — replace global uniqueness with per-user uniqueness
-- ============================================================================
--
-- Migration 003/004 scoped reads and RLS by user_id, but several legacy UNIQUE
-- constraints still deduped data globally. That made a clean second user unable
-- to import or track the same company/contact/role as the founding user.
--
-- This migration drops those global constraints and recreates equivalent
-- per-user constraints so INSERT ... ON CONFLICT can safely target
-- (user_id, ...).
-- ============================================================================

BEGIN;

-- Legacy global constraints created by 002_backend_schema.sql.
ALTER TABLE public.jobs                 DROP CONSTRAINT IF EXISTS jobs_name_key;
ALTER TABLE public.prospects            DROP CONSTRAINT IF EXISTS prospects_name_company_name_key;
ALTER TABLE public.roles                DROP CONSTRAINT IF EXISTS roles_company_id_title_apply_url_key;
ALTER TABLE public.job_contacts         DROP CONSTRAINT IF EXISTS job_contacts_job_id_name_key;
ALTER TABLE public.company_applications DROP CONSTRAINT IF EXISTS company_applications_company_id_key;
ALTER TABLE public.companies            DROP CONSTRAINT IF EXISTS companies_name_role_key;

-- Per-user replacements. NULL apply_url is allowed to behave like normal SQL
-- uniqueness; duplicate NULL apply_url rows are permitted, matching prior
-- Postgres UNIQUE behavior.
CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_user_name_unique
  ON public.jobs(user_id, name);

CREATE UNIQUE INDEX IF NOT EXISTS idx_prospects_user_name_company_unique
  ON public.prospects(user_id, name, company_name);

CREATE UNIQUE INDEX IF NOT EXISTS idx_roles_user_company_title_url_unique
  ON public.roles(user_id, company_id, title, apply_url);

CREATE UNIQUE INDEX IF NOT EXISTS idx_job_contacts_user_job_name_unique
  ON public.job_contacts(user_id, job_id, name);

CREATE UNIQUE INDEX IF NOT EXISTS idx_company_applications_user_company_unique
  ON public.company_applications(user_id, company_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_companies_user_name_role_unique
  ON public.companies(user_id, name, role);

COMMIT;
