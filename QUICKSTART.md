# OutreachOS Quick Start

Get your job search automation platform running in **20 minutes**.

## 🚀 The Fast Path

### 1️⃣ **Supabase (5 min)**
```bash
# Go to https://supabase.com
# Create new project → note your credentials
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
VITE_SUPABASE_ANON_KEY=eyJ...
```

### 2️⃣ **Create Tables (2 min)**
1. In Supabase dashboard → SQL Editor → New Query
2. Paste SQL from `SUPABASE_SETUP.md`
3. Click Run
4. ✅ Done! Tables created

### 3️⃣ **Set Up Environment (2 min)**
```bash
cp .env.example .env

# Edit .env with your Supabase credentials:
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
GEMINI_API_KEY=your_gemini_key_here
```

### 4️⃣ **Run Locally (3 min)**
```bash
npm run install:all
npm run dev
# Open http://localhost:5173
```

### 5️⃣ **Deploy to Vercel (8 min)**
```bash
# Push to GitHub
git add .
git commit -m "Deploy to Vercel + Supabase"
git push origin main

# Go to https://vercel.com/new
# Import your GitHub repo
# Add env vars from your .env
# Click Deploy
```

---

## 📋 What's Included

### Frontend (React + Vite)
- ✅ Job evaluation (Career Ops)
- ✅ Email generation (AI-powered)
- ✅ Job board search
- ✅ Auto-apply automation
- ✅ Resume management
- ✅ Outreach tracking

### Backend (Vercel Serverless)
- ✅ `/api/career/evaluate` — Job evaluation
- ✅ `/api/generate/email` — Email generation
- ✅ `/api/automations/auto-apply` — Browser automation
- ✅ `/api/credits/status` — API quota tracking
- ✅ `/api/health` — Health check

### Database (Supabase PostgreSQL)
- ✅ User profiles
- ✅ Job listings
- ✅ Evaluations
- ✅ Contacts
- ✅ Companies
- ✅ Activity logs

---

## 🔑 Required API Keys

### Must Have
- **Gemini API Key** — Free at [makersuite.google.com](https://makersuite.google.com)
  - Used for job evaluation and email generation
  - Free tier: 60 calls/minute

### Nice to Have
- **Anthropic (Claude)** — [console.anthropic.com](https://console.anthropic.com)
- **OpenAI** — [platform.openai.com](https://platform.openai.com)
- **Hunter.io** — Email validation
- **Apollo.io** — B2B data
- **Apify** — Web scraping

---

## ✅ Quick Verification

After deployment, test these:

```bash
# 1. Health check
curl https://yourapp.vercel.app/api/health

# 2. In browser (DevTools F12)
http://localhost:5173/

# 3. Try: Profile → Evaluate a job → Check Supabase dashboard
```

---

## 📚 Full Docs

- **DEPLOYMENT.md** — Complete deployment guide
- **SUPABASE_SETUP.md** — Database schema & setup
- **frontend/README.md** — Frontend architecture
- **.env.example** — All configuration options

---

## 🆘 Common Issues

| Error | Solution |
|-------|----------|
| `SUPABASE_URL is undefined` | Check `.env` has values, restart dev server |
| `Database connection error` | Verify Supabase project is active, check credentials |
| `API key returning 401` | Re-copy key from provider dashboard (may be truncated) |
| `Build fails on Vercel` | Run `npm run build` locally to test, check logs |

---

## 🎯 Next Steps

1. ✅ Follow steps 1-4 above (local setup)
2. ✅ Test in browser: fill profile → evaluate a job
3. ✅ Check data in Supabase dashboard (Table Editor)
4. ✅ Deploy to Vercel (step 5)
5. ✅ Test in production: same flows on Vercel URL
6. 📊 Monitor: Vercel dashboard + Supabase stats

---

## 💡 Tips

- **Free Tier**: Vercel + Supabase free tiers work great for personal use
- **First API Call**: Might take 3-5 sec (serverless cold start), then instant
- **Auto-Apply**: Requires Playwright; works best on Lever/Greenhouse forms
- **Backups**: Enable in Supabase Pro ($25/month) for production

---

**Ready? Start with step 1️⃣ above!**
