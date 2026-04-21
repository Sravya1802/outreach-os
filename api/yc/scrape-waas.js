import { getYCHiringCompanies, filterYCCompanies } from '../../backend/services/yc.js'
import { upsertYCCompanies } from '../_lib/ycStore.js'
import { logActivity } from '../_lib/companyStore.js'

export default async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end()

  try {
    const companies = await getYCHiringCompanies()
    const usFilter = filterYCCompanies(companies, { location: 'us' })
    const toImport = usFilter.slice(0, 500)
    const result = await upsertYCCompanies(toImport)

    await logActivity('yc_waas_scrape', {
      matched: usFilter.length,
      imported: result.imported,
      skipped: result.skipped,
    })

    res.json({
      imported: result.imported,
      skipped: result.skipped,
      total: usFilter.length,
      source: 'yc-oss-api',
    })
  } catch (err) {
    console.error('[yc/scrape-waas] error:', err)
    res.status(500).json({ error: err.message })
  }
}
