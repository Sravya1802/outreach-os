// Outreach → Messages happy-path: contacts page renders.
import { test, expect } from '@playwright/test'

test('outreach CRM renders', async ({ page }) => {
  await page.goto('/outreach/messages')
  await expect(page.getByRole('heading', { name: 'Outreach CRM', level: 1 })).toBeVisible()
})
