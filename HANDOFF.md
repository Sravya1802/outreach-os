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
a6fc28a  docs: record stats and apify status fixes
346c0b2  fix: show real contact and api status counts
c36bb39  docs: record ranked roles fix
0d0e534  fix: stabilize ranked roles rendering
509d859  docs: record apply nav fix push
7540f13  docs: record apply nav overlay fix
fcb908b  fix: keep sidebar nav above content overlays
…
```

phase-4-pg tip:
```
53f0767  fix: deploy backend from phase branch
f929862  fix: report total contacts and apify quota status
624e6a3  perf: collapse N+1 count queries (4497→1 + 18→3)
f02ff10  Phase A.2: scope every DB query by req.user.id (17 files, 707/-480)
8571f6c  migration 004: tighten user_id NOT NULL
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
- "Top Companies filter on Companies page is broken" — small frontend bug.
- "Companies page shows 0 first then populates" — loading-state flicker.
- "Don't pre-load resume in Career Ops Evaluate" — UX preference.
- "Job Dashboard slow to load" — already partially addressed by Phase B perf, may need more.

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

### 2026-04-25 — VM backend deployed for stats + Apify status
- **What:** Fast-forwarded the Oracle VM checkout from the accidental `origin/local-backup` reset back to `origin/phase-4-pg`, restarted `pm2` app `outreach-backend`, and confirmed public backend health is `ok`.
- **Files:** [../outreach-local/backend/server.js:133](../outreach-local/backend/server.js#L133), [../outreach-local/backend/services/creditChecker.js:44](../outreach-local/backend/services/creditChecker.js#L44)
- **Status:** live VM is on `phase-4-pg` commit `f929862` for runtime code; `https://outreach-jt.duckdns.org/api/health` returned `{"status":"ok",...,"auth_mode":"enforce"}`.
- **Follow-up:** User should hard-refresh Vercel app and verify Companies contacts show total contact count/subtext and API Status marks Apify red or amber when quota/API failure is reported.

### 2026-04-25 — Backend deploy script corrected
- **What:** Fixed `deploy/update.sh` so future VM deploys fast-forward `origin/phase-4-pg` instead of resetting to `origin/local-backup`; dependency install now runs only when backend package files change and uses legacy peer handling for the existing OpenAI/Zod peer conflict.
- **Files:** [../outreach-local/deploy/update.sh:19](../outreach-local/deploy/update.sh#L19)
- **Status:** committed and pushed on `phase-4-pg`: `53f0767`; VM checkout also fast-forwarded to `53f0767`; `bash -n deploy/update.sh` passed.
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
