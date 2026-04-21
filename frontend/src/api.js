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
    const [jobsRes, evaluationsRes, contactsRes] = await Promise.all([
      supabase.from('jobs').select('*', { count: 'exact' }),
      supabase.from('evaluations').select('*', { count: 'exact' }),
      supabase.from('job_contacts').select('*', { count: 'exact' }),
    ])

    return {
      totalCompanies: jobsRes.count || 0,
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
    const { data: jobs } = await supabase.from('jobs').select('*', { count: 'exact' })
    const { data: evaluations } = await supabase.from('evaluations').select('*')

    return {
      summary: {
        totalCompanies: jobs?.length || 0,
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
    status: () => apiCall('/credits/status'),
  },

  companies: {
    searchByName: (companyName) => apiCall('/companies/search-by-name', { method: 'POST', body: { companyName } }),

    categories: async () => {
      const { data } = await supabase.from('jobs').select('category')
      const cats = {}
      data?.forEach(row => {
        cats[row.category] = (cats[row.category] || 0) + 1
      })
      return { categories: Object.keys(cats) }
    },

    scrape: (params) => apiCall('/companies/scrape', { method: 'POST', body: params }),
    scrapeSource: (src, params) => apiCall(`/companies/scrape/${src}`, { method: 'POST', body: params }),

    list: async () => {
      const { data } = await supabase.from('jobs').select('*').limit(100)
      return data || []
    },
  },

  yc: {
    companies: async (params = {}) => {
      let query = supabase.from('jobs').select('*').eq('source', 'yc_startups')

      if (params.category) query = query.eq('category', params.category)
      if (params.search) query = query.ilike('name', `%${params.search}%`)

      const { data } = await query.limit(params.pageSize || 50)
      return { companies: data || [], total: data?.length || 0 }
    },

    company: async (slug) => {
      const { data } = await supabase.from('jobs').select('*').eq('name', slug).single()
      return data || {}
    },

    import: (slugs) => apiCall('/yc/import', { method: 'POST', body: { slugs } }),
    importAll: (filters) => apiCall('/yc/import-all', { method: 'POST', body: { filters } }),
    scrapeWaas: () => apiCall('/yc/scrape-waas', { method: 'POST', body: {} }),
  },

  generate: {
    email: (body) => apiCall('/generate/email', { method: 'POST', body }),
    linkedin: (body) => apiCall('/generate/linkedin', { method: 'POST', body }),
    both: (body) => apiCall('/generate/both', { method: 'POST', body }),
  },

  unified: {
    categoryCounts: async () => {
      const { data } = await supabase.from('jobs').select('category')
      const counts = {}
      data?.forEach(row => {
        counts[row.category] = (counts[row.category] || 0) + 1
      })
      return { counts: Object.entries(counts).map(([category, count]) => ({ category, count })) }
    },

    companies: async (params = {}) => {
      let query = supabase.from('jobs').select('*')

      if (params.category) query = query.eq('category', params.category)
      if (params.search) query = query.ilike('name', `%${params.search}%`)
      if (params.status) query = query.eq('status', params.status)

      const { data, count } = await query
        .order('created_at', { ascending: false })
        .range(params.page * 50 || 0, ((params.page || 0) + 1) * 50)
        .select('*', { count: 'exact' })

      return { companies: data || [], total: count || 0 }
    },

    dashboard: async () => {
      const { data: jobs } = await supabase.from('jobs').select('*')
      const { data: contacts } = await supabase.from('job_contacts').select('*')

      const grouped = {}
      jobs?.forEach(job => {
        grouped[job.id] = {
          id: job.id,
          name: job.name,
          contacts: contacts?.filter(c => c.job_id === job.id) || [],
        }
      })

      return { companies: Object.values(grouped) }
    },
  },

  jobs: {
    search: async (query) => {
      const { data } = await supabase
        .from('jobs')
        .select('*')
        .ilike('name', `%${query}%`)
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
