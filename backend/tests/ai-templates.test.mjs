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
