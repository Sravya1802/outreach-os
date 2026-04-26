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
0b59c6d  fix: cache companies dashboard counts
4584276  fix: prevent company count flicker and route scrapes
e986b4d  docs: record dashboard auto-apply queue widget
8d87bf2  ux(dashboard): surface auto-apply queue counts with needs-review urgency
dddee6f  docs: record nightly auto-apply pipeline + visible queue
3682c1b  ux(auto-apply): visible queue card + nightly pipeline UI
c755cf5  docs: record portal scanner UX bundle + auto-apply queue button
b6e2030  feat(career ops): 'Add to Auto-Apply Queue' button on Evaluate result
…
```

phase-4-pg tip:
```
d0016ee  fix: scrape selected sources into jobs
2890bf0  feat(career ops): nightly auto-apply pipeline + visible queue
60615c5  feat(scrape): broaden role queries beyond CS + persist new-company names
ee4b6e2  feat(scrape): clearer feedback + last-scrape widget data
fa28694  fix(apify): export noteApifyError so scraper.js can import it
d8bf3b4  fix(scraper): align linkedin actors with apify schema changes
```

## Known gaps & open work

### Pending — needs my input or has an unfixed bug
1. **Outreach CRM "0 contacts"** — code fix is committed (`8a55549`) so `/outreach` now calls the JWT-attaching API wrapper. After Vercel deploy, verify as `lakshmisravyar@gmail.com` that `/outreach` shows 36 contacts (14 with email). If still empty, check Settings page → red Account box and DevTools Network `all-contacts` `Authorization` header.
2. ~~**Email + DM templates**~~ — implemented in the current uncommitted stabilization pass: `/outreach/templates` is now an editable per-user template UI, backend stores templates in `meta.outreach_templates`, and `generate` routes pass saved templates into the AI prompt as style anchors.
3. **Role Eligibility / Ranked Roles loading bug** — code fix committed and pushed (`0d0e534`) to prevent blank render when `/career/ranked` returns score values as strings, but user still saw a blank `/apply/ranked` screen. Audit pass mounted the existing root ErrorBoundary so the next browser repro should show an actionable stack trace instead of a blank page. After deploy, verify `/apply/ranked`; if it still fails, capture the rendered ErrorBoundary stack or DevTools Console.
4. ~~**Sign in / Sign up UI**~~ — implemented in the current uncommitted stabilization pass: Login now has Sign in / Sign up tabs, with magic link kept as a secondary sign-in option.
5. **"Email rate limit exceeded" on magic link** — Supabase auth config issue, not code.
6. **Audit follow-ups** — frontend lint now exits 0 but still prints 4 `exhaustive-deps` warnings; backend now has a package-lock and `npm audit --prefix backend --audit-level=high` passes; no typecheck/e2e scripts; authenticated browser flows remain unverified without a live session token.

### Deferred / acknowledged
- Apify hit monthly limit → LinkedIn/Wellfound/Google Jobs scrapers blocked until reset. I'll update the Apify API key.
- ~~"Apify status card should turn red when limit hit"~~ — fixed in frontend `346c0b2` and backend `f929862`; VM deployed and public health check passed on 2026-04-25.
- ~~"Top Companies filter on Companies page is broken"~~ — fixed in frontend `463f756` + backend `86eaeed` (server-side sort + source/status filters); VM deployed through `d0016ee`.
- ~~"Companies page shows 0/loading first then populates"~~ — fixed in `7f42c6d`; tightened in `4584276`; final UX fix in `0b59c6d` uses per-user sessionStorage cache + parent stats snapshot so the page paints last known counts immediately and refreshes silently.
- ~~"Job Scraper source buttons show 'no companies found'"~~ — fixed in frontend `4584276` + backend `d0016ee`; per-source scrapes now hit canonical `/jobs/scrape` and backend accepts selected sources.
- ~~"Don't pre-load resume in Career Ops Evaluate"~~ — fixed in `6cf20ad` (Resume section now only renders on Auto-Apply Setup tab or when user has no resume).
- ~~"Job Dashboard slow to load"~~ — improved in `c2eabdb` (stale-while-revalidate sessionStorage cache, 5min TTL; instant first paint on revisit, background refresh).

### Architectural follow-ups (no urgency)
- Migration 005 to drop `user_id DEFAULT` after fixing 5 TODO(auth) markers in cron/startup paths (server.js daily refresh, jobs.js runReclassifyUnclassified, autoApplier comment).
- "System user" concept for background paths that genuinely have no request context.
- Schema follow-up: migration 003 added `user_id`, but several legacy UNIQUE constraints remain global, especially `jobs.name UNIQUE` plus `ON CONFLICT (name)` insert paths. This can silently block a clean second user from importing/scraping the same company. Needs a planned migration to replace global uniqueness with per-user uniqueness where intended.

## How I work

- Auto mode: usually ON — execute autonomously on low-risk work. Off for big architectural calls.
- Memory rules I've internalized:
  - **No Claude attribution** in commits / PR bodies / code (no `Co-Authored-By`, no 🤖 footers).
  - **Disambiguate ambiguous "yes"/"go"** on multi-option prompts before acting on destructive branches.
  - **Never `git reset --hard` with a dirty tree** — stash first, always.
- Sandbox blocks: writing credentials to VM .env, force-pushing to main, broad credential probes. I ask before those.

## What's likely next

If the session resumes my work as of this snapshot:
1. **Browser-verify** Companies no longer flashes `0`/loading on revisit, Job Scraper per-source buttons return real found/already-in-DB counts, Outreach CRM fix, Auto Apply tab order, Completed tab, and `/apply/ranked` after Vercel finishes deploying `main`.
2. **Receive** email + DM templates → wire into `backend/services/ai.js` prompt + populate `/outreach/templates` UI with editable template store (per-user, in `meta` table).
3. **Receive** Role Eligibility DevTools error → fix.
4. **Quick wins left:** Login tabs, Supabase magic-link rate-limit config, and any browser-verified regressions.

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

### 2026-04-25 — User asks #2/#5/#6/#7 shipped (full second-user enablement pass)
- **What:**
  - **#2 (Evaluate-tab resume picker, option A):** Backend gained `POST /api/career/parse-resume` (multer, parses PDF text without writing anything to DB) and `POST /api/career/evaluate` now accepts an optional `resumeText` in the body that overrides the saved default. Falls back to saved when body is empty (backward compat). Frontend Evaluate tab has a 3-pill picker (Use saved / Upload PDF / Paste text) with **no preselection** — Evaluate button is disabled until the user explicitly picks a mode and provides content. Upload runs through the new parse endpoint so the user's saved default is never overwritten.
  - **#5 (auto-apply pre-flight + form-completeness, option B + the extra ask):** Pulled `validateProfileForApply()` into a dependency-free module `services/applyValidation.js`. Adds checks for email format, phone format, and visa-sponsorship mismatch (when the JD explicitly denies sponsorship). On every apply, **after fill but before submit**, `detectUnfilledRequired()` walks the form for required-but-empty inputs/selects/textareas/radio groups/checkbox groups; if any exist, the worker flags `needs_review` with the field labels found and never clicks Submit. This addresses "few applications ask more information" — the worker now refuses to submit when custom required questions weren't auto-filled. Refactored Greenhouse/Lever/Ashby fillers to fill-only; submit selectors live in `SUBMIT_SELECTORS` so the main flow can scan in between. 7 new unit tests in `auto-apply-validation.test.mjs`.
  - **#6 (Handshake scraper, option A):** New `scrapeHandshake()` reads `HANDSHAKE_SESSION_COOKIE` from env, drives a Playwright browser with the cookie injected on the configurable `HANDSHAKE_BASE_URL` (default `app.joinhandshake.com`, user is on `https://uic.joinhandshake.com`), scrapes job cards from the search page, and applies the existing `INTERN_RE` + `isUSLocation` filters. Bounces with a clear log if redirected to `/login` (cookie expired). Registered in SOURCES; frontend ScraperPage shows it with an HS badge. **Action required from user:** paste cookie into VM `.env` as `HANDSHAKE_SESSION_COOKIE` + `HANDSHAKE_BASE_URL=https://uic.joinhandshake.com`, then `pm2 restart outreach-backend`.
  - **#7 (resume library → Supabase Storage, option B):** New `services/resumeStorage.js` wraps Supabase Storage REST API with the service-role key — no new npm dep. Three buckets (`resume-library`, `resumes`, `tailored-pdfs`), all per-user paths `<user_id>/...`. New endpoints `GET/POST/DELETE /api/career/library`. Migration `005_storage_buckets.sql` creates buckets + per-user RLS policies (`storage.foldername(name)[1] = auth.uid()::text`). Frontend Auto-Apply Setup gains a "Resume Library — per-user (cloud storage)" card above the legacy folder card with per-archetype upload buttons (aiml/ds/swe/devops/fullstack/startup/misc), file list, delete. Legacy `scanResumes()` filesystem path stays in place for backward compat — Phase 2 will switch the auto-apply worker to read from storage. Migration script `scripts/migrate-resumes-to-storage.mjs` uploads existing PDFs idempotently.
- **Files:** [frontend/src/api.js:213](frontend/src/api.js#L213), [frontend/src/components/CareerOps.jsx:1100](frontend/src/components/CareerOps.jsx#L1100), [frontend/src/components/ScraperPage.jsx:5](frontend/src/components/ScraperPage.jsx#L5), [supabase/migrations/005_storage_buckets.sql:1](supabase/migrations/005_storage_buckets.sql#L1), [../outreach-local/backend/services/applyValidation.js:1](../outreach-local/backend/services/applyValidation.js#L1), [../outreach-local/backend/services/resumeStorage.js:1](../outreach-local/backend/services/resumeStorage.js#L1), [../outreach-local/backend/services/scraper.js:725](../outreach-local/backend/services/scraper.js#L725), [../outreach-local/backend/services/autoApplier.js:107](../outreach-local/backend/services/autoApplier.js#L107), [../outreach-local/backend/routes/careerOps.js:93](../outreach-local/backend/routes/careerOps.js#L93), [../outreach-local/backend/routes/careerOps.js:259](../outreach-local/backend/routes/careerOps.js#L259), [../outreach-local/backend/tests/auto-apply-validation.test.mjs:1](../outreach-local/backend/tests/auto-apply-validation.test.mjs#L1), [../outreach-local/scripts/migrate-resumes-to-storage.mjs:1](../outreach-local/scripts/migrate-resumes-to-storage.mjs#L1)
- **Status:** committed/pushed. Frontend `main`: `f87cf27`. Backend `phase-4-pg`: `d096d3e`. Frontend tests 7/7, backend tests 12/12 (5 templates + 7 apply validation), frontend build passes, backend audit clean. **VM deploy still pending** + **Supabase migration 005 pending** (creates buckets + RLS).
- **Follow-up:** **User actions required** (in order):
  1. **Apply migration 005 in Supabase SQL Editor** — paste `supabase/migrations/005_storage_buckets.sql`. Creates 3 buckets + RLS policies. Idempotent.
  2. **VM deploy:** `ssh -t ubuntu@140.245.15.56 'sudo bash /home/ubuntu/outreach/deploy/update.sh'` ships `d096d3e`.
  3. **Add Handshake env vars to VM `.env`:** `HANDSHAKE_SESSION_COOKIE=<paste from DevTools>` + `HANDSHAKE_BASE_URL=https://uic.joinhandshake.com`, then `pm2 restart outreach-backend`.
  4. **One-time migration of existing 6 PDFs to storage:** `set -a; source /home/ubuntu/outreach/.env; set +a; USER_ID=70df2946-a46e-4b63-832c-2822cda4cf4b LOCAL_DIR=/home/ubuntu/outreach/resumes node /home/ubuntu/outreach/scripts/migrate-resumes-to-storage.mjs`. Idempotent.
  5. **Browser-verify:** (a) `/discover/evaluate` Evaluate tab — pick each of the three pills, evaluate something. (b) Auto-Apply Setup → upload a PDF to a per-user archetype slot, confirm it lists. (c) Job Scraper → click Handshake (after cookie set). (d) Queue an evaluation with profile email broken — auto-apply should flag needs_review with the bad-email reason.
  6. **Phase 2 (later):** flip `services/resumeRegistry.scanResumes()` to read from Supabase Storage instead of filesystem; route `POST /api/career/resume` to storage; thread storage download into autoApplier so Playwright reads from a temp file pulled out of the cloud bucket. Then delete on-disk PDFs.
  7. **You accidentally pasted into `.env.example`** during Handshake cookie collection — remove the `HANDSHAKE_SESSION_COOKIE =1.1.57293952.1770171320` line from `email tracker/.env.example` (it's tracked).

### 2026-04-25 — User asks #1/#3/#8 + production-readiness audit
- **What:**
  - **#1 Career Ops UX:** reordered tabs so 🔍 Portal Scanner is the default landing tab (was Evaluate). Added a **+ Auto-Apply** button on every History row (`EvalCard`); the button is disabled and shows ✓ Queued once the row's `apply_mode='auto'` and `apply_status='queued'`. Backend `GET /career/evaluations` now returns `apply_mode + apply_status` so the initial state is correct.
  - **#3 USA-only scrape filter:** added `isUSLocation()` helper in `services/scraper.js` with a comprehensive non-US country/city blocklist (Toronto/London/Bangalore/Dublin/Berlin/Paris/Sydney/etc.). Applied to LinkedIn/Wellfound/Indeed/Dice/GoogleJobs/AIJobs/RemoteAI/Hiring.cafe/Greenhouse/Lever/Ashby paths. 16/16 unit cases pass; "Remote"/"USA"/empty kept by design.
  - **#8 Multi-template support:** `normalizeOutreachTemplates()` now accepts `variants: [{ id, kind: email|linkedin, name, body }]` capped at 20, IDs auto-generated. `templateGuidance()` in `services/ai.js` appends matching variants as additional style examples so saved variants actually shape generated outreach. `TemplatesPage.jsx` gains "+ Add email variant" / "+ Add LinkedIn variant" with edit/delete + per-variant char counter. Outreach CRM header now has a ✏ Manage templates button. 5/5 backend template tests + 7/7 frontend tests pass.
  - **Audit fixes shipped:** (a) Tailor PDF was passing hardcoded `'Sravya Rachakonda'` as the candidate name even though the route loaded one from meta — fixed to pull from `user_profile.first_name + last_name` first, filename second, generic third. Same fix in `autoApplier.js`. (b) `resumeGenerator.generateResumePDF` used `waitUntil: 'networkidle0'` which can hang on stalled subresource requests; switched to `'load'` + explicit timeouts on launch / setContent / pdf so PDF failures surface fast instead of timing out. The VM had `_tmp-*.html` files written but no matching PDFs, confirming Puppeteer was the failure point.
- **Files:** [frontend/src/components/CareerOps.jsx:798](frontend/src/components/CareerOps.jsx#L798), [frontend/src/components/CareerOps.jsx:1088](frontend/src/components/CareerOps.jsx#L1088), [frontend/src/components/TemplatesPage.jsx:1](frontend/src/components/TemplatesPage.jsx#L1), [frontend/src/components/OutreachPage.jsx:75](frontend/src/components/OutreachPage.jsx#L75), [../outreach-local/backend/services/scraper.js:51](../outreach-local/backend/services/scraper.js#L51), [../outreach-local/backend/services/outreachTemplates.js:14](../outreach-local/backend/services/outreachTemplates.js#L14), [../outreach-local/backend/services/ai.js:245](../outreach-local/backend/services/ai.js#L245), [../outreach-local/backend/routes/careerOps.js:158](../outreach-local/backend/routes/careerOps.js#L158), [../outreach-local/backend/routes/careerOps.js:546](../outreach-local/backend/routes/careerOps.js#L546), [../outreach-local/backend/services/resumeGenerator.js:255](../outreach-local/backend/services/resumeGenerator.js#L255), [../outreach-local/backend/services/autoApplier.js:233](../outreach-local/backend/services/autoApplier.js#L233), [../outreach-local/backend/tests/ai-templates.test.mjs:1](../outreach-local/backend/tests/ai-templates.test.mjs#L1)
- **Status:** committed/pushed. Frontend `main`: `9e61e4e`. Backend `phase-4-pg`: `d49c6f2` + `b2d7c92` (tailor-pdf fix). Backend tests 5/5, frontend tests 7/7, frontend build passes (705KB bundle, 184KB gzipped), frontend audit clean, backend audit clean, lint exits 0 with 4 pre-existing exhaustive-deps warnings. **VM deploy still pending** — sandbox blocks per-deploy without explicit auth.
- **Follow-up:** User runs `ssh -t ubuntu@140.245.15.56 'sudo bash /home/ubuntu/outreach/deploy/update.sh'` to ship `b2d7c92`. After deploy: (a) retry Tailor PDF on an evaluation — expect a real `cv-*.pdf` to appear, no 500. (b) Browser-verify Career Ops tabs default to Portal Scanner, and History rows show the ✓ Queued state correctly. (c) Add an extra template variant on `/outreach/templates`, generate copy, confirm AI uses it. (d) Re-run a US-only scrape and check that no Toronto/London/Bangalore rows appear. **Open user-asks still requiring answers:** #2 (Evaluate-tab resume picker A/B/C), #5 (auto-apply conservative-mode A/B/C), #6 (Handshake auth A/B/C), #7 (resume library per-user A/B). The audit report below documents what already exists in each area.

### 2026-04-25 — Diagnosed + fixed LinkedIn scrape returning 0
- **What:** User clicked LinkedIn → "no companies found" even though LinkedIn had hundreds of roles. VM logs showed `valig/linkedin-jobs-scraper → 100 items` but `[linkedin] returned 0 results`. Inspected the actor's dataset directly (`mCyre4ZwR4MkGjz0F`) — actor returned 100 unrelated full-time roles ("Director, Customer Success", "HR Assistant", …); `valig` ignored the `intern 2026` keyword. The post-fetch `INTERN_RE` filter correctly dropped them all, but the for-loop then `return [] `'d instead of falling through to the next actor (`curious_coder`, which uses LinkedIn's own search URL and would honor the keyword) or to the Greenhouse fallback. Same trap in indeed + google_jobs handlers. Fixed: when `items.length > 0 && results.length === 0`, log sample title and `continue` to next attempt.
- **Files:** [../outreach-local/backend/services/scraper.js:495](../outreach-local/backend/services/scraper.js#L495), [../outreach-local/backend/services/scraper.js:594](../outreach-local/backend/services/scraper.js#L594), [../outreach-local/backend/services/scraper.js:697](../outreach-local/backend/services/scraper.js#L697)
- **Status:** committed + pushed on `phase-4-pg`: `675c4cc`. `node --check` passes. **VM deploy blocked by sandbox (auth needed per deploy).**
- **Follow-up:** User runs `ssh -t ubuntu@140.245.15.56 'sudo bash /home/ubuntu/outreach/deploy/update.sh'`, then retries the LinkedIn scrape from `/discover/scraper`. Expected: either `curious_coder` returns intern roles via LinkedIn's keyword-honoring search URL, or all actors fall through to the Greenhouse direct-fetch fallback (which already works — earlier logs showed it returning 19 results). If `curious_coder` also produces non-intern items, we have a deeper "actors don't honor keyword on LinkedIn" problem and should consider switching to LinkedIn's public job-search RSS feed.

### 2026-04-25 — VM backend deploy of stabilization pass
- **What:** User ran `sudo bash /home/ubuntu/outreach/deploy/update.sh` over SSH on the Oracle VM. Fast-forwarded `phase-4-pg` from the previously deployed tip up to `43d9124` (templates + audit stabilization). pm2 restarted, deploy script's health-check loop reported healthy on attempt 2, and public `https://outreach-jt.duckdns.org/api/health` returns `{"status":"ok","auth_mode":"enforce"}`.
- **Files:** [../outreach-local/deploy/update.sh:1](../outreach-local/deploy/update.sh#L1)
- **Status:** live on VM at commit `43d9124`. The Templates feature backend (`/api/generate/templates`, `meta.outreach_templates`, AI prompt style anchors) and the Company Detail `meta` upsert conflict-target fix are now active in prod.
- **Follow-up:** Browser-verify as `lakshmisravyar@gmail.com`: (a) save email + LinkedIn templates on `/outreach/templates`, then generate copy and confirm saved style is used; (b) Company Detail score-fit + per-company resume upload/delete; (c) `/apply/ranked` (ErrorBoundary will now surface stack if it crashes); (d) Outreach CRM shows 36 contacts.

### 2026-04-25 — Production-readiness audit pass + narrow fixes
- **What:** Ran repository/feature audit checks across frontend and deployed backend worktree. Fixed root `npm test` script, Vite ESM lint issue, Company Detail authenticated fetch bypasses for score-fit + per-company resume upload/delete, mounted the existing ErrorBoundary to avoid blank page crashes, and fixed backend `meta` upsert conflict target for company resume PDF parsing.
- **Files:** [package.json:16](package.json#L16), [frontend/vite.config.js:5](frontend/vite.config.js#L5), [frontend/src/components/CompanyDetail.jsx:1144](frontend/src/components/CompanyDetail.jsx#L1144), [frontend/src/main.jsx:5](frontend/src/main.jsx#L5), [tests/api-client.test.mjs:67](tests/api-client.test.mjs#L67), [../outreach-local/backend/routes/companies.js:59](../outreach-local/backend/routes/companies.js#L59)
- **Status:** committed/pushed with the stabilization commits: frontend `main` `329715c`, backend `phase-4-pg` `43d9124`; tests/build/audits now pass as recorded below. Backend deploy to Oracle VM was attempted but blocked by the tool approval layer, so VM is still on pre-`43d9124` until user runs deploy manually.
- **Follow-up:** Run `sudo bash /home/ubuntu/outreach/deploy/update.sh` on the VM to ship backend changes, then browser-verify `/apply/ranked`, Company Detail Career Ops score-fit/resume upload/delete, and scraper/status flows. Plan follow-up migration for per-user UNIQUE constraints before relying on clean second-user imports.

### 2026-04-25 — Stabilization pass: templates, login tabs, audits
- **What:** Completed the Templates feature end-to-end and turned the login form into Sign in / Sign up tabs. `/outreach/templates` now loads/saves per-user email + LinkedIn templates via `/api/generate/templates`, stores them in `meta`, and generation routes pass saved templates into the AI prompt as style anchors. Added frontend API tests and backend template normalization tests. Generated/tracked backend and frontend lockfiles so audits are reproducible.
- **Files:** [frontend/src/components/TemplatesPage.jsx:1](frontend/src/components/TemplatesPage.jsx#L1), [frontend/src/components/Login.jsx:41](frontend/src/components/Login.jsx#L41), [frontend/src/api.js:134](frontend/src/api.js#L134), [tests/api-client.test.mjs:77](tests/api-client.test.mjs#L77), [../outreach-local/backend/routes/generate.js:18](../outreach-local/backend/routes/generate.js#L18), [../outreach-local/backend/services/outreachTemplates.js:1](../outreach-local/backend/services/outreachTemplates.js#L1), [../outreach-local/backend/tests/ai-templates.test.mjs:1](../outreach-local/backend/tests/ai-templates.test.mjs#L1)
- **Status:** committed/pushed. Frontend `main`: `329715c`. Backend `phase-4-pg`: `43d9124`. `npm test` passes 7/7, `npm test --prefix backend` passes 2/2, frontend build passes, frontend lint exits 0 with 4 warnings, frontend audit passes, backend audit passes, backend changed files pass `node --check`. Local Vite preview served `/apply/ranked`, `/outreach/templates`, `/discover/scraper`, and `/discover/companies` with HTTP 200. Backend deploy to VM was blocked by tool approval, not by code.
- **Follow-up:** Backend deploy still required: `sudo bash /home/ubuntu/outreach/deploy/update.sh` on the VM. Browser-verify saving templates as a logged-in user and generating email/LinkedIn copy uses the saved style after Vercel deploy + VM deploy.

### 2026-04-25 — Companies counts render from cache
- **What:** Removed the visible loading/dash pass on `/discover/companies` by caching stats + category counts per user in `sessionStorage`, seeding from the parent App stats snapshot, and refreshing counts in the background.
- **Files:** [frontend/src/components/CompanyDashboard.jsx:44](frontend/src/components/CompanyDashboard.jsx#L44), [frontend/src/components/CompanyDashboard.jsx:69](frontend/src/components/CompanyDashboard.jsx#L69), [frontend/src/App.jsx:341](frontend/src/App.jsx#L341)
- **Status:** committed on `main`: `0b59c6d`; `npm run build --prefix frontend` passed; not browser-verified after Vercel deploy.
- **Follow-up:** After Vercel deploy, visit `/discover/companies` once to seed the cache, then navigate away/back or refresh in the same tab and confirm the page does not show the intermediate loading/dash state.

### 2026-04-25 — Companies flicker + Job Scraper source fix
- **What:** Prevented the Companies page from briefly rendering real-looking zero counts by tracking stats/category loaded flags. Routed Job Scraper per-source buttons through canonical `/jobs/scrape` so results land in the main `jobs` table, added selected-source backend support, added a LinkedIn direct Greenhouse fallback when Apify actors fail, and kept legacy `/companies/scrape/:src` from dropping `name`-shaped results.
- **Files:** [frontend/src/components/CompanyDashboard.jsx:48](frontend/src/components/CompanyDashboard.jsx#L48), [frontend/src/components/ScraperPage.jsx:43](frontend/src/components/ScraperPage.jsx#L43), [frontend/src/api.js:106](frontend/src/api.js#L106), [../outreach-local/backend/routes/jobs.js:19](../outreach-local/backend/routes/jobs.js#L19), [../outreach-local/backend/services/scraper.js:519](../outreach-local/backend/services/scraper.js#L519), [../outreach-local/backend/services/scraper.js:1172](../outreach-local/backend/services/scraper.js#L1172), [../outreach-local/backend/routes/companies.js:293](../outreach-local/backend/routes/companies.js#L293)
- **Status:** frontend committed/pushed on `main`: `4584276`; backend committed/pushed/deployed on `phase-4-pg`: `d0016ee`; `npm run build --prefix frontend` passed; `node --check` passed for changed backend files; VM deploy completed and public health returned `ok`.
- **Follow-up:** Wait for Vercel deploy, hard-refresh `/discover/companies` and `/discover/scraper`, then retry LinkedIn/GitHub/Google source buttons while logged in.

### 2026-04-25 — Dashboard surfaces auto-apply queue counts
- **What:** Compact card above the "Last scrape" widget on the Dashboard now shows queue counts (Needs Review / Queued / Submitted / Failed / Unsupported). Border + label flip red when `needs_review > 0` so profile-incomplete items are visible without navigating into Career Ops. Hidden entirely when nothing is in flight. Click → `/career-ops`.
- **Files:** [frontend/src/components/DashboardPage.jsx:48](frontend/src/components/DashboardPage.jsx#L48)
- **Status:** committed and pushed `main`: `8d87bf2`. Build passes. No backend changes — reads from the existing `/api/career/auto-apply-queue` endpoint.

### 2026-04-25 — Nightly auto-apply pipeline + visible queue (DEPLOYED)
- **What:** End-to-end nightly automation. Cron at 07:00 UTC iterates over every user with `nightly_pipeline_settings.enabled=true` and runs the orchestrator: scan Greenhouse/Lever/Ashby (per `roleType`) → skip URLs already evaluated → evaluate new ones via OpenAI → if `score >= minScore` → set apply_mode=auto + apply_status=queued → run Playwright worker against up to `maxApps` queued items. Worker uses **library resume** (no per-role tailoring) when `useLibraryResume=true` so the pipeline runs fast and unattended. Profile-incomplete items now flag `needs_review` instead of `failed` so the user can fix and retry.
- **New endpoints:** GET `/api/career/auto-apply-queue` (queue + counts), GET/PUT `/api/career/nightly-settings`, POST `/api/career/nightly-pipeline`, GET `/api/career/nightly-pipeline/last-run`. Orchestrator extracted to [services/nightlyPipeline.js](../outreach-local/backend/services/nightlyPipeline.js) so route + cron share code. `scanGreenhouse/Lever/Ashby` were promoted from file-local to exported in `routes/careerOps.js`.
- **autoApplier extensions:** new `STATUS.needs_review`; `useLibraryResume` flag on `processOneEvaluation` skips tailored PDF gen and picks straight from the resume library by archetype; `runQueueOnce` accepts both positional `userId` and `{userId}` object forms (backward-compat); summary now includes `needsReview` count.
- **Settings (per-user):** enabled (default off), roleType (intern/fulltime/all, default intern), minScore (0–100, default 85), maxApps (1–200, default 50), useLibraryResume (default true). Stored in `meta.nightly_pipeline_settings`.
- **UI:** Auto-Apply Setup tab now leads with two new cards. (1) "Queue & Status" — every flagged role grouped by status (Needs Review / Queued / Submitted / Failed / Unsupported), each item shows company, role, grade, score, source (Manual eval / Bulk eval / 🌙 Nightly / Portal Scanner), platform, and date; needs_review items show their error inline. (2) "🌙 Nightly Pipeline" — enable toggle, role-type selector, min-score / max-apps inputs, Save Settings, and "Run Pipeline Now" button for immediate manual trigger; shows last run summary inline.
- **Files:** [../outreach-local/backend/routes/careerOps.js:626](../outreach-local/backend/routes/careerOps.js#L626), [../outreach-local/backend/services/autoApplier.js:30](../outreach-local/backend/services/autoApplier.js#L30), [../outreach-local/backend/services/nightlyPipeline.js:1](../outreach-local/backend/services/nightlyPipeline.js#L1), [../outreach-local/backend/server.js:434](../outreach-local/backend/server.js#L434), [frontend/src/components/CareerOps.jsx:435](frontend/src/components/CareerOps.jsx#L435)
- **Status:** committed `phase-4-pg`: `2890bf0`; `main`: `3682c1b`. Deployed to VM (healthy attempt 2). Build passes.
- **Follow-up:** **User must enable** the toggle from Auto-Apply Setup before the cron will fire — defaults to off for safety. After enabling, first cron run is at 07:00 UTC (≈2am Central). Manual "Run Pipeline Now" works immediately. Monitor `pm2 logs` for `[nightly-cron]` and `[nightly]` lines to confirm scheduled execution.

### 2026-04-25 — Portal Scanner role-type filter + persistence + bulk evaluate + Add-to-Queue button
- **What:** Career Ops UX bundle responding to four user asks at once.
  1. **Portal Scanner role-type filter** — segmented control (🎓 Internship / 💼 Full-Time / 📋 All) drives the existing backend `roleType` param. Backend already supported `intern|fulltime|all`; frontend just exposed it. Changing the toggle auto-rescans.
  2. **Portal Scanner persistence** — sessionStorage cache keyed `careerOps:portalScan:v2` (1h TTL) preserves jobs/bySource/roleType across tab switches. Header shows "last scanned 5m ago" and the button label flips to "↻ Re-scan" when cached results exist.
  3. **Bulk evaluate scanned roles** — "Evaluate N roles" button on the Portal Scanner triggers `api.career.batchEvaluate` against the visible filtered list (capped at 10 per backend limit). Inline progress banner reports outcome and points the user to History.
  4. **"Add to Auto-Apply Queue" button on EvaluationReport** — queue-without-running path. Sets `apply_mode='auto'` + `apply_status='queued'` via existing PATCH endpoints. Hidden once queued/submitted. Resume archetype matching still happens at run-time inside the worker (`pickResumeForRole` in `services/resumeRegistry.js`) — picks from the user's 6 archetype PDFs based on the role archetype detected by the evaluator.
- **Files:** [frontend/src/api.js:227](frontend/src/api.js#L227), [frontend/src/components/CareerOps.jsx:628](frontend/src/components/CareerOps.jsx#L628), [frontend/src/components/CareerOps.jsx:123](frontend/src/components/CareerOps.jsx#L123)
- **Status:** committed and pushed on `main`: `a415306` + `b6e2030`. Build passes. **No backend changes** — all reuses existing endpoints, so no VM deploy needed; Vercel auto-deploys.
- **Follow-up:** After Vercel deploys, verify (a) Portal Scanner filter works, (b) cache persists across History/Evaluate tab navigation, (c) bulk evaluate routes to History, (d) "Add to Auto-Apply Queue" button shows up when status is not_started.

### 2026-04-25 — Broader role queries + per-source breakdown + new-company names (DEPLOYED)
- **What:** Three things the user asked for in one pass.
  1. **Broadened ALL scraper default queries** so internships outside CS get returned. `getSearchTerms` defaults to `['intern 2026', 'internship 2026', 'new grad 2026']` instead of `'software engineer intern 2026'`. Subcategory + category branches drop the SWE prefix too — e.g. picking "Marketing & Creative" now searches `Marketing intern 2026`, not `Marketing software engineer intern`. scraper.js linkedin/wellfound/indeed/dice/google_jobs and apify.js linkedin/google_jobs/wellfound/yc-Serper-fallback all role-agnostic now. SEARCH_TERMS_MAP role-specific entries (Quant, IB, etc.) intentionally untouched.
  2. **Persist newCompanyNames (top 25) + errors** into `meta.last_scrape_summary` alongside the count fields.
  3. **Dashboard "Last scrape" card now answers two questions** at a glance: (a) per-source pills `linkedin: 100, wellfound: 12, github: 50` with red pills for failed sources (so user sees which scrapers actually work), (b) first 8 newly-added company names as clickable links to `/companies?search=<name>` with `+N more` for the rest.
- **Files:** [../outreach-local/backend/services/scraper.js:114](../outreach-local/backend/services/scraper.js#L114), [../outreach-local/backend/services/apify.js:212](../outreach-local/backend/services/apify.js#L212), [../outreach-local/backend/routes/jobs.js:144](../outreach-local/backend/routes/jobs.js#L144), [frontend/src/components/DashboardPage.jsx:117](frontend/src/components/DashboardPage.jsx#L117)
- **Status:** committed `phase-4-pg`: `60615c5`; `main`: `5503dab`. Deployed to VM (healthy attempt 2). Build passes.
- **Follow-up:** User runs an all-sources scrape; Dashboard card will show per-source breakdown so any silently-broken scraper is visible. Names of new companies surfaced inline. If LinkedIn now returns 1000 results because the broader query catches all intern types (could be too noisy), revisit — may want to add a role-type selector in the Job Scraper UI.

### 2026-04-25 — Honest scrape feedback + Last-scrape Dashboard widget (DEPLOYED)
- **What:** "+0 companies added" was misleading — scrapers actually return 100 results that all dedupe against the user's existing 1,499-company DB. Now backend `/api/jobs/scrape` returns `found` (total returned by all scrapers this run) + `alreadyInDb` (found - added) and persists the summary into `meta.last_scrape_summary`. Frontend ScraperPage reads normalized fields and shows: `found 100 (+5 new, 95 already in DB)` / `found 100 — all already in DB` / `+5 companies added` / `no companies found` instead of always `+0`. Dashboard gained a "Last scrape" card under the stats row showing age + found/added/inDb counts, fed by `stats.lastScrape` from `/api/stats`.
- **Files:** [../outreach-local/backend/routes/jobs.js:133](../outreach-local/backend/routes/jobs.js#L133), [../outreach-local/backend/server.js:160](../outreach-local/backend/server.js#L160), [frontend/src/components/ScraperPage.jsx:39](frontend/src/components/ScraperPage.jsx#L39), [frontend/src/components/DashboardPage.jsx:117](frontend/src/components/DashboardPage.jsx#L117)
- **Status:** committed `phase-4-pg`: `ee4b6e2`; `main`: `e214c80`. Deployed to VM (healthy attempt 2). Build passes.
- **Follow-up:** After Vercel auto-deploys frontend, run a scrape — Activity Log will read honestly and the Dashboard will get a "Last scrape · just now · Found 100 · 100 already in DB" card.

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
