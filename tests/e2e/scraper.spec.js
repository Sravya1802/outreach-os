// Discover → Scraper happy-path: page renders. Doesn't actually run a scrape
// (Apify quota — saving for PR-C with mocked external calls).
import { test, expect } from '@playwright/test'
import { skipWithoutAuthEnv } from './auth-env.js'

skipWithoutAuthEnv()

test('scraper page renders', async ({ page }) => {
  await page.goto('/discover/scraper')
  await expect(page.getByRole('heading', { name: 'Job Scraper', level: 1 })).toBeVisible()
})
