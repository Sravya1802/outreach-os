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
  if (rows.length === 0) return { imported: 0, skipped: 0, companies: [] }

  // Upsert ignoreDuplicates: inserts new names, skips conflicts on `name`.
  const { data: inserted, error: upErr } = await supabase
    .from('companies')
    .upsert(rows, { onConflict: 'name', ignoreDuplicates: true })
    .select('id, name, category, yc_batch, website')
  if (upErr) throw upErr

  const insertedNames = new Set((inserted || []).map(r => r.name))
  const skippedNames = rows.map(r => r.name).filter(n => !insertedNames.has(n))

  // Fetch IDs of the skipped (already-existing) rows so the caller can navigate
  // to them — otherwise clicking a YC card for a known company would dead-end.
  let existing = []
  if (skippedNames.length > 0) {
    const { data } = await supabase
      .from('companies')
      .select('id, name, category, yc_batch, website')
      .in('name', skippedNames)
    existing = data || []
  }

  const all = [...(inserted || []), ...existing]
  return { imported: inserted?.length || 0, skipped: skippedNames.length, companies: all }
}
