import { supabase } from './supabaseClient'

const API = '/api'

async function apiCall(url, options = {}) {
  const res = await fetch(`${API}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || 'Request failed')
  }
  return res.json()
}

const careerAction = (action, body = {}) =>
  apiCall('/career', { method: 'POST', body: { action, ...body } })

export const api = {
  health: () => apiCall('/health'),

  stats: async () => {
    const [companiesRes, jobsRes, evaluationsRes, contactsRes] = await Promise.all([
      supabase.from('companies').select('*', { count: 'exact', head: true }),
      supabase.from('jobs').select('*', { count: 'exact', head: true }),
      supabase.from('evaluations').select('*', { count: 'exact', head: true }),
      supabase.from('job_contacts').select('*', { count: 'exact', head: true }),
    ])
    return {
      totalCompanies: companiesRes.count || 0,
      totalJobs: jobsRes.count || 0,
      totalEvaluations: evaluationsRes.count || 0,
      totalContacts: contactsRes.count || 0,
      responseRate: 0,
      activeSources: 0,
      ycImported: 0,
      totalApplications: evaluationsRes.count || 0,
    }
  },

  activity: async () => {
    const { data } = await supabase
      .from('activity_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10)
    return { activity: data || [] }
  },

  jobMetrics: async () => {
    const [{ data: companies }, { data: jobs }, { data: evaluations }] = await Promise.all([
      supabase.from('companies').select('id'),
      supabase.from('jobs').select('id'),
      supabase.from('evaluations').select('*'),
    ])
    const gradeDist = { A: 0, B: 0, C: 0, D: 0, F: 0 }
    ;(evaluations || []).forEach(e => { if (e.grade && gradeDist[e.grade] !== undefined) gradeDist[e.grade]++ })
    return {
      summary: {
        totalCompanies: companies?.length || 0,
        totalJobs: jobs?.length || 0,
        totalEvaluations: evaluations?.length || 0,
        totalContacts: 0,
        responseRate: 0,
        applyRate: 0,
      },
      applyFunnel: {
        evaluated: evaluations?.filter(e => !e.apply_status || e.apply_status === 'not_started').length || 0,
        applied: evaluations?.filter(e => ['opened', 'submitted', 'queued'].includes(e.apply_status)).length || 0,
        responded: evaluations?.filter(e => e.apply_status === 'responded').length || 0,
        interview: evaluations?.filter(e => e.apply_status === 'interview').length || 0,
        offer: evaluations?.filter(e => e.apply_status === 'offer').length || 0,
        rejected: evaluations?.filter(e => e.apply_status === 'rejected').length || 0,
      },
      gradeDist,
      topOutreachCompanies: [],
      recentEvals: (evaluations || []).slice(0, 10).map(e => ({ kind: 'evaluation', ...e })),
    }
  },

  credits: {
    status: async () => ({ credits: 999, plan: 'hobby' }),
  },

  companies: {
    searchByName: (companyName) => apiCall('/companies/search-by-name', { method: 'POST', body: { companyName } }),

    categories: async () => {
      const { data } = await supabase.from('companies').select('category')
      const cats = {}
      data?.forEach(row => {
        if (!row.category) return
        cats[row.category] = (cats[row.category] || 0) + 1
      })
      return { categories: Object.keys(cats) }
    },

    scrape: (params) => apiCall('/companies/scrape', { method: 'POST', body: params }),
    scrapeSource: (src, params) => apiCall(`/companies/scrape/${src}`, { method: 'POST', body: params }),

    list: async () => {
      const { data } = await supabase
        .from('companies')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100)
      return data || []
    },
  },

  yc: {
    companies: (params = {}) => apiCall('/yc', { method: 'POST', body: {
      action: 'list',
      page: params.page || 0,
      pageSize: params.pageSize || 50,
      filters: {
        location: params.location,
        industry: params.industry,
        maxTeamSize: params.maxTeamSize,
        minTeamSize: params.minTeamSize,
        batch: params.batch,
        q: params.q || params.search,
      },
    } }),

    company: async (slug) => {
      const { data } = await supabase.from('companies').select('*').eq('name', slug).maybeSingle()
      return data || {}
    },

    import: (slugs) => apiCall('/yc', { method: 'POST', body: { action: 'import', slugs } }),
    importAll: (filters) => apiCall('/yc', { method: 'POST', body: { action: 'import-all', filters } }),
    scrapeWaas: () => apiCall('/yc', { method: 'POST', body: { action: 'scrape-waas' } }),
  },

  generate: {
    email: (body) => apiCall('/generate/email', { method: 'POST', body }),
    linkedin: (body) => apiCall('/generate/linkedin', { method: 'POST', body }),
    both: async (body) => {
      const [emailRes, linkedinRes] = await Promise.all([
        apiCall('/generate/email', { method: 'POST', body }),
        apiCall('/generate/linkedin', { method: 'POST', body }),
      ])
      return { email: emailRes.email, linkedin: linkedinRes.linkedin }
    },
  },

  unified: {
    categoryCounts: async () => {
      const { data } = await supabase.from('companies').select('category')
      const counts = {}
      data?.forEach(row => {
        if (!row.category) return
        counts[row.category] = (counts[row.category] || 0) + 1
      })
      return { counts: Object.entries(counts).map(([category, count]) => ({ category, count })) }
    },

    companies: async (params = {}) => {
      let query = supabase.from('companies').select('*', { count: 'exact' })

      if (params.category) query = query.eq('category', params.category)
      if (params.search) query = query.ilike('name', `%${params.search}%`)
      if (params.status) query = query.eq('status', params.status)

      const pageSize = params.pageSize || 50
      const page = params.page || 0
      const { data, count } = await query
        .order('created_at', { ascending: false })
        .range(page * pageSize, (page + 1) * pageSize - 1)

      return { companies: data || [], total: count || 0 }
    },

    dashboard: async () => {
      const { data: companies } = await supabase
        .from('companies')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100)
      const { data: jobs } = companies?.length
        ? await supabase.from('jobs').select('*').in('company_name', companies.map(c => c.name))
        : { data: [] }
      const { data: contacts } = await supabase.from('job_contacts').select('*')

      const grouped = (companies || []).map(c => ({
        id: c.id,
        name: c.name,
        category: c.category,
        website: c.website,
        jobs: (jobs || []).filter(j => j.company_name === c.name),
        contacts: (contacts || []).filter(ct => (jobs || []).some(j => j.id === ct.job_id && j.company_name === c.name)),
      }))
      return { companies: grouped }
    },
  },

  jobs: {
    search: async (query) => {
      const { data } = await supabase
        .from('jobs')
        .select('*')
        .or(`title.ilike.%${query}%,company_name.ilike.%${query}%`)
        .limit(20)
      return data || []
    },
    detail: async (id) => {
      const { data: job } = await supabase.from('jobs').select('*').eq('id', id).maybeSingle()
      const { data: contacts } = await supabase.from('job_contacts').select('*').eq('job_id', id)
      return { job, contacts: contacts || [] }
    },
    updateStatus: async (id, status) => {
      const { data } = await supabase.from('jobs').update({ status }).eq('id', id).select()
      return data?.[0] || {}
    },
    scrape: (params) => apiCall('/jobs/scrape', { method: 'POST', body: params }),
  },

  career: {
    // ── Resume ────────────────────────────────────────────────────────────────
    resume: () => careerAction('resume-info'),

    uploadResume: async (file) => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        const key = user ? `${user.id}/resume.pdf` : 'shared/resume.pdf'
        const { error: upErr } = await supabase.storage
          .from('resumes')
          .upload(key, file, { upsert: true, contentType: 'application/pdf' })
        if (upErr) throw upErr

        // Extract text client-side using pdfjs via dynamic import
        const text = await extractPdfText(file)
        if (text && text.length > 50) {
          await careerAction('resume-text-save', { text, name: file.name })
        }
        return { success: true, chars: text?.length || 0 }
      } catch (err) {
        return { success: false, error: err.message }
      }
    },

    // ── Evaluate a job (single) — resume text pulled server-side ─────────────
    evaluate: (body) => apiCall('/career/evaluate', { method: 'POST', body }),

    // ── Evaluations / history ────────────────────────────────────────────────
    evaluations: () => careerAction('evaluations-list'),
    evaluation: (id) => careerAction('evaluation-get', { id }),
    deleteEvaluation: (id) => careerAction('evaluation-delete', { id }),
    batchEvaluate: (urls) => careerAction('batch-evaluate', { urls }),

    // ── Apply-state (shared with ApplicationPipeline) ────────────────────────
    setApplyStatus: (id, status) => careerAction('apply-status', { id, status }),
    setApplyMode: (id, mode) => careerAction('apply-mode', { id, mode }),

    // ── Pipeline (kanban, read-side from Supabase) ───────────────────────────
    pipeline: async () => {
      const { data: evaluations } = await supabase
        .from('evaluations')
        .select('*')
        .order('created_at', { ascending: false })

      const buckets = {
        evaluated: [], applied: [], responded: [], interview: [], offer: [], rejected: [],
      }
      ;(evaluations || []).forEach(e => {
        const s = e.apply_status || 'not_started'
        if (s === 'not_started') buckets.evaluated.push(e)
        else if (['opened', 'submitted', 'queued'].includes(s)) buckets.applied.push(e)
        else if (s === 'responded') buckets.responded.push(e)
        else if (s === 'interview') buckets.interview.push(e)
        else if (s === 'offer') buckets.offer.push(e)
        else if (s === 'rejected') buckets.rejected.push(e)
      })
      const columns = Object.fromEntries(Object.entries(buckets).map(([k, items]) => [k, { label: k, items }]))
      return { columns, total: evaluations?.length || 0, totals: columns }
    },

    // ── Portal scanner (Greenhouse/Lever/Ashby) ──────────────────────────────
    scanPortals: () => careerAction('scan-portals'),

    // ── Profile / resumes library ────────────────────────────────────────────
    profile: () => careerAction('profile-get'),
    updateProfile: (profile) => careerAction('profile-update', { profile }),
    resumesLibrary: () => careerAction('resumes-library'),

    // ── Companies (Career Ops detail) ────────────────────────────────────────
    getCompany: async (id) => {
      const { data } = await supabase.from('companies').select('*').eq('id', id).maybeSingle()
      return data || {}
    },
    updateCompany: async (id, patch) => {
      const { data } = await supabase.from('companies').update(patch).eq('id', id).select().single()
      return data || {}
    },

    // ── Tracker ──────────────────────────────────────────────────────────────
    tracker: () => careerAction('tracker'),
    ranked: async () => {
      const { data } = await supabase
        .from('evaluations')
        .select('*')
        .order('score', { ascending: false })
        .limit(50)
      return { applications: data || [] }
    },

    // ── Auto-apply (not supported on Vercel serverless) ──────────────────────
    autoApplyRun: () => careerAction('auto-apply-run'),
    autoApplyDirect: (body) => careerAction('auto-apply-direct', body),
    autoApplyResumePreview: (jobUrls) => careerAction('auto-apply-resume-preview', { jobUrls }),
    apply: async (id) => {
      // Manual "mark as applied" shortcut (no automation)
      return careerAction('apply-status', { id, status: 'submitted' })
    },

    // ── Resume / report URLs (static routes, not endpoints) ──────────────────
    tailoredResume: () => ({ ok: false, error: 'Not available in this deployment' }),
    reportHtmlUrl: (id) => `/evaluation/${id}`,
    downloadUrl: (id) => `/evaluation/${id}`,
  },

  automations: {
    linkedinFinder: (body) => apiCall('/automations/linkedin-finder', { method: 'POST', body }),
    aiSearch: (body) => apiCall('/automations/ai-search', { method: 'POST', body }),
    autoApply: (body) => apiCall('/automations/auto-apply', { method: 'POST', body }),
  },
}

// ── Helpers ────────────────────────────────────────────────────────────────────
async function extractPdfText(file) {
  try {
    const pdfjs = await import('pdfjs-dist/build/pdf.mjs')
    const workerSrc = (await import('pdfjs-dist/build/pdf.worker.mjs?url')).default
    pdfjs.GlobalWorkerOptions.workerSrc = workerSrc
    const buf = await file.arrayBuffer()
    const pdf = await pdfjs.getDocument({ data: buf }).promise
    let text = ''
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p)
      const c = await page.getTextContent()
      text += c.items.map(it => it.str).join(' ') + '\n'
    }
    return text.trim()
  } catch (err) {
    console.warn('[pdf extract] failed:', err.message)
    return ''
  }
}

