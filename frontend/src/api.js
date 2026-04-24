// ─────────────────────────────────────────────────────────────────────────────
// OutreachOS frontend → backend API client.
//
// Every route hits the Express backend at VITE_API_URL (Oracle VM in prod,
// '' in dev for vite proxy). No direct Supabase table access — the backend
// owns all data access and business logic. Supabase is only used for auth
// (App.jsx / Login.jsx).
// ─────────────────────────────────────────────────────────────────────────────

const ENV = import.meta.env || {}
const BASE = ENV.VITE_API_URL ? ENV.VITE_API_URL.replace(/\/$/, '') : ''
export const API = `${BASE}/api`
export const apiUrl = (path = '') => `${API}${path.startsWith('/') ? path : `/${path}`}`

const isFormData = (body) => typeof FormData !== 'undefined' && body instanceof FormData

async function apiCall(url, options = {}) {
  const init = {
    method: options.method || 'GET',
    headers: options.headers !== undefined
      ? options.headers
      : (isFormData(options.body) ? {} : { 'Content-Type': 'application/json' }),
  }
  if (options.body !== undefined) {
    init.body = isFormData(options.body) ? options.body : JSON.stringify(options.body)
  }
  const res = await fetch(apiUrl(url), init)
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || 'Request failed')
  }
  return res.json()
}

export const rawApiFetch = (url, options = {}) => fetch(apiUrl(url), options)

const qs = (params) => {
  const entries = Object.entries(params || {}).filter(([, v]) => v !== undefined && v !== null && v !== '')
  return entries.length ? '?' + new URLSearchParams(entries).toString() : ''
}

export const api = {
  health:     () => apiCall('/health'),
  stats:      () => apiCall('/stats'),
  activity:   () => apiCall('/activity'),
  jobMetrics: () => apiCall('/dashboard/job-metrics'),

  credits: {
    status: () => apiCall('/credits/status').catch(() => ({ credits: 999, plan: 'hobby' })),
  },

  companies: {
    list:         () => apiCall('/jobs'),
    categories:   () => apiCall('/companies/categories'),
    searchByName: (companyName) => apiCall('/companies/search-by-name', { method: 'POST', body: { companyName } }),
    // "All sources" scrape: use /jobs/scrape — it reads category/subcategory,
    // classifies via the AI classifier, and writes to the canonical `jobs` table
    // (matches what the category listing reads).
    scrape:       (params) => apiCall('/jobs/scrape', { method: 'POST', body: params }),
    // Per-source scrape still uses the legacy /companies/scrape/:src path; category
    // filtering isn't supported here, so rows land in the legacy `companies` table.
    scrapeSource: (src, params) => apiCall(`/companies/scrape/${encodeURIComponent(src)}`, { method: 'POST', body: params }),
  },

  yc: {
    companies:  (params = {}) => apiCall('/yc/companies' + qs({
      page:        params.page,
      pageSize:    params.pageSize,
      location:    params.location,
      industry:    params.industry,
      maxTeamSize: params.maxTeamSize,
      minTeamSize: params.minTeamSize,
      batch:       params.batch,
      q:           params.q || params.search,
    })),
    company:    (slug) => apiCall(`/yc/companies/${encodeURIComponent(slug)}`),
    import:     (slugs)   => apiCall('/yc/import',     { method: 'POST', body: { slugs } }),
    importAll:  (filters) => apiCall('/yc/import-all', { method: 'POST', body: { filters } }),
    scrapeWaas: () => apiCall('/yc/scrape-waas', { method: 'POST', body: {} }),
  },

  generate: {
    email:    (body) => apiCall('/generate/email',    { method: 'POST', body }),
    linkedin: (body) => apiCall('/generate/linkedin', { method: 'POST', body }),
    both: async (body) => {
      const [emailRes, linkedinRes] = await Promise.all([
        apiCall('/generate/email',    { method: 'POST', body }),
        apiCall('/generate/linkedin', { method: 'POST', body }),
      ])
      return { email: emailRes.email, linkedin: linkedinRes.linkedin }
    },
    coverLetter: (body) => apiCall('/generate/email', { method: 'POST', body: { ...body, format: 'cover_letter' } }),
    waas:        (body) => apiCall('/generate/email', { method: 'POST', body: { ...body, format: 'waas_dm' } }),
  },

  unified: {
    categoryCounts: () => apiCall('/unified/category-counts'),
    companies:      (params = {}) => apiCall('/unified/companies' + qs({
      category: params.category,
      search:   params.search,
      status:   params.status,
      page:     params.page,
      pageSize: params.pageSize,
    })),
    dashboard:      () => apiCall('/unified/dashboard'),
    allContacts:    (params = {}) => apiCall('/unified/all-contacts' + (
      params instanceof URLSearchParams ? `?${params.toString()}` : qs(params)
    )),
  },

  jobs: {
    lastRefresh:  () => apiCall('/jobs/last-refresh'),
    search:       (q) => apiCall('/jobs/search' + qs({ q })),
    detail:       (id) => apiCall(`/jobs/${id}/detail`),
    roles:        (id) => apiCall(`/jobs/${id}/roles`),
    careersUrl:   (id) => apiCall(`/jobs/${id}/careers-url`),
    contacts:     (id) => apiCall(`/jobs/${id}/contacts`),
    scrapeRoles:  (id, roleType = 'intern') => apiCall(`/jobs/${id}/scrape-roles`, { method: 'POST', body: { roleType } }),
    scrape:       (params) => apiCall('/jobs/scrape', { method: 'POST', body: params }),
    updateStatus: (id, status) => apiCall(`/jobs/${id}/status`, { method: 'PUT', body: { status } }),
    findLinkedIn: (id) => apiCall(`/jobs/${id}/find-linkedin`, { method: 'POST', body: {} }),
    findPeopleStream: (id) => apiUrl(`/jobs/${id}/find-people-stream`),
    findEmails: (id, domain = null) => apiCall(`/jobs/${id}/find-emails`, {
      method: 'POST',
      body: domain ? { domain } : {},
    }),
    findEmailForContact: (contactId) => apiCall(`/jobs/contacts/${contactId}/find-email`, { method: 'POST', body: {} }),
    generate: (contactId, type = 'email', extraContext = '') => apiCall(`/jobs/contacts/${contactId}/generate`, {
      method: 'POST',
      body: { type, extraContext },
    }),
    updateContact: (contactId, data) => apiCall(`/jobs/contacts/${contactId}`, { method: 'PUT', body: data }),
    deleteContact: (contactId) => apiCall(`/jobs/contacts/${contactId}`, { method: 'DELETE' }),
    scrapeLinkedInCompany: (id, linkedinUrl) => apiCall(`/jobs/${id}/scrape-linkedin-company`, {
      method: 'POST',
      body: { linkedinUrl },
    }),
  },

  career: {
    // ── Resume (backend-owned upload + parse) ────────────────────────────────
    resume:       () => apiCall('/career/resume'),
    uploadResume: async (file) => {
      const fd = new FormData()
      fd.append('resume', file)
      try {
        const r = await apiCall('/career/resume', { method: 'POST', body: fd })
        return { success: true, ...r }
      } catch (err) {
        return { success: false, error: err.message }
      }
    },

    // ── Evaluate / evaluations history ───────────────────────────────────────
    evaluate:         (body) => apiCall('/career/evaluate',       { method: 'POST', body }),
    batchEvaluate:    (urls) => apiCall('/career/batch-evaluate', { method: 'POST', body: { urls } }),
    evaluations:      () => apiCall('/career/evaluations'),
    evaluation:       (id) => apiCall(`/career/evaluations/${id}`),
    deleteEvaluation: (id) => apiCall(`/career/evaluations/${id}`, { method: 'DELETE' }),

    // ── Apply-state ──────────────────────────────────────────────────────────
    setApplyStatus: (id, status) => apiCall(`/career/evaluations/${id}/apply-status`, { method: 'PATCH', body: { status } }),
    setApplyMode:   (id, mode)   => apiCall(`/career/evaluations/${id}/apply-mode`,   { method: 'PATCH', body: { mode } }),
    apply:          (id) => apiCall(`/career/evaluations/${id}/apply`,        { method: 'POST' }),
    markApplied:    (id) => apiCall(`/career/evaluations/${id}/mark-applied`, { method: 'POST' }),

    // ── Pipeline / tracker / stats / ranked ──────────────────────────────────
    pipeline:    () => apiCall('/career/pipeline'),
    tracker:     () => apiCall('/career/tracker'),
    stats:       () => apiCall('/career/stats'),
    ranked:      () => apiCall('/career/ranked'),
    scanPortals: () => apiCall('/career/scan-portals', { method: 'POST' }),

    // ── Profile + resumes library ────────────────────────────────────────────
    profile:        () => apiCall('/career/profile'),
    updateProfile:  (profile) => apiCall('/career/profile', { method: 'PUT', body: profile }),
    resumesLibrary: () => apiCall('/career/resumes-library'),

    // ── Career-Ops company page ──────────────────────────────────────────────
    getCompany:    (id) => apiCall(`/career/company/${id}`),
    updateCompany: (id, patch) => apiCall(`/career/company/${id}`, { method: 'PUT', body: patch }),
    scoreFit:      (id) => apiCall(`/career/company/${id}/score-fit`, { method: 'POST' }),
    scoreFitUrl:   (id) => apiUrl(`/career/company/${id}/score-fit`),

    // ── Auto-apply ───────────────────────────────────────────────────────────
    autoApplyRun:           () => apiCall('/career/auto-apply/run', { method: 'POST' }),
    autoApplyDirect:        (body) => apiCall('/career/auto-apply-direct',        { method: 'POST', body }),
    autoApplyResumePreview: (jobUrls) => apiCall('/career/auto-apply/resume-preview', { method: 'POST', body: { jobUrls } }),

    // ── Company documents ────────────────────────────────────────────────────
    documents:        (companyId) => apiCall(`/career/${companyId}/documents`),
    uploadDocument:   async (companyId, file) => {
      const fd = new FormData()
      fd.append('file', file)
      return apiCall(`/career/${companyId}/documents`, { method: 'POST', body: fd })
    },
    deleteDocument:   (companyId, docId) => apiCall(`/career/${companyId}/documents/${docId}`, { method: 'DELETE' }),
    downloadDocument: (companyId, docId) => apiUrl(`/career/${companyId}/documents/${docId}/download`),

    // ── Report / download URLs — backend renders the HTML/PDF directly ───────
    reportHtmlUrl:  (id) => apiUrl(`/career/evaluations/${id}/report.html`),
    downloadUrl:    (id) => apiUrl(`/career/download/${id}`),
    tailoredResume: (id) => apiCall(`/career/tailored-resume/${id}`, { method: 'POST' }),
  },

  automations: {
    linkedinFinder:  (body) => apiCall('/automations/linkedin-finder', { method: 'POST', body }),
    aiSearch:        (body) => apiCall('/automations/ai-search',       { method: 'POST', body }),
    autoApply:       (body) => apiCall('/automations/auto-apply',      { method: 'POST', body }),
    logs:            (id)   => apiCall(`/automations/logs/${id}`),
    scheduled:       () => apiCall('/automations/scheduled'),
    addScheduled:    (body) => apiCall('/automations/scheduled', { method: 'POST', body }),
    deleteScheduled: (id)   => apiCall(`/automations/scheduled/${id}`, { method: 'DELETE' }),
  },
}
