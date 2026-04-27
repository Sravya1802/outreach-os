import { test } from '@playwright/test'

const publishableKey = (
  process.env.E2E_SUPABASE_PUBLISHABLE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  ''
).trim()

export const hasAuthEnv = Boolean(
  publishableKey.startsWith('sb_publishable_') &&
  (
    (process.env.E2E_TEST_EMAIL && process.env.E2E_TEST_PASSWORD) ||
    process.env.E2E_REFRESH_TOKEN
  )
)

export function skipWithoutAuthEnv() {
  test.skip(
    !hasAuthEnv,
    'E2E_SUPABASE_PUBLISHABLE_KEY=sb_publishable_... plus E2E_TEST_EMAIL/E2E_TEST_PASSWORD are required for authenticated e2e specs.'
  )
}
