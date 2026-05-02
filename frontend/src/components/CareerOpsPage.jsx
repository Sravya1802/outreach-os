import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'

const APP_STATUS_LABELS = {
  interested:   { label:'Interested',    bg:'#eff6ff', color:'#2563eb' },
  applied:      { label:'Applied',       bg:'#fdf4ff', color:'#9333ea' },
  phone_screen: { label:'Phone Screen',  bg:'#fefce8', color:'#ca8a04' },
  interview:    { label:'Interview',     bg:'#fff7ed', color:'#c2410c' },
  offer:        { label:'Offer',         bg:'#f0fdf4', color:'#15803d' },
  rejected:     { label:'Rejected',      bg:'#fef2f2', color:'#dc2626' },
  pass:         { label:'Pass',          bg:'#f8fafc', color:'#64748b' },
}

function Spin({ color = '#6366f1', size = 20 }) {
  return <span style={{ display:'inline-block', width:size, height:size, border:`2px solid ${color}30`, borderTopColor:color, borderRadius:'50%', animation:'spin 0.7s linear infinite' }} />
}

function fitScore(score) {
  const n = Number(score)
  return Number.isFinite(n) ? n : null
}

function ScoreCircle({ score }) {
  const n = fitScore(score)
  if (n == null || n <= 0) return (
    <div style={{ width:52, height:52, borderRadius:'50%', border:'2px solid #e2e8f0', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
      <span style={{ fontSize:10, color:'#94a3b8', fontWeight:700 }}>N/A</span>
    </div>
  )
  const pct = Math.min(n / 5, 1)
  const color = pct >= 0.85 ? '#16a34a' : pct >= 0.7 ? '#ca8a04' : pct >= 0.5 ? '#2563eb' : '#dc2626'
  return (
    <div style={{ width:52, height:52, borderRadius:'50%', border:`3px solid ${color}`, display:'flex', alignItems:'center', justifyContent:'center', background:`${color}10`, flexShrink:0 }}>
      <span style={{ fontSize:14, fontWeight:800, color }}>{n.toFixed(1)}</span>
    </div>
  )
}

export default function CareerOpsPage() {
  const navigate = useNavigate()
  const [applications, setApplications] = useState([])
  const [loading, setLoading]   = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [filter, setFilter]     = useState('all')
  const [error, setError]       = useState(null)

  function loadRanked(silent = false) {
    if (!silent) setRefreshing(true)
    return api.career.ranked()
      .then(d => {
        const rows = Array.isArray(d) ? d : (Array.isArray(d?.applications) ? d.applications : [])
        setApplications(rows)
        setError(null)
      })
      .catch(e => { console.warn('Career ranked fetch error:', e); setError(e.message || 'Failed to load ranked roles') })
      .finally(() => { setLoading(false); setRefreshing(false) })
  }

  // Initial load + auto-refresh when the tab regains focus. The ranked list is
  // stale otherwise — fit scores and statuses change in other tabs (CareerOps
  // evaluations, company-detail tracking) but this page only loaded once.
  useEffect(() => {
    loadRanked(true)
    const onFocus = () => { if (document.visibilityState === 'visible') loadRanked(true) }
    document.addEventListener('visibilitychange', onFocus)
    window.addEventListener('focus', onFocus)
    return () => {
      document.removeEventListener('visibilitychange', onFocus)
      window.removeEventListener('focus', onFocus)
    }
  }, [])

  const filtered = applications.filter(a => {
    if (filter === 'all') return true
    if (filter === 'applied') return ['applied','phone_screen','interview','offer'].includes(a.status)
    if (filter === 'scored') return fitScore(a.fit_score) != null
    return true
  })

  const scored = applications.map(a => ({ app: a, score: fitScore(a.fit_score) })).filter(a => a.score != null)
  const avgScore = scored.length > 0
    ? (scored.reduce((s, a) => s + a.score, 0) / scored.length).toFixed(1)
    : null

  const topPick = scored.reduce((best, row) => (!best || row.score > best.score ? row : best), null)?.app
  const applyCount = scored.filter(a => a.score >= 4.2).length

  return (
    <div style={{ flex:1, overflowY:'auto', background:'#f8fafc' }}>
      {/* Header */}
      <div style={{ padding:'24px 40px 20px', background:'#fff', borderBottom:'1px solid #e2e8f0' }}>
        <h1 style={{ fontSize:22, fontWeight:800, color:'#0f172a', margin:'0 0 4px' }}>Career Ops</h1>
        <p style={{ fontSize:13, color:'#64748b', margin:'0 0 20px' }}>Track applications, fit scores, and next steps</p>

        {/* Stats */}
        {applications.length > 0 && (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:12 }}>
            {[
              { label:'Total Tracked', value: applications.length, sub:'companies', tint:'#6366f1' },
              { label:'Avg Fit Score', value: avgScore ? `${avgScore}/5` : '—', sub:'out of 5.0', tint:'#059669' },
              { label:'Top Pick', value: topPick?.company_name || '—', sub: topPick?.fit_score ? `${topPick.fit_score}/5` : 'no score', tint:'#F26625' },
              { label:'Apply Now', value: applyCount, sub:'score ≥ 4.2', tint:'#dc2626' },
            ].map(s => (
              <div key={s.label} style={{ padding:'14px 16px', background:'#f8fafc', borderRadius:10, border:'1px solid #e2e8f0' }}>
                <div style={{ fontSize:20, fontWeight:800, color: s.tint }}>{String(s.value)}</div>
                <div style={{ fontSize:12, fontWeight:700, color:'#0f172a', marginTop:2 }}>{s.label}</div>
                <div style={{ fontSize:11, color:'#94a3b8' }}>{s.sub}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ padding:'20px 40px' }}>
        {/* Filters */}
        <div style={{ display:'flex', gap:8, marginBottom:20, alignItems:'center', justifyContent:'space-between' }}>
          <div style={{ display:'flex', gap:8 }}>
            {['all','applied','scored'].map(f => (
              <button key={f} onClick={() => setFilter(f)}
                style={{ padding:'6px 14px', borderRadius:8, border:`1px solid ${filter === f ? '#6366f1' : '#e2e8f0'}`, background: filter === f ? '#eff6ff' : '#fff', color: filter === f ? '#6366f1' : '#64748b', fontSize:12, fontWeight:600, cursor:'pointer' }}>
                {f === 'all' ? 'All Tracked' : f === 'applied' ? 'In Progress' : 'Scored'}
              </button>
            ))}
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <button onClick={() => loadRanked()} disabled={refreshing}
              title="Refresh ranked roles"
              style={{ padding:'6px 12px', fontSize:12, fontWeight:600, background:'#fff', color:'#4f46e5', border:'1px solid #c7d2fe', borderRadius:8, cursor: refreshing ? 'default' : 'pointer', display:'flex', alignItems:'center', gap:6 }}>
              {refreshing ? <Spin size={11} /> : '↻'} Refresh
            </button>
            <div style={{ fontSize:12, color:'#94a3b8' }}>Ranked by fit score</div>
          </div>
        </div>

        {loading ? (
          <div style={{ display:'flex', justifyContent:'center', paddingTop:60 }}><Spin /></div>
        ) : error ? (
          <div style={{ textAlign:'center', paddingTop:60, background:'#fff', borderRadius:16, border:'1px solid #fecaca', padding:'60px 40px' }}>
            <div style={{ fontSize:40, marginBottom:16 }}>⚠</div>
            <div style={{ fontSize:18, fontWeight:700, color:'#991b1b', marginBottom:8 }}>Ranked roles failed to load</div>
            <div style={{ fontSize:13, color:'#b91c1c', marginBottom:24 }}>{error}</div>
            <button onClick={() => window.location.reload()}
              style={{ padding:'10px 24px', background:'#dc2626', color:'#fff', border:'none', borderRadius:10, fontSize:13, fontWeight:700, cursor:'pointer' }}>
              Retry
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign:'center', paddingTop:60, background:'#fff', borderRadius:16, border:'1px solid #e2e8f0', padding:'60px 40px' }}>
            <div style={{ fontSize:40, marginBottom:16 }}>📋</div>
            <div style={{ fontSize:18, fontWeight:700, color:'#475569', marginBottom:8 }}>No applications tracked yet</div>
            <div style={{ fontSize:13, color:'#94a3b8', marginBottom:24 }}>
              Open a company detail page and use the Career Ops tab to track your application status and fit score.
            </div>
            <button onClick={() => navigate('/companies')}
              style={{ padding:'10px 24px', background:'linear-gradient(135deg,#6366f1,#7c3aed)', color:'#fff', border:'none', borderRadius:10, fontSize:13, fontWeight:700, cursor:'pointer' }}>
              Browse Companies →
            </button>
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            {filtered.map((app, i) => {
              const stMeta = APP_STATUS_LABELS[app.status] || APP_STATUS_LABELS.interested
              const score = fitScore(app.fit_score)
              const bestFilteredScore = Math.max(...filtered.map(a => fitScore(a.fit_score) ?? 0))
              const isBest = score != null && score > 0 && score === bestFilteredScore
              return (
                <div key={app.id || i}
                  style={{ background:'#fff', border:`1px solid ${isBest ? '#4ade80' : '#e2e8f0'}`, borderRadius:14, padding:'20px 24px', display:'flex', gap:18, alignItems:'flex-start', position:'relative' }}>
                  {isBest && (
                    <div style={{ position:'absolute', top:14, right:16, fontSize:10, fontWeight:700, padding:'3px 10px', background:'#f0fdf4', color:'#15803d', border:'1px solid #bbf7d0', borderRadius:20 }}>
                      ★ Best Match
                    </div>
                  )}
                  <ScoreCircle score={app.fit_score} />
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:4, flexWrap:'wrap' }}>
                      {/* Role title shown FIRST when this came from an evaluation —
                          users want the role identity, not just the company. */}
                      {app.job_title && (
                        <div style={{ fontWeight:800, fontSize:16, color:'#0f172a' }}>{app.job_title}</div>
                      )}
                      <div style={{ fontWeight: app.job_title ? 600 : 800, fontSize: app.job_title ? 13 : 16, color: app.job_title ? '#64748b' : '#0f172a' }}>
                        {app.job_title ? `· ${app.company_name}` : app.company_name}
                      </div>
                      {app.grade && (
                        <span style={{ fontSize:11, fontWeight:800, padding:'2px 8px', borderRadius:6, background:`${ { A:'#16a34a', B:'#0d9488', C:'#d97706', D:'#ea580c', F:'#dc2626' }[app.grade] || '#94a3b8' }20`, color:{ A:'#16a34a', B:'#0d9488', C:'#d97706', D:'#ea580c', F:'#dc2626' }[app.grade] || '#94a3b8' }}>
                          Grade {app.grade}
                        </span>
                      )}
                      <span style={{ fontSize:10, padding:'3px 8px', borderRadius:6, background:stMeta.bg, color:stMeta.color, fontWeight:700 }}>{stMeta.label}</span>
                      {app.source === 'evaluation' && (
                        <span style={{ fontSize:9, padding:'2px 7px', borderRadius:5, background:'#eef2ff', color:'#4f46e5', fontWeight:700, letterSpacing:'0.05em', textTransform:'uppercase' }}>
                          From CareerOps
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize:12, color:'#64748b', marginBottom:8 }}>
                      {[
                        app.salary && `💰 ${app.salary}`,
                        app.location_type && app.location_type !== 'onsite' && app.location_type,
                        app.applied_date && `Applied ${app.applied_date}`,
                        app.follow_up_date && `Follow up ${app.follow_up_date}`,
                      ].filter(Boolean).join(' · ')}
                    </div>
                    {app.fit_assessment && (
                      <div style={{ fontSize:12, color:'#475569', lineHeight:1.5, marginBottom:10, padding:'10px 12px', background:'#f8fafc', borderRadius:8 }}>
                        {String(app.fit_assessment).slice(0, 200)}{String(app.fit_assessment).length > 200 ? '…' : ''}
                      </div>
                    )}
                    {app.notes && (
                      <div style={{ fontSize:11, color:'#64748b', fontStyle:'italic', marginBottom:8 }}>{app.notes.slice(0, 120)}{app.notes.length > 120 ? '…' : ''}</div>
                    )}
                    <div style={{ display:'flex', gap:8, marginTop:8 }}>
                      {app.company_id ? (
                        <button onClick={() => navigate(`/company/${app.company_id}`)}
                          style={{ padding:'6px 16px', background:'#6366f1', color:'#fff', border:'none', borderRadius:8, fontSize:12, fontWeight:700, cursor:'pointer' }}>
                          View →
                        </button>
                      ) : app.job_url ? (
                        <a href={app.job_url} target="_blank" rel="noreferrer"
                          style={{ padding:'6px 16px', background:'#6366f1', color:'#fff', border:'none', borderRadius:8, fontSize:12, fontWeight:700, cursor:'pointer', textDecoration:'none' }}>
                          Open Posting ↗
                        </a>
                      ) : null}
                      {app.source === 'evaluation' && app.evaluation_id && (
                        <button onClick={() => navigate(`/career?evalId=${app.evaluation_id}`)}
                          style={{ padding:'6px 16px', background:'#fff', color:'#4f46e5', border:'1px solid #c7d2fe', borderRadius:8, fontSize:12, fontWeight:700, cursor:'pointer' }}>
                          See evaluation →
                        </button>
                      )}
                    </div>
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
