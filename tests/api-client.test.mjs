import assert from 'node:assert/strict'
import test from 'node:test'
import { api, apiUrl } from '../frontend/src/api.js'

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

test('career document/report URLs use the shared API base', () => {
  assert.equal(api.career.downloadUrl(5), '/api/career/download/5')
  assert.equal(api.career.reportHtmlUrl(5), '/api/career/evaluations/5/report.html')
  assert.equal(api.career.scoreFitUrl(9), '/api/career/company/9/score-fit')
})
