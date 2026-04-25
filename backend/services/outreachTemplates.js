export const DEFAULT_OUTREACH_TEMPLATES = {
  email: `Hi {{first_name}},

I came across your work at {{company}} and wanted to reach out directly. I'm a Master's CS student focused on software engineering, AI/ML, and production systems, and I'm looking for Summer 2026 internship opportunities.

If your team is hiring interns, would you be open to pointing me toward the right person or sharing what makes a strong candidate for {{company}}?

Best,
Sravya Rachakonda
sravyarachakonda.com`,
  linkedin: `Hi {{first_name}}, I came across your work at {{company}}. I'm a Master's CS student focused on SWE/AI systems and looking for Summer 2026 internships. Would you be open to sharing what your team looks for in interns?`,
}

function cleanTemplate(value, fallback) {
  const text = typeof value === 'string' ? value.trim() : ''
  return text.length > 0 ? text.slice(0, 8000) : fallback
}

export function normalizeOutreachTemplates(raw = {}) {
  return {
    email: cleanTemplate(raw.email, DEFAULT_OUTREACH_TEMPLATES.email),
    linkedin: cleanTemplate(raw.linkedin, DEFAULT_OUTREACH_TEMPLATES.linkedin),
  }
}

export function cleanOutreachTemplate(value) {
  return cleanTemplate(value, '')
}
