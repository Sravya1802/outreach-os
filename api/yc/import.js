import { getYCHiringCompanies } from '../../backend/services/yc.js'
import { upsertYCCompanies } from '../_lib/ycStore.js'
import { logActivity } from '../_lib/companyStore.js'

export default async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end()

  const { slugs = [] } = req.body || {}
  if (!Array.isArray(slugs) || slugs.length === 0) {
    return res.json({ imported: 0, skipped: 0, companies: [] })
  }

  try {
    const allCompanies = await getYCHiringCompanies()
    const toImport = allCompanies.filter(c => slugs.includes(c.slug))

    const result = await upsertYCCompanies(toImport)
    await logActivity('yc_import', { requested: slugs.length, imported: result.imported, skipped: result.skipped })

    const first = result.companies[0] || null
    res.json({
      imported: result.imported,
      skipped: result.skipped,
      id: first?.id,
      name: first?.name,
      companies: result.companies,
    })
  } catch (err) {
    console.error('[yc/import] error:', err)
    res.status(500).json({ error: err.message })
  }
}
