import { getSupabase } from './supabase.js'

function ycToCompanyRow(c) {
  return {
    name: c.name,
    website: c.website || null,
    description: c.one_liner || (c.long_description ? String(c.long_description).slice(0, 500) : null),
    category: 'startup',
    yc_batch: c.batch || null,
    industry: c.industry || null,
    headcount_max: c.team_size || null,
    linkedin_url: c.linkedin_url || null,
    status: c.status === 'Active' ? 'active' : (c.status?.toLowerCase?.() || 'active'),
  }
}

export async function upsertYCCompanies(ycCompanies) {
  if (!ycCompanies || ycCompanies.length === 0) {
    return { imported: 0, skipped: 0, companies: [] }
  }

  const supabase = getSupabase()
  const rows = ycCompanies.map(ycToCompanyRow).filter(r => r.name)
  const names = rows.map(r => r.name)

  const { data: existingRows, error: selErr } = await supabase
    .from('companies')
    .select('id, name')
    .in('name', names)
  if (selErr) throw selErr
  const existing = new Set((existingRows || []).map(r => r.name))

  const toInsert = rows.filter(r => !existing.has(r.name))
  const skipped = rows.length - toInsert.length

  let imported = 0
  const importedRows = []
  if (toInsert.length > 0) {
    const { data, error } = await supabase
      .from('companies')
      .insert(toInsert)
      .select('id, name, category, yc_batch, website')
    if (error) throw error
    imported = data?.length || 0
    data?.forEach(row => importedRows.push(row))
  }

  return { imported, skipped, companies: importedRows }
}
