import { getSupabase } from './supabase.js'

function deriveWebsite(careersUrl) {
  if (!careersUrl) return null
  try {
    const u = new URL(careersUrl)
    return `${u.protocol}//${u.hostname}`
  } catch {
    return null
  }
}

/**
 * Upsert scraped companies into the `companies` table.
 * Input: normalized scraper results ({ name, careersUrl, location, source, jobTitle, ... })
 * Returns: { added, updated, total, newCompanies }
 */
export async function upsertScrapedCompanies(results) {
  const supabase = getSupabase()

  if (!results || results.length === 0) {
    return { added: 0, updated: 0, total: 0, newCompanies: [] }
  }

  // Dedupe within this batch by lowercased name (companies.name has UNIQUE)
  const byName = new Map()
  for (const r of results) {
    const name = (r.name || '').trim()
    if (!name) continue
    const key = name.toLowerCase()
    const existing = byName.get(key)
    if (!existing) {
      byName.set(key, { ...r, name })
    } else {
      if (!existing.careersUrl && r.careersUrl) existing.careersUrl = r.careersUrl
      const srcs = new Set((existing.source || '').split(',').filter(Boolean))
      ;(r.source || '').split(',').filter(Boolean).forEach(s => srcs.add(s))
      existing.source = [...srcs].join(',')
    }
  }
  const deduped = [...byName.values()]
  const names = deduped.map(r => r.name)

  // Fetch existing rows to decide insert vs. update
  const { data: existingRows, error: selErr } = await supabase
    .from('companies')
    .select('id, name, website, status, linkedin_url')
    .in('name', names)
  if (selErr) throw selErr

  const existingMap = new Map((existingRows || []).map(row => [row.name.toLowerCase(), row]))

  const toInsert = []
  const toUpdate = []

  for (const r of deduped) {
    const key = r.name.toLowerCase()
    const existing = existingMap.get(key)
    const website = deriveWebsite(r.careersUrl)

    if (!existing) {
      toInsert.push({
        name: r.name,
        website,
        category: 'startup',
        status: 'active',
      })
    } else {
      const patch = {}
      if (!existing.website && website) patch.website = website
      if (!existing.status) patch.status = 'active'
      if (Object.keys(patch).length > 0) {
        toUpdate.push({ id: existing.id, patch })
      }
    }
  }

  let added = 0
  const newCompanies = []
  if (toInsert.length > 0) {
    const { data, error } = await supabase
      .from('companies')
      .insert(toInsert)
      .select('id, name, category, website')
    if (error) throw error
    added = data?.length || 0
    data?.forEach(row => newCompanies.push(row))
  }

  let updated = 0
  for (const { id, patch } of toUpdate) {
    const { error } = await supabase.from('companies').update(patch).eq('id', id)
    if (!error) updated++
  }

  return { added, updated, total: deduped.length, newCompanies }
}

/**
 * Upsert scraped job postings into the `jobs` table, linked to company_name.
 * The `jobs` table has a UNIQUE constraint on `url`, so duplicate URLs are skipped.
 */
export async function upsertScrapedJobs(results) {
  const supabase = getSupabase()
  if (!results || results.length === 0) return { added: 0 }

  const rows = results
    .filter(r => r.careersUrl && r.name)
    .map(r => ({
      source: r.source || 'scrape',
      source_id: null,
      title: r.jobTitle || 'Software Engineering Intern',
      company_name: r.name,
      description: r.jobDescription || null,
      url: r.careersUrl,
      category: 'startup',
      status: 'new',
      location: r.location || null,
      remote_policy: /remote/i.test(r.location || '') ? 'remote' : null,
    }))

  if (rows.length === 0) return { added: 0 }

  const { data, error } = await supabase
    .from('jobs')
    .upsert(rows, { onConflict: 'url', ignoreDuplicates: true })
    .select('id')

  if (error) {
    console.warn('[jobs upsert] error:', error.message)
    return { added: 0, error: error.message }
  }
  return { added: data?.length || 0 }
}

export async function logActivity(action, details = {}) {
  try {
    const supabase = getSupabase()
    await supabase.from('activity_log').insert([{ action, entity_type: 'company', details }])
  } catch (err) {
    console.warn('[activity_log] failed:', err.message)
  }
}
