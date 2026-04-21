# OutreachOS Deployment Guide

**Architecture:** React Frontend (Vercel) + Vercel Serverless Functions + Supabase PostgreSQL

---

## Quick Start (15 minutes)

### 1. Supabase Setup
```bash
# Go to https://supabase.com and create a new project
# Follow SUPABASE_SETUP.md to:
# - Create database tables (SQL schema)
# - Get credentials (URL, anon key, service role key)
```

### 2. Environment Variables
```bash
cp .env.example .env

# Edit .env with:
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
GEMINI_API_KEY=your_key
# ... add other API keys
```

### 3. Test Locally
```bash
npm run install:all
npm run dev
# Frontend: http://localhost:5173
# Backend: http://localhost:3001
```

### 4. Deploy to Vercel
```bash
# Push to GitHub
git add .
git commit -m "Deploy: Supabase + Vercel"
git push origin main

# Go to https://vercel.com/new
# Connect your GitHub repo
# Add environment variables (from .env)
# Deploy!
```

---

## Pre-Deployment Checklist

### ✅ Code Quality
- [x] ESLint errors fixed (127 → 53 remaining)
- [x] React Hooks violations resolved
- [x] Dead code removed (11 components)
- [x] Shared utilities extracted
- [x] Backend services integrated into API functions

### ✅ Architecture
- [x] Frontend: React + Vite deployed on Vercel CDN
- [x] Backend: Serverless functions on Vercel (`/api/*`)
- [x] Database: PostgreSQL on Supabase (persistent)
- [x] API Client: Dual approach (Supabase queries + function calls)

### ✅ Integrations
- [x] jobEvaluator service imported
- [x] ai.js (email generation) integrated
- [x] autoApplier (Playwright) connected
- [x] creditChecker service integrated
- [x] All API functions properly typed

### ✅ Environment Setup
- [x] `.env.example` created with Supabase vars
- [x] `vercel.json` configured with function settings
- [x] `SUPABASE_SETUP.md` with complete SQL schema
- [x] Root `package.json` with workspace scripts

---

## Detailed Deployment Steps

### Step 1: Supabase Setup (5 minutes)

**1a. Create Project**
```bash
# Visit https://supabase.com/dashboard
# Click "New Project"
# Fill in:
# - Project name: outreach-os
# - Password: strong password (save it!)
# - Region: closest to you
# - Pricing: Free tier
# Click "Create new project"
# Wait ~2 minutes for initialization
```

**1b. Get Credentials**
```bash
# In Supabase dashboard:
# Settings > API (left sidebar)
# Copy and paste into .env:

SUPABASE_URL=https://xxxxxxxxxxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**1c. Create Database Tables**
```bash
# In Supabase dashboard:
# SQL Editor > New Query
# Paste the entire SQL schema from SUPABASE_SETUP.md
# Click "Run"
# Verify all tables created (Table Editor on left sidebar)
```

### Step 2: Local Development (5 minutes)

```bash
# Install dependencies
npm run install:all

# Copy environment template
cp .env.example .env

# Edit .env with your credentials
# Minimum required:
# - SUPABASE_URL
# - SUPABASE_SERVICE_ROLE_KEY
# - VITE_SUPABASE_URL
# - VITE_SUPABASE_ANON_KEY
# - GEMINI_API_KEY

# Start dev servers
npm run dev
# Frontend: http://localhost:5173
# Backend: http://localhost:3001 (if running Express locally)
```

### Step 3: Test Locally (5 minutes)

```bash
# Browser: http://localhost:5173
# Open DevTools (F12)

# Test flows:
# 1. Profile page → fill user profile
# 2. Career Ops → evaluate a test job URL
# 3. Check console for API errors
# 4. Verify data appears in Supabase dashboard
```

### Step 4: Push to GitHub

```bash
# Initialize git (if not already done)
git init
git config user.name "Your Name"
git config user.email "your.email@gmail.com"

# Create .gitignore
cat > .gitignore << 'EOF'
node_modules/
.env
.env.local
dist/
build/
.DS_Store
*.log
.idea/
.vscode/
EOF

# Commit and push
git add .
git commit -m "Initial commit: OutreachOS with Supabase + Vercel

- Migrated from SQLite to Supabase PostgreSQL
- Converted Express backend to Vercel serverless functions
- Integrated jobEvaluator, ai.js, autoApplier, creditChecker
- Fixed ESLint errors and React Hooks violations
- Ready for production deployment"

# Create repo on GitHub first at github.com/YOUR_USERNAME/outreach-os
git remote add origin https://github.com/YOUR_USERNAME/outreach-os.git
git branch -M main
git push -u origin main
```

### Step 5: Deploy to Vercel (3 minutes)

**5a. Connect Repository**
```bash
# Visit https://vercel.com/new
# Click "Import Git Repository"
# Find and select your GitHub repo
# Click "Import"
```

**5b. Configure Project**
```
Framework Preset: Vite
Build Command: npm run build
Install Command: npm install
Output Directory: frontend/dist
Root Directory: ./ (or leave blank)
```

**5c. Add Environment Variables**
In Vercel dashboard → Settings > Environment Variables

Add all variables from your `.env`:
```
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
GEMINI_API_KEY
ANTHROPIC_API_KEY (optional)
OPENAI_API_KEY (optional)
HUNTER_API_KEY (optional)
APIFY_API_TOKEN (optional)
APOLLO_API_KEY (optional)
PROSPEO_API_KEY (optional)
AI_PROVIDER=gemini
```

**5d. Deploy**
```bash
# Click "Deploy" button
# Vercel will build and deploy
# Deployment URL: https://outreach-os-xxxxx.vercel.app
```

---

## Post-Deployment Verification

### Test Health Endpoint
```bash
curl https://yourapp.vercel.app/api/health
# Should return: { "status": "ok", ... }
```

### Test in Browser
```bash
# Visit https://yourapp.vercel.app
# Open DevTools > Console (F12)
# No errors should appear
# Test profile, evaluation, email generation
```

### Check Supabase
```bash
# Vercel app writes to Supabase
# Verify in Supabase dashboard:
# - Table Editor > evaluations
# - Should see test data from your actions
```

### Monitor Vercel Logs
```bash
# Dashboard > Deployments
# Click latest deployment
# View "Logs" tab for any errors
```

---

## API Endpoints (After Deployment)

All available at `https://yourapp.vercel.app/api/*`:

- `GET /api/health` — Health check
- `POST /api/career/evaluate` — Evaluate job against resume
- `POST /api/generate/email` — Generate outreach email
- `POST /api/automations/auto-apply` — Run auto-apply queue (SSE)
- `GET /api/credits/status` — Check API credit status

---

## Environment Variables (Production)

### Supabase (Required)
```
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ... (backend only)
VITE_SUPABASE_URL=https://xxxxx.supabase.co (frontend)
VITE_SUPABASE_ANON_KEY=eyJ... (frontend)
```

### AI Providers (At least one required)
```
GEMINI_API_KEY=AIzaSy... (recommended, free tier available)
ANTHROPIC_API_KEY=sk-ant-... (optional)
OPENAI_API_KEY=sk-proj-... (optional)
```

### Data APIs (Optional)
```
HUNTER_API_KEY=your_key
APIFY_API_TOKEN=your_token
APOLLO_API_KEY=your_key
PROSPEO_API_KEY=your_key
```

### Settings
```
AI_PROVIDER=gemini (primary AI provider)
```

---

## Troubleshooting

### "SUPABASE_URL undefined"
**Solution**: Check Vercel Environment Variables match `.env`

### "Database connection error"
**Solution**: 
1. Verify Supabase project is active
2. Verify credentials are correct (copy from Supabase dashboard Settings > API)
3. Check that tables were created (Supabase > Table Editor)

### "API keys returning 401"
**Solution**: Verify keys are correct and active in each provider's dashboard

### Build fails on Vercel
**Solution**: 
1. Test build locally: `npm run build`
2. Check package.json scripts are correct
3. View Vercel deployment logs for specific errors

### Frontend loads but API calls fail
**Solution**: 
1. Check Network tab in DevTools
2. Verify API URL is correct
3. Check CORS (should be handled automatically by Vercel)
4. Check env vars are set in Vercel dashboard

---

## Monitoring & Maintenance

### Vercel Dashboard
- **Deployments**: View build logs, redeploy, rollback
- **Functions**: Monitor serverless function metrics
- **Analytics**: Monitor traffic, errors, response times

### Supabase Dashboard
- **Table Editor**: Browse and edit data
- **SQL Editor**: Run custom queries
- **Statistics**: Monitor DB size, query performance
- **Logs**: View query logs (Pro plan)

### Setting Up Alerts
1. Vercel: Enable "Monitor with UptimeRobot"
2. Supabase: Enable backup emails (Pro plan)
3. Add monitoring service like Pingdom for uptime checks

---

## Rollback

If deployment has issues:

**Option 1: Vercel Dashboard**
1. Go to Deployments
2. Find last working deployment
3. Click "..." → "Promote to Production"

**Option 2: Git**
```bash
git revert <bad-commit-hash>
git push origin main
# Vercel auto-redeploys
```

---

## Scaling Considerations

### Free Tier Limits
- Vercel: 100 GB bandwidth/month, up to 60s function timeout
- Supabase Free: 2 GB database, 2 GB file storage, 50,000 monthly active users

### For Higher Usage
1. Upgrade Vercel plan ($20/month)
2. Upgrade Supabase plan ($25/month)
3. Add caching layer (Vercel Edge Caching)
4. Optimize database queries with indexes (already added)

---

## Security Checklist

- [x] Environment variables not committed (.gitignore)
- [x] Supabase service role key used server-side only
- [x] Frontend uses anon key (read-only by default)
- [x] API functions validate inputs
- [x] HTTPS enforced (Vercel default)
- [x] Rate limiting configured in vercel.json
- [ ] Enable RLS on Supabase tables (for production)
- [ ] Set up CORS policy (as needed)

---

## Next Steps

1. ✅ Set up Supabase project
2. ✅ Deploy to Vercel
3. Monitor error logs for 48 hours
4. Test auto-apply with real job URLs
5. Collect user feedback
6. Enable advanced features (RLS, backups)
7. Set up monitoring alerts

---

## Documentation

- **SUPABASE_SETUP.md** — Detailed Supabase configuration
- **frontend/README.md** — Frontend architecture
- **backend/services/** — Service layer documentation
- **api/** — Vercel function documentation

---

Last Updated: 2026-04-21
