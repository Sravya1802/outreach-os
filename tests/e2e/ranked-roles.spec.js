// Apply → Ranked Roles happy-path: Career Ops page renders.
import { test, expect } from '@playwright/test'

test('ranked roles page (Career Ops) renders', async ({ page }) => {
  await page.goto('/apply/ranked')
  await expect(page.getByRole('heading', { name: 'Career Ops', level: 1 })).toBeVisible()
})
