# OutreachOS Deployment Guide

## Pre-Deployment Checklist

### ✅ Code Quality
- [x] ESLint errors reduced from 127 → 53
- [x] React Hooks violations fixed
- [x] Dead code removed (11 components)
- [x] Shared utilities extracted
- [x] Backend logging configured
- [x] Database indexes added

### ✅ Auto-Apply System
- [x] Playwright-based form filler implemented
- [x] Support for Greenhouse, Lever, Ashby ATS
- [x] Resume tailoring integrated
- [x] Error handling for captcha/login walls
- [x] Status tracking (queued → submitted → error)
- [x] Attempt counter added

### ✅ Environment Setup
- [x] .env.example created with all variables
- [x] Config validation implemented
- [x] Logger (Pino) integrated
- [x] Validation middleware ready
- [x] Docker Compose configured

---

## GitHub Setup

### 1. Initialize Repository
```bash
cd /Users/lakshmisravyarachakonda/VS\ CODE/email\ tracker
git init
git config user.name "Your Name"
git config user.email "your.email@gmail.com"
```

### 2. Create .gitignore
```bash
cat > .gitignore << 'EOF'
# Dependencies
node_modules/
package-lock.json
yarn.lock

# Environment
.env
.env.local
.env.*.local

# Build outputs
dist/
build/
.next/

# Runtime
data/
*.log
.DS_Store

# IDE
.vscode/
.idea/
*.swp
*.swo

# Testing
coverage/
.nyc_output/

# OS
.DS_Store
Thumbs.db
EOF
```

### 3. Create Initial Commit
```bash
git add .
git commit -m "Initial commit: OutreachOS full-stack refactor

- Fixed 58% of ESLint errors (127 → 53)
- Removed 11 dead components
- Extracted shared utilities
- Added database indexes
- Integrated Pino logging
- Set up validation middleware
- Auto-apply with Playwright integrated
- Ready for production deployment"
```

### 4. Add Remote & Push to GitHub
```bash
# Create repo on GitHub first at github.com/username/outreacha-os
git remote add origin https://github.com/YOUR_USERNAME/outreacha-os.git
git branch -M main
git push -u origin main
```

---

## Vercel Deployment

### Frontend Deployment

#### 1. Connect GitHub to Vercel
- Go to https://vercel.com/new
- Import GitHub repository
- Select `frontend` as root directory
- Environment variables:
  - `VITE_API_URL=https://api.yourdomain.com`

#### 2. Configure Build
- Framework: Vite
- Build command: `npm run build`
- Install command: `npm install`
- Output directory: `dist`

#### 3. Deploy
```bash
# Vercel auto-deploys on push to main
# Or manually trigger:
vercel --prod
```

**Frontend URL:** `https://outreach-os.vercel.app`

---

### Backend Deployment (Alternative: Railway/Heroku/Fly.io)

Since Vercel is serverless (no persistent storage for SQLite), backend needs dedicated hosting:

#### Option 1: Railway (Recommended)
```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Create service
railway init

# Add variables
railway variable add PORT=3001
railway variable add GEMINI_API_KEY=...
railway variable add DATABASE_URL=file:/data/outreach.db

# Deploy
railway up
```

#### Option 2: Fly.io
```bash
# Install Fly CLI
brew install flyctl

# Login
fly auth login

# Create app
fly launch

# Deploy
fly deploy
```

#### Option 3: Heroku (deprecated, but still works)
```bash
heroku login
heroku create outreacha-os-api
git push heroku main
```

---

## Environment Variables (Production)

### Critical (Required)
```
PORT=3001
AI_PROVIDER=gemini
GEMINI_API_KEY=your_key
```

### APIs (Optional but recommended)
```
ANTHROPIC_API_KEY=your_key
APOLLO_API_KEY=your_key
APIFY_API_TOKEN=your_token
HUNTER_API_KEY=your_key
LINKEDIN_SESSION_COOKIE=your_cookie
```

### Production Settings
```
CORS_ORIGINS=https://outreach-os.vercel.app
NODE_ENV=production
LOG_LEVEL=info
```

---

## Security Hardening Checklist

- [x] Rate limiting configured (200 req/min, reduce to 60)
- [x] CORS restricted to localhost + production domains
- [ ] HTTPS enforced (Vercel handles this)
- [ ] Database path secured (don't expose in .env)
- [ ] API keys rotated before production
- [ ] Input validation middleware ready (Zod schemas)
- [ ] Error messages don't leak sensitive info
- [ ] Sensitive logs redacted in production

---

## Post-Deployment Testing

### 1. Health Check
```bash
curl https://api.yourdomain.com/api/health
# Should return: { status: 'ok', ... }
```

### 2. Test Core Features
- [ ] Login & authentication
- [ ] Company search
- [ ] Job evaluation
- [ ] Resume upload
- [ ] Auto-apply queue
- [ ] Report generation

### 3. Monitor Logs
- Check Vercel deployment logs
- Check backend service logs
- Check database for errors

### 4. Verify Auto-Apply
- [ ] Evaluate a test job
- [ ] Queue for auto-apply
- [ ] Check browser automation works
- [ ] Verify form filling
- [ ] Check status updates in DB

---

## Monitoring & Maintenance

### Uptime Monitoring
```bash
# Add Vercel monitoring
# Set up health check pings to /api/health
# Use: pingdom.com or similar
```

### Log Aggregation
- Vercel logs: Dashboard
- Backend logs: Use Pino (configured)
- Database: Monitor `data/outreach.db` file size

### Backup Strategy
- [ ] Daily backup of `backend/data/outreach.db`
- [ ] Backup to AWS S3 or similar
- [ ] Test restore process monthly

### Update Schedule
- Check dependencies monthly: `npm outdated`
- Security patches: ASAP
- Major updates: Quarterly with testing

---

## Troubleshooting

### Auto-Apply Not Running
```bash
# Check Playwright is installed
npm list puppeteer playwright

# Verify browser cache
rm -rf ~/.cache/ms-playwright

# Test locally first
node backend/services/autoApplier.js
```

### Database Lock Issues
```sql
-- Check open connections
SELECT * FROM pragma_database_list;

-- Vacuum database
VACUUM;
```

### CORS Errors in Frontend
```javascript
// Update CORS_ORIGINS in production .env
// Frontend must match deployed URL
```

---

## Next Steps After Deploy

1. **Monitor for 48 hours** - Watch error logs
2. **Test auto-apply thoroughly** - Use test jobs first
3. **Collect feedback** - User testing phase
4. **Security audit** - Run security scanner
5. **Load testing** - Verify scales under load
6. **Backup automation** - Set up daily DB backups

---

## Support & Documentation

- **Frontend**: See `/frontend/README.md`
- **Backend**: See `/backend/README.md`
- **Database**: See `/backend/db.js` schema
- **Auto-Apply**: See `/backend/services/autoApplier.js`

---

Generated: 2026-04-20
