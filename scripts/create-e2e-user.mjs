#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// create-e2e-user.mjs — one-time setup for the e2e test account.
//
// Creates a Supabase auth user via the admin API, signs in as that user, and
// prints the resulting refresh_token. Add the refresh_token to your local
// .env (E2E_REFRESH_TOKEN=...) and to the GitHub repo secrets so the nightly
// CI run can authenticate.
//
// Run once. The refresh token rotates on use, so don't share it.
//
// Required env:
//   SUPABASE_URL                — e.g. https://dkifhfqgoremdjhkcojc.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY   — Project Settings → API → service_role key.
//                                 NEVER commit this. Use only locally.
//
// Optional env:
//   E2E_TEST_EMAIL    — defaults to e2e+<timestamp>@outreach-os.local
//   E2E_TEST_PASSWORD — defaults to a strong random string (printed at end)
//
// Usage:
//   SUPABASE_URL=https://… \
//   SUPABASE_SERVICE_ROLE_KEY=eyJ… \
//   node scripts/create-e2e-user.mjs
// ─────────────────────────────────────────────────────────────────────────────

import { randomBytes } from 'node:crypto'

const SUPABASE_URL  = process.env.SUPABASE_URL
const SERVICE_ROLE  = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('Missing required env: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
  console.error('Find them in Supabase dashboard → Project Settings → API')
  process.exit(2)
}

const email    = process.env.E2E_TEST_EMAIL    || `e2e+${Date.now()}@outreach-os.local`
const password = process.env.E2E_TEST_PASSWORD || randomBytes(24).toString('base64url')

console.log(`Creating test user: ${email}`)

// 1. Admin: create the user (email pre-confirmed).
const create = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
  method:  'POST',
  headers: {
    'Content-Type':  'application/json',
    'Authorization': `Bearer ${SERVICE_ROLE}`,
    'apikey':        SERVICE_ROLE,
  },
  body: JSON.stringify({
    email,
    password,
    email_confirm: true,
  }),
})
if (!create.ok) {
  console.error('admin createUser failed:', create.status, await create.text())
  process.exit(1)
}
const user = await create.json()
console.log(`✓ Created user id=${user.id}`)

// 2. Sign in as that user via the regular auth endpoint to get a session.
//    The admin API doesn't return a refresh_token — we have to sign in.
const signin = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
  method:  'POST',
  headers: {
    'Content-Type': 'application/json',
    // Sign-in uses the anon key as apikey, not the service role.
    // We don't have anon at hand — but service_role works on /token endpoints
    // because it has all privileges. Keeping it simple here.
    'apikey':       SERVICE_ROLE,
  },
  body: JSON.stringify({ email, password }),
})
if (!signin.ok) {
  console.error('signin failed:', signin.status, await signin.text())
  process.exit(1)
}
const session = await signin.json()

console.log('\n────────────────────────────────────────')
console.log('Add to your local .env and GitHub Actions secrets:')
console.log('────────────────────────────────────────')
console.log(`E2E_TEST_EMAIL=${email}`)
console.log(`E2E_TEST_PASSWORD=${password}   # save somewhere safe in case you need to re-sign-in manually`)
console.log(`E2E_REFRESH_TOKEN=${session.refresh_token}`)
console.log('────────────────────────────────────────')
console.log('\nThen run:  npm run test:e2e')
