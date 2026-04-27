// Edge-case routing — PR-D of audit fix #6.
//
// Runs in the unauthenticated `chromium` project: confirms unknown URLs
// route via the catch-all and that protected routes show the login form
// when no session is present.
import { test, expect } from '@playwright/test'

test('unknown URL falls through the catch-all', async ({ page }) => {
  await page.goto('/this-route-does-not-exist')
  // Catch-all is <Route path="*" element={<Navigate to="/dashboard" />}>.
  // Without a session the dashboard renders <Login />, so we verify by the
  // login form rather than the URL — the URL flow can race with the redirect.
  await expect(page.getByText('OutreachOS')).toBeVisible()
  await expect(page.getByText('Sign in to continue')).toBeVisible()
})

test('direct nav to a protected route while unauth renders the login form', async ({ page }) => {
  await page.goto('/discover/companies')
  await expect(page.getByText('OutreachOS')).toBeVisible()
  await expect(page.getByText('Sign in to continue')).toBeVisible()
})
