import { scrapeOneSource } from '../../backend/services/scraper.js'
import { upsertScrapedCompanies, upsertScrapedJobs, logActivity } from '../_lib/companyStore.js'

export default async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end()

  const {
    jobTitle = 'Software Engineer Intern',
    location = 'United States',
    jobType = 'intern',
  } = req.body || {}

  try {
    const subcategory = `${jobTitle} ${jobType}`.trim()
    const { results } = await scrapeOneSource('linkedin', subcategory, 'Tech & Software')

    const companiesResult = await upsertScrapedCompanies(results)
    const jobsResult = await upsertScrapedJobs(results)

    const jobs = results.slice(0, 50).map(r => ({
      title: r.jobTitle || jobTitle,
      company: r.name,
      location: r.location || location,
      applyUrl: r.careersUrl || '',
      source: 'linkedin_finder',
    }))

    await logActivity('linkedin_finder', {
      jobTitle,
      location,
      found: results.length,
      companies_added: companiesResult.added,
      jobs_added: jobsResult.added,
    })

    res.json({
      jobs,
      total: jobs.length,
      companiesAdded: companiesResult.added,
      jobsAdded: jobsResult.added,
    })
  } catch (err) {
    console.error('[linkedin-finder] error:', err)
    res.status(500).json({ error: err.message })
  }
}
