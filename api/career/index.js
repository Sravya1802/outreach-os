import { getSupabase } from '../_lib/supabase.js'
import { evaluateJob, fetchJobFromUrl } from '../../backend/services/jobEvaluator.js'
import { classifyFast, KNOWN_COMPANIES } from '../../backend/services/categorize.js'

// ── Real websites + careers URLs for the companies we seed ──────────────────
// Hand-curated for the big names that use proprietary ATS (Workday, iCIMS,
// custom) so the UI links to the real careers page instead of a scraped ATS
// hostname. Fallback: guess from `{name}.com`.
const WEBSITES = {
  'Apple':            ['apple.com',            'https://www.apple.com/careers/us/'],
  'Microsoft':        ['microsoft.com',        'https://careers.microsoft.com/v2/global/en/home'],
  'Google':           ['google.com',           'https://careers.google.com/jobs/results/'],
  'Meta':             ['meta.com',             'https://www.metacareers.com/jobs'],
  'Amazon':           ['amazon.com',           'https://www.amazon.jobs/en/'],
  'Salesforce':       ['salesforce.com',       'https://careers.salesforce.com/en/jobs/'],
  'Oracle':           ['oracle.com',           'https://careers.oracle.com/jobs/'],
  'Adobe':            ['adobe.com',            'https://careers.adobe.com/us/en'],
  'Ibm':              ['ibm.com',              'https://www.ibm.com/careers/'],
  'Intel':            ['intel.com',            'https://jobs.intel.com/'],
  'Nvidia':           ['nvidia.com',           'https://www.nvidia.com/en-us/about-nvidia/careers/'],
  'Netflix':          ['netflix.com',          'https://jobs.netflix.com/'],
  'Uber':             ['uber.com',             'https://www.uber.com/us/en/careers/'],
  'Airbnb':           ['airbnb.com',           'https://careers.airbnb.com/'],
  'Spotify':          ['spotify.com',          'https://www.lifeatspotify.com/jobs'],
  'Linkedin':         ['linkedin.com',         'https://careers.linkedin.com/'],
  'Twitter':          ['x.com',                'https://careers.x.com/en'],
  'Goldman Sachs':    ['goldmansachs.com',     'https://www.goldmansachs.com/careers/'],
  'Morgan Stanley':   ['morganstanley.com',    'https://www.morganstanley.com/people/'],
  'Jp Morgan':        ['jpmorgan.com',         'https://careers.jpmorgan.com/'],
  'Jpmorgan':         ['jpmorgan.com',         'https://careers.jpmorgan.com/'],
  'Jpmorgan Chase':   ['jpmorganchase.com',    'https://careers.jpmorgan.com/'],
  'Citigroup':        ['citigroup.com',        'https://jobs.citi.com/'],
  'Citibank':         ['citi.com',             'https://jobs.citi.com/'],
  'Citi':             ['citi.com',             'https://jobs.citi.com/'],
  'Barclays':         ['barclays.com',         'https://home.barclays/careers/'],
  'Ubs':              ['ubs.com',              'https://www.ubs.com/global/en/careers.html'],
  'Deutsche Bank':    ['db.com',               'https://careers.db.com/'],
  'Two Sigma':        ['twosigma.com',         'https://www.twosigma.com/careers/'],
  'Citadel':          ['citadel.com',          'https://www.citadel.com/careers/'],
  'Jane Street':      ['janestreet.com',       'https://www.janestreet.com/join-jane-street/'],
  'Jump Trading':     ['jumptrading.com',      'https://www.jumptrading.com/careers/'],
  'Hudson River Trading': ['hudson-trading.com','https://www.hudsonrivertrading.com/careers/'],
  'De Shaw':          ['deshaw.com',           'https://www.deshaw.com/careers'],
  'Renaissance Technologies': ['rentec.com',   'https://www.rentec.com/'],
  'Optiver':          ['optiver.com',          'https://optiver.com/careers/'],
  'Susquehanna':      ['sig.com',              'https://careers.sig.com/'],
  'Bridgewater':      ['bridgewater.com',      'https://www.bridgewater.com/careers'],
  'Point72':          ['point72.com',          'https://point72.com/careers/'],
  'Palantir':         ['palantir.com',         'https://www.palantir.com/careers/'],
  'Anduril':          ['anduril.com',          'https://www.anduril.com/careers/'],
  'Stripe':           ['stripe.com',           'https://stripe.com/jobs/search'],
  'Figma':            ['figma.com',            'https://www.figma.com/careers/'],
  'Notion':           ['notion.so',            'https://www.notion.so/careers'],
  'Anthropic':        ['anthropic.com',        'https://www.anthropic.com/careers'],
  'Openai':           ['openai.com',           'https://openai.com/careers/'],
  'Databricks':       ['databricks.com',       'https://www.databricks.com/company/careers'],
  'Snowflake':        ['snowflake.com',        'https://careers.snowflake.com/'],
  'Cloudflare':       ['cloudflare.com',       'https://www.cloudflare.com/careers/'],
  'Datadog':          ['datadoghq.com',        'https://careers.datadoghq.com/'],
}

function guessWebsite(displayName) {
  const hit = WEBSITES[displayName]
  if (hit) return `https://www.${hit[0]}`
  // Fallback: collapse to slug.com (e.g. "Jane Street" → "janestreet.com").
  const slug = displayName.toLowerCase().replace(/[^a-z0-9]+/g, '')
  if (!slug) return null
  return `https://www.${slug}.com`
}

function guessCareersUrl(displayName) {
  const hit = WEBSITES[displayName]
  if (hit) return hit[1]
  const slug = displayName.toLowerCase().replace(/[^a-z0-9]+/g, '')
  if (!slug) return null
  return `https://www.${slug}.com/careers`
}

// ── Role classifier (intern vs. fulltime) — mirrors backend/routes/jobs.js ──
const INTERN_KW   = /\binterns?\b|\binternships?\b|\bco-op\b|\bcoop\b|\bsummer 202[456]\b/i
const FULLTIME_KW = /\bfull.?time\b|\bnew.?grad\b|\bentry.?level\b|\bjunior\b/i
const CS_ROLE_KW  = /\b(software|engineer|developer|backend|frontend|full.?stack|data|ml|machine learning|ai|scientist|research|platform|infrastructure|devops|sre|security)\b/i
const NON_CS_ROLE = /\b(product\s+manager|sales|marketing|business|account|recruiter|hr|finance|ops|compliance|legal|support|customer)\b/i

function classifyRoleType(title) {
  if (!title) return null
  if (!CS_ROLE_KW.test(title)) return null
  if (NON_CS_ROLE.test(title)) return null
  if (INTERN_KW.test(title)) return 'intern'
  if (FULLTIME_KW.test(title)) return 'fulltime'
  if (/\bsenior\b|\blead\b|\bstaff\b|\bprincipal\b|\bhead\b/i.test(title)) return 'fulltime'
  return null
}

function roleTypeMatches(classified, wanted) {
  if (!classified) return false
  if (wanted === 'intern')   return classified === 'intern'
  if (wanted === 'fulltime') return classified === 'fulltime'
  return true
}

// ── Greenhouse / Lever / Ashby JSON APIs ────────────────────────────────────
async function fetchAtsRoles(slug, roleType) {
  const out = []
  // Greenhouse
  try {
    const r = await fetch(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=false`, { signal: AbortSignal.timeout(6000) })
    if (r.ok) {
      const d = await r.json()
      for (const j of (d.jobs || [])) {
        const cls = classifyRoleType(j.title || '')
        if (!roleTypeMatches(cls, roleType)) continue
        out.push({ title: j.title, location: j.location?.name || '', source: 'greenhouse', apply_url: j.absolute_url || `https://boards.greenhouse.io/${slug}` })
      }
    }
  } catch {}
  if (out.length) return out
  // Lever
  try {
    const r = await fetch(`https://api.lever.co/v0/postings/${slug}?mode=json&limit=250`, { signal: AbortSignal.timeout(6000) })
    if (r.ok) {
      const d = await r.json()
      for (const j of (Array.isArray(d) ? d : [])) {
        const cls = classifyRoleType(j.text || '')
        if (!roleTypeMatches(cls, roleType)) continue
        out.push({ title: j.text, location: j.categories?.location || '', source: 'lever', apply_url: j.hostedUrl || `https://jobs.lever.co/${slug}` })
      }
    }
  } catch {}
  if (out.length) return out
  // Ashby
  try {
    const r = await fetch(`https://api.ashbyhq.com/posting-api/job-board/${slug}`, { signal: AbortSignal.timeout(6000) })
    if (r.ok) {
      const d = await r.json()
      for (const j of (d.jobs || d.jobPostings || [])) {
        const cls = classifyRoleType(j.title || '')
        if (!roleTypeMatches(cls, roleType)) continue
        out.push({ title: j.title, location: j.locationName || j.location || '', source: 'ashby', apply_url: j.jobPostingUrl || j.applyUrl || `https://jobs.ashbyhq.com/${slug}` })
      }
    }
  } catch {}
  return out
}

// ── Workday — try common subdomains (wd1/wd5/wd12/wd3/wd2) ──────────────────
async function fetchWorkdayRoles(slug, roleType) {
  if (!slug) return []
  const searchText = roleType === 'fulltime' ? 'software engineer' : 'intern'
  const results = []
  const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  for (const sub of ['wd1', 'wd5', 'wd12', 'wd3', 'wd2']) {
    const tenants = ['External_Career_Site', 'External', 'Careers', `${slug}_careers`]
    for (const tenant of tenants) {
      try {
        const url = `https://${slug}.${sub}.myworkdayjobs.com/wday/cxs/${slug}/${tenant}/jobs`
        const r = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'User-Agent': UA },
          body: JSON.stringify({ limit: 100, offset: 0, searchText, appliedFacets: {} }),
          signal: AbortSignal.timeout(8000),
        })
        if (!r.ok) continue
        const d = await r.json()
        const postings = d.jobPostings || []
        if (postings.length === 0) continue
        // Trust Workday's text search when it returns results — use a softer
        // filter. For intern: require "intern" or "co-op" literally in title.
        // For fulltime: require a CS-role keyword and reject obvious non-CS.
        for (const j of postings) {
          const title = j.title || ''
          const ok = roleType === 'intern'
            ? /\binterns?\b|\binternship\b|\bco-?op\b/i.test(title) && !NON_CS_ROLE.test(title)
            : CS_ROLE_KW.test(title) && !NON_CS_ROLE.test(title) && !INTERN_KW.test(title)
          if (!ok) continue
          results.push({
            title,
            location: j.locationsText || '',
            source: 'workday',
            apply_url: `https://${slug}.${sub}.myworkdayjobs.com/${tenant}/job${j.externalPath || ''}`,
          })
        }
        if (results.length) return results
      } catch {}
    }
  }
  return results
}

// ── Serper (Google search) fallback ─────────────────────────────────────────
// Searches the company's own careers domain + the major ATS hosts and filters
// the results by CS role + intern/fulltime keyword. Matches the local backend's
// Step 1d implementation — this is what keeps Salesforce/Microsoft/Google/
// Amazon working when their ATS APIs refuse direct access.
async function fetchSerperRoles(companyName, companyWebsite, roleType) {
  const key = (process.env.SERPER_API_KEY || '').trim()
  if (!key || key.length < 10) return []

  // Build site clause.
  let siteClause = 'site:boards.greenhouse.io OR site:jobs.lever.co OR site:jobs.ashbyhq.com'
  try {
    if (companyWebsite) {
      const host = new URL(companyWebsite.startsWith('http') ? companyWebsite : `https://${companyWebsite}`).hostname.replace(/^www\./, '')
      if (host && !/greenhouse|lever|ashby/.test(host)) {
        siteClause = `site:${host} OR ${siteClause}`
      }
    }
  } catch {}

  const queries = roleType === 'fulltime'
    ? [`"${companyName}" software engineer ${siteClause}`, `"${companyName}" new grad ${siteClause}`]
    : [`"${companyName}" intern software ${siteClause}`, `"${companyName}" internship engineering ${siteClause}`]

  const out = []
  const seen = new Set()
  for (const q of queries) {
    try {
      const r = await fetch('https://google.serper.dev/search', {
        method: 'POST',
        headers: { 'X-API-KEY': key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ q, num: 20 }),
        signal: AbortSignal.timeout(10000),
      })
      if (!r.ok) continue
      const d = await r.json()
      for (const it of (d.organic || [])) {
        if (!it?.link || seen.has(it.link)) continue
        // Skip aggregators.
        if (/linkedin\.com\/jobs\/search|indeed\.com|glassdoor\.com\/job-listing|ziprecruiter|monster\.com|dice\.com\/jobs|builtin|crunchbase/i.test(it.link)) continue
        const title = it.title.split(/[-–|·]|\s+at\s+.+$/i)[0].trim()
        if (title.length < 8 || title.length > 120) continue
        const isIntern = /\bintern/i.test(title)
        if (roleType === 'intern' && !isIntern) continue
        if (roleType === 'fulltime' && isIntern) continue
        if (!CS_ROLE_KW.test(title) || NON_CS_ROLE.test(title)) continue
        seen.add(it.link)
        out.push({
          title,
          location: it.snippet?.match(/\b([A-Z][a-z]+(?:\s[A-Z][a-z]+)*,\s*[A-Z]{2}|Remote|Hybrid)\b/)?.[1] || '',
          source: 'serper',
          apply_url: it.link,
        })
      }
    } catch {}
  }
  return out
}

// ── Apple's internal jobs API ───────────────────────────────────────────────
async function fetchAppleRoles(roleType) {
  const out = []
  const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  const endpoints = [
    'https://jobs.apple.com/api/role/search',
    'https://jobs.apple.com/api/v1/search',
  ]
  const body = JSON.stringify({
    query: roleType === 'fulltime' ? 'software engineer' : 'internship',
    filters: { locations: ['united-states-USA'] },
    page: 1, locale: 'en-us', sort: 'newest',
  })
  for (const url of endpoints) {
    try {
      const r = await fetch(url, {
        method: 'POST',
        redirect: 'follow',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': UA,
          'Origin': 'https://jobs.apple.com',
          'Referer': 'https://jobs.apple.com/en-us/search',
        },
        body,
        signal: AbortSignal.timeout(9000),
      })
      if (!r.ok) continue
      const d = await r.json().catch(() => null)
      const items = d?.searchResults || d?.res?.searchResults || []
      for (const it of items.slice(0, 30)) {
        const title = it.postingTitle || it.transformedPostingTitle
        if (!title) continue
        const isIntern = /\bintern/i.test(title)
        if (roleType === 'intern' && !isIntern) continue
        if (roleType === 'fulltime' && isIntern) continue
        const slug = (it.transformedPostingTitle || title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
        out.push({
          title,
          location: Array.isArray(it.locations) ? (it.locations[0]?.name || '') : '',
          source: 'apple',
          apply_url: `https://jobs.apple.com/en-us/details/${it.id || it.positionId}/${slug}`,
        })
      }
      if (out.length) return out
    } catch {}
  }
  return out
}

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
    // their own ATS. Safe to re-run; also fixes stale workday/ATS hostnames
    // previously stored as company.website.
    if (action === 'seed-known-companies') {
      const fullRows = []
      for (const [name, meta] of KNOWN_COMPANIES.entries()) {
        const displayName = name.replace(/\b\w/g, c => c.toUpperCase())
        fullRows.push({
          name: displayName,
          category: meta.category,
          website: guessWebsite(displayName),
          careers_url: guessCareersUrl(displayName),
          status: 'active',
        })
      }
      // Probe whether companies.careers_url exists (older installs won't have
      // it until the user re-runs the migration). If missing, drop the column
      // from the payload so insert/update still succeeds.
      const hasCareersUrl = await (async () => {
        const { error } = await sb.from('companies').select('careers_url').limit(1)
        return !error
      })()
      const sanitize = (r) => hasCareersUrl ? r : (() => { const { careers_url, ...rest } = r; return rest })()

      const rows = fullRows.map(sanitize)
      const { data: inserted, error: insErr } = await sb
        .from('companies')
        .upsert(rows, { onConflict: 'name', ignoreDuplicates: true })
        .select('id, name')
      if (insErr) throw insErr

      // Fix bad websites on existing rows.
      const insertedNames = new Set((inserted || []).map(r => r.name))
      const toFix = fullRows.filter(r => !insertedNames.has(r.name) && r.website)
      let fixed = 0
      for (const r of toFix) {
        const { data: existing } = await sb.from('companies').select('website').eq('name', r.name).maybeSingle()
        if (!existing) continue
        const bad = !existing.website || /workday|myworkdayjobs|greenhouse|lever\.co|ashby|icims|smartrecruiters|recruitee|workable/i.test(existing.website)
        if (bad) {
          const patch = hasCareersUrl ? { website: r.website, careers_url: r.careers_url } : { website: r.website }
          const { error } = await sb.from('companies').update(patch).eq('name', r.name)
          if (!error) fixed++
        }
      }
      return res.json({
        added: inserted?.length || 0,
        websites_fixed: fixed,
        total: fullRows.length,
        careers_url_column: hasCareersUrl,
      })
    }

    // ── Per-company role scrape ───────────────────────────────────────────────
    // Ports the local backend's scrape-roles across Greenhouse / Lever / Ashby
    // JSON APIs + Workday (multi-subdomain) + Apple's internal jobs API. Writes
    // hits to the jobs table so JobScraperTab reloads show them.
    if (action === 'company-scrape-roles') {
      const { companyId, roleType = 'intern' } = req.body || {}
      if (!companyId) return res.status(400).json({ error: 'companyId required' })
      const { data: company } = await sb.from('companies').select('*').eq('id', companyId).maybeSingle()
      if (!company) return res.status(404).json({ error: 'Company not found' })
      const name = company.name

      const collected = []

      // (1) Apple-specific — Apple's own jobs API indexes everything.
      if (/^apple\b/i.test(name)) {
        try { collected.push(...(await fetchAppleRoles(roleType))) } catch {}
      }

      // (2) Greenhouse / Lever / Ashby with slug variants derived from name +
      // careers_url + website.
      const slugs = new Set()
      const addSlug = (s) => { if (s) slugs.add(s.toLowerCase().replace(/[^a-z0-9-]/g, '')) }
      addSlug(name.toLowerCase().replace(/[^a-z0-9]/g, ''))
      addSlug(name.toLowerCase().replace(/\s+/g, '-'))
      addSlug(name.toLowerCase().split(/\s+/)[0])
      for (const url of [company.careers_url, company.website].filter(Boolean)) {
        const m = url.match(/(?:greenhouse\.io|lever\.co|ashbyhq\.com)\/([^/?#]+)/)
        if (m?.[1]) addSlug(m[1])
      }
      for (const slug of slugs) {
        if (collected.length) break
        const ats = await fetchAtsRoles(slug, roleType)
        collected.push(...ats)
      }

      // (3) Workday — try wd1 / wd5 / wd12 / wd3 / wd2 subdomains with the slug.
      if (!collected.length) {
        const wdSlug = name.toLowerCase().replace(/[^a-z0-9]/g, '')
        collected.push(...(await fetchWorkdayRoles(wdSlug, roleType)))
      }

      // (4) Serper fallback — Google search the company's careers + ATS
      // domains. This is what the local backend relied on for big names whose
      // ATS is SPA-only (Salesforce, Microsoft, Google, Amazon, Apple, etc.).
      if (!collected.length) {
        collected.push(...(await fetchSerperRoles(name, company.website || '', roleType)))
      }

      // Dedupe + US-first + save.
      const seen = new Set()
      const unique = collected.filter(r => {
        const k = r.apply_url || r.title
        if (seen.has(k)) return false
        seen.add(k); return true
      }).slice(0, 25)

      if (unique.length) {
        const rows = unique.map(r => ({
          source: r.source || 'career-scrape',
          title: r.title,
          company_name: name,
          url: r.apply_url,
          category: company.category || 'startup',
          status: 'new',
          location: r.location || null,
          remote_policy: /remote/i.test(r.location || '') ? 'remote' : null,
        })).filter(r => r.url)
        if (rows.length) {
          await sb.from('jobs').upsert(rows, { onConflict: 'url', ignoreDuplicates: true })
        }
      }

      const { data: finalRoles } = await sb.from('jobs').select('*').eq('company_name', name).order('created_at', { ascending: false })
      return res.json({
        roles: finalRoles || [],
        added: unique.length,
        found: collected.length,
        careersPageUrl: company.careers_url || null,
      })
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
