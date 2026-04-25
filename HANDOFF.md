# Handoff prompt — paste this into a new Claude session

I'm continuing work on **OutreachOS** — AI-powered job-search automation. Memory files in `~/.claude/projects/-Users-lakshmisravyarachakonda-VS-CODE-email-tracker/memory/` will auto-load. Key context follows; please confirm you can access memory + the working dirs before we begin.

---

## Stack & deployment (live as of 2026-04-25)

```
Vercel (outreach-jt.vercel.app)
   │  static React SPA, sends Bearer <jwt> on every /api/* call
   ▼
Oracle Cloud Always Free VM (140.245.15.56 → outreach-jt.duckdns.org)
   │  Express + pm2 + nginx + Let's Encrypt SSL
   │  Playwright for auto-apply, Puppeteer for PDFs
   │  Auth: ES256 JWKS verify, AUTH_MODE=enforce
   ▼
Supabase Postgres 17.6 (session pooler: aws-1-us-east-1)
```

- Frontend repo: `/Users/lakshmisravyarachakonda/VS CODE/email tracker` (branch: `main`)
- Backend worktree: `/Users/lakshmisravyarachakonda/VS CODE/outreach-local` (branch: `phase-4-pg` — VM tracks this)
- Repo: `https://github.com/Sravya1802/outreach-os` (PUBLIC — flagged in memory: still has historical PII commits, recommend rewriting history or going private)

## Accounts

- **`lakshmisravyar@gmail.com`** (UUID `70df2946-a46e-4b63-832c-2822cda4cf4b`) — owns ALL existing production data: 1499 companies, 36 job_contacts (14 with email), 2 evaluations, resume text, 6 role-archetype PDFs in `/home/ubuntu/outreach/resumes/`.
- **`rls180202@gmail.com`** (UUID `459b9b5b-1f86-48cf-9b8a-98e7a4fb4c5d`) — empty / clean-slate account.
- Per-user isolation is enforced — each account sees ONLY its own data via RLS + backend `WHERE user_id = req.user.id` on every query.

## Migrations applied to Supabase

- `001_init.sql` (legacy)
- `002_backend_schema.sql` — full canonical schema (13 tables + indexes + RLS + storage)
- `003_per_user_isolation.sql` — added `user_id UUID DEFAULT <founder>` to every table, backfilled, swapped RLS to `user_id = auth.uid()`
- `004_user_id_not_null.sql` — tightened user_id NOT NULL (kept DEFAULT for cron paths)

## Recent commits (main branch, latest first)

```
c2eabdb  perf(job dashboard): stale-while-revalidate cache for instant revisit
6cf20ad  ux(career ops): hide resume section on evaluate when already uploaded
7f42c6d  fix(companies): suppress 0-flicker before counts load
463f756  fix(companies): wire sort/source/status to backend + refetch on change
d853c01  docs: record vm backend deploy
a6fc28a  docs: record stats and apify status fixes
346c0b2  fix: show real contact and api status counts
…
```

phase-4-pg tip:
```
86eaeed  feat(unified/companies): server-side sort + source/status filters
53f0767  fix: deploy backend from phase branch
f929862  fix: report total contacts and apify quota status
624e6a3  perf: collapse N+1 count queries (4497→1 + 18→3)
f02ff10  Phase A.2: scope every DB query by req.user.id (17 files, 707/-480)
```

## Known gaps & open work

### Pending — needs my input or has an unfixed bug
1. **Outreach CRM "0 contacts"** — code fix is committed (`8a55549`) so `/outreach` now calls the JWT-attaching API wrapper. After Vercel deploy, verify as `lakshmisravyar@gmail.com` that `/outreach` shows 36 contacts (14 with email). If still empty, check Settings page → red Account box and DevTools Network `all-contacts` `Authorization` header.
2. **Email + DM templates** — placeholder page exists at `/outreach/templates`. I'll paste my preferred templates and you wire them into the AI prompt + populate the page.
3. **Role Eligibility / Ranked Roles loading bug** — code fix committed and pushed (`0d0e534`) to prevent blank render when `/career/ranked` returns score values as strings. After Vercel deploy, verify `/apply/ranked` opens and renders rows or an empty state.
4. **Sign in / Sign up UI** — currently one combined Login form, want a tabs-based UX.
5. **"Email rate limit exceeded" on magic link** — Supabase auth config issue, not code.

### Deferred / acknowledged
- Apify hit monthly limit → LinkedIn/Wellfound/Google Jobs scrapers blocked until reset. I'll update the Apify API key.
- ~~"Apify status card should turn red when limit hit"~~ — fixed in frontend `346c0b2` and backend `f929862`; VM deployed and public health check passed on 2026-04-25.
- ~~"Top Companies filter on Companies page is broken"~~ — fixed in frontend `463f756` + backend `86eaeed` (server-side sort + source/status filters). **Needs VM backend deploy.**
- ~~"Companies page shows 0 first then populates"~~ — fixed in `7f42c6d` (null-sentinel for catCounts so loading state is distinct from empty).
- ~~"Don't pre-load resume in Career Ops Evaluate"~~ — fixed in `6cf20ad` (Resume section now only renders on Auto-Apply Setup tab or when user has no resume).
- ~~"Job Dashboard slow to load"~~ — improved in `c2eabdb` (stale-while-revalidate sessionStorage cache, 5min TTL; instant first paint on revisit, background refresh).

### Architectural follow-ups (no urgency)
- Migration 005 to drop `user_id DEFAULT` after fixing 5 TODO(auth) markers in cron/startup paths (server.js daily refresh, jobs.js runReclassifyUnclassified, autoApplier comment).
- "System user" concept for background paths that genuinely have no request context.

## How I work

- Auto mode: usually ON — execute autonomously on low-risk work. Off for big architectural calls.
- Memory rules I've internalized:
  - **No Claude attribution** in commits / PR bodies / code (no `Co-Authored-By`, no 🤖 footers).
  - **Disambiguate ambiguous "yes"/"go"** on multi-option prompts before acting on destructive branches.
  - **Never `git reset --hard` with a dirty tree** — stash first, always.
- Sandbox blocks: writing credentials to VM .env, force-pushing to main, broad credential probes. I ask before those.

## What's likely next

If the session resumes my work as of this snapshot:
1. **Browser-verify** Outreach CRM fix, Companies contact count, Apify red status, Auto Apply tab order, Completed tab, and `/apply/ranked` after Vercel finishes deploying `main`.
2. **Receive** email + DM templates → wire into `backend/services/ai.js` prompt + populate `/outreach/templates` UI with editable template store (per-user, in `meta` table).
3. **Receive** Role Eligibility DevTools error → fix.
4. **Quick wins**: Apify-status-red, Top-Companies-filter, Companies-flicker, Career-Ops-no-preload — these are 15-30 min each.

Confirm you can read `~/.claude/projects/-Users-lakshmisravyarachakonda-VS-CODE-email-tracker/memory/MEMORY.md` and the auto-loaded memory files, then ask me which item I want to start with.

---

## ⚠️ Standing instruction to Claude (keep this HANDOFF.md alive)

**Every time you finish a unit of work — bug fix, new feature, diagnosis, branch state change — append a dated entry to the "Session log" below BEFORE ending your turn.** The user should never have to ask "what did you do so far?" — the answer always lives here.

Entry format:
```
### YYYY-MM-DD — <short title>
- **What:** 1–2 lines on the change
- **Files:** file.ext:line(s)
- **Status:** committed / uncommitted / branch name / not yet tested / verified working
- **Follow-up:** anything the next session needs to pick up
```

Also update the "Known gaps" section above when an item is resolved (strike through + move to "Session log") or when a new issue is uncovered.

---

## Session log

### 2026-04-25 — LinkedIn scraper actor schema realigned + burn detection extended (DEPLOYED)
- **What:** After the user's Apify key swap (`marbled_geothermal` → `charitable_raisin`), the burn errors stopped but every LinkedIn scrape still returned 0 — Apify changed two things on their side: (1) `bebity/linkedin-jobs-scraper` flipped from free-trial to paid-only, (2) `curious_coder/linkedin-jobs-scraper` changed input schema to require `urls: [...]` instead of `keyword`. The Job Scraper page calls `services/scraper.js` (separate from `services/apify.js`), and only `apify.js` had been updated to the new schemas. Patched `scraper.js`: primary actor → `valig` (free, keyword schema, was working pre-burn), fallback → `curious_coder` with new `urls` schema, dropped `bebity`. Also wired `noteApifyError` into all 4 actor catches in `scraper.js` (linkedin/wellfound/indeed/google_jobs) plus the central `runApifyActor` wrapper, so the sidebar burn indicator now covers BOTH scraper paths. Required adding `export` to `noteApifyError` in `apify.js` (forgot in `5660817`; first deploy crashed with `does not provide an export`).
- **Files:** [../outreach-local/backend/services/scraper.js:1](../outreach-local/backend/services/scraper.js#L1), [../outreach-local/backend/services/scraper.js:469](../outreach-local/backend/services/scraper.js#L469), [../outreach-local/backend/services/apify.js:30](../outreach-local/backend/services/apify.js#L30)
- **Status:** committed `phase-4-pg`: `d8bf3b4` + `fa28694`; live on VM (deploy script polled health check successfully on attempt 2 — proving the deploy-script polling fix from `c8c6d06` works in practice). Backend stable, pm2 PID 42411.
- **Follow-up:** User should retry LinkedIn scrape from the Job Scraper page. If valig works on the new account, expect new companies. If it still 0s, the new account may already be quota-limited (Apify FREE tier's $5 monthly cap is small) — the sidebar Apify dot will go red within seconds and we know the burn detection now covers `scraper.js` too.

### 2026-04-25 — VM Apify token swap (user-side)
- **What:** User pasted the new `apify_api_kzd...` token (`charitable_raisin` account) and the VM .env was updated (likely user-side; my SSH sed was sandbox-blocked but the VM logs subsequently showed the new account responding). Old `marbled_geothermal` quota-burn errors stopped appearing.
- **Status:** verified live — pm2 on `5660817` then later `fa28694`, Apify auth no longer 403s.
- **Follow-up:** New account is also FREE plan; will burn through actor credits eventually. Burn-detection sentinel will now flip the sidebar dot red the moment that happens (covers both apify.js and scraper.js paths).

### 2026-04-25 — Apify quota-burn surfaces in /credits/status (DEPLOYED)
- **What:** Apify's `/v2/users/me` reports the *account's* platform credit balance (reliably 0/0 on FREE accounts) — it doesn't expose the actor-side monthly limits that actually trip with `Monthly usage hard limit exceeded`. So `checkApify()` couldn't detect a burn and the sidebar Apify dot stayed green while every scrape failed silently. Fixed: module-level `apifyQuotaBurn` sentinel in `services/apify.js` is bumped by `noteApifyError(actor, err)` whenever an actor catch fires with a quota-shaped error (regex matches `hard limit|monthly usage|quota|exhausted|insufficient.*credit|402|payment required`). `creditChecker.checkAllCredits()` overlays this on top of the cached result every read — recent burns (<6h) flip `apify.critical = true` regardless of the 30-min result cache. Wired into all actor catch paths (linkedin, wellfound, people/linkedin, profile-scrape) plus `runActor()` itself as defense in depth.
- **Files:** [../outreach-local/backend/services/apify.js:13](../outreach-local/backend/services/apify.js#L13), [../outreach-local/backend/services/creditChecker.js:7](../outreach-local/backend/services/creditChecker.js#L7)
- **Status:** committed `phase-4-pg`: `5660817`; live on VM (verified `noteApifyError` × 7 in deployed apify.js, pm2 stable, `/api/health` ok).
- **Follow-up:** Sidebar Apify dot will turn red within seconds of the next quota-failed scrape. Stays red 6h post-burn (or until pm2 restart). No manual monitoring needed.

### 2026-04-25 — Sidebar rename + Apify scrape diagnosis
- **What:** User asked to rename sidebar "Evaluate a Role" to "Career Ops" since `/discover/evaluate` already houses the full Career Ops tab UI (Evaluate / Portal Scanner / Batch / History / Auto-Apply Setup). Single label change, route untouched.
- **Files:** [frontend/src/App.jsx:258](frontend/src/App.jsx#L258)
- **Status:** committed and pushed on `main`: `3e570ef`. Build passes.
- **Apify finding (open issue):** User reported "no jobs are getting scraped". Backend stderr shows `Monthly usage hard limit exceeded` on every Apify actor — LinkedIn (valig, bebity, curious_coder) AND Wellfound (curious_coder, clearpath, apify/rag-web-browser). New Apify token rotated to fresh `marbled_geothermal` FREE account validates against Apify API but `monthlyUsageLimitUsd` reports 0 — free tier credits insufficient for these actors. Greenhouse fallback IS working (returned 92 roles per logs at 03:11/03:13), so portal-scan paths still surface jobs. Real fix: upgrade Apify to a paid plan, switch to cheaper actors, or accept Greenhouse-only coverage. Not a code bug.
- **Follow-up:** Decision needed on Apify spend vs scrape coverage — if you want LinkedIn + Wellfound back, we need a paid plan or different actors.

### 2026-04-25 — Deploy script health-check race fixed
- **What:** User ran `update.sh` and got "Backend not healthy — connection refused" on localhost:3001 after pm2 restart. Backend was actually live (`/api/health` returned ok within seconds; pm2 process stable), so it was a script race: pm2 restart returns before Node binds the port. Replaced the one-shot `curl` with a 15-attempt × 2s poll (30s budget).
- **Files:** [../outreach-local/deploy/update.sh:59-71](../outreach-local/deploy/update.sh#L59-L71)
- **Status:** committed and pushed on `phase-4-pg`: `c8c6d06`. `bash -n deploy/update.sh` passed.
- **Follow-up:** The fix only applies to the deploy **after** the next one (since `update.sh` git-pulls into itself mid-run and the active shell already loaded the old script). The next run may still print the race error; the run after that will be clean.

### 2026-04-25 — VM redeploy with security fix
- **What:** User authorized + ran `update.sh` on VM. Fast-forwarded `phase-4-pg` from `86eaeed` → `54ddf62`, pm2 restarted. Script's localhost health check raced the boot (false alarm), but public `/api/health` returned ok and pm2 was stable at 34s.
- **Files:** [../outreach-local/backend/routes/careerOps.js:823](../outreach-local/backend/routes/careerOps.js#L823), [../outreach-local/backend/routes/careerOps.js:837](../outreach-local/backend/routes/careerOps.js#L837), [../outreach-local/backend/routes/jobs.js:1409](../outreach-local/backend/routes/jobs.js#L1409)
- **Status:** live on VM at commit `54ddf62`. The 3 JOIN scoping defenses are now in prod.
- **Follow-up:** Browser-verify `/apply/ranked` and Job Dashboard "Recent Evaluations" links still work as `lakshmisravyar`.

### 2026-04-25 — Full-app audit + 4 fixes
- **What:** End-to-end audit of repo state, builds, JWT coverage, per-user isolation, frontend↔backend contract, secret hygiene, and live VM. Fixed 4 issues uncovered.
  1. **JWT bypass** in [JobDashboard.jsx:192](frontend/src/components/JobDashboard.jsx#L192) — Recent Evaluations links rendered raw `<a href="/api/career/evaluations/X/report.html">` which 401s in enforce mode. Swapped to `api.career.reportHtmlUrl(e.id)` (same `withAuthQuery` helper used by CareerOps/Pipeline/CompanyDetail).
  2. **Per-user isolation** (defense-in-depth) — 3 queries JOIN'd `jobs` without `AND j.user_id = $X`. The driving table's user_id was scoped, so leakage required cross-user FK rows that shouldn't exist, but DB-level defense-in-depth was missing. Fixed in:
     - `GET /api/career/stats` — top-pick subquery
     - `GET /api/career/ranked` — ranked applications
     - `POST /api/jobs/contacts/:id/generate` — contact + company lookup
  3. Apify key on VM **validated** against `https://api.apify.com/v2/users/me`: length 46, prefix `apify_api_`, account `marbled_geothermal` (FREE plan). User did rotate the VM-side key (auto-generated username = fresh account). pm2 logs from earlier today still show "Monthly usage hard limit exceeded" on LinkedIn actors, but those pre-date the rotation; not yet retried post-restart.
  4. Lint debt unchanged — 47 errors are pre-existing `react-hooks/set-state-in-effect`, unused vars, `vite.config.js __dirname`. Documented as architectural follow-up, not addressed.
- **Audit clean:**
  - Frontend↔backend API contract: 80+ method/path pairs, zero mismatches.
  - Secret scan: `.env` properly gitignored in both repos. No tracked credentials, only documented test-account UUID `459b9b5b...` in HANDOFF (intentional). `deploy/env.template` uses placeholders.
  - Backend syntax sweep: every `.js` under `backend/` passes `node --check`.
  - Frontend build: passes (677kb bundle, gzipped 178kb — could be code-split, low priority).
  - Live VM: `pm2` stable, `/api/health` ok, `auth_mode=enforce`.
- **Files:** [frontend/src/components/JobDashboard.jsx:192](frontend/src/components/JobDashboard.jsx#L192), [../outreach-local/backend/routes/careerOps.js:823](../outreach-local/backend/routes/careerOps.js#L823), [../outreach-local/backend/routes/careerOps.js:837](../outreach-local/backend/routes/careerOps.js#L837), [../outreach-local/backend/routes/jobs.js:1409](../outreach-local/backend/routes/jobs.js#L1409)
- **Status:** committed and pushed. Frontend on `main`: `45128da`. Backend on `phase-4-pg`: `54ddf62`. Builds + node --check pass. **Backend NOT yet redeployed** — sandbox blocked the auto-deploy for newly-committed security changes; needs explicit user authorization.
- **Follow-up:** Run `sudo bash /home/ubuntu/outreach/deploy/update.sh` on VM to ship the 3 isolation fixes. After that, browser-verify (a) Job Dashboard "Recent Evaluations" links open the report instead of 401-ing, (b) `/apply/ranked` still loads as `lakshmisravyar`. Apify scraping: if it still fails, check Apify dashboard for actor-specific monthly limits (key itself is valid).

### 2026-04-25 — VM backend deploy for sort/filter fix
- **What:** Ran `sudo bash /home/ubuntu/outreach/deploy/update.sh` on the Mumbai VM (user-authorized SSH). Fast-forwarded `phase-4-pg` from `53f0767` → `86eaeed`, pm2 restarted `outreach-backend`. The in-script localhost health check raced the boot (connection-refused at 2s uptime), but the public `https://outreach-jt.duckdns.org/api/health` returned `{"status":"ok","auth_mode":"enforce"}` four seconds later and pm2 was stable at 22s/247mb.
- **Files:** [../outreach-local/backend/routes/unified.js:50](../outreach-local/backend/routes/unified.js#L50)
- **Status:** live on VM at commit `86eaeed`. Top Companies sort + source/status filters now active in prod.
- **Follow-up:** Note the deploy script's localhost-health-check still races boot — could bump to a 5s sleep + retry loop, or trust the public health check that runs separately. Low priority. Browser-verify `/companies/[category]` sort dropdown works across all pages.

### 2026-04-25 — Quick-wins sweep (4 deferred items)
- **What:** Cleared the four deferred green-pile items in one pass.
  1. **Top Companies filter** — sort dropdown only re-ordered the loaded 50 rows and `source`/`status` filter dropdowns were silently dropped by the backend. Added `sort` (hiring|contacts|recent|az|za) + `source` + `status` query params to `/api/unified/companies`, frontend now passes them and refetches via useEffect dep on `sortBy`.
  2. **Companies page 0-flicker** — initial render showed "0 companies" + every category card at "0" before stats/categoryCounts resolved. Switched `catCounts` initial state from `{}` to `null` so the renderer can distinguish "still loading" from "loaded empty"; show "Loading…" / "—" placeholders during load.
  3. **Career Ops resume preload** — "Your Resume" section was always visible at the top of every tab including Evaluate. Now only renders on Auto-Apply Setup tab or when user has no resume yet.
  4. **Job Dashboard perf** — first paint blocked on `/dashboard/job-metrics`. Added sessionStorage SWR cache (5min TTL): instant first paint on revisit, background refresh shown by spinner in Refresh button.
- **Files:** [../outreach-local/backend/routes/unified.js:50-95](../outreach-local/backend/routes/unified.js#L50-L95), [frontend/src/api.js:151](frontend/src/api.js#L151), [frontend/src/components/CategoryView.jsx:247](frontend/src/components/CategoryView.jsx#L247), [frontend/src/components/CompanyDashboard.jsx:47](frontend/src/components/CompanyDashboard.jsx#L47), [frontend/src/components/CareerOps.jsx:936](frontend/src/components/CareerOps.jsx#L936), [frontend/src/components/JobDashboard.jsx:48](frontend/src/components/JobDashboard.jsx#L48)
- **Status:** committed and pushed. Frontend on `main`: `463f756`, `7f42c6d`, `6cf20ad`, `c2eabdb`. Backend on `phase-4-pg`: `86eaeed`. `npm run build --prefix frontend` and `node --check backend/routes/unified.js` both passed. Not browser-tested.
- **Follow-up:** **VM backend deploy required** for Top Companies filter to actually work — `sudo bash /home/ubuntu/outreach/deploy/update.sh` on the Mumbai VM. Frontend already pushed; Vercel will auto-deploy. After both, browser-verify on `/companies/[category]` (sort dropdown should reshuffle results across all pages, not just current page) and on `/dashboard` (no "0 companies" flash before counts load).

### 2026-04-25 — VM backend deployed for stats + Apify status
- **What:** Fast-forwarded the Oracle VM checkout from the accidental `origin/local-backup` reset back to `origin/phase-4-pg`, restarted `pm2` app `outreach-backend`, and confirmed public backend health is `ok`.
- **Files:** [../outreach-local/backend/server.js:133](../outreach-local/backend/server.js#L133), [../outreach-local/backend/services/creditChecker.js:44](../outreach-local/backend/services/creditChecker.js#L44)
- **Status:** live VM is on `phase-4-pg` commit `f929862` for runtime code; `https://outreach-jt.duckdns.org/api/health` returned `{"status":"ok",...,"auth_mode":"enforce"}`.
- **Follow-up:** User should hard-refresh Vercel app and verify Companies contacts show total contact count/subtext and API Status marks Apify red or amber when quota/API failure is reported.

### 2026-04-25 — Backend deploy script corrected
- **What:** Fixed `deploy/update.sh` so future VM deploys fast-forward `origin/phase-4-pg` instead of resetting to `origin/local-backup`; dependency install now runs only when backend package files change and uses legacy peer handling for the existing OpenAI/Zod peer conflict.
- **Files:** [../outreach-local/deploy/update.sh:19](../outreach-local/deploy/update.sh#L19)
- **Status:** committed and pushed on `phase-4-pg`: `53f0767`; VM checkout also fast-forwarded to `53f0767`; `bash -n deploy/update.sh` passed; VM no-op deploy script run returned `Already up to date`.
- **Follow-up:** Future backend deploys can use `sudo bash /home/ubuntu/outreach/deploy/update.sh` again without rolling the VM back to `local-backup`.

### 2026-04-25 — Companies contacts count + Apify status
- **What:** Fixed misleading Companies/Dashboard contact stats by enriching frontend stats from job metrics and patched backend `/api/stats` to return total contacts plus email/LinkedIn counts. Wired API Status to `/api/credits/status` so Apify turns red on quota/error instead of green just because a token exists.
- **Files:** [frontend/src/api.js:70](frontend/src/api.js#L70), [frontend/src/components/CompanyDashboard.jsx:151](frontend/src/components/CompanyDashboard.jsx#L151), [frontend/src/App.jsx:130](frontend/src/App.jsx#L130), [../outreach-local/backend/server.js:133](../outreach-local/backend/server.js#L133), [../outreach-local/backend/services/creditChecker.js:44](../outreach-local/backend/services/creditChecker.js#L44)
- **Status:** frontend committed on `main`: `346c0b2`; backend committed on `phase-4-pg`: `f929862`; `npm run build --prefix frontend`, `node --check backend/server.js`, and `node --check backend/services/creditChecker.js` passed.
- **Follow-up:** Branches were pushed and VM backend was deployed later on 2026-04-25. Browser-verify after Vercel deploy.

### 2026-04-25 — Ranked Roles blank page + Completed tab order
- **What:** Moved Auto Apply `Completed` tab after `History`. Hardened `/apply/ranked` against backend score values arriving as strings by normalizing `fit_score`, response shape, average score, best-match, and score rendering.
- **Files:** [frontend/src/components/AutoApplyPage.jsx:5](frontend/src/components/AutoApplyPage.jsx#L5), [frontend/src/components/CareerOpsPage.jsx:19](frontend/src/components/CareerOpsPage.jsx#L19)
- **Status:** committed and pushed on `main`: `0d0e534`; `npm run build --prefix frontend` passed; not yet browser-confirmed by user.
- **Follow-up:** After Vercel deploy, hard-refresh and verify `/apply/ranked` plus Auto Apply tab ordering.

### 2026-04-25 — Apply nav overlay fix pushed
- **What:** Pushed the sidebar overlay fix and handoff update to `origin/main`.
- **Files:** [frontend/src/App.jsx:210](frontend/src/App.jsx#L210), [HANDOFF.md:116](HANDOFF.md#L116)
- **Status:** pushed to `origin/main`; local branch matches remote except unrelated untracked files.
- **Follow-up:** Wait for Vercel deploy, hard-refresh the app, and retry the Apply nav items.

### 2026-04-25 — Apply sidebar clicks blocked by overlay
- **What:** User reported Apply nav items were not opening. Live Vercel routes returned 200 and the deployed JS contained the Apply routes, so patched the sidebar to sit above non-modal content overlays that can intercept clicks.
- **Files:** [frontend/src/App.jsx:210](frontend/src/App.jsx#L210)
- **Status:** committed and pushed on `main`: `fcb908b`; `npm run build --prefix frontend` passed; not yet browser-confirmed by user.
- **Follow-up:** After Vercel deploy, user should hard-refresh and retry `/apply/auto-apply`, `/apply/pipeline`, and `/apply/ranked`.

### 2026-04-25 — Push state revalidated
- **What:** Rechecked `git status`, `git log --oneline -6`, and `git push origin main` after a stale handoff said `main` was still 4 commits ahead. GitHub was already up to date.
- **Files:** [HANDOFF.md:38](HANDOFF.md#L38)
- **Status:** committed on `main` as a handoff-only update; unrelated untracked files remain: `PLAN-B.txt`, `supabase/migrations/002_backend_schema.sql`, `supabase/migrations/003_per_user_isolation.sql`.
- **Follow-up:** Browser-verify `/outreach` and `/apply/auto-apply` after Vercel deployment.

### 2026-04-25 — Main pushed after Auto Apply work
- **What:** Pushed `main` to GitHub after rebasing local Outreach/Completed/HANDOFF commits on top of the remote Phase C commit (`bfcea63`).
- **Files:** [HANDOFF.md:38](HANDOFF.md#L38)
- **Status:** pushed to `origin/main` through `bc996ce`; local worktree still has unrelated untracked files `PLAN-B.txt`, `supabase/migrations/002_backend_schema.sql`, and `supabase/migrations/003_per_user_isolation.sql`.
- **Follow-up:** Wait for Vercel deployment, then verify `/outreach` and `/apply/auto-apply` in browser.

### 2026-04-25 — Outreach fix committed + Phase C linearized onto main
- **What:** Committed the Outreach CRM JWT-fetch fix, then replayed local work on top of remote `main` after GitHub advanced to Phase C (`bfcea63`) during the session.
- **Files:** [frontend/src/components/OutreachPage.jsx:34](frontend/src/components/OutreachPage.jsx#L34), [HANDOFF.md:38](HANDOFF.md#L38)
- **Status:** committed and pushed on `main`: `8a55549`; Phase C is now in `main` via `bfcea63`; not browser-tested.
- **Follow-up:** Verify `/outreach` on the deployed Vercel app after deployment.

### 2026-04-25 — Auto Apply Completed tab
- **What:** Added a `Completed` tab to `/apply/auto-apply`. It reads `api.career.pipeline()`, filters `apply_status === 'submitted'`, and shows submitted roles sorted by applied date.
- **Files:** [frontend/src/components/AutoApplyPage.jsx:5](frontend/src/components/AutoApplyPage.jsx#L5), [frontend/src/components/AutoApplyPage.jsx:177](frontend/src/components/AutoApplyPage.jsx#L177)
- **Status:** committed and pushed on `main`: `b3bc61c`; `npm run build --prefix frontend` passed. Full `npm run lint --prefix frontend` still fails on pre-existing repo lint debt (`react-hooks/set-state-in-effect`, unused vars, empty catches, `vite.config.js` `__dirname`).
- **Follow-up:** Verify the Completed tab in browser after Vercel deploy.

### 2026-04-25 — Context refresh + memory confirmation
- **What:** Read `HANDOFF.md`, confirmed `MEMORY.md` and `feedback_keep_handoff_updated.md` are accessible, and checked frontend/backend worktree state.
- **Files:** [HANDOFF.md:1](HANDOFF.md#L1), `/Users/lakshmisravyarachakonda/.claude/projects/-Users-lakshmisravyarachakonda-VS-CODE-email-tracker/memory/MEMORY.md`, `/Users/lakshmisravyarachakonda/.claude/projects/-Users-lakshmisravyarachakonda-VS-CODE-email-tracker/memory/feedback_keep_handoff_updated.md`
- **Status:** included in `8a55549` after `HANDOFF.md` was added to git; backend worktree is on `phase-4-pg`.
- **Follow-up:** Keep appending dated entries before ending each unit of work.

### 2026-04-24 — Outreach CRM "0 contacts" root cause + fix
- **What:** `OutreachPage.jsx` was calling raw `fetch('/api/unified/all-contacts?…')` which bypassed the JWT-attaching `api.js` wrapper. Backend in `AUTH_MODE=enforce` returned 401; the `.then(r => r.ok ? r.json() : { contacts: [] })` handler silently swallowed it → empty list, no error UI. Swapped to `api.unified.allContacts(params)` which attaches `Authorization: Bearer <jwt>` from the current Supabase session. Added `console.error` on failure so the next silent-empty case isn't silent. Swept the rest of `frontend/src` — this was the only naked `/api/` fetch.
- **Files:** [frontend/src/components/OutreachPage.jsx:34-44](frontend/src/components/OutreachPage.jsx#L34-L44)
- **Status:** uncommitted on `main`; NOT browser-tested yet; backend endpoint at [backend/routes/unified.js:285](../outreach-local/backend/routes/unified.js#L285) confirmed to accept `limit`/`hasEmail`/`noEmail` and scope by `req.user.id`.
- **Follow-up:** User to deploy and confirm `/outreach` as `lakshmisravyar@gmail.com` shows 36 contacts (14 with email). Then commit + push.

### 2026-04-24 — Branch-state discovery (blocker for Completed tab work)
- **What:** User asked to add a "Completed" tab to the Auto Apply page at `/apply/auto-apply`. Investigation revealed that page **does not exist on `main`** — it was introduced by commit `cbadab2` "Phase C: IA refactor — DISCOVER / APPLY / OUTREACH sections + Auto Apply page" which lives on remote branch `feat/ia-discover-apply-outreach`, not yet merged. The handoff's listed commit `bfcea63` for Phase C is not present in `git log --all`; handoff commit hashes for Phase C appear aspirational/stale.
- **Files:** n/a — investigation only. `git log main` tops at `3c5be1b`. `feat/ia-discover-apply-outreach` tip: `cbadab2`.
- **Status:** Blocked awaiting user decision: add Completed tab on `feat/ia-discover-apply-outreach` directly, or merge Phase C → main first then add on main. Also unclear what Vercel (`outreach-jt.vercel.app`) is tracking — screenshot shows Phase C live in prod, so either the feature branch is deployed or Phase C was rebased/pushed to main under a different hash.
- **Follow-up:** Next session — ask user which branch to land the Completed tab on. Per memory rule, do NOT switch branches with the OutreachPage.jsx fix still uncommitted without stashing first.
