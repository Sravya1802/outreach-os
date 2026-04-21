import { scrapeAllSources } from '../../backend/services/scraper.js'
import { upsertScrapedCompanies, upsertScrapedJobs, logActivity } from '../_lib/companyStore.js'

export default async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { subcategory = '', category = '' } = req.body || {}

  try {
    const { results, bySource, errors } = await scrapeAllSources(subcategory, category)
    const companiesResult = await upsertScrapedCompanies(results)
    const jobsResult = await upsertScrapedJobs(results)

    await logActivity('scrape_all', {
      subcategory,
      category,
      deduped: results.length,
      added: companiesResult.added,
      updated: companiesResult.updated,
      jobs_added: jobsResult.added,
      bySource,
      errors,
    })

    res.json({
      ok: true,
      deduped: results.length,
      added: companiesResult.added,
      updated: companiesResult.updated,
      total: companiesResult.total,
      jobsAdded: jobsResult.added,
      bySource,
      errors,
      newCompanies: companiesResult.newCompanies,
    })
  } catch (err) {
    console.error('[scrape all] error:', err)
    res.status(500).json({ error: err.message })
  }
}
