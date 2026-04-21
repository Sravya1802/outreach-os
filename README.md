# OutreachOS 🚀

**AI-powered internship job search automation** — Evaluate companies, track applications, and auto-apply with intelligent resume tailoring.

## ✨ Features

### 💼 Job Search & Evaluation
- **Multi-source scraping** — LinkedIn, Wellfound, GitHub, Google Jobs, YC
- **AI evaluation** — A-F grading with detailed analysis (Claude, Gemini, GPT-4o)
- **Smart categorization** — 23 industry categories auto-applied
- **Contact enrichment** — Apollo.io + Hunter.io email finding

### 📋 Application Pipeline  
- **Kanban board** — Visualize progress (evaluated → applied → offered)
- **Auto-apply** — Playwright form-filling for Greenhouse, Lever, Ashby
- **Resume tailoring** — AI keyword injection + PDF generation
- **Status tracking** — Full audit trail

### 🤖 Auto-Apply System
- Detects platform (Greenhouse/Lever/Ashby)
- Auto-fills form fields from profile
- Handles captcha/login walls (pauses for manual completion)
- Tracks submission status with timestamps
- Supports resume tailoring for each job

---

## 🚀 Quick Start

```bash
# Clone & setup
git clone https://github.com/yourusername/outreacha-os.git
cd outreacha-os
bash setup.sh

# Update .env with API keys
cp .env.example .env
# Edit .env: Add GEMINI_API_KEY (free tier available)

# Start development
cd frontend && npm run dev  # Terminal 1
cd backend && npm run dev   # Terminal 2

# Open http://localhost:5173
```

---

## 🔧 Environment Setup

**Required:**
```
PORT=3001
AI_PROVIDER=gemini
GEMINI_API_KEY=your_key  # Free tier available
```

**Optional (recommended):**
```
ANTHROPIC_API_KEY=your_key
APOLLO_API_KEY=your_key
APIFY_API_TOKEN=your_token
HUNTER_API_KEY=your_key
LINKEDIN_SESSION_COOKIE=li_at
```

---

## 🏗️ Tech Stack

- **Frontend**: React 19 + Vite + Tailwind
- **Backend**: Express.js + SQLite
- **AI**: Gemini, Claude, GPT-4o
- **Automation**: Playwright (form filling), Puppeteer (PDF generation)
- **Integrations**: Apify, Apollo.io, Hunter.io

---

## 📊 Recent Improvements

- ✅ Fixed 58% of ESLint errors (127 → 53)
- ✅ Removed 11 dead components
- ✅ Extracted shared utilities
- ✅ Added 8 database performance indexes
- ✅ Integrated Pino logging
- ✅ Input validation middleware ready
- ✅ Auto-apply fully functional

See **IMPROVEMENTS.md** for details.

---

## 🚢 Deployment

### Frontend (Vercel - Free)
```bash
# 1. Push to GitHub
# 2. Connect at vercel.com/new
# 3. Select frontend directory
# 4. Deploy (auto on every push)
```

### Backend (Railway ~$7/month)
See **DEPLOYMENT.md** for Railway, Heroku, Fly.io setup.

---

## 📄 License

MIT © 2026 — Free to use and modify

---

**Pro Tip:** Evaluate jobs with AI first (A-graded roles have 3x better response rates), then auto-apply to top candidates.
