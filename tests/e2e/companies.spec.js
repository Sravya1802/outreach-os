// Discover → Companies happy-path: page renders + search input is present.
import { test, expect } from '@playwright/test'

test('companies page renders + search is interactable', async ({ page }) => {
  await page.goto('/discover/companies')
  await expect(page.getByRole('heading', { name: 'Companies', level: 1 })).toBeVisible()

  // Search box is the primary affordance — verify it exists and accepts input.
  const search = page.getByPlaceholder(/search/i).first()
  await expect(search).toBeVisible()
  await search.fill('test')
  await expect(search).toHaveValue('test')
})
