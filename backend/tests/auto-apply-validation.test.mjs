import assert from 'node:assert/strict'
import test from 'node:test'
import { validateProfileForApply } from '../services/applyValidation.js'

const goodProfile = {
  first_name: 'Alex', last_name: 'Doe',
  email: 'alex@example.com', phone: '312-555-0100',
  needs_sponsorship: 0,
}

test('validateProfileForApply: complete profile passes', () => {
  const r = validateProfileForApply(goodProfile, 'Some JD text.')
  assert.equal(r.ok, true)
})

test('validateProfileForApply: missing required fields → needs_review', () => {
  for (const k of ['first_name', 'last_name', 'email', 'phone']) {
    const r = validateProfileForApply({ ...goodProfile, [k]: '' }, '')
    assert.equal(r.ok, false, `should fail on missing ${k}`)
    assert.match(r.reason, /Profile incomplete/i)
  }
})

test('validateProfileForApply: invalid email → needs_review', () => {
  const r = validateProfileForApply({ ...goodProfile, email: 'not-an-email' }, '')
  assert.equal(r.ok, false)
  assert.match(r.reason, /Email/i)
})

test('validateProfileForApply: invalid phone → needs_review', () => {
  const r = validateProfileForApply({ ...goodProfile, phone: 'abc' }, '')
  assert.equal(r.ok, false)
  assert.match(r.reason, /Phone/i)
})

test('validateProfileForApply: sponsorship mismatch flagged when JD says no sponsorship', () => {
  const sponsoredUser = { ...goodProfile, needs_sponsorship: 1 }
  const jds = [
    'Note: This role does not offer visa sponsorship.',
    'Must be a US citizen — no sponsorship available.',
    'We are unable to sponsor employment visas.',
    'US citizens only.',
  ]
  for (const jd of jds) {
    const r = validateProfileForApply(sponsoredUser, jd)
    assert.equal(r.ok, false, `should flag sponsorship mismatch for: "${jd}"`)
    assert.match(r.reason, /sponsorship/i)
  }
})

test('validateProfileForApply: sponsorship-required user passes when JD silent on sponsorship', () => {
  const sponsoredUser = { ...goodProfile, needs_sponsorship: 1 }
  const r = validateProfileForApply(sponsoredUser, 'Looking for a passionate engineer to join our team. Great benefits.')
  assert.equal(r.ok, true)
})

test('validateProfileForApply: no-sponsorship user always passes JD compatibility', () => {
  const r = validateProfileForApply(goodProfile, 'No sponsorship available — must be a US citizen')
  assert.equal(r.ok, true)
})
