# OutreachOS — Local Edition

This is a **standalone copy** of OutreachOS restored to the pre-Vercel/Supabase state (commit `b632988`). It runs entirely on your machine against the local Express + sqlite backend. No Supabase, no deployment, no rate limits.

Your production Vercel deploy lives at the main `email tracker/` folder next door and is untouched by anything here.

## First-time setup (one-shot)

```bash
cd "/Users/lakshmisravyarachakonda/VS CODE/outreach-local"
bash setup.sh
```

That installs both `frontend/` and `backend/` npm dependencies and creates the sqlite data directory. Takes ~60-90 seconds.

If `setup.sh` errors on `.env.example`, ignore — `.env` is already in place (copied from your working tracker).

## Running

**Two terminals:**

Terminal 1 (backend):
```bash
cd "/Users/lakshmisravyarachakonda/VS CODE/outreach-local/backend"
npm run dev
# → Backend on port 3001
```

Terminal 2 (frontend):
```bash
cd "/Users/lakshmisravyarachakonda/VS CODE/outreach-local/frontend"
npm run dev
# → Vite dev server at http://localhost:5173
```

Open http://localhost:5173 — frontend auto-proxies `/api/*` to the Express backend.

## What works here that doesn't on Vercel

- Auto-Apply via Playwright
- Full per-company scrape-roles (Workday, Apple, Greenhouse, Lever, Ashby, Serper fallback, direct HTML parse)
- Bulk refresh cron
- Any request > 60s (no serverless timeout)
- Resume PDF parse + tailored resume generation
- Documents upload per company
- Everything your local was doing before the migration

## Data

Local sqlite file: `backend/data/outreach.db` (created on first run). Completely separate from your Supabase Vercel data — you can experiment freely here.

## Git branch

This folder is a git worktree on branch `local-backup`, pinned to commit `b632988` (the pre-migration state). To get back to the tracker folder:

```bash
cd "/Users/lakshmisravyarachakonda/VS CODE/email tracker"
git branch  # you'll still be on main
```

Do **not** delete this folder via `rm -rf` — use `git worktree remove` from the main tracker if you ever want to clean it up:

```bash
cd "/Users/lakshmisravyarachakonda/VS CODE/email tracker"
git worktree remove ../outreach-local
```
