// Auth-required regression spec — PR-C of audit fix #6.
//
// Asserts that every protected backend endpoint returns 401 when called with
// no Authorization header. Catches regressions where someone accidentally
// drops the requireAuth middleware off a route — exactly the gap the audit
// flagged as Critical when AUTH_MODE was previously 'log-only'.
//
// Runs in the `chromium-authed` project but doesn't actually use the
// authenticated state; it just calls the backend directly via Playwright's
// request fixture without auth headers.
import { test, expect } from '@playwright/test'

// Where the backend lives. Lives separately from the frontend baseURL.
const BACKEND_URL = process.env.E2E_BACKEND_URL || 'https://outreach-jt.duckdns.org'

const PROTECTED = [
  // Random sample of representative GET endpoints across the API surface.
  { method: 'GET',  path: '/api/stats' },
  { method: 'GET',  path: '/api/career/tracker' },
  { method: 'GET',  path: '/api/career/evaluations' },
  { method: 'GET',  path: '/api/unified/dashboard' },
  { method: 'POST', path: '/api/jobs/reclassify-unclassified', body: {} },
  // Deprecated endpoints from PR #9 — still gated by auth before returning 410.
  { method: 'GET',  path: '/api/career/tracker/raw' },
  { method: 'GET',  path: '/api/career/reports' },
  { method: 'POST', path: '/api/automations/auto-apply', body: { jobs: [], mode: 'review' } },
]

for (const { method, path, body } of PROTECTED) {
  test(`unauth ${method} ${path} → 401`, async ({ request }) => {
    const r = await request.fetch(BACKEND_URL + path, {
      method,
      data: body,
      headers: { 'Content-Type': 'application/json' },
      // Strip any cookies/headers the request fixture might inherit.
      failOnStatusCode: false,
    })
    expect(r.status(), `${method} ${path} should reject anon callers`).toBe(401)
  })
}

test('public endpoint /api/health returns 200 unauth', async ({ request }) => {
  const r = await request.fetch(BACKEND_URL + '/api/health', { failOnStatusCode: false })
  expect(r.status()).toBe(200)
})
