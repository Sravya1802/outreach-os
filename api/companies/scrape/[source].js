import { scrapeOneSource } from '../../../backend/services/scraper.js'
import { upsertScrapedCompanies, upsertScrapedJobs, logActivity } from '../../_lib/companyStore.js'

export default async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { source } = req.query
  const { subcategory = '', category = '' } = req.body || {}

  if (!source) return res.status(400).json({ error: 'source required' })

  try {
    const { results, count } = await scrapeOneSource(source, subcategory, category)
    const companiesResult = await upsertScrapedCompanies(results, category)
    const jobsResult = await upsertScrapedJobs(results, category)

    await logActivity('scrape_source', {
      source,
      subcategory,
      category,
      raw: count,
      deduped: results.length,
      added: companiesResult.added,
      updated: companiesResult.updated,
      jobs_added: jobsResult.added,
    })

    res.json({
      ok: true,
      source,
      raw: count,
      deduped: results.length,
      added: companiesResult.added,
      updated: companiesResult.updated,
      total: companiesResult.total,
      jobsAdded: jobsResult.added,
      newCompanies: companiesResult.newCompanies,
    })
  } catch (err) {
    console.error(`[scrape ${source}] error:`, err)
    res.status(500).json({ error: err.message, source })
  }
}
