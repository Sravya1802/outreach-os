// Default template style anchors. The AI uses these as TONE references —
// it personalizes per recipient/company at generation time. The placeholders
// ({{first_name}}, {{company}}, {{specific_hook}}, {{credential}}) are NOT
// substituted literally; they show the model the slot structure to follow.
export const DEFAULT_OUTREACH_TEMPLATES = {
  email: `Subject: {{specific_hook_subject}}

Hi {{first_name}},

{{specific_hook_about_their_team_or_product}}. {{credential_that_matches_their_work}}.

{{clear_ask_referral_or_intro}}?

Best,
Sravya Rachakonda
sravyarachakonda.com

---
Tone reference (do NOT copy these placeholders literally — fill them with company-specific content):
- specific_hook_subject: "Mercedes-Benz pipelines → your data infra at {{company}}?"
- specific_hook: "Saw your team at Tempus is shipping clinical doc automation"
- credential: "I've spent the last year building RAG over UIC Cancer Center clinical notes"
- clear_ask: "Open to a 5-min chat next week, or a pointer to the right person on the data team"`,
  linkedin: `Hi {{first_name}}, {{specific_hook_about_their_team}}. {{ONE_credential_that_matches}}. {{clear_ask}}?

---
Tone reference (do NOT copy placeholders — under 280 chars, ONE hook + ONE credential + ONE ask):
- "Saw your team at Tempus is shipping clinical doc automation. I'm running RAG over Cancer Center notes at UIC. Open to a quick chat about your data team's hiring?"`,
}

function cleanTemplate(value, fallback) {
  const text = typeof value === 'string' ? value.trim() : ''
  return text.length > 0 ? text.slice(0, 8000) : fallback
}

function makeId() {
  return `v_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function normalizeVariant(v) {
  if (!v || typeof v !== 'object') return null
  const kind = v.kind === 'linkedin' ? 'linkedin' : 'email'
  const body = cleanTemplate(v.body, '')
  if (!body) return null
  const name = typeof v.name === 'string' && v.name.trim() ? v.name.trim().slice(0, 120) : 'Untitled'
  const id = typeof v.id === 'string' && v.id ? v.id.slice(0, 64) : makeId()
  return { id, kind, name, body }
}

export function normalizeOutreachTemplates(raw = {}) {
  const variants = Array.isArray(raw.variants)
    ? raw.variants.map(normalizeVariant).filter(Boolean).slice(0, 20)
    : []
  return {
    email: cleanTemplate(raw.email, DEFAULT_OUTREACH_TEMPLATES.email),
    linkedin: cleanTemplate(raw.linkedin, DEFAULT_OUTREACH_TEMPLATES.linkedin),
    variants,
  }
}

export function cleanOutreachTemplate(value) {
  return cleanTemplate(value, '')
}
