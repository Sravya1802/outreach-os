import { getYCHiringCompanies, filterYCCompanies } from '../../backend/services/yc.js'
import { upsertYCCompanies } from '../_lib/ycStore.js'
import { logActivity } from '../_lib/companyStore.js'

export default async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end()

  const filters = req.body?.filters || {}

  try {
    const companies = await getYCHiringCompanies()
    const toImport = filterYCCompanies(companies, filters)
    const result = await upsertYCCompanies(toImport)

    await logActivity('yc_import_all', {
      filters,
      matched: toImport.length,
      imported: result.imported,
      skipped: result.skipped,
    })

    res.json({
      imported: result.imported,
      skipped: result.skipped,
      total: toImport.length,
    })
  } catch (err) {
    console.error('[yc/import-all] error:', err)
    res.status(500).json({ error: err.message })
  }
}
