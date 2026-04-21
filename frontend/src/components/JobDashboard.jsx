import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'

const GRADE_COLOR = { A:'#16a34a', B:'#0d9488', C:'#d97706', D:'#ea580c', F:'#dc2626' }

function Spin({ color = '#6366f1', size = 18 }) {
  return <span style={{ display:'inline-block', width:size, height:size, border:`2px solid ${color}30`, borderTopColor:color, borderRadius:'50%', animation:'spin 0.7s linear infinite' }} />
}

function KPICard({ label, value, sub, tint, onClick }) {
  return (
    <div onClick={onClick}
      style={{ padding:'18px 20px', background:'#fff', border:'1px solid #e2e8f0', borderRadius:12, cursor: onClick ? 'pointer' : 'default', transition:'all 0.15s' }}
      onMouseEnter={e => { if (onClick) { e.currentTarget.style.borderColor = tint; e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.06)' } }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.boxShadow = 'none' }}>
      <div style={{ fontSize:24, fontWeight:800, color: tint }}>{value}</div>
      <div style={{ fontSize:12, fontWeight:700, color:'#0f172a', marginTop:3 }}>{label}</div>
      {sub && <div style={{ fontSize:11, color:'#94a3b8', marginTop:2 }}>{sub}</div>}
    </div>
  )
}

function FunnelBar({ label, count, max, tint }) {
  const pct = max > 0 ? Math.max(3, Math.round((count / max) * 100)) : 0
  return (
    <div style={{ marginBottom:10 }}>
      <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:4 }}>
        <span style={{ color:'#475569', fontWeight:600 }}>{label}</span>
        <span style={{ color: tint, fontWeight:800 }}>{count}</span>
      </div>
      <div style={{ height:8, background:'#f1f5f9', borderRadius:4, overflow:'hidden' }}>
        <div style={{ height:'100%', width:`${pct}%`, background: tint, borderRadius:4, transition:'width 0.5s' }} />
      </div>
    </div>
  )
}

function timeAgo(iso) {
  if (!iso) return ''
  const h = Math.floor((Date.now() - new Date(iso)) / 3600000)
  if (h < 1) return 'just now'
  if (h < 24) return `${h}h ago`
  if (h < 168) return `${Math.floor(h / 24)}d ago`
  return `${Math.floor(h / 168)}w ago`
}

export default function JobDashboard() {
  const navigate = useNavigate()
  const [m, setM]             = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try { setM(await api.jobMetrics()) } catch (_) { setM(null) }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  if (loading && !m) {
    return <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center' }}><Spin size={28} /></div>
  }
  if (!m) {
    return <div style={{ flex:1, padding:40 }}>Failed to load metrics</div>
  }

  const { summary, applyFunnel, applyModes, gradeDist, topOutreachCompanies, recentEvals, recentApplied } = m
  const funnelMax = Math.max(applyFunnel.evaluated, applyFunnel.applied, applyFunnel.responded, applyFunnel.interview, applyFunnel.offer, applyFunnel.rejected, 1)
  const gradeMax  = Math.max(...Object.values(gradeDist), 1)

  return (
    <div style={{ flex:1, overflowY:'auto', background:'#f8fafc' }}>
      {/* Header */}
      <div style={{ padding:'24px 40px', background:'#fff', borderBottom:'1px solid #e2e8f0' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexWrap:'wrap', gap:12 }}>
          <div>
            <h1 style={{ fontSize:22, fontWeight:800, color:'#0f172a', margin:'0 0 4px' }}>Job Dashboard</h1>
            <p style={{ fontSize:13, color:'#64748b', margin:0 }}>Every company, contact, and application — tracked end-to-end</p>
          </div>
          <button onClick={load}
            style={{ padding:'8px 16px', fontSize:12, fontWeight:700, background:'#fff', color:'#475569', border:'1px solid #e2e8f0', borderRadius:8, cursor:'pointer' }}>
            ↻ Refresh
          </button>
        </div>
      </div>

      <div style={{ padding:'24px 40px', display:'flex', flexDirection:'column', gap:24 }}>

        {/* Top-level KPIs */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(150px, 1fr))', gap:12 }}>
          <KPICard label="Companies" value={summary.totalCompanies.toLocaleString()} sub="in database" tint="#6366f1" onClick={() => navigate('/companies')} />
          <KPICard label="Evaluations" value={summary.totalEvaluations} sub="roles scored A–F" tint="#7c3aed" onClick={() => navigate('/career-ops-workflow')} />
          <KPICard label="Applied" value={applyFunnel.applied} sub={`${applyModes.manual} manual · ${applyModes.auto} auto`} tint="#0891b2" onClick={() => navigate('/pipeline')} />
          <KPICard label="Contacts" value={summary.totalContacts} sub={`${summary.contactsWithEmail} emails · ${summary.contactsWithLinkedIn} LinkedIn`} tint="#059669" onClick={() => navigate('/outreach')} />
          <KPICard label="Outreach Sent" value={summary.outreachSent} sub={`${summary.outreachGenerated} drafted`} tint="#d97706" />
          <KPICard label="Response Rate" value={`${summary.responseRate}%`} sub={`${summary.outreachReplied} / ${summary.outreachSent}`} tint="#dc2626" />
        </div>

        {/* Two-column section */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:24 }}>

          {/* Application Funnel */}
          <div style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:12, padding:20 }}>
            <h2 style={{ fontSize:14, fontWeight:800, color:'#0f172a', margin:'0 0 14px' }}>Application Funnel</h2>
            <FunnelBar label="Evaluated"    count={applyFunnel.evaluated} max={funnelMax} tint="#6366f1" />
            <FunnelBar label="Applied"      count={applyFunnel.applied}   max={funnelMax} tint="#0891b2" />
            <FunnelBar label="Responded"    count={applyFunnel.responded} max={funnelMax} tint="#ca8a04" />
            <FunnelBar label="Interviewing" count={applyFunnel.interview} max={funnelMax} tint="#7c3aed" />
            <FunnelBar label="Offer"        count={applyFunnel.offer}     max={funnelMax} tint="#16a34a" />
            <FunnelBar label="Rejected"     count={applyFunnel.rejected}  max={funnelMax} tint="#dc2626" />
            <div style={{ marginTop:16, padding:'10px 12px', background:'#f8fafc', borderRadius:8, fontSize:12, color:'#475569' }}>
              <strong>{summary.applyRate}%</strong> of evaluated roles you've applied to
            </div>
          </div>

          {/* Grade Distribution */}
          <div style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:12, padding:20 }}>
            <h2 style={{ fontSize:14, fontWeight:800, color:'#0f172a', margin:'0 0 14px' }}>Fit-Score Distribution</h2>
            {['A','B','C','D','F'].map(g => (
              <FunnelBar key={g} label={`Grade ${g}`} count={gradeDist[g] || 0} max={gradeMax} tint={GRADE_COLOR[g]} />
            ))}
            <div style={{ marginTop:16, padding:'10px 12px', background:'#f0fdf4', borderRadius:8, fontSize:12, color:'#166534', border:'1px solid #bbf7d0' }}>
              <strong>{(gradeDist.A || 0) + (gradeDist.B || 0)}</strong> roles scored A or B — your best bets to apply first.
            </div>
          </div>
        </div>

        {/* Top outreach companies */}
        <div style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:12, padding:20 }}>
          <h2 style={{ fontSize:14, fontWeight:800, color:'#0f172a', margin:'0 0 14px' }}>Where your outreach effort went</h2>
          {topOutreachCompanies.length === 0 ? (
            <div style={{ fontSize:13, color:'#94a3b8', padding:'14px 0' }}>No outreach yet — find contacts on a company to start.</div>
          ) : (
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
              <thead>
                <tr style={{ background:'#f8fafc' }}>
                  {['Company','Contacts','Emails','Sent','Replied'].map(h => (
                    <th key={h} style={{ padding:'8px 12px', textAlign:h === 'Company' ? 'left' : 'right', fontWeight:700, color:'#475569', fontSize:11, textTransform:'uppercase', letterSpacing:'0.06em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {topOutreachCompanies.map((c, i) => (
                  <tr key={i} style={{ borderTop:'1px solid #f1f5f9' }}>
                    <td style={{ padding:'10px 12px', color:'#0f172a', fontWeight:600 }}>
                      {c.name}
                      {c.category && <div style={{ fontSize:11, color:'#94a3b8', fontWeight:400 }}>{c.category}</div>}
                    </td>
                    <td style={{ padding:'10px 12px', textAlign:'right', color:'#475569', fontWeight:600 }}>{c.contact_count}</td>
                    <td style={{ padding:'10px 12px', textAlign:'right', color:'#16a34a', fontWeight:600 }}>{c.email_count}</td>
                    <td style={{ padding:'10px 12px', textAlign:'right', color:'#0891b2', fontWeight:600 }}>{c.sent_count}</td>
                    <td style={{ padding:'10px 12px', textAlign:'right', color:'#dc2626', fontWeight:600 }}>{c.replied_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Recent timeline — two columns */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:24 }}>
          <div style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:12, padding:20 }}>
            <h2 style={{ fontSize:14, fontWeight:800, color:'#0f172a', margin:'0 0 14px' }}>Recent Evaluations</h2>
            {recentEvals.length === 0 ? (
              <div style={{ fontSize:13, color:'#94a3b8' }}>No evaluations yet.</div>
            ) : (
              recentEvals.slice(0, 8).map((e, i) => (
                <a key={i} href={`/api/career/evaluations/${e.id}/report.html`} target="_blank" rel="noreferrer"
                  style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 0', borderBottom: i < recentEvals.length - 1 ? '1px solid #f1f5f9' : 'none', textDecoration:'none' }}>
                  <div style={{ width:26, height:26, borderRadius:'50%', border:`2px solid ${GRADE_COLOR[e.grade] || '#94a3b8'}`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                    <span style={{ fontSize:11, fontWeight:900, color: GRADE_COLOR[e.grade] || '#94a3b8' }}>{e.grade || '—'}</span>
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:12, fontWeight:700, color:'#0f172a', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{e.job_title}</div>
                    <div style={{ fontSize:11, color:'#94a3b8' }}>{e.company_name} · {timeAgo(e.created_at)}</div>
                  </div>
                </a>
              ))
            )}
          </div>

          <div style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:12, padding:20 }}>
            <h2 style={{ fontSize:14, fontWeight:800, color:'#0f172a', margin:'0 0 14px' }}>Recently Applied</h2>
            {recentApplied.length === 0 ? (
              <div style={{ fontSize:13, color:'#94a3b8' }}>No applications submitted yet.</div>
            ) : (
              recentApplied.slice(0, 8).map((e, i) => (
                <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 0', borderBottom: i < recentApplied.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                  <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:10, background:'#ecfeff', color:'#0891b2', flexShrink:0 }}>{e.apply_status}</span>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:12, fontWeight:700, color:'#0f172a', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{e.job_title}</div>
                    <div style={{ fontSize:11, color:'#94a3b8' }}>{e.company_name} · {timeAgo(e.applied_at)}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
