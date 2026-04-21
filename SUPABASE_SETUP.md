# Supabase Setup Guide

## Overview
This app uses Supabase (PostgreSQL + REST API) for persistent data storage. Follow these steps to set up your Supabase project.

## Step 1: Create a Supabase Project

1. Go to https://supabase.com and sign up (free tier available)
2. Click "New Project"
3. Choose a project name, password, region (closest to you), and pricing plan (Free tier works for development)
4. Wait for project initialization (~2 minutes)

## Step 2: Get Your Credentials

Once your project is created:

1. Go to **Settings > API** (left sidebar)
2. Copy these credentials and add to `.env`:
   - `Project URL` → `SUPABASE_URL`
   - `anon public` → `VITE_SUPABASE_ANON_KEY`
   - `service_role secret` → `SUPABASE_SERVICE_ROLE_KEY`

Example:
```bash
SUPABASE_URL=https://xxxxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## Step 3: Create Database Tables

1. Go to **SQL Editor** (left sidebar)
2. Click "New Query"
3. Copy and paste the SQL schema below
4. Click "Run"

### Database Schema

```sql
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- User Profile
CREATE TABLE IF NOT EXISTS user_profile (
  id INT PRIMARY KEY DEFAULT 1,
  first_name VARCHAR(255),
  last_name VARCHAR(255),
  email VARCHAR(255) UNIQUE,
  phone VARCHAR(20),
  location VARCHAR(255),
  linkedin_url VARCHAR(500),
  github_url VARCHAR(500),
  portfolio_url VARCHAR(500),
  resume_dir VARCHAR(500),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Jobs (from job boards or searches)
CREATE TABLE IF NOT EXISTS jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source VARCHAR(50), -- 'ycombinator', 'lever', 'greenhouse', 'linkedin', etc.
  source_id VARCHAR(255),
  title VARCHAR(255) NOT NULL,
  company_name VARCHAR(255),
  description TEXT,
  url VARCHAR(500) UNIQUE,
  category VARCHAR(50), -- 'startup', 'faang', 'growth', 'scaleup'
  status VARCHAR(50) DEFAULT 'new', -- 'new', 'bookmarked', 'evaluated', 'applied', 'rejected', 'archived'
  salary_min INTEGER,
  salary_max INTEGER,
  salary_currency VARCHAR(10) DEFAULT 'USD',
  location VARCHAR(255),
  remote_policy VARCHAR(20), -- 'remote', 'hybrid', 'onsite'
  posted_at TIMESTAMP,
  last_scrape TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT unique_job_source UNIQUE(source, source_id)
);

-- Job Evaluations (Career Ops results)
CREATE TABLE IF NOT EXISTS evaluations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
  job_url VARCHAR(500),
  job_title VARCHAR(255),
  job_description TEXT,
  company_name VARCHAR(255),
  grade VARCHAR(1), -- 'A', 'B', 'C', 'D', 'F'
  score FLOAT, -- 1.0-5.0
  global_score FLOAT,
  archetype VARCHAR(100),
  report_json JSONB, -- Full evaluation report
  apply_status VARCHAR(50) DEFAULT 'not_started', -- 'not_started', 'queued', 'in_progress', 'submitted', 'pending', 'rejected'
  apply_mode VARCHAR(50) DEFAULT 'manual', -- 'manual', 'auto'
  apply_platform VARCHAR(50), -- 'greenhouse', 'lever', 'ashby', 'linkedin', 'custom'
  apply_attempts INTEGER DEFAULT 0,
  apply_error VARCHAR(500),
  apply_resume_used VARCHAR(255),
  applied_at TIMESTAMP,
  pdf_path VARCHAR(500),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Job Contacts (recruiter/hiring manager info)
CREATE TABLE IF NOT EXISTS job_contacts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
  name VARCHAR(255),
  title VARCHAR(255),
  email VARCHAR(255),
  linkedin_url VARCHAR(500),
  status VARCHAR(50) DEFAULT 'discovered', -- 'discovered', 'contacted', 'replied', 'unresponsive'
  outreach_type VARCHAR(50), -- 'linkedin', 'email', 'both'
  outreach_message TEXT,
  outreach_sent_at TIMESTAMP,
  reply_at TIMESTAMP,
  reply_text TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Companies (enriched company data)
CREATE TABLE IF NOT EXISTS companies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) UNIQUE NOT NULL,
  website VARCHAR(500),
  description TEXT,
  category VARCHAR(50), -- 'startup', 'scale', 'mid', 'enterprise'
  yc_batch VARCHAR(50), -- e.g., 'S22', 'W23'
  industry VARCHAR(100),
  headcount_min INTEGER,
  headcount_max INTEGER,
  funding_usd BIGINT,
  status VARCHAR(50), -- 'active', 'acquired', 'shutdown'
  linkedin_url VARCHAR(500),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Activity Log (for debugging & analytics)
CREATE TABLE IF NOT EXISTS activity_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  action VARCHAR(100), -- 'job_fetched', 'job_evaluated', 'outreach_sent', 'reply_received'
  entity_type VARCHAR(50), -- 'job', 'evaluation', 'contact'
  entity_id VARCHAR(255),
  details JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Metadata (app-level settings)
CREATE TABLE IF NOT EXISTS meta (
  key VARCHAR(100) PRIMARY KEY,
  value TEXT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_jobs_category ON jobs(category);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_company_name ON jobs(company_name);
CREATE INDEX IF NOT EXISTS idx_evaluations_grade ON evaluations(grade);
CREATE INDEX IF NOT EXISTS idx_evaluations_apply_status ON evaluations(apply_status);
CREATE INDEX IF NOT EXISTS idx_evaluations_apply_mode ON evaluations(apply_mode);
CREATE INDEX IF NOT EXISTS idx_evaluations_created_at ON evaluations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_contacts_job_id ON job_contacts(job_id);
CREATE INDEX IF NOT EXISTS idx_job_contacts_status ON job_contacts(status);
CREATE INDEX IF NOT EXISTS idx_companies_name ON companies(name);
CREATE INDEX IF NOT EXISTS idx_activity_log_created_at ON activity_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_log_action ON activity_log(action);
```

## Step 4: Enable Row-Level Security (Optional but Recommended)

1. Go to **Authentication > Policies** (left sidebar)
2. Click "Enable RLS" on each table for production security
3. For development, you can leave it disabled

## Step 5: Set Up Environment Variables

Add the following to your `.env` file:

```bash
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Frontend
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## Step 6: Verify Connection

Run your application locally:

```bash
cd frontend
npm install
npm run dev

cd ../backend
npm install
npm run dev
```

Go to http://localhost:5173 and check the browser console. You should see API calls succeeding.

## Useful Supabase Dashboard Features

### View Data
- **Table Editor**: Click any table to browse/edit data visually
- **SQL Editor**: Write custom queries

### Monitor Usage
- **Statistics**: Real-time DB size, row count, query stats
- **Logs**: Database query logs (Pro plan)

### Backups
- **Backups**: Automatic daily backups (Pro plan)
- **Point-in-time Recovery**: Restore to any point in time (Pro plan)

## Deployment to Vercel

1. Create a Vercel account at https://vercel.com
2. Connect your GitHub repository
3. Add environment variables in Vercel dashboard:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - All API keys (Gemini, Anthropic, OpenAI, etc.)
4. Deploy!

## Troubleshooting

### "JWT expired" or 401 errors
- Check that `SUPABASE_SERVICE_ROLE_KEY` is correct
- Verify it's not the `anon_key` (these are different!)

### "Database connection refused"
- Ensure your Supabase project is active (check dashboard)
- Check that you've run the SQL schema creation script

### CORS issues in browser
- This is expected for `anon_key` (frontend only)
- `service_role_key` is for backend only
- Use `VITE_SUPABASE_ANON_KEY` in frontend `.env`

## Next Steps

1. ✅ Set up Supabase project
2. ✅ Create database tables
3. ✅ Configure environment variables
4. Test the app locally
5. Deploy to Vercel
6. Monitor performance in Supabase dashboard
