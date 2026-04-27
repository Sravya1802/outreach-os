import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_OUTREACH_TEMPLATES, normalizeOutreachTemplates } from '../services/outreachTemplates.js'

test('normalizeOutreachTemplates falls back to defaults for empty values', () => {
  const templates = normalizeOutreachTemplates({ email: '', linkedin: null })
  assert.equal(templates.email, DEFAULT_OUTREACH_TEMPLATES.email)
  assert.equal(templates.linkedin, DEFAULT_OUTREACH_TEMPLATES.linkedin)
})

test('normalizeOutreachTemplates trims and bounds saved template text', () => {
  const long = ` ${'x'.repeat(9000)} `
  const templates = normalizeOutreachTemplates({ email: '  hello  ', linkedin: long })
  assert.equal(templates.email, 'hello')
  assert.equal(templates.linkedin.length, 8000)
})

test('normalizeOutreachTemplates accepts variants and assigns ids', () => {
  const t = normalizeOutreachTemplates({
    email: 'primary',
    linkedin: 'short',
    variants: [
      { kind: 'email', name: 'Recruiter', body: 'Hi {{first_name}}' },
      { kind: 'linkedin', name: '', body: 'short DM' },
      { kind: 'invalid', body: 'kept-as-email' },        // kind defaults to 'email'
      { kind: 'email', body: '   ' },                    // empty body → dropped
      null, undefined, 'string-not-object',              // junk → dropped
    ],
  })
  assert.equal(t.variants.length, 3)
  assert.ok(t.variants.every(v => v.id && v.id.length > 0))
  assert.equal(t.variants[0].name, 'Recruiter')
  assert.equal(t.variants[1].name, 'Untitled')
})

test('normalizeOutreachTemplates caps variants at 20', () => {
  const many = Array.from({ length: 30 }, (_, i) => ({ kind: 'email', name: `t${i}`, body: `b${i}` }))
  const t = normalizeOutreachTemplates({ variants: many })
  assert.equal(t.variants.length, 20)
})

test('normalizeOutreachTemplates preserves provided variant ids', () => {
  const t = normalizeOutreachTemplates({
    variants: [{ id: 'fixed-id', kind: 'email', name: 'A', body: 'hello' }],
  })
  assert.equal(t.variants[0].id, 'fixed-id')
})
