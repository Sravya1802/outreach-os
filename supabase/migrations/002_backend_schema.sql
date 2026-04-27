-- ============================================================================
-- OutreachOS — Phase 4 schema (sqlite → Postgres)
-- ============================================================================
--
-- This replicates the local Express backend's sqlite schema in Postgres so the
-- backend can point at Supabase instead of a local file.
--
-- IMPORTANT CONTEXT:
-- The local backend's "jobs" table is actually its CANONICAL companies table
-- (it has name, category, location, website, team_size, yc_batch, tags, etc).
-- The older "companies" table is a small legacy table. Don't be confused by
-- the naming — we keep both for backward compatibility with existing routes.
--
-- DESTRUCTIVE NOTICE:
-- Running this migration drops any existing tables that conflict with the
-- local-backend schema (the Vercel-era companies/jobs/etc tables that have
-- different columns). The 1500-ish Vercel-scraped rows will be lost.
-- That's intentional — they were miscategorized anyway. Starting fresh.
--
-- If you want to preserve Vercel-era data, export CSVs from the Supabase
-- Table Editor BEFORE running this.
--
-- Safe to re-run (idempotent where possible).
-- ============================================================================


-- ── Step 0: drop conflicting tables ──────────────────────────────────────────
-- Drop order respects foreign keys. CASCADE handles dependent objects.
DROP TABLE IF EXISTS outreach              CASCADE;
DROP TABLE IF EXISTS contacts              CASCADE;
DROP TABLE IF EXISTS job_contacts          CASCADE;
DROP TABLE IF EXISTS roles                 CASCADE;
DROP TABLE IF EXISTS documents             CASCADE;
DROP TABLE IF EXISTS company_applications  CASCADE;
DROP TABLE IF EXISTS activity_log          CASCADE;
DROP TABLE IF EXISTS prospects             CASCADE;
DROP TABLE IF EXISTS jobs                  CASCADE;
DROP TABLE IF EXISTS companies             CASCADE;
DROP TABLE IF EXISTS evaluations           CASCADE;
DROP TABLE IF EXISTS user_profile          CASCADE;
DROP TABLE IF EXISTS meta                  CASCADE;


-- ── Meta (key/value app-level state) ─────────────────────────────────────────
CREATE TABLE meta (
  key   TEXT PRIMARY KEY,
  value TEXT
);


-- ── User profile (singleton, id=1) for auto-apply form filling ───────────────
CREATE TABLE user_profile (
  id                 INT PRIMARY KEY CHECK (id = 1),
  first_name         TEXT,
  last_name          TEXT,
  email              TEXT,
  phone              TEXT,
  linkedin_url       TEXT,
  github_url         TEXT,
  portfolio_url      TEXT,
  location           TEXT,
  work_authorization TEXT    DEFAULT 'US Citizen',
  needs_sponsorship  INT     DEFAULT 0,
  gender             TEXT,
  race               TEXT,
  veteran_status     TEXT,
  disability_status  TEXT,
  resume_dir         TEXT    DEFAULT '/home/ubuntu/outreach/resumes',
  updated_at         TIMESTAMPTZ DEFAULT NOW()
);
INSERT INTO user_profile (id) VALUES (1) ON CONFLICT (id) DO NOTHING;


-- ── Legacy "companies" table (small, kept for backward compat) ───────────────
CREATE TABLE companies (
  id          BIGSERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  role        TEXT,
  location    TEXT,
  stage       TEXT,
  source      TEXT,
  apply_url   TEXT,
  posted_at   TEXT,
  status      TEXT DEFAULT 'new',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (name, role)
);


-- ── Legacy contacts linked to legacy companies ───────────────────────────────
CREATE TABLE contacts (
  id            BIGSERIAL PRIMARY KEY,
  company_id    BIGINT REFERENCES companies(id) ON DELETE CASCADE,
  name          TEXT,
  title         TEXT,
  linkedin_url  TEXT,
  email         TEXT,
  email_status  TEXT,
  phone         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);


-- ── Legacy outreach tied to contacts ─────────────────────────────────────────
CREATE TABLE outreach (
  id          BIGSERIAL PRIMARY KEY,
  contact_id  BIGINT REFERENCES contacts(id) ON DELETE CASCADE,
  type        TEXT,
  subject     TEXT,
  body        TEXT,
  status      TEXT DEFAULT 'draft',
  sent_at     TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);


-- ── Prospects (cold-email targets) ───────────────────────────────────────────
CREATE TABLE prospects (
  id               BIGSERIAL PRIMARY KEY,
  name             TEXT NOT NULL,
  title            TEXT,
  linkedin_url     TEXT,
  email            TEXT,
  email_status     TEXT DEFAULT 'unknown',
  phone            TEXT,
  company_name     TEXT NOT NULL,
  company_type     TEXT DEFAULT 'startup',
  company_website  TEXT,
  email_subject    TEXT,
  email_body       TEXT,
  linkedin_dm      TEXT,
  status           TEXT DEFAULT 'pending',
  notes            TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (name, company_name)
);


-- ── Jobs = canonical COMPANIES table (local-backend naming quirk) ────────────
-- All columns from local db.js base + all ALTER TABLE additions merged in.
CREATE TABLE jobs (
  id                       BIGSERIAL PRIMARY KEY,
  name                     TEXT NOT NULL UNIQUE,
  category                 TEXT,
  pay                      INT DEFAULT 0,
  roles                    TEXT,
  location                 TEXT,
  url                      TEXT,
  tag                      TEXT,
  domain                   TEXT,
  created_at               TIMESTAMPTZ DEFAULT NOW(),

  -- added via ALTER in db.js
  linkedin_company_url     TEXT,
  is_hiring                INT DEFAULT 0,
  source                   TEXT,
  subcategory              TEXT,
  confidence               NUMERIC DEFAULT 0,
  classified_at            TEXT,
  wikipedia_summary        TEXT,
  intern_roles_json        TEXT,
  intern_roles_checked_at  TEXT,
  intern_roles_source      TEXT,
  intern_roles_count       INT,
  city                     TEXT,
  state                    TEXT,
  country                  TEXT DEFAULT 'US',
  is_remote                INT DEFAULT 0,
  resolved_domain          TEXT,
  website                  TEXT,
  description              TEXT,
  team_size                INT,
  yc_batch                 TEXT,
  tags                     TEXT,
  status                   TEXT DEFAULT 'new'
);


-- ── Job contacts (LinkedIn profiles + Hunter emails per company) ─────────────
CREATE TABLE job_contacts (
  id                BIGSERIAL PRIMARY KEY,
  job_id            BIGINT REFERENCES jobs(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  title             TEXT,
  linkedin_url      TEXT,
  email             TEXT,
  email_status      TEXT DEFAULT 'unknown',
  source            TEXT DEFAULT 'unknown',
  generated_dm      TEXT,
  generated_subject TEXT,
  generated_body    TEXT,
  status            TEXT DEFAULT 'pending',
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  -- added via ALTER
  seniority_score   INT DEFAULT 0,
  UNIQUE (job_id, name)
);


-- ── Career Ops evaluations ───────────────────────────────────────────────────
CREATE TABLE evaluations (
  id                  BIGSERIAL PRIMARY KEY,
  job_url             TEXT,
  job_title           TEXT,
  company_name        TEXT,
  job_description     TEXT,
  grade               TEXT,
  score               NUMERIC,
  report_json         TEXT,
  report_path         TEXT,
  pdf_path            TEXT,
  source              TEXT DEFAULT 'career_ops',
  created_at          TIMESTAMPTZ DEFAULT NOW(),

  -- added via ALTER
  apply_mode          TEXT DEFAULT 'manual',
  apply_status        TEXT DEFAULT 'not_started',
  applied_at          TEXT,
  apply_platform      TEXT,
  apply_error         TEXT,
  apply_resume_used   TEXT,
  apply_attempts      INT DEFAULT 0
);


-- ── Activity log (dashboard feed) ────────────────────────────────────────────
CREATE TABLE activity_log (
  id         BIGSERIAL PRIMARY KEY,
  action     TEXT NOT NULL,
  details    TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);


-- ── Scraped roles per company (jobs) ─────────────────────────────────────────
CREATE TABLE roles (
  id          BIGSERIAL PRIMARY KEY,
  company_id  BIGINT REFERENCES jobs(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  location    TEXT,
  posted_at   TEXT,
  source      TEXT,
  apply_url   TEXT,
  description TEXT,
  status      TEXT DEFAULT 'open',
  role_type   TEXT DEFAULT 'intern',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (company_id, title, apply_url)
);


-- ── Per-company application tracking ─────────────────────────────────────────
CREATE TABLE company_applications (
  id                    BIGSERIAL PRIMARY KEY,
  company_id            BIGINT REFERENCES jobs(id) ON DELETE CASCADE UNIQUE,
  status                TEXT DEFAULT 'interested',
  applied_date          TEXT,
  follow_up_date        TEXT,
  notes                 TEXT,
  fit_score             NUMERIC,
  salary                TEXT,
  location_type         TEXT DEFAULT 'onsite',
  start_date            TEXT,
  end_date              TEXT,
  fit_assessment        TEXT,
  resume_path           TEXT,
  resume_original_name  TEXT,
  resume_size           INT,
  job_title             TEXT,
  job_url               TEXT,
  job_source            TEXT,
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);


-- ── Documents (file uploads tied to companies) ──────────────────────────────
CREATE TABLE documents (
  id             BIGSERIAL PRIMARY KEY,
  company_id     BIGINT,
  filename       TEXT NOT NULL,
  original_name  TEXT NOT NULL,
  mime_type      TEXT,
  size           INT,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);


-- ── Indices for read perf (mirror local db.js) ──────────────────────────────
CREATE INDEX idx_jobs_category                    ON jobs(category);
CREATE INDEX idx_jobs_status                      ON jobs(status);
CREATE INDEX idx_jobs_subcategory                 ON jobs(subcategory);
CREATE INDEX idx_jobs_is_hiring                   ON jobs(is_hiring);
CREATE INDEX idx_jobs_source                      ON jobs(source);
CREATE INDEX idx_job_contacts_job_id              ON job_contacts(job_id);
CREATE INDEX idx_job_contacts_status              ON job_contacts(status);
CREATE INDEX idx_evaluations_grade                ON evaluations(grade);
CREATE INDEX idx_evaluations_apply_status         ON evaluations(apply_status);
CREATE INDEX idx_evaluations_created_at           ON evaluations(created_at);
CREATE INDEX idx_activity_log_created_at          ON activity_log(created_at);
CREATE INDEX idx_roles_company_id                 ON roles(company_id);
CREATE INDEX idx_roles_role_type                  ON roles(role_type);
CREATE INDEX idx_company_applications_status      ON company_applications(status);


-- ── Row-level security ───────────────────────────────────────────────────────
-- 4-user shared workspace: any authenticated user has full access.
-- The backend uses the service_role key so it bypasses RLS anyway;
-- these policies only matter for any future frontend-direct queries.

DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'meta','user_profile','evaluations','companies','contacts','outreach',
    'prospects','jobs','job_contacts','activity_log','roles',
    'company_applications','documents'
  ]) LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "authenticated_all_%s" ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY "authenticated_all_%s" ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
      t, t
    );
  END LOOP;
END $$;


-- ── Resume storage bucket RLS ────────────────────────────────────────────────
-- Create the bucket in Supabase Dashboard first if it doesn't exist:
--   Storage → New bucket → name "resumes", Public OFF

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
