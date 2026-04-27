import { test, expect } from '@playwright/test'
import { skipWithoutAuthEnv } from './auth-env.js'
import { apiFetch, apiFetchWithToken, getAccessToken, passwordGrant } from './api-helpers.js'

skipWithoutAuthEnv()

test('combined company and auto-apply queue filters return scoped API responses', async ({ page, request }) => {
  await page.goto('/dashboard')

  const companies = await apiFetch(
    page,
    request,
    '/api/unified/companies?category=Tech%20%26%20Software&search=a&source=yc&status=new&cities=Remote&includeRemote=true&sort=contacts&page=0&pageSize=5'
  )
  expect(companies.status()).toBe(200)
  const companyBody = await companies.json()
  expect(Array.isArray(companyBody.companies)).toBe(true)
  expect(typeof companyBody.total).toBe('number')

  const preview = await apiFetch(
    page,
    request,
    '/api/career/bulk-queue/preview?minGrade=B&minScore=70&jobType=intern&workLocation=onsite&country=US&supportedOnly=true'
  )
  expect(preview.status()).toBe(200)
  const previewBody = await preview.json()
  expect(typeof previewBody.count).toBe('number')
  expect(Array.isArray(previewBody.rows)).toBe(true)
})

test('privacy export and sensitive-profile dry run are available to authenticated users', async ({ page, request }) => {
  await page.goto('/dashboard')

  const exported = await apiFetch(page, request, '/api/career/privacy/export')
  expect(exported.status()).toBe(200)
  const exportBody = await exported.json()
  expect(exportBody.userId).toBeTruthy()
  expect(exportBody.security?.erasure).toContain('sensitive-profile')
  expect(exportBody.data).toHaveProperty('user_profile')
  expect(Array.isArray(exportBody.data.evaluations)).toBe(true)

  const dryRun = await apiFetch(page, request, '/api/career/privacy/sensitive-profile?dryRun=true', { method: 'DELETE' })
  expect(dryRun.status()).toBe(200)
  const dryRunBody = await dryRun.json()
  expect(dryRunBody.dryRun).toBe(true)
  expect(Array.isArray(dryRunBody.profileFields)).toBe(true)
  expect(Array.isArray(dryRunBody.metaKeys)).toBe(true)
})

test('application tracking Save path persists when the test user has a company row', async ({ page, request }) => {
  await page.goto('/dashboard')
  const list = await apiFetch(page, request, '/api/unified/companies?page=0&pageSize=1')
  expect(list.status()).toBe(200)
  const { companies = [] } = await list.json()
  const company = companies.find(c => c.id)
  test.skip(!company, 'No company rows exist for this e2e user; saved/application tracking write path is skipped until seeded.')

  const before = await apiFetch(page, request, `/api/career/company/${company.id}`)
  expect(before.status()).toBe(200)
  const original = await before.json()
  const marker = `e2e-save-${Date.now()}`

  try {
    const save = await apiFetch(page, request, `/api/career/company/${company.id}`, {
      method: 'PUT',
      data: {
        status: original.status || 'interested',
        notes: marker,
        job_title: original.job_title || 'E2E verification role',
        job_url: original.job_url || company.careers_url || 'https://example.com/e2e',
        job_source: original.job_source || 'e2e',
      },
    })
    expect(save.status()).toBe(200)
    const saved = await save.json()
    expect(saved.notes).toBe(marker)
  } finally {
    await apiFetch(page, request, `/api/career/company/${company.id}`, {
      method: 'PUT',
      data: {
        status: original.status || 'interested',
        notes: original.notes || null,
        applied_date: original.applied_date || null,
        follow_up_date: original.follow_up_date || null,
        fit_score: original.fit_score || null,
        salary: original.salary || null,
        location_type: original.location_type || 'onsite',
        start_date: original.start_date || null,
        end_date: original.end_date || null,
        fit_assessment: original.fit_assessment || null,
        job_title: original.job_title || null,
        job_url: original.job_url || null,
        job_source: original.job_source || null,
      },
    })
  }
})

test('two-user profile writes stay isolated when second e2e credentials are configured', async ({ page, request }) => {
  const secondEmail = process.env.E2E_SECOND_TEST_EMAIL
  const secondPassword = process.env.E2E_SECOND_TEST_PASSWORD
  test.skip(!secondEmail || !secondPassword, 'Set E2E_SECOND_TEST_EMAIL and E2E_SECOND_TEST_PASSWORD to run two-user write/read isolation.')

  await page.goto('/dashboard')
  const primaryToken = await getAccessToken(page)
  const secondSession = await passwordGrant(secondEmail, secondPassword)
  const secondToken = secondSession.access_token
  const primaryMarker = `https://example.com/e2e-primary-${Date.now()}`
  const secondMarker = `https://example.com/e2e-second-${Date.now()}`

  const primaryBefore = await apiFetchWithToken(request, '/api/career/profile', primaryToken)
  const secondBefore = await apiFetchWithToken(request, '/api/career/profile', secondToken)
  const primaryOriginal = primaryBefore.status() === 200 ? await primaryBefore.json() : {}
  const secondOriginal = secondBefore.status() === 200 ? await secondBefore.json() : {}

  try {
    const primaryWrite = await apiFetchWithToken(request, '/api/career/profile', primaryToken, {
      method: 'PUT',
      data: { portfolio_url: primaryMarker },
    })
    expect(primaryWrite.status()).toBe(200)

    const secondRead = await apiFetchWithToken(request, '/api/career/profile', secondToken)
    expect(secondRead.status()).toBe(200)
    expect((await secondRead.json()).portfolio_url).not.toBe(primaryMarker)

    const secondWrite = await apiFetchWithToken(request, '/api/career/profile', secondToken, {
      method: 'PUT',
      data: { portfolio_url: secondMarker },
    })
    expect(secondWrite.status()).toBe(200)

    const primaryRead = await apiFetchWithToken(request, '/api/career/profile', primaryToken)
    expect(primaryRead.status()).toBe(200)
    expect((await primaryRead.json()).portfolio_url).toBe(primaryMarker)
  } finally {
    await apiFetchWithToken(request, '/api/career/profile', primaryToken, {
      method: 'PUT',
      data: { portfolio_url: primaryOriginal.portfolio_url || null },
    })
    await apiFetchWithToken(request, '/api/career/profile', secondToken, {
      method: 'PUT',
      data: { portfolio_url: secondOriginal.portfolio_url || null },
    })
  }
})

test('seeded Auto Apply dry run fills and validates a real application when configured', async ({ page, request }) => {
  test.setTimeout(120_000)
  const evalId = process.env.E2E_AUTO_APPLY_EVAL_ID
  test.skip(!evalId, 'Set E2E_AUTO_APPLY_EVAL_ID to a queued Greenhouse/Lever/Ashby evaluation with consent + resume to run full dry-run execution.')

  await page.goto('/dashboard')
  const result = await apiFetch(page, request, `/api/career/auto-apply/${encodeURIComponent(evalId)}`, {
    method: 'POST',
    data: { dryRun: true, headless: true },
  })
  expect(result.status()).toBe(200)
  const body = await result.json()
  expect(body.platform, JSON.stringify(body)).toMatch(/greenhouse|lever|ashby/)
  expect(body.dryRun || body.needsReview, JSON.stringify(body)).toBeTruthy()
  if (body.dryRun) {
    expect(body.readyToSubmit, JSON.stringify(body)).toBe(true)
  }
})

test('real Apify-backed scrape succeeds when quota test is explicitly enabled', async ({ page, request }) => {
  test.setTimeout(120_000)
  test.skip(process.env.E2E_RUN_REAL_APIFY !== '1', 'Set E2E_RUN_REAL_APIFY=1 to spend Apify quota and verify a real actor-backed scrape.')

  await page.goto('/dashboard')
  const status = await apiFetch(page, request, '/api/credits/status?refresh=true')
  expect(status.status()).toBe(200)
  const statusBody = await status.json()
  test.skip(!!statusBody.apify?.critical, `Apify is unavailable or quota-exhausted: ${statusBody.apify?.error || 'critical status'}`)

  const scrape = await apiFetch(page, request, '/api/jobs/scrape', {
    method: 'POST',
    data: { source: 'linkedin', category: 'All Categories', subcategory: '' },
  })
  expect(scrape.status()).toBe(200)
  const body = await scrape.json()
  expect(body.errors?.linkedin, JSON.stringify(body.errors || {})).toBeFalsy()
  expect(body.found, JSON.stringify(body)).toBeGreaterThan(0)
})
