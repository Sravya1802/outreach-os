import { SOURCES } from '../../backend/services/scraper.js'
import { upsertScrapedCompanies, upsertScrapedJobs, logActivity } from '../_lib/companyStore.js'

// Prefer fast sources for AI-search (GitHub/ATS only — no Apify) so we stay under 60s.
const FAST_SOURCE_KEYS = ['greenhouse', 'lever', 'ashby', 'simplify', 'speedyapply', 'internlist']

export default async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end()

  const { description = '', remote = false } = req.body || {}
  if (!description) return res.status(400).json({ error: 'description required' })

  try {
    const fastSources = SOURCES.filter(s => FAST_SOURCE_KEYS.includes(s.key))
    const searchTerms = [description, `${description} intern`, `${description} 2026`]

    const settled = await Promise.allSettled(fastSources.map(s => s.fn(searchTerms)))
    const allRaw = []
    const bySource = {}
    for (let i = 0; i < fastSources.length; i++) {
      const r = settled[i]
      if (r.status === 'fulfilled') {
        bySource[fastSources[i].key] = r.value.length
        allRaw.push(...r.value)
      } else {
        bySource[fastSources[i].key] = 0
      }
    }

    const tokens = description.toLowerCase().split(/\s+/).filter(t => t.length > 2)
    const matchesDescription = (r) => {
      if (tokens.length === 0) return true
      const hay = `${r.name || ''} ${r.jobTitle || ''} ${r.jobDescription || ''} ${r.location || ''}`.toLowerCase()
      return tokens.some(t => hay.includes(t))
    }
    const filtered = allRaw.filter(matchesDescription).filter(r => !remote || /remote/i.test(r.location || ''))

    const seen = new Set()
    const unique = []
    for (const r of filtered) {
      const key = (r.name || '').toLowerCase()
      if (!key || seen.has(key)) continue
      seen.add(key)
      unique.push(r)
    }

    const companiesResult = await upsertScrapedCompanies(unique)
    const jobsResult = await upsertScrapedJobs(unique)

    const jobs = unique.slice(0, 50).map(r => ({
      title: r.jobTitle || 'Software Engineer Intern',
      company: r.name,
      location: r.location || 'USA',
      applyUrl: r.careersUrl || '',
      source: 'ai_search',
    }))

    await logActivity('ai_search', {
      description,
      remote,
      bySource,
      unique: unique.length,
      companies_added: companiesResult.added,
      jobs_added: jobsResult.added,
    })

    res.json({
      jobs,
      total: jobs.length,
      companiesAdded: companiesResult.added,
      jobsAdded: jobsResult.added,
      bySource,
    })
  } catch (err) {
    console.error('[ai-search] error:', err)
    res.status(500).json({ error: err.message })
  }
}
