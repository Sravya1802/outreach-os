// ─────────────────────────────────────────────────────────────────────────────
// auth.spec.js — PR-A smoke test.
//
// Loads the unauthenticated landing page and asserts the login form is
// rendered. Doesn't actually sign in — that needs a test account, and PR-A's
// goal is to prove the harness works end-to-end. Login-flow tests land in
// PR-B once test-user provisioning is wired up.
// ─────────────────────────────────────────────────────────────────────────────

import { test, expect } from '@playwright/test'

test('landing page shows login form', async ({ page }) => {
  await page.goto('/')

  // Unique anchors: branding + the password-mode subtitle (default mode).
  await expect(page.getByText('OutreachOS')).toBeVisible()
  await expect(page.getByText('Sign in to continue')).toBeVisible()

  // Email + password inputs are interactable.
  const email = page.getByPlaceholder('you@example.com')
  await expect(email).toBeVisible()
  await email.fill('test@example.com')
  await expect(email).toHaveValue('test@example.com')

  const password = page.getByPlaceholder('••••••••')
  await expect(password).toBeVisible()
})
