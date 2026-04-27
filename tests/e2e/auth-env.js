import { test } from '@playwright/test'

export const hasAuthEnv = Boolean(
  process.env.E2E_REFRESH_TOKEN &&
  (process.env.E2E_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY)
)

export function skipWithoutAuthEnv() {
  test.skip(
    !hasAuthEnv,
    'E2E_REFRESH_TOKEN and E2E_SUPABASE_PUBLISHABLE_KEY are required for authenticated e2e specs.'
  )
}
