// Apply → Auto Apply happy-path: page renders, default tab loads, switching
// to the Queue tab reveals its worker sections.
import { test, expect } from '@playwright/test'
import { skipWithoutAuthEnv } from './auth-env.js'

skipWithoutAuthEnv()

test('auto-apply page renders + Queue tab shows worker sections', async ({ page }) => {
  await page.goto('/apply/auto-apply')
  await expect(page.getByRole('heading', { name: 'Auto Apply', level: 1 })).toBeVisible()

  // Default tab is "setup" — switch to "Queue" to surface the bulk queue + worker.
  await page.getByRole('button', { name: /queue/i }).first().click()
  await expect(page.getByRole('heading', { name: 'Bulk Queue Evaluations' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Run Auto-Apply Worker' })).toBeVisible()
})
