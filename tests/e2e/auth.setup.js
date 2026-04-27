// ─────────────────────────────────────────────────────────────────────────────
// auth.setup.js — runs once before the e2e suite and stashes a logged-in
// session in storageState. Subsequent specs reuse it via Playwright's
// dependsOn project relationship (see playwright.config.js).
//
// Reads E2E_REFRESH_TOKEN from env. Locally: paste it manually after running
// scripts/create-e2e-user.mjs once. In CI: GitHub Actions secret.
//
// Supabase URL + anon key are public (anon role is intended to be exposed in
// frontend bundles), so they're hardcoded here. If the project gets recreated,
// update the constants.
// ─────────────────────────────────────────────────────────────────────────────

import { test as setup, expect } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SUPABASE_URL  = 'https://dkifhfqgoremdjhkcojc.supabase.co'
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRraWZoZnFnb3JlbWRqaGtjb2pjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3NzE2OTAsImV4cCI6MjA5MjM0NzY5MH0.IoppGmy8AMU0mqKOrMNB2C60VZXtzcLkZURHoARNLss'
const STORAGE_KEY   = 'sb-dkifhfqgoremdjhkcojc-auth-token'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const STORAGE_PATH = path.join(__dirname, '.auth', 'storage.json')

setup('refresh session and save storage state', async ({ page }) => {
  const rt = process.env.E2E_REFRESH_TOKEN
  if (!rt) {
    setup.skip(true, 'E2E_REFRESH_TOKEN not set — run scripts/create-e2e-user.mjs first or paste a refresh_token from a browser session.')
  }

  // Mint a fresh access_token. Refresh tokens rotate, but Playwright caches
  // storageState per run so we always start with a freshly minted access.
  const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON },
    body:    JSON.stringify({ refresh_token: rt }),
  })
  if (!r.ok) {
    throw new Error(`Supabase refresh failed (${r.status}): ${(await r.text()).slice(0, 200)}`)
  }
  const session = await r.json()

  // Visit the app once to let it set the supabase client up; then inject the
  // session into localStorage and persist storage state for downstream specs.
  await page.goto('/')
  await page.evaluate(([k, v]) => localStorage.setItem(k, JSON.stringify(v)), [STORAGE_KEY, session])

  // Reload so the supabase client picks up the session and the app routes to
  // the authenticated layout.
  await page.reload()

  // Sanity: the dashboard renders something only an authed user sees.
  // Use a reasonably-stable selector that doesn't depend on data presence.
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 10_000 })

  await page.context().storageState({ path: STORAGE_PATH })
})
