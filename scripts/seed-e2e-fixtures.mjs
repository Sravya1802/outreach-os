#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// seed-e2e-fixtures.mjs — idempotent fixture seeder for the deep-audit gates.
//
// Creates the rows the Playwright deep-audit specs need so the previously
// optional gates can run on every CI execution:
//   * one jobs (canonical companies) row → unblocks "application tracking Save"
//   * one user_profile row with consent + resume_dir → satisfies Auto Apply
//     pre-flight validation
//   * one evaluations row, apply_mode='auto', apply_status='queued', against a
//     freshly-picked Greenhouse posting → unblocks the seeded Auto Apply
//     dry-run test, surfaced as $E2E_AUTO_APPLY_EVAL_ID
//
// Env (required):
//   SUPABASE_URL                — https://<project>.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY   — service role JWT (Project Settings → API)
//   E2E_TEST_EMAIL              — same email Playwright signs in with
//
// Env (optional):
//   E2E_RESUME_DIR              — defaults to /home/ubuntu/outreach/resumes
//                                 so the production VM can serve the resume.
//   E2E_GREENHOUSE_BOARDS       — comma-separated board slugs to try in order.
//   E2E_FALLBACK_JOB_URL        — used if no listed board returns jobs.
//
// Outputs (stdout + $GITHUB_OUTPUT):
//   eval_id=<id>
//   user_id=<uuid>
//
// Idempotent. Re-running wipes only the rows tagged source='e2e_seed' for
// this user_id, then re-creates the queued evaluation against today's URL.
// ─────────────────────────────────────────────────────────────────────────────

import fs from 'node:fs';

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const EMAIL        = process.env.E2E_TEST_EMAIL;
if (!SUPABASE_URL || !SERVICE_KEY || !EMAIL) {
  console.error('[seed-e2e] Skipping: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / E2E_TEST_EMAIL not set.');
  process.exit(0);
}

const RESUME_DIR = process.env.E2E_RESUME_DIR || '/home/ubuntu/outreach/resumes';
const BOARDS     = (process.env.E2E_GREENHOUSE_BOARDS
  || 'anthropic,gitlab,robinhood,1password,duolingo,doordash,airbnb,instacart,dropbox')
  .split(',').map(s => s.trim()).filter(Boolean);
const FALLBACK_URL = process.env.E2E_FALLBACK_JOB_URL
  || 'https://job-boards.greenhouse.io/anthropic';

const baseHeaders = {
  apikey:        SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type':'application/json',
};

async function findUserId(email) {
  const target = email.toLowerCase();
  for (let page = 1; page <= 50; page++) {
    const url = `${SUPABASE_URL}/auth/v1/admin/users?per_page=200&page=${page}`;
    const r = await fetch(url, { headers: baseHeaders });
    if (!r.ok) throw new Error(`admin list users failed: ${r.status} ${await r.text()}`);
    const body = await r.json();
    const users = body.users ?? body;
    if (!Array.isArray(users)) throw new Error('admin list users: unexpected payload shape');
    const user = users.find(u => (u.email || '').toLowerCase() === target);
    if (user) return user.id;
    if (users.length < 200) break;
  }
  throw new Error(`No auth user found for email ${email}`);
}

async function postgrest(method, path, body, extraHeaders = {}) {
  const url = `${SUPABASE_URL}/rest/v1/${path.replace(/^\//, '')}`;
  const r = await fetch(url, {
    method,
    headers: { ...baseHeaders, ...extraHeaders },
    body:    body == null ? undefined : JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${await r.text()}`);
  const text = await r.text();
  return text ? JSON.parse(text) : null;
}

async function pickGreenhouseJob() {
  for (const board of BOARDS) {
    try {
      const r = await fetch(`https://boards-api.greenhouse.io/v1/boards/${board}/jobs`);
      if (!r.ok) continue;
      const { jobs = [] } = await r.json();
      const job = jobs.find(j => /greenhouse\.io|job-boards\.greenhouse/.test(j?.absolute_url || ''));
      if (job?.absolute_url) {
        return { url: job.absolute_url, title: job.title || 'Software Engineer', company: board };
      }
    } catch {
      /* try next board */
    }
  }
  return { url: FALLBACK_URL, title: 'E2E verification role', company: 'fallback' };
}

function emit(key, value) {
  process.stdout.write(`${key}=${value}\n`);
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
  }
}

(async () => {
  const userId = await findUserId(EMAIL);
  console.error(`[seed-e2e] e2e user_id = ${userId}`);

  // 1. user_profile — fields validateProfileForApply() checks + consent flag.
  //    The unique index on (user_id) is partial (WHERE user_id IS NOT NULL),
  //    which PostgREST rejects for on_conflict=user_id (42P10). Manual upsert.
  const profile = {
    first_name:          'E2E',
    last_name:           'Test',
    email:               EMAIL,
    phone:               '+15551234567',
    country:             'US',
    work_authorization:  'US Citizen',
    needs_sponsorship:   0,
    auto_apply_consent:  1,
    demographic_consent: 0,
    resume_dir:          RESUME_DIR,
  };
  const existing = await postgrest('GET', `user_profile?user_id=eq.${userId}&select=id`);
  if (Array.isArray(existing) && existing.length > 0) {
    await postgrest(
      'PATCH',
      `user_profile?user_id=eq.${userId}`,
      profile,
      { Prefer: 'return=minimal' },
    );
    console.error('[seed-e2e] user_profile patched');
  } else {
    await postgrest(
      'POST',
      'user_profile',
      { user_id: userId, ...profile },
      { Prefer: 'return=minimal' },
    );
    console.error('[seed-e2e] user_profile inserted');
  }

  // 2. jobs row — unblocks the application-tracking Save gate, which only
  //    needs at least one row for this user under /api/unified/companies.
  await postgrest(
    'POST',
    'jobs?on_conflict=user_id,name',
    {
      user_id:   userId,
      name:      'E2E Test Co',
      category:  'Tech & Software',
      url:       'https://example.com/e2e',
      location:  'Remote',
      country:   'US',
      is_remote: 1,
      status:    'new',
    },
    { Prefer: 'resolution=merge-duplicates,return=minimal' },
  );
  console.error('[seed-e2e] jobs row upserted');

  // 3. evaluations — wipe prior seeded rows for this user, then create one
  //    queued auto-apply row pointing at a fresh Greenhouse URL.
  const job = await pickGreenhouseJob();
  console.error(`[seed-e2e] greenhouse target: ${job.url} (${job.company})`);

  await postgrest('DELETE', `evaluations?user_id=eq.${userId}&source=eq.e2e_seed`);

  const inserted = await postgrest(
    'POST',
    'evaluations',
    {
      user_id:         userId,
      job_url:         job.url,
      job_title:       job.title,
      company_name:    job.company,
      job_description: 'E2E seeded evaluation for the Auto Apply dry-run gate.',
      apply_mode:      'auto',
      apply_status:    'queued',
      source:          'e2e_seed',
      grade:           'B',
      score:           85,
    },
    { Prefer: 'return=representation' },
  );
  const evalId = inserted?.[0]?.id;
  if (!evalId) throw new Error('Failed to capture inserted evaluation id');
  console.error(`[seed-e2e] evaluations row inserted: id=${evalId}`);

  emit('eval_id', evalId);
  emit('user_id', userId);
})().catch(err => {
  console.error('[seed-e2e] fatal:', err.message);
  process.exit(1);
});
