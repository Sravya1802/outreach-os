// Dashboard happy-path: page renders for an authenticated user.
import { test, expect } from '@playwright/test'

test('dashboard renders for authed user', async ({ page }) => {
  await page.goto('/dashboard')
  await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible()
})
