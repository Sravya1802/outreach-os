// ─────────────────────────────────────────────────────────────────────────────
// Phase 5 target api.js — restores the local-backup shape, plus VITE_API_URL
// for pointing at the Oracle VM backend in production.
//
// HOW TO USE (when Phase 2 is live and Oracle VM is up):
//   1. In Vercel env vars, set VITE_API_URL=https://<your-duckdns>.duckdns.org
//      (no trailing slash; without /api suffix — we add /api in calls)
//   2. Rename: frontend/src/api.js → frontend/src/api.backup.js  (save current)
//              frontend/src/api.phase-5.js → frontend/src/api.js
//   3. Commit + push → Vercel auto-rebuilds
//   4. Frontend now talks to Oracle VM backend directly.
//
// LOCAL DEV: Vite's /api proxy in vite.config.js still works when VITE_API_URL
// is unset, so local development continues to hit localhost:3001 transparently.
// ─────────────────────────────────────────────────────────────────────────────

const BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL.replace(/\/$/, '')}/api`
  : '/api';

async function req(url, options = {}) {
  const res = await fetch(`${BASE}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

const post  = (url, body) => req(url, { method: 'POST', body });
const get   = (url)       => req(url);
const put   = (url, body) => req(url, { method: 'PUT', body });
const patch = (url, body) => req(url, { method: 'PATCH', body });
const del   = (url)       => req(url, { method: 'DELETE' });

// Raw fetch for SSE / form uploads — caller handles streaming.
// Uses the same BASE so it works with VITE_API_URL.
const rawFetch = (path, init) => fetch(`${BASE}${path}`, init);

export const api = {
  health:      () => get('/health'),
  stats:       () => get('/stats'),
  activity:    () => get('/activity'),
  jobMetrics:  () => get('/dashboard/job-metrics'),

  credits: {
    status: (refresh = false) => get(`/credits/status${refresh ? '?refresh=true' : ''}`),
  },

  companies: {
    searchByName: (companyName) => post('/companies/search-by-name', { companyName }),
    categories:   ()            => get('/companies/categories'),
    scrape:       (params = {}) => post('/companies/scrape', params),
    scrapeSource: (src, params) => post(`/companies/scrape/${src}`, params),
  },

  yc: {
    companies:  (params = {}) => get(`/yc/companies?${new URLSearchParams(params)}`),
    company:    (slug)        => get(`/yc/companies/${slug}`),
    import:     (slugs)       => post('/yc/import', { slugs }),
    importAll:  (filters)     => post('/yc/import-all', { filters }),
    scrapeWaas: ()            => post('/yc/scrape-waas', {}),
  },

  generate: {
    email:       (body) => post('/generate/email', body),
    linkedin:    (body) => post('/generate/linkedin', body),
    both:        (body) => post('/generate/both', body),
    waas:        (body) => post('/generate/waas', body),
    coverLetter: (body) => post('/generate/cover-letter', body),
  },

  unified: {
    companies:      (params = {}) => get(`/unified/companies?${new URLSearchParams(params)}`),
    categoryCounts: ()            => get('/unified/category-counts'),
    cityCounts:     (params = {}) => get(`/unified/city-counts?${new URLSearchParams(params)}`),
    contacts:       (name)        => get(`/unified/contacts/${encodeURIComponent(name)}`),
    dashboard:      ()            => get('/unified/dashboard'),
  },

  jobs: {
    list:         (params = {}) => get(`/jobs?${new URLSearchParams(params)}`),
    search:       (q)           => get(`/jobs/search?q=${encodeURIComponent(q)}`),
    scrape:       (params = {}) => post('/jobs/scrape', params),
    detail:       (id)          => get(`/jobs/${id}/detail`),
    updateStatus: (id, status)  => put(`/jobs/${id}/status`, { status }),
    contacts:     (id, source)  => get(`/jobs/${id}/contacts${source ? `?source=${source}` : ''}`),
    roles:        (id)          => get(`/jobs/${id}/roles`),
    careersUrl:   (id)          => get(`/jobs/${id}/careers-url`),
    scrapeRoles:  (id, roleType = 'intern') => post(`/jobs/${id}/scrape-roles`, { roleType }),
    findLinkedIn:          (id) => post(`/jobs/${id}/find-linkedin`, {}),
    findPeopleStream:      (id) => `${BASE}/jobs/${id}/find-people-stream`, // SSE URL
    scrapeLinkedInCompany: (id, linkedinUrl) => post(`/jobs/${id}/scrape-linkedin-company`, { linkedinUrl }),
    findEmails:   (id, domain = null) => post(`/jobs/${id}/find-emails`, domain ? { domain } : {}),
    findEmailForContact: (contactId) => post(`/jobs/contacts/${contactId}/find-email`, {}),
    generate:     (contactId, type, extraContext = '') => post(`/jobs/contacts/${contactId}/generate`, { type, extraContext }),
    updateContact:(contactId, data) => put(`/jobs/contacts/${contactId}`, data),
    deleteContact:     (contactId)  => del(`/jobs/contacts/${contactId}`),
    checkInternRoles:  (id)         => post(`/jobs/${id}/check-intern-roles`, {}),
    scraperHealth:     ()           => get('/jobs/scraper-health'),
    importSheet:       ()           => rawFetch('/jobs/import-startup-sheet', { method: 'POST' }), // returns raw Response for SSE
  },

  career: {
    resume:           ()           => get('/career/resume'),
    getCompany:       (id)         => get(`/career/company/${id}`),
    updateCompany:    (id, data)   => put(`/career/company/${id}`, data),
    stats:            ()           => get('/career/stats'),
    ranked:           ()           => get('/career/ranked'),
    documents:        (id)         => get(`/career/${id}/documents`),
    deleteDocument:   (cId, dId)   => del(`/career/${cId}/documents/${dId}`),
    uploadResume:     (formData)   => rawFetch('/career/resume', { method: 'POST', body: formData }).then(r => r.json()),
    evaluate:         (body)       => post('/career/evaluate', body),
    evaluations:      ()           => get('/career/evaluations'),
    evaluation:       (id)         => get(`/career/evaluations/${id}`),
    deleteEvaluation: (id)         => del(`/career/evaluations/${id}`),
    tailoredResume:   (id)         => post(`/career/tailored-resume/${id}`, {}),
    setApplyMode:     (id, mode)   => patch(`/career/evaluations/${id}/apply-mode`, { mode }),
    setApplyStatus:   (id, status) => patch(`/career/evaluations/${id}/apply-status`, { status }),
    apply:            (id)         => post(`/career/evaluations/${id}/apply`, {}),
    markApplied:      (id)         => post(`/career/evaluations/${id}/mark-applied`, {}),
    pipeline:         ()           => get('/career/pipeline'),
    profile:          ()           => get('/career/profile'),
    updateProfile:    (data)       => put('/career/profile', data),
    resumesLibrary:   ()           => get('/career/resumes-library'),
    autoApplyRun:     (body = {})  => post('/career/auto-apply/run', body),
    autoApplyOne:     (id, body = {}) => post(`/career/auto-apply/${id}`, body),
    autoApplyDirect:  (body)       => post('/career/auto-apply-direct', body),
    autoApplyResumePreview: (jobUrls) => post('/career/auto-apply/resume-preview', { jobUrls }),
    downloadUrl:      (id)         => `${BASE}/career/download/${id}`,
    scanPortals:      ()           => post('/career/scan-portals', {}),
    batchEvaluate:    (urls)       => post('/career/batch-evaluate', { urls }),
    tracker:          ()           => get('/career/tracker'),
    reports:          ()           => get('/career/reports'),
    reportUrl:        (filename)   => `${BASE}/career/reports/${filename}`,
    reportHtmlUrl:    (evalId)     => `${BASE}/career/evaluations/${evalId}/report.html`,
  },

  automations: {
    // SSE via POST — returns raw Response for caller to stream
    linkedinFinder: (body) => rawFetch('/automations/linkedin-finder', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    aiSearch:       (body) => rawFetch('/automations/ai-search',       { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    autoApply:      (body) => rawFetch('/automations/auto-apply',      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    getLogs:        (id)   => get(`/automations/logs/${id}`),
    getScheduled:   ()     => get('/automations/scheduled'),
    setScheduled:   (data) => post('/automations/scheduled', data),
    deleteScheduled:(id)   => del(`/automations/scheduled/${id}`),
  },

  prospects: {
    list:        (params = {}) => get(`/prospects?${new URLSearchParams(params)}`),
    stats:       ()            => get('/prospects/stats'),
    discover:    (mode, limit) => post('/prospects/discover', { mode, limit }),
    addCompany:  (companyName, companyType) => post('/prospects/add-company', { companyName, companyType }),
    generate:    (id, extraContext = '') => post(`/prospects/${id}/generate`, { extraContext }),
    findEmail:   (id) => post(`/prospects/${id}/find-email`, {}),
    verifyEmail: (id) => post(`/prospects/${id}/verify-email`, {}),
    update:      (id, data) => put(`/prospects/${id}`, data),
    delete:      (id) => del(`/prospects/${id}`),
  },
};
