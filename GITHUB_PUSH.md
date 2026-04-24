# GitHub Push & Vercel Deployment Instructions

> ⚠️ **Historical — pre-Phase-4 initial push guide.** The repo is
> already published at https://github.com/Sravya1802/outreach-os and
> the Vercel-only deployment path described here is no longer accurate
> (backend now lives on Oracle Cloud). See [README.md](README.md) and
> [PLAN.txt](PLAN.txt). Preserved for historical reference only.

## Step 1: Create GitHub Repository

1. Go to https://github.com/new
2. Create repository: `outreacha-os`
3. Description: "AI-powered internship job search automation"
4. **Do NOT initialize with README** (we already have one)
5. Click "Create repository"

---

## Step 2: Connect Local Repository to GitHub

```bash
cd /Users/lakshmisravyarachakonda/VS\ CODE/email\ tracker

# Add remote (replace with your username)
git remote add origin https://github.com/YOUR_USERNAME/outreacha-os.git

# Verify remote
git remote -v

# Push to GitHub
git branch -M main
git push -u origin main
```

**Expected output:**
```
Counting objects: 115
Total 115 (delta 0), reused 0 (delta 0), pack-reused 0
To https://github.com/your-username/outreacha-os.git
 * [new branch]      main -> main
Branch 'main' set up to track remote branch 'main' from 'origin'.
```

---

## Step 3: Deploy Frontend to Vercel

### Option A: Vercel Dashboard (Easiest)

1. Go to https://vercel.com/new
2. Import GitHub Repository
   - Select your GitHub account
   - Search for `outreacha-os`
   - Click Import
3. Configure Project
   - **Framework**: Vite
   - **Root Directory**: `./frontend`
   - **Build command**: `npm run build`
   - **Output directory**: `dist`
4. Environment Variables
   - Add: `VITE_API_URL` = `http://localhost:3001` (for now)
5. Click "Deploy"

**Frontend URL**: `https://outreacha-os.vercel.app` (auto-generated)

### Option B: Vercel CLI

```bash
# Install Vercel CLI
npm install -g vercel

# Login to Vercel
vercel login

# Deploy frontend
cd frontend
vercel --prod
```

---

## Step 4: Deploy Backend to Railway (Recommended)

Railway is perfect for Node.js + SQLite apps with persistent storage.

### Option A: Railway Dashboard

1. Go to https://railway.app
2. Click "New Project"
3. Select "Deploy from GitHub"
4. Authorize Railway to access GitHub
5. Select `outreacha-os` repository
6. Select `backend` directory
7. Railway auto-detects Node.js
8. Add Environment Variables:
   ```
   PORT=3001
   AI_PROVIDER=gemini
   GEMINI_API_KEY=your_key_here
   ANTHROPIC_API_KEY=your_key_here (optional)
   APOLLO_API_KEY=your_key_here (optional)
   APIFY_API_TOKEN=your_token_here (optional)
   HUNTER_API_KEY=your_key_here (optional)
   LINKEDIN_SESSION_COOKIE=your_cookie (optional)
   CORS_ORIGINS=https://outreacha-os.vercel.app
   NODE_ENV=production
   LOG_LEVEL=info
   ```
9. Click "Deploy"

**Backend URL**: `https://outreacha-os-api.railway.app` (auto-generated)

### Option B: Railway CLI

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Initialize project
cd backend
railway init

# Deploy
railway up
```

---

## Step 5: Update Frontend API URL

Once backend is deployed, update frontend to use production API:

1. Go to Vercel Dashboard
2. Project Settings → Environment Variables
3. Add/Update: `VITE_API_URL=https://outreacha-os-api.railway.app`
4. Redeploy frontend (should auto-trigger)

Or via CLI:
```bash
vercel env add VITE_API_URL https://outreacha-os-api.railway.app --prod
```

---

## Step 6: Test Production Deployment

### Health Check
```bash
# Frontend
curl https://outreacha-os.vercel.app

# Backend
curl https://outreacha-os-api.railway.app/api/health
```

Expected backend response:
```json
{
  "status": "ok",
  "ai_provider": "gemini",
  "has_gemini": true,
  "has_apify": false,
  "has_apollo": false,
  "has_linkedin": false
}
```

### Test Core Features
- [ ] Can access frontend at https://outreacha-os.vercel.app
- [ ] Dashboard loads and shows stats
- [ ] Can search for companies
- [ ] Can upload resume
- [ ] Can evaluate a job
- [ ] Can queue for auto-apply
- [ ] Can view application pipeline

---

## Step 7: Enable CI/CD (Optional)

Create `.github/workflows/deploy.yml` for auto-deployment on push:

```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Deploy to Vercel
        uses: vercel/action@master
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
```

Get tokens from:
- Vercel Dashboard → Settings → Tokens
- Railway Dashboard → Settings → API Tokens

---

## Step 8: Backup & Monitoring

### Railway Database Backup
1. Dashboard → Backend Service
2. Data → Volumes
3. Download `data/outreach.db` regularly
4. Store in AWS S3 or similar

### Monitor Logs
```bash
# Vercel logs
vercel logs https://outreacha-os.vercel.app --tail

# Railway logs
railway logs
```

---

## Troubleshooting

### Frontend won't load
```bash
# Check logs
vercel logs https://outreacha-os.vercel.app --tail

# Redeploy
vercel deploy --prod
```

### Backend API returns 502
```bash
# Check Railway logs
railway logs

# Verify environment variables
railway env list

# Restart service
railway up
```

### CORS errors in production
```
Error: Access-Control-Allow-Origin missing
```

Fix: Update backend `.env`:
```
CORS_ORIGINS=https://outreacha-os.vercel.app,http://localhost:5173
```

Then redeploy:
```bash
cd backend && git push  # This triggers Railway auto-deploy
```

---

## Post-Deployment Checklist

- [ ] Frontend loads without errors
- [ ] Backend health check returns 200
- [ ] Can authenticate and use app
- [ ] Auto-apply queue processes jobs
- [ ] Email notifications working (if configured)
- [ ] Database persists data
- [ ] Logs are accessible
- [ ] Backups are scheduled

---

## Cost Breakdown

| Service | Cost | Notes |
|---------|------|-------|
| Vercel (Frontend) | **Free** | 100GB bandwidth/month, unlimited deployments |
| Railway (Backend) | ~$7-15/mo | $5 base + compute usage |
| GitHub (Repo) | **Free** | Unlimited public repos |
| **Total** | ~$7-15/mo | Less than 1 large coffee ☕ |

---

## Next: Monitoring in Production

After deployment is live:

1. **Set up error tracking** (Sentry, LogRocket)
2. **Enable analytics** (Google Analytics, PostHog)
3. **Configure alerts** (PagerDuty, Slack)
4. **Daily log review** (first 2 weeks)
5. **Weekly performance check** (lighthouse, Core Web Vitals)

---

**🎉 Congrats! OutreachOS is live!**

Share the production URL with friends:
```
Frontend: https://outreacha-os.vercel.app
Docs: https://github.com/YOUR_USERNAME/outreacha-os/blob/main/README.md
```

---

Generated: 2026-04-21
