import { test } from '@playwright/test'

const publishableKey = (
  process.env.E2E_SUPABASE_PUBLISHABLE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  ''
).trim()

export const hasAuthEnv = Boolean(
  process.env.E2E_REFRESH_TOKEN &&
  publishableKey.startsWith('sb_publishable_')
)

export function skipWithoutAuthEnv() {
  test.skip(
    !hasAuthEnv,
    'E2E_REFRESH_TOKEN and E2E_SUPABASE_PUBLISHABLE_KEY=sb_publishable_... are required for authenticated e2e specs.'
  )
}
