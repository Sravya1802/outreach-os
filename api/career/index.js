import { getSupabase } from '../_lib/supabase.js'
import { evaluateJob, fetchJobFromUrl } from '../../backend/services/jobEvaluator.js'
import { classifyFast, KNOWN_COMPANIES } from '../../backend/services/categorize.js'

const SCAN_GREENHOUSE = [
  'stripe','airbnb','robinhood','figma','coinbase','plaid','brex','ramp','notion','anthropic',
  'openai','scale','databricks','cloudflare','datadog','palantir','anduril','gusto','rippling','lattice',
]
const SCAN_LEVER = [
  'netflix','atlassian','duolingo','airtable','carta','flexport','klaviyo','canva','hubspot',
  'chime','affirm','databricks','snowflake','coda','asana',
]
const SCAN_ASHBY = [
  'linear','cursor','replit','railway','render','resend','raycast','supabase','clerk',
  'mercury','brex','ramp','posthog','cal','hex',
]
const CS_TITLE_RE = /intern|engineer|developer|researcher|scientist|data|ml|software|swe/i
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

function isRecent(timestamp) {
  if (!timestamp) return true
  const posted = new Date(typeof timestamp === 'number' && timestamp < 1e12 ? timestamp * 1000 : timestamp)
  return !isNaN(posted) && (Date.now() - posted.getTime()) <= SEVEN_DAYS_MS
}

async function scanGreenhouse() {
  const jobs = []
  await Promise.allSettled(SCAN_GREENHOUSE.map(async token => {
    try {
      const r = await fetch(`https://boards-api.greenhouse.io/v1/boards/${token}/jobs?content=true`, { signal: AbortSignal.timeout(5000) })
      if (!r.ok) return
      const data = await r.json()
      for (const j of (data.jobs || [])) {
        if (!CS_TITLE_RE.test(j.title)) continue
        const ts = j.updated_at || j.created_at
        if (!isRecent(ts)) continue
        jobs.push({ title: j.title, company: token, location: j.location?.name || '', postedAt: ts || null, applyUrl: j.absolute_url || `https://boards.greenhouse.io/${token}`, source: 'greenhouse' })
      }
    } catch {}
  }))
  return jobs
}

async function scanLever() {
  const jobs = []
  await Promise.allSettled(SCAN_LEVER.map(async company => {
    try {
      const r = await fetch(`https://api.lever.co/v0/postings/${company}?mode=json`, { signal: AbortSignal.timeout(5000) })
      if (!r.ok) return
      const data = await r.json()
      for (const j of (Array.isArray(data) ? data : [])) {
        if (!CS_TITLE_RE.test(j.text || '')) continue
        const ts = j.createdAt
        if (!isRecent(ts)) continue
        jobs.push({ title: j.text, company, location: j.categories?.location || j.country || '', postedAt: ts ? new Date(ts).toISOString() : null, applyUrl: j.hostedUrl || `https://jobs.lever.co/${company}`, source: 'lever' })
      }
    } catch {}
  }))
  return jobs
}

async function scanAshby() {
  const jobs = []
  await Promise.allSettled(SCAN_ASHBY.map(async company => {
    try {
      const r = await fetch(`https://api.ashbyhq.com/posting-api/job-board/${company}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobBoardName: company }), signal: AbortSignal.timeout(5000),
      })
      if (!r.ok) return
      const data = await r.json()
      for (const j of (data.jobs || data.jobPostings || [])) {
        if (!CS_TITLE_RE.test(j.title || '')) continue
        const ts = j.publishedAt || j.createdAt || j.updatedAt
        if (!isRecent(ts)) continue
        jobs.push({ title: j.title, company, location: j.location || j.locationName || '', postedAt: ts || null, applyUrl: j.jobUrl || j.applyUrl || `https://jobs.ashbyhq.com/${company}`, source: 'ashby' })
      }
    } catch {}
  }))
  return jobs
}

async function getResumeText(sb) {
  const { data } = await sb.from('meta').select('value').eq('key', 'user_resume_text').maybeSingle()
  return data?.value || null
}

export default async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const sb = getSupabase()
  const { action } = req.body || {}

  try {
    // ── Portal scan (public ATS APIs, no auth, ~60s) ──────────────────────────
    if (action === 'scan-portals') {
      const [gh, lv, ash] = await Promise.all([scanGreenhouse(), scanLever(), scanAshby()])
      const jobs = [...gh, ...lv, ...ash]
      return res.json({ jobs, total: jobs.length, bySource: { greenhouse: gh.length, lever: lv.length, ashby: ash.length } })
    }

    // ── Batch evaluate (up to 5 URLs; each ~10s) ──────────────────────────────
    if (action === 'batch-evaluate') {
      const { urls = [] } = req.body || {}
      if (!Array.isArray(urls) || urls.length === 0) return res.status(400).json({ error: 'urls[] required' })
      const resumeText = await getResumeText(sb)
      if (!resumeText) return res.status(400).json({ error: 'No resume uploaded — upload a resume first.' })
      const batch = urls.slice(0, 5)
      const settled = await Promise.allSettled(batch.map(async url => {
        const fetched = await fetchJobFromUrl(url.trim())
        if (!fetched.text) throw new Error(`Could not fetch: ${url}`)
        const ev = await evaluateJob({ jobDescription: fetched.text, resumeText, jobUrl: url })
        const { data } = await sb.from('evaluations').insert([{
          job_url: url, job_title: ev.jobTitle || 'Role', company_name: ev.companyName || 'Company',
          grade: ev.grade || 'C', score: ev.overallScore || ev.globalScore || 0,
          report_json: JSON.stringify(ev), apply_status: 'not_started', apply_mode: 'manual',
        }]).select().single()
        return { url, evalId: data?.id, evaluation: ev, status: 'done' }
      }))
      const results = settled.map((s, i) => s.status === 'fulfilled' ? s.value : { url: batch[i], status: 'failed', error: s.reason?.message })
      results.sort((a, b) => (b.evaluation?.overallScore || 0) - (a.evaluation?.overallScore || 0))
      return res.json({ results, total: results.length, done: results.filter(r => r.status === 'done').length })
    }

    // ── Resume text save (parsed client-side or by /api/career/evaluate) ──────
    if (action === 'resume-text-save') {
      const { text, name } = req.body || {}
      if (!text) return res.status(400).json({ error: 'text required' })
      await sb.from('meta').upsert([{ key: 'user_resume_text', value: text }])
      if (name) await sb.from('meta').upsert([{ key: 'user_resume_name', value: name }])
      await sb.from('meta').upsert([{ key: 'user_resume_date', value: new Date().toISOString() }])
      return res.json({ ok: true, chars: text.length })
    }

    // ── Resume info (text preview + name + date) ──────────────────────────────
    if (action === 'resume-info') {
      const { data } = await sb.from('meta').select('key, value').in('key', ['user_resume_text', 'user_resume_name', 'user_resume_date'])
      const map = Object.fromEntries((data || []).map(r => [r.key, r.value]))
      const text = map.user_resume_text || ''
      return res.json({
        hasResume: !!text,
        name: map.user_resume_name || null,
        date: map.user_resume_date || null,
        textPreview: text.slice(0, 300),
      })
    }

    // ── User profile (singleton row) ──────────────────────────────────────────
    if (action === 'profile-get') {
      const { data } = await sb.from('user_profile').select('*').eq('id', 1).maybeSingle()
      return res.json(data || {})
    }
    if (action === 'profile-update') {
      const { profile = {} } = req.body || {}
      const allowed = ['first_name','last_name','email','phone','linkedin_url','github_url','portfolio_url','location','work_authorization','needs_sponsorship','gender','race','veteran_status','disability_status','resume_dir']
      const patch = Object.fromEntries(Object.entries(profile).filter(([k]) => allowed.includes(k)))
      patch.id = 1
      const { data } = await sb.from('user_profile').upsert([patch]).select().single()
      return res.json(data || {})
    }

    // ── Evaluations CRUD ──────────────────────────────────────────────────────
    if (action === 'evaluations-list') {
      const { data } = await sb.from('evaluations')
        .select('id, job_title, company_name, grade, score, job_url, apply_status, apply_mode, pdf_path, created_at')
        .order('created_at', { ascending: false }).limit(100)
      return res.json(data || [])
    }
    if (action === 'evaluation-get') {
      const { id } = req.body || {}
      const { data } = await sb.from('evaluations').select('*').eq('id', id).maybeSingle()
      if (!data) return res.status(404).json({ error: 'Not found' })
      return res.json({ ...data, evaluation: data.report_json ? JSON.parse(data.report_json) : null })
    }
    if (action === 'evaluation-delete') {
      const { id } = req.body || {}
      await sb.from('evaluations').delete().eq('id', id)
      return res.json({ ok: true })
    }
    if (action === 'apply-status') {
      const { id, status } = req.body || {}
      const patch = { apply_status: status }
      if (['opened','submitted','queued'].includes(status)) patch.applied_at = new Date().toISOString()
      const { data } = await sb.from('evaluations').update(patch).eq('id', id).select().single()
      return res.json(data || {})
    }
    if (action === 'apply-mode') {
      const { id, mode } = req.body || {}
      const { data } = await sb.from('evaluations').update({ apply_mode: mode }).eq('id', id).select().single()
      return res.json(data || {})
    }

    // ── Resume library (list PDFs in Supabase Storage bucket 'resumes') ───────
    if (action === 'resumes-library') {
      const { data } = await sb.storage.from('resumes').list('', { limit: 100 })
      return res.json({ resumes: (data || []).map(f => ({ name: f.name, size: f.metadata?.size, updatedAt: f.updated_at })) })
    }

    // ── Tracker (evaluations grouped for ops view) ────────────────────────────
    if (action === 'tracker') {
      const { data } = await sb.from('evaluations')
        .select('id, job_title, company_name, grade, score, apply_status, applied_at, created_at')
        .order('created_at', { ascending: false }).limit(200)
      return res.json({ rows: data || [] })
    }

    // ── Auto-apply: cannot run Playwright on Vercel serverless ────────────────
    if (action === 'auto-apply-run' || action === 'auto-apply-direct') {
      return res.status(501).json({
        error: 'Auto-apply requires a long-running backend with browser automation and is not available in this deployment. Use manual apply.',
      })
    }
    if (action === 'auto-apply-resume-preview') {
      const { jobUrls = [] } = req.body || {}
      if (!jobUrls.length) return res.json({ previews: {} })
      const { data } = await sb.from('evaluations').select('id, pdf_path, job_url').in('job_url', jobUrls)
      const previews = Object.fromEntries((data || []).map(r => [r.job_url, { evalId: r.id, pdfPath: r.pdf_path || null }]))
      return res.json({ previews })
    }

    // ── Tailored resume: deferred (PDF generation requires filesystem) ────────
    if (action === 'tailored-resume') {
      return res.status(501).json({ error: 'Tailored resume generation not available in this deployment.' })
    }

    // ── Seed ~300 well-known companies from the KNOWN_COMPANIES map ──────────
    // Covers FAANG, big finance, big quant, major healthcare, etc. — companies
    // that don't show up in Greenhouse/Lever/Ashby scrapes because they run
    // their own ATS. Safe to re-run: uses upsert with ignoreDuplicates.
    if (action === 'seed-known-companies') {
      const rows = []
      for (const [name, meta] of KNOWN_COMPANIES.entries()) {
        rows.push({
          name: name.replace(/\b\w/g, c => c.toUpperCase()), // titlecase
          category: meta.category,
          status: 'active',
        })
      }
      const { data, error } = await sb
        .from('companies')
        .upsert(rows, { onConflict: 'name', ignoreDuplicates: true })
        .select('id, name, category')
      if (error) throw error
      return res.json({ added: data?.length || 0, total: rows.length })
    }

    // ── One-shot backfill: reclassify all companies using the fast classifier ─
    if (action === 'reclassify-companies') {
      const { data: all } = await sb.from('companies').select('id, name, category, description')
      const rows = all || []
      let updated = 0, checked = 0, skipped = 0
      // Serial so we don't overload the Supabase connection pool or hit the
      // 60s timeout with a large update fan-out. Chunk of 500 is plenty.
      for (const row of rows.slice(0, 500)) {
        checked++
        const opinion = classifyFast({ name: row.name, description: row.description || '' })
        if (!opinion?.category || (opinion.confidence || 0) < 0.9) { skipped++; continue }
        if (row.category === opinion.category) { skipped++; continue }
        const { error } = await sb.from('companies').update({ category: opinion.category }).eq('id', row.id)
        if (!error) updated++
      }
      return res.json({ checked, updated, skipped, total: rows.length })
    }

    return res.status(400).json({ error: `unknown action: ${action}` })
  } catch (err) {
    console.error(`[career/${action}]`, err)
    res.status(500).json({ error: err.message })
  }
}
