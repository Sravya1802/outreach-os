import { useState, useEffect, useCallback } from 'react'
import { api } from '../api'
import { useMediaQuery } from '../hooks'

// Column order and color palette for the job-search Kanban.
const COLUMN_ORDER = ['evaluated', 'applied', 'responded', 'interview', 'offer', 'rejected']
const COL_STYLE = {
  evaluated: { tint: '#6366f1', bg: '#eef2ff', border: '#c7d2fe' },
  applied:   { tint: '#0891b2', bg: '#ecfeff', border: '#a5f3fc' },
  responded: { tint: '#ca8a04', bg: '#fefce8', border: '#fde68a' },
  interview: { tint: '#7c3aed', bg: '#faf5ff', border: '#e9d5ff' },
  offer:     { tint: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0' },
  rejected:  { tint: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
}
const GRADE_COLOR = { A:'#16a34a', B:'#0d9488', C:'#d97706', D:'#ea580c', F:'#dc2626' }

function Spin({ color = '#6366f1', size = 18 }) {
  return <span style={{ display:'inline-block', width:size, height:size, border:`2px solid ${color}30`, borderTopColor:color, borderRadius:'50%', animation:'spin 0.7s linear infinite' }} />
}

function Card({ item, onMove, onOpenReport }) {
  const grade = item.grade || '—'
  const gColor = GRADE_COLOR[grade] || '#94a3b8'
  return (
    <div style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:10, padding:'10px 12px', marginBottom:8, boxShadow:'0 1px 2px rgba(0,0,0,0.03)' }}>
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:5 }}>
        <div style={{ width:26, height:26, borderRadius:'50%', border:`2px solid ${gColor}`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
          <span style={{ fontSize:11, fontWeight:900, color: gColor }}>{grade}</span>
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:12, fontWeight:700, color:'#0f172a', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{item.job_title || 'Role'}</div>
          <div style={{ fontSize:10, color:'#64748b', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{item.company_name}</div>
        </div>
      </div>
      <div style={{ display:'flex', alignItems:'center', gap:5, marginTop:6, flexWrap:'wrap' }}>
        {item.apply_mode === 'auto' && (
          <span style={{ fontSize:9, fontWeight:700, padding:'1px 6px', borderRadius:10, background:'#f5f3ff', color:'#7c3aed' }}>⚡ auto</span>
        )}
        <button onClick={() => onOpenReport(item.id)}
          style={{ fontSize:10, padding:'3px 8px', borderRadius:5, background:'#eef2ff', color:'#4f46e5', border:'1px solid #c7d2fe', cursor:'pointer', fontWeight:600 }}>
          Report
        </button>
        {item.job_url && (
          <a href={item.job_url} target="_blank" rel="noreferrer"
            style={{ fontSize:10, padding:'3px 8px', borderRadius:5, background:'#f8fafc', color:'#475569', border:'1px solid #e2e8f0', textDecoration:'none', fontWeight:600 }}>
            Job ↗
          </a>
        )}
        <select value={item.apply_status || 'not_started'} onChange={e => onMove(item.id, e.target.value)}
          style={{ fontSize:10, padding:'2px 6px', borderRadius:5, border:'1px solid #e2e8f0', background:'#fff', color:'#475569', marginLeft:'auto', cursor:'pointer' }}>
          <option value="not_started">Evaluated</option>
          <option value="opened">Applied — opened</option>
          <option value="submitted">Applied — submitted</option>
          <option value="queued">Applied — queued</option>
          <option value="responded">Responded</option>
          <option value="interview">Interviewing</option>
          <option value="offer">Offer</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>
    </div>
  )
}

export default function ApplicationPipeline() {
  const [data, setData]     = useState(null)
  const [loading, setLoading] = useState(true)
  // On phone, the 6-column Kanban can't fit; pick one column to show at a
  // time using the stat pills as a tab selector. Default to whichever
  // column has the most items, so the user lands on the meaningful one.
  const isPhone = useMediaQuery('(max-width: 640px)')
  const [activeCol, setActiveCol] = useState('evaluated')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.career.pipeline()
      setData(r)
    } catch (e) { console.warn('Pipeline load error:', e); setData(null) }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function move(id, nextStatus) {
    try {
      await api.career.setApplyStatus(id, nextStatus)
      load()
    } catch (err) { alert('Move failed: ' + err.message) }
  }

  async function openReport(id) {
    try { await api.career.openReportTab(id) }
    catch (err) { alert('Could not open report: ' + err.message) }
  }

  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', background:'#f8fafc' }}>
      {/* Header */}
      <div style={{ padding:'22px 32px 16px', background:'#fff', borderBottom:'1px solid #e2e8f0' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:12 }}>
          <div>
            <h1 style={{ fontSize:22, fontWeight:800, color:'#0f172a', margin:'0 0 4px' }}>Application Pipeline</h1>
            <p style={{ fontSize:13, color:'#64748b', margin:0 }}>Every job you've evaluated — move cards as the process advances</p>
          </div>
          <button onClick={load} disabled={loading}
            style={{ padding:'8px 16px', fontSize:12, fontWeight:700, background:'#fff', color:'#475569', border:'1px solid #e2e8f0', borderRadius:8, cursor: loading ? 'default':'pointer', display:'flex', alignItems:'center', gap:6 }}>
            {loading ? <Spin size={12} /> : '↻'} Refresh
          </button>
        </div>

        {/* Stat pills — clickable on phone (column selector), display-only
            on desktop (the Kanban is visible all at once). */}
        {data && (
          <div style={{ display:'flex', gap:8, marginTop:14, flexWrap:'wrap' }}>
            {COLUMN_ORDER.map(k => {
              const meta = COL_STYLE[k]
              const n = data.totals?.[k] || 0
              const isActive = isPhone && activeCol === k
              const Tag = isPhone ? 'button' : 'div'
              return (
                <Tag key={k}
                  {...(isPhone ? { onClick: () => setActiveCol(k), type:'button' } : {})}
                  style={{
                    padding:'6px 14px', borderRadius:20,
                    background: isActive ? meta.tint : meta.bg,
                    border:`1px solid ${isActive ? meta.tint : meta.border}`,
                    display:'flex', alignItems:'center', gap:7,
                    cursor: isPhone ? 'pointer' : 'default',
                    fontFamily:'inherit',
                    transition:'all 0.12s',
                  }}>
                  <span style={{ fontSize:13, fontWeight:800, color: isActive ? '#fff' : meta.tint }}>{n}</span>
                  <span style={{ fontSize:11, fontWeight:700, color: isActive ? '#fff' : meta.tint, textTransform:'capitalize' }}>{data.columns[k].label}</span>
                </Tag>
              )
            })}
          </div>
        )}
      </div>

      {/* Kanban — desktop: 6 columns side-by-side with horizontal scroll.
          Phone: a single column matching activeCol, full-width. */}
      <div style={{ flex:1, overflowX: isPhone ? 'hidden' : 'auto', overflowY: isPhone ? 'auto' : 'hidden', padding: isPhone ? '14px 12px' : '20px 32px' }}>
        {loading && !data ? (
          <div style={{ display:'flex', justifyContent:'center', paddingTop:60 }}><Spin size={28} /></div>
        ) : !data || data.total === 0 ? (
          <div style={{ textAlign:'center', paddingTop:80, color:'#94a3b8' }}>
            <div style={{ fontSize:44, marginBottom:14 }}>📋</div>
            <div style={{ fontSize:15, fontWeight:700, color:'#475569', marginBottom:6 }}>Nothing in the pipeline yet</div>
            <div style={{ fontSize:12 }}>Evaluate a job in Career Ops — it'll appear here automatically.</div>
          </div>
        ) : (
          <div style={{ display:'flex', gap:16, height: isPhone ? 'auto' : '100%', minHeight: isPhone ? 0 : 400 }}>
            {(isPhone ? [activeCol] : COLUMN_ORDER).map(k => {
              const col = data.columns[k]
              const meta = COL_STYLE[k]
              return (
                <div key={k} style={{
                  width: isPhone ? '100%' : 280,
                  flexShrink: isPhone ? 1 : 0,
                  display:'flex', flexDirection:'column',
                  background: meta.bg, border:`1px solid ${meta.border}`,
                  borderRadius:12, padding:12,
                  height: isPhone ? 'auto' : '100%',
                  overflow: isPhone ? 'visible' : 'hidden',
                }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10, paddingLeft:4 }}>
                    <div>
                      <div style={{ fontSize:12, fontWeight:800, color: meta.tint, textTransform:'uppercase', letterSpacing:'0.06em' }}>{col.label}</div>
                      <div style={{ fontSize:10, color: meta.tint, opacity:0.7 }}>{col.hint}</div>
                    </div>
                    <div style={{ fontSize:11, fontWeight:700, padding:'2px 8px', borderRadius:10, background:'#fff', color: meta.tint, border:`1px solid ${meta.border}` }}>
                      {col.items.length}
                    </div>
                  </div>
                  <div style={{ flex:1, overflowY: isPhone ? 'visible' : 'auto', paddingRight:2 }}>
                    {col.items.length === 0 ? (
                      <div style={{ fontSize:11, color: meta.tint, opacity:0.5, textAlign:'center', padding:'24px 8px' }}>—</div>
                    ) : (
                      col.items.map(item => (
                        <Card key={item.id} item={item} onMove={move} onOpenReport={openReport} />
                      ))
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
