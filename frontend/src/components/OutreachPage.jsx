import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'

const STATUS_PILLS = {
  pending:   { bg:'#f8fafc', color:'#64748b', border:'#e2e8f0' },
  generated: { bg:'#eff6ff', color:'#2563eb', border:'#bfdbfe' },
  dm_sent:   { bg:'#fdf4ff', color:'#9333ea', border:'#f0abfc' },
  sent:      { bg:'#fefce8', color:'#ca8a04', border:'#fde68a' },
  replied:   { bg:'#f0fdf4', color:'#15803d', border:'#bbf7d0' },
  closed:    { bg:'#f8fafc', color:'#64748b', border:'#e2e8f0' },
}

const EMAIL_BADGES = {
  verified: { bg:'#f0fdf4', color:'#15803d', label:'✓ verified' },
  valid:    { bg:'#eff6ff', color:'#2563eb', label:'valid' },
  risky:    { bg:'#fefce8', color:'#ca8a04', label:'risky' },
  invalid:  { bg:'#fef2f2', color:'#dc2626', label:'invalid' },
}

function Spin({ color = '#6366f1', size = 20 }) {
  return <span style={{ display:'inline-block', width:size, height:size, border:`2px solid ${color}30`, borderTopColor:color, borderRadius:'50%', animation:'spin 0.7s linear infinite' }} />
}

export default function OutreachPage() {
  const navigate = useNavigate()
  const [contacts, setContacts] = useState([])
  const [loading, setLoading]   = useState(true)
  const [emailFilter, setEmailFilter] = useState('with_email') // 'all' | 'with_email' | 'no_email'
  const [company, setCompany]   = useState('')  // company filter
  const [search, setSearch]     = useState('')
  const [sortBy, setSortBy]     = useState('newest') // newest | az | za | company | status

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams({ limit: '500' })
    if (emailFilter === 'with_email') params.set('hasEmail', 'true')
    if (emailFilter === 'no_email')   params.set('noEmail', 'true')
    api.unified.allContacts(params)
      .then(d => setContacts(d.contacts || []))
      .catch(e => { console.error('[outreach] all-contacts failed:', e); setContacts([]) })
      .finally(() => setLoading(false))
  }, [emailFilter])

  // Unique companies for dropdown
  const companies = useMemo(() => {
    const names = [...new Set(contacts.map(c => c.company_name).filter(Boolean))].sort()
    return names
  }, [contacts])

  const filtered = useMemo(() => {
    const f = contacts.filter(c => {
      if (company && c.company_name !== company) return false
      if (!search) return true
      const q = search.toLowerCase()
      return (c.name || '').toLowerCase().includes(q) ||
             (c.company_name || '').toLowerCase().includes(q) ||
             (c.title || '').toLowerCase().includes(q) ||
             (c.email || '').toLowerCase().includes(q)
    })
    return f.sort((a, b) => {
      if (sortBy === 'az') return (a.name || '').localeCompare(b.name || '')
      if (sortBy === 'za') return (b.name || '').localeCompare(a.name || '')
      if (sortBy === 'company') return (a.company_name || '').localeCompare(b.company_name || '')
      if (sortBy === 'status') return (a.status || 'zz').localeCompare(b.status || 'zz')
      // newest — contacts table doesn't expose created_at here reliably; use id desc
      return (b.id || 0) - (a.id || 0)
    })
  }, [contacts, company, search, sortBy])

  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', background:'#f8fafc' }}>
      {/* Header */}
      <div style={{ padding:'24px 32px 20px', background:'#fff', borderBottom:'1px solid #e2e8f0', flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:16, marginBottom:4 }}>
          <h1 style={{ fontSize:22, fontWeight:800, color:'#0f172a', margin:0 }}>Outreach CRM</h1>
          <button type="button" onClick={() => navigate('/outreach/templates')}
            title="Edit the email + LinkedIn DM templates the AI uses for generated outreach"
            style={{ padding:'8px 14px', borderRadius:9, border:'1px solid #c7d2fe', background:'#eef2ff', color:'#4f46e5', fontSize:12, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap', flexShrink:0 }}>
            ✏ Manage templates
          </button>
        </div>
        <p style={{ fontSize:13, color:'#64748b', margin:'0 0 16px' }}>
          {filtered.length} contact{filtered.length !== 1 ? 's' : ''}{company ? ` at ${company}` : ' across all companies'}
        </p>

        <div style={{ display:'flex', gap:10, alignItems:'center', flexWrap:'wrap' }}>
          {/* Search */}
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search name, title, email…"
            style={{ padding:'8px 14px', borderRadius:8, border:'1px solid #e2e8f0', fontSize:13, outline:'none', minWidth:220 }} />

          {/* Company filter */}
          <select value={company} onChange={e => setCompany(e.target.value)}
            style={{ padding:'8px 12px', borderRadius:8, border:'1px solid #e2e8f0', fontSize:13, color: company ? '#0f172a' : '#94a3b8', background:'#fff', outline:'none', minWidth:160 }}>
            <option value="">All Companies</option>
            {companies.map(co => <option key={co} value={co}>{co}</option>)}
          </select>

          {/* Email filter */}
          <div style={{ display:'flex', gap:4, background:'#f1f5f9', borderRadius:9, padding:3 }}>
            {[['all','All'],['with_email','Has Email'],['no_email','No Email']].map(([f, label]) => (
              <button key={f} onClick={() => setEmailFilter(f)}
                style={{ padding:'6px 14px', borderRadius:7, border:'none', background: emailFilter === f ? '#fff' : 'transparent', color: emailFilter === f ? '#6366f1' : '#64748b', fontSize:12, fontWeight:600, cursor:'pointer', boxShadow: emailFilter === f ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', transition:'all 0.12s' }}>
                {label}
              </button>
            ))}
          </div>

          {/* Sort */}
          <select value={sortBy} onChange={e => setSortBy(e.target.value)}
            style={{ padding:'8px 12px', borderRadius:8, border:'1px solid #e2e8f0', fontSize:13, color:'#0f172a', background:'#fff', outline:'none' }}>
            <option value="newest">↓ Newest</option>
            <option value="az">A → Z (name)</option>
            <option value="za">Z → A (name)</option>
            <option value="company">By company</option>
            <option value="status">By status</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div style={{ flex:1, overflowY:'auto', padding:'16px 32px' }}>
        {loading ? (
          <div style={{ display:'flex', justifyContent:'center', paddingTop:60 }}><Spin /></div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign:'center', paddingTop:60 }}>
            <div style={{ fontSize:40, marginBottom:12 }}>👤</div>
            <div style={{ fontSize:16, fontWeight:700, color:'#475569', marginBottom:8 }}>No contacts found</div>
            <div style={{ fontSize:13, color:'#94a3b8', marginBottom:20 }}>
              {emailFilter === 'with_email' ? 'No contacts with emails yet — open a company and click "Find People"' : 'No contacts match your filters'}
            </div>
          </div>
        ) : (
          <div style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:12, overflow:'hidden' }}>
            <div style={{ display:'grid', gridTemplateColumns:'2fr 1.5fr 2fr 1fr 80px', gap:12, padding:'10px 18px', background:'#f8fafc', borderBottom:'1px solid #e2e8f0', fontSize:11, fontWeight:700, color:'#64748b', textTransform:'uppercase', letterSpacing:'0.06em' }}>
              <span>Contact</span><span>Company</span><span>Email</span><span>Status</span><span></span>
            </div>
            {filtered.map((c, i) => {
              const badge  = EMAIL_BADGES[c.email_status]
              const stPill = STATUS_PILLS[c.status] || STATUS_PILLS.pending
              return (
                <div key={c.id || i} style={{ display:'grid', gridTemplateColumns:'2fr 1.5fr 2fr 1fr 80px', gap:12, padding:'12px 18px', borderBottom: i < filtered.length - 1 ? '1px solid #f1f5f9' : 'none', alignItems:'center' }}>
                  <div>
                    <div style={{ fontWeight:600, fontSize:13, color:'#0f172a' }}>{c.name || '—'}</div>
                    {c.title && <div style={{ fontSize:11, color:'#94a3b8' }}>{c.title}</div>}
                  </div>
                  <div>
                    <span style={{ fontSize:13, color:'#475569', fontWeight:500, cursor:'pointer' }}
                      onClick={() => c.job_id && navigate(`/company/${c.job_id}`)}>
                      {c.company_name || '—'}
                    </span>
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
                    {c.email ? (
                      <>
                        <span style={{ fontSize:12, color:'#0f172a', fontFamily:'monospace' }}>{c.email}</span>
                        {badge && <span style={{ fontSize:9, padding:'2px 6px', borderRadius:4, background:badge.bg, color:badge.color, fontWeight:700 }}>{badge.label}</span>}
                      </>
                    ) : (
                      <span style={{ fontSize:11, color:'#94a3b8' }}>No email</span>
                    )}
                  </div>
                  <div>
                    {c.status && (
                      <span style={{ fontSize:10, padding:'3px 8px', borderRadius:6, background:stPill.bg, color:stPill.color, border:`1px solid ${stPill.border}`, fontWeight:700 }}>
                        {c.status}
                      </span>
                    )}
                  </div>
                  <div>
                    {c.job_id && (
                      <button onClick={() => navigate(`/company/${c.job_id}`)}
                        style={{ padding:'5px 10px', background:'#eff6ff', color:'#6366f1', border:'1px solid #c7d2fe', borderRadius:6, fontSize:11, fontWeight:700, cursor:'pointer' }}>
                        View →
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
