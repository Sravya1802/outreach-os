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

export const api = {
  // System health (Vercel function)
  health: () => apiCall('/health'),

  // Stats from Supabase
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
      totalApplications: 0,
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
    const { data: companies } = await supabase.from('companies').select('id')
    const { data: jobs } = await supabase.from('jobs').select('id')
    const { data: evaluations } = await supabase.from('evaluations').select('*')

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
        evaluated: evaluations?.filter(e => !e.apply_status).length || 0,
        applied: evaluations?.filter(e => ['opened', 'submitted', 'queued'].includes(e.apply_status)).length || 0,
        responded: evaluations?.filter(e => e.apply_status === 'responded').length || 0,
        interview: evaluations?.filter(e => e.apply_status === 'interview').length || 0,
        offer: evaluations?.filter(e => e.apply_status === 'offer').length || 0,
        rejected: evaluations?.filter(e => e.apply_status === 'rejected').length || 0,
      },
      gradeDist: { A: 0, B: 0, C: 0, D: 0, F: 0 },
      topOutreachCompanies: [],
      recentEvals: [],
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
    companies: async (params = {}) => {
      let query = supabase.from('companies').select('*').not('yc_batch', 'is', null)

      if (params.category) query = query.eq('category', params.category)
      if (params.search) query = query.ilike('name', `%${params.search}%`)

      const { data } = await query.limit(params.pageSize || 50)
      return { companies: data || [], total: data?.length || 0 }
    },

    company: async (slug) => {
      const { data } = await supabase.from('companies').select('*').eq('name', slug).single()
      return data || {}
    },

    import: (slugs) => apiCall('/yc/index', { method: 'POST', body: { action: 'import', slugs } }),
    importAll: (filters) => apiCall('/yc/index', { method: 'POST', body: { action: 'import-all', filters } }),
    scrapeWaas: () => apiCall('/yc/index', { method: 'POST', body: { action: 'scrape-waas' } }),
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
      const companyIds = (companies || []).map(c => c.id)
      const { data: jobs } = companyIds.length
        ? await supabase.from('jobs').select('*').in('company_name', (companies || []).map(c => c.name))
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
      const { data: job } = await supabase.from('jobs').select('*').eq('id', id).single()
      const { data: contacts } = await supabase.from('job_contacts').select('*').eq('job_id', id)
      return { job, contacts: contacts || [] }
    },

    updateStatus: async (id, status) => {
      const { data } = await supabase.from('jobs').update({ status }).eq('id', id)
      return data?.[0] || {}
    },

    scrape: (params) => apiCall('/jobs/scrape', { method: 'POST', body: params }),
  },

  career: {
    resume: async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { hasResume: false }

        const { data } = await supabase.storage
          .from('resumes')
          .list(`${user.id}`)

        return { hasResume: data && data.length > 0, name: 'resume.pdf' }
      } catch {
        return { hasResume: false }
      }
    },

    uploadResume: async (file) => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) throw new Error('Not authenticated')

        const { data, error } = await supabase.storage
          .from('resumes')
          .upload(`${user.id}/resume.pdf`, file, { upsert: true })

        if (error) throw error
        return { success: true }
      } catch (err) {
        return { success: false, error: err.message }
      }
    },

    evaluate: (body) => apiCall('/career/evaluate', { method: 'POST', body }),

    pipeline: async () => {
      const { data: evaluations } = await supabase
        .from('evaluations')
        .select('*')
        .order('created_at', { ascending: false })

      const columns = {}
      ;['not_started', 'opened', 'submitted', 'queued', 'responded', 'interview', 'offer', 'rejected'].forEach(status => {
        columns[status] = {
          label: status,
          items: evaluations?.filter(e => e.apply_status === status) || [],
        }
      })

      return { columns, total: evaluations?.length || 0, totals: columns }
    },

    setApplyStatus: async (id, status) => {
      const { data } = await supabase
        .from('evaluations')
        .update({ apply_status: status, updated_at: new Date() })
        .eq('id', id)
      return data?.[0] || {}
    },

    ranked: async () => {
      const { data } = await supabase
        .from('evaluations')
        .select('*')
        .order('grade', { ascending: false })
        .limit(50)
      return { applications: data || [] }
    },
  },

  automations: {
    linkedinFinder: (body) => apiCall('/automations/linkedin-finder', { method: 'POST', body }),
    aiSearch: (body) => apiCall('/automations/ai-search', { method: 'POST', body }),
    autoApply: (body) => apiCall('/automations/auto-apply', { method: 'POST', body }),
  },
}
