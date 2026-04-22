import { getYCHiringCompanies, filterYCCompanies } from '../../backend/services/yc.js'
import { upsertYCCompanies } from '../_lib/ycStore.js'
import { logActivity } from '../_lib/companyStore.js'

export default async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end()

  const { action, slugs, filters } = req.body || {}

  try {
    if (action === 'import') {
      if (!Array.isArray(slugs) || slugs.length === 0) {
        return res.json({ imported: 0, skipped: 0, companies: [] })
      }
      const allCompanies = await getYCHiringCompanies()
      const toImport = allCompanies.filter(c => slugs.includes(c.slug))
      const result = await upsertYCCompanies(toImport)
      await logActivity('yc_import', { requested: slugs.length, imported: result.imported, skipped: result.skipped })
      const first = result.companies[0] || null
      return res.json({ imported: result.imported, skipped: result.skipped, id: first?.id, name: first?.name, companies: result.companies })
    }

    if (action === 'import-all') {
      const f = filters || {}
      const companies = await getYCHiringCompanies()
      const toImport = filterYCCompanies(companies, f)
      const result = await upsertYCCompanies(toImport)
      await logActivity('yc_import_all', { filters: f, matched: toImport.length, imported: result.imported, skipped: result.skipped })
      return res.json({ imported: result.imported, skipped: result.skipped, total: toImport.length })
    }

    if (action === 'scrape-waas') {
      const companies = await getYCHiringCompanies()
      const usFilter = filterYCCompanies(companies, { location: 'us' })
      const toImport = usFilter.slice(0, 500)
      const result = await upsertYCCompanies(toImport)
      await logActivity('yc_waas_scrape', { matched: usFilter.length, imported: result.imported, skipped: result.skipped })
      return res.json({ imported: result.imported, skipped: result.skipped, total: usFilter.length, source: 'yc-oss-api' })
    }

    return res.status(400).json({ error: 'action must be import, import-all, or scrape-waas' })
  } catch (err) {
    console.error('[yc] error:', err)
    res.status(500).json({ error: err.message })
  }
}
