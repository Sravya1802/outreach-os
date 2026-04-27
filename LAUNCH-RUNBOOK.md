# Launch Runbook — finishing pre-launch hardening

Code is committed and pushed (commit `9692e11` on `main`). This document is the
copy-paste sequence to finish steps 1–6. Total hands-on time: ~25 minutes if
nothing goes wrong, plus the e2e + mobile QA.

**Order matters.** Migrations first (idempotent, low risk), then VM deploy,
then verification. Do NOT pm2-restart before migrations — the new code expects
the new column / index to exist.

---

## Step 1 — Apply migrations 009 + 010 to Supabase

### Why this comes first
- Migration 009 adds a partial unique index. Safe even with old code running.
- Migration 010 adds the `auto_apply_paused` column. New code reads it; old code ignores it. Backwards-compatible.
- Both are idempotent (`IF NOT EXISTS`), so re-running is a no-op.

### How to do it (no `DATABASE_URL` needed — easiest path)

1. Open [https://supabase.com/dashboard](https://supabase.com/dashboard).
2. Select your OutreachOS project.
3. Left sidebar → **SQL Editor** → **New query**.
4. Paste this entire block and click **Run**:

```sql
-- 009: prevent double-applying to the same job for the same user
CREATE UNIQUE INDEX IF NOT EXISTS evaluations_submitted_unique
  ON public.evaluations (user_id, job_url)
  WHERE apply_status = 'submitted';

-- 010: soft-pause flag (separate from consent withdrawal)
ALTER TABLE public.user_profile
  ADD COLUMN IF NOT EXISTS auto_apply_paused INT DEFAULT 0;

-- Sanity-check: both should appear
SELECT indexname FROM pg_indexes WHERE indexname = 'evaluations_submitted_unique';
SELECT column_name FROM information_schema.columns
  WHERE table_name = 'user_profile' AND column_name = 'auto_apply_paused';
```

5. Expect 2 rows in the final two `SELECT`s. If both rows return, you're done with step 1.
6. If you see `ERROR:  could not create unique index ... duplicate key value`, that means the live DB already has a `(user_id, job_url, submitted)` collision. Fix it before retrying:

```sql
-- Find the duplicates
SELECT user_id, job_url, count(*) FROM evaluations
  WHERE apply_status = 'submitted'
  GROUP BY user_id, job_url HAVING count(*) > 1;
-- Then keep the earliest, mark the rest as 'duplicate':
-- UPDATE evaluations SET apply_status = 'duplicate' WHERE id IN (... the dup ids except min ...);
```

---

## Step 2 — Deploy the new code on the Oracle VM

### What you'll need
- SSH to `ubuntu@140.245.15.56` (or whatever user you set up — check `ssh ubuntu@140.245.15.56` first; if that fails try `opc@`).
- The VM should already have the repo cloned somewhere — likely `/home/ubuntu/email-tracker` or similar based on past handoffs. `pwd` after SSH will tell you.

### Commands to run on the VM

```bash
# 1. SSH in
ssh ubuntu@140.245.15.56

# 2. Find the repo
cd ~/email-tracker   # adjust if your path differs

# 3. Pull the new commit
git fetch origin
git log --oneline -3        # confirm 9692e11 is on origin/main
git pull origin main

# 4. Confirm no new dependencies (this commit added no new packages)
#    If `git diff e42c957 9692e11 -- backend/package.json` shows no diff, skip npm install.
git diff e42c957 9692e11 -- backend/package.json frontend/package.json
# If empty: skip. If anything changed:
# (cd backend && npm install) && (cd frontend && npm install)

# 5. Update backend env (.env file location — usually backend/.env on the VM)
nano backend/.env
# Add or confirm these two lines exist:
#   NODE_ENV=production
#   AUTH_MODE=enforce
# Save (Ctrl+O, Enter, Ctrl+X)

# 6. Sanity-check that the file parses with the new boot guard BEFORE restarting pm2
node --check backend/middleware/requireAuth.js
node --check backend/server.js
# Both should print nothing and exit 0.

# 7. Restart pm2
pm2 list                    # see what's running — usually one process
pm2 restart all
pm2 logs --lines 40         # watch for boot
# Expect: "[auth] middleware ready — mode=enforce, jwks=..."
# If you see "refusing to start: NODE_ENV=production but AUTH_MODE=..." → the
# boot guard is working but your .env didn't take effect. Fix .env and re-restart.
# Press Ctrl+C to leave the log tail.
```

### Frontend deploy (Vercel)

The frontend redeploys automatically on push to `main` if your Vercel project is connected to GitHub. Check the Vercel dashboard — there should be a build kicking off for commit `9692e11`. Once it goes green, hard-refresh the site and confirm:
- The "Currently US-only" banner shows on the login page.
- A "Forgot password?" link appears under the password sign-in form.

If your Vercel project isn't auto-deploying, run `vercel --prod` from the `frontend/` directory locally.

---

## Step 3 — Run `verify-migrations` against the live DB

### Where to get `DATABASE_URL`

1. Supabase dashboard → your project → **Project Settings** (gear icon, bottom-left).
2. Left submenu: **Database**.
3. Scroll to **Connection string** → **URI** tab.
4. Pick the **Session pooler** connection (port 5432, region `aws-1-us-east-1` per your handoff).
5. Click "Reveal" / copy the URI. It looks like:
   `postgresql://postgres.<project-ref>:<password>@aws-1-us-east-1.pooler.supabase.com:5432/postgres`
6. **Don't paste the password into the URL if your password has special chars** — URL-encode them or use the `psql` env-var form instead.

### Running the verifier

From your laptop (not the VM — the script is in the repo):

```bash
cd "/Users/lakshmisravyarachakonda/VS CODE/email tracker"
DATABASE_URL='postgresql://postgres.xxx:yourpw@aws-1-us-east-1.pooler.supabase.com:5432/postgres' \
  npm run verify-migrations
```

Expect:

```
Running 4 schema-invariant checks…

✓ user_id IS NOT NULL on per-user tables
✓ user_id has no DEFAULT (migration 007 applied)
✓ RLS enabled on per-user tables
✓ expected per-user UNIQUE indexes exist

All checks passed.
```

If the last check fails with "got 6 rows" instead of 7, migration 009 didn't apply — go back to step 1.

---

## Step 4 — Run the e2e suite

### Where to get the e2e creds

These are stored in your repo's `.env` files OR previously set in your shell. From `tests/` past usage:

- `E2E_TEST_EMAIL` and `E2E_TEST_PASSWORD` are the credentials of a real Supabase auth user dedicated to testing. If you don't have one yet:
  1. Supabase dashboard → **Authentication** → **Users** → **Add user** → **Create new user** with a fake email like `e2e+test@yourdomain.com` and a strong password.
  2. Note the email + password — those become `E2E_TEST_EMAIL` / `E2E_TEST_PASSWORD`.

- `E2E_REFRESH_TOKEN` is obtained by logging that user in once and grabbing their refresh token:
  ```bash
  # Replace the values inline:
  curl -s -X POST "https://<your-supabase-ref>.supabase.co/auth/v1/token?grant_type=password" \
    -H "apikey: <your-anon-key>" \
    -H "Content-Type: application/json" \
    -d '{"email":"e2e+test@yourdomain.com","password":"your-strong-pw"}' \
    | jq -r .refresh_token
  ```
  - `<your-supabase-ref>` is the part of `SUPABASE_URL` before `.supabase.co`.
  - `<your-anon-key>` is `VITE_SUPABASE_ANON_KEY` from your `.env`.

### Running the suite

```bash
cd "/Users/lakshmisravyarachakonda/VS CODE/email tracker"
E2E_REFRESH_TOKEN='<refresh-token-from-above>' \
E2E_TEST_EMAIL='e2e+test@yourdomain.com' \
E2E_TEST_PASSWORD='your-strong-pw' \
  npm run test:e2e
```

If specs fail because of the new pause toggle or `/reset-password` route, that's a real test gap — let me know and I'll update the specs.

---

## Step 5 — Verify production state

After steps 1–2 are done:

```bash
# Health check — expect auth_mode: enforce AND nightly_cron_disabled present (proves new code shipped)
curl -s https://outreach-jt.duckdns.org/api/health | jq

# Auth still rejecting unauth requests
curl -s -o /dev/null -w "no-token: %{http_code}\n" \
  https://outreach-jt.duckdns.org/api/career/profile
# Expect 401
```

If `nightly_cron_disabled` is missing from the JSON, your VM hasn't pulled the new code yet — go back to step 2.

### Smoke-test the new features in the browser

1. Log out, click **Forgot password?** → enter your email → check inbox for a Supabase recovery email → click link → confirm `/reset-password` page loads → set a new password → confirm sign-in works with the new one.
2. Log in → **Auto Apply → Setup** → tick **Pause Auto Apply** → save → try **Run Auto-Apply Queue**. Expect the run to refuse with "Auto Apply is paused." Untick → save → confirm runs work again.
3. Resize the browser to <900px wide (or open on a phone). The yellow "Optimized for desktop" banner should appear, dismissable.

---

## Step 6 — Mobile QA on real devices

I can't do this; it needs a phone in your hand. The minimum bar before letting users in:

1. Open `https://outreach-jt.vercel.app` (or your prod frontend URL) on iPhone Safari + Android Chrome.
2. Sign in. Check these 5 routes don't have unreadable overflow:
   - `/dashboard`
   - `/discover/companies`
   - `/apply/auto-apply`
   - `/discover/evaluate` (Career Ops)
   - `/job-dashboard`
3. If anything overflows badly, the mobile banner I added at least warns the user — but you may want to add a stronger "open on desktop" gate for now.

---

## When all six are done

Update [HANDOFF.md](HANDOFF.md) — add a Session log entry confirming "deployed + verified" so the next session knows the work landed.

## If anything goes wrong

- **Backend won't start after step 2**: pm2 logs will show the boot error. Most likely cause is the new boot guard refusing to start because `.env` didn't pick up `AUTH_MODE=enforce`. Fix the `.env` and `pm2 restart all`.
- **Migration 009 fails on duplicates**: the SQL block in step 1 has a fallback query to find them. Ping me with the output and I'll write the cleanup.
- **e2e fails on new auth flow**: the spec hasn't been updated for the new modes yet. Tell me which spec failed and I'll patch.
