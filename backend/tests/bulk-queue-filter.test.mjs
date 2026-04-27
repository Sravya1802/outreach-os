import assert from 'node:assert/strict'
import test from 'node:test'
import { buildBulkQueueFilter } from '../services/bulkQueueFilter.js'

const userId = '70df2946-a46e-4b63-832c-2822cda4cf4b'

test('bulk queue filter always scopes rows to the caller and not-started applications', () => {
  const { sql, params } = buildBulkQueueFilter({ userId, profile: {} })
  assert.match(sql, /user_id = \$1/)
  assert.match(sql, /apply_status IS NULL OR apply_status = 'not_started'/)
  assert.equal(params[0], userId)
})

test('bulk queue filter combines grade and score thresholds', () => {
  const { sql, params } = buildBulkQueueFilter({ userId, minGrade: 'B', minScore: '82', supportedOnly: false })
  assert.match(sql, /grade = ANY\(\$2\)/)
  assert.match(sql, /score >= \$3/)
  assert.deepEqual(params[1], ['A', 'B'])
  assert.equal(params[2], 82)
})

test('bulk queue filter matches job type across title and description', () => {
  const { sql, params } = buildBulkQueueFilter({ userId, jobType: 'intern', supportedOnly: false })
  assert.match(sql, /job_title/)
  assert.match(sql, /job_description/)
  assert.deepEqual(params.slice(1), ['%intern%', '%internship%', '%co-op%', '%coop%'])
})

test('bulk queue filter normalizes US country values exactly', () => {
  const usa = buildBulkQueueFilter({ userId, country: 'USA', supportedOnly: false })
  assert.ok(usa.params.includes('%United States%'))

  const australia = buildBulkQueueFilter({ userId, country: 'Australia', supportedOnly: false })
  assert.ok(australia.params.includes('%Australia%'))
  assert.ok(!australia.params.includes('%United States%'))
})

test('bulk queue filter supports on-site spelling variants', () => {
  const { params } = buildBulkQueueFilter({ userId, workLocation: 'onsite', supportedOnly: false })
  assert.deepEqual(params.slice(1), ['%on-site%', '%onsite%', '%on site%'])
})

test('bulk queue filter excludes no-sponsorship roles when user needs sponsorship', () => {
  const { sql, params } = buildBulkQueueFilter({ userId, profile: { needs_sponsorship: 1 }, supportedOnly: false })
  assert.match(sql, /!\~\*/)
  assert.match(params.at(-1), /unable to sponsor/)
})

test('bulk queue filter defaults to supported ATS only', () => {
  const { sql, params } = buildBulkQueueFilter({ userId })
  assert.match(sql, /job_url ~\*/)
  assert.equal(params.at(-1), 'greenhouse|lever|ashby')
})

test('bulk queue filter reports missing consent to the UI', () => {
  const noConsent = buildBulkQueueFilter({ userId, profile: { auto_apply_consent: 0 } })
  assert.equal(noConsent.consentRequired, true)

  const consent = buildBulkQueueFilter({ userId, profile: { auto_apply_consent: 1 } })
  assert.equal(consent.consentRequired, false)
})
