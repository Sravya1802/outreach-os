import assert from 'node:assert/strict'
import test from 'node:test'
import { api, apiUrl, rawApiFetch } from '../frontend/src/api.js'

function mockJsonFetch(check, payload = {}) {
  globalThis.fetch = async (url, init = {}) => {
    check(url, init)
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

test('apiUrl builds local proxy URLs by default', () => {
  assert.equal(apiUrl('/health'), '/api/health')
  assert.equal(apiUrl('career/resume'), '/api/career/resume')
})

test('job contact endpoints use the backend routes expected by the UI', async () => {
  mockJsonFetch((url, init) => {
    assert.equal(url, '/api/jobs/contacts/7/generate')
    assert.equal(init.method, 'POST')
    assert.deepEqual(JSON.parse(init.body), { type: 'linkedin', extraContext: 'met at Grace Hopper' })
  }, { message: 'hello' })
  await api.jobs.generate(7, 'linkedin', 'met at Grace Hopper')

  mockJsonFetch((url, init) => {
    assert.equal(url, '/api/jobs/contacts/7')
    assert.equal(init.method, 'PUT')
    assert.deepEqual(JSON.parse(init.body), { status: 'sent' })
  }, { id: 7, status: 'sent' })
  await api.jobs.updateContact(7, { status: 'sent' })
})

test('email finder endpoints post to canonical jobs routes', async () => {
  mockJsonFetch((url, init) => {
    assert.equal(url, '/api/jobs/42/find-emails')
    assert.equal(init.method, 'POST')
    assert.deepEqual(JSON.parse(init.body), { domain: 'example.com' })
  }, { added: 1 })
  await api.jobs.findEmails(42, 'example.com')

  mockJsonFetch((url, init) => {
    assert.equal(url, '/api/jobs/contacts/11/find-email')
    assert.equal(init.method, 'POST')
    assert.deepEqual(JSON.parse(init.body), {})
  }, { email: 'person@example.com' })
  await api.jobs.findEmailForContact(11)
})

test('raw URL helpers respect the shared API base', () => {
  const params = new URLSearchParams({ limit: '500', hasEmail: 'true' })
  mockJsonFetch((url, init) => {
    assert.equal(url, '/api/unified/all-contacts?limit=500&hasEmail=true')
    assert.equal(init.method, 'GET')
  }, { contacts: [] })
  return api.unified.allContacts(params)
})

test('SSE URL helpers are URL builders; download/report helpers are async actions', () => {
  // SSE streams keep using ?access_token=<jwt> because EventSource cannot send
  // headers. With no cached token the helper just returns the bare URL.
  assert.equal(api.career.scoreFitUrl(9), '/api/career/company/9/score-fit')

  // Downloads and report views fetch with Bearer auth and open as blob URLs —
  // they're action helpers, not URL builders, so the JWT never reaches the URL.
  assert.equal(typeof api.career.openReportTab, 'function')
  assert.equal(typeof api.career.downloadEvaluationPdf, 'function')
  assert.equal(typeof api.career.downloadDocument, 'function')
})

test('raw API fetch keeps direct calls on the authenticated API helper path', async () => {
  mockJsonFetch((url, init) => {
    assert.equal(url, '/api/career/company/42/score-fit')
    assert.equal(init.method, 'POST')
  }, { ok: true })

  const res = await rawApiFetch('/career/company/42/score-fit', { method: 'POST' })
  assert.equal(res.ok, true)
})

test('outreach template endpoints use the generate API routes', async () => {
  mockJsonFetch((url, init) => {
    assert.equal(url, '/api/generate/templates')
    assert.equal(init.method, 'GET')
  }, { templates: { email: 'Email', linkedin: 'DM' } })
  await api.generate.templates()

  mockJsonFetch((url, init) => {
    assert.equal(url, '/api/generate/templates')
    assert.equal(init.method, 'PUT')
    assert.deepEqual(JSON.parse(init.body), { email: 'Email', linkedin: 'DM' })
  }, { templates: { email: 'Email', linkedin: 'DM' } })
  await api.generate.saveTemplates({ email: 'Email', linkedin: 'DM' })
})
