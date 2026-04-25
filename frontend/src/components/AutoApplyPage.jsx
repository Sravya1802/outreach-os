import { useState, useEffect } from 'react'
import { api } from '../api'
import { AutoApplySetup } from './CareerOps'

const TABS = [
  { id: 'setup',          label: '⚙ Setup',          desc: 'Profile + resume library used to fill applications' },
  { id: 'queue',          label: '📋 Queue',         desc: 'Bulk-queue evaluations + run the worker' },
  { id: 'completed',      label: '✅ Completed',     desc: 'Applications the auto-apply worker submitted successfully' },
  { id: 'resume-folder',  label: '📁 Resume Folder', desc: 'Role-archetype PDFs: AIML / SWE / DS / DevOps / full stack / startup' },
  { id: 'history',        label: '📜 History',       desc: 'Past auto-apply runs and outcomes' },
]

const GRADE_ORDER = ['A', 'B', 'C', 'D', 'F']

export default function AutoApplyPage() {
  const [tab, setTab] = useState('setup')
  return (
    <div style={{ flex:1, overflowY:'auto', background:'#f8fafc' }}>
      {/* Header */}
      <div style={{ padding:'24px 40px 0', background:'#fff', borderBottom:'1px solid #e2e8f0' }}>
        <h1 style={{ fontSize:22, fontWeight:800, color:'#0f172a', margin:'0 0 4px' }}>Auto Apply</h1>
        <p style={{ fontSize:13, color:'#64748b', margin:'0 0 18px' }}>
          Submit applications automatically against Greenhouse, Lever, and Ashby portals using your tailored resume + profile.
        </p>
        <div style={{ display:'flex', gap:0 }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{ padding:'10px 22px', fontSize:13, fontWeight:700, background:'transparent',
                color: tab === t.id ? '#4f46e5' : '#64748b',
                border:'none', borderBottom: tab === t.id ? '3px solid #4f46e5' : '3px solid transparent',
                cursor:'pointer' }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding:'24px 40px', maxWidth:1200, margin:'0 auto' }}>
        <div style={{ fontSize:12, color:'#94a3b8', marginBottom:18 }}>{TABS.find(t => t.id === tab)?.desc}</div>
        {tab === 'setup'         && <SetupTab />}
        {tab === 'queue'         && <QueueTab />}
        {tab === 'completed'     && <CompletedTab />}
        {tab === 'resume-folder' && <ResumeFolderTab />}
        {tab === 'history'       && <HistoryTab />}
      </div>
    </div>
  )
}

function SetupTab() {
  // Reuse the existing AutoApplySetup component from CareerOps so the same
  // profile editor + resume library + run-queue button works here.
  return (
    <div style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:14, padding:'24px 28px' }}>
      <AutoApplySetup />
    </div>
  )
}

function QueueTab() {
  const [minGrade, setMinGrade] = useState('B')
  const [minScore, setMinScore] = useState(70)
  const [preview, setPreview]   = useState({ count: 0, rows: [] })
  const [loadingPreview, setLP] = useState(false)
  const [queuing, setQueuing]   = useState(false)
  const [running, setRunning]   = useState(false)
  const [result, setResult]     = useState(null)

  // Live preview as slider moves (debounced).
  useEffect(() => {
    setLP(true)
    const t = setTimeout(async () => {
      try {
        const params = new URLSearchParams()
        if (minGrade) params.set('minGrade', minGrade)
        if (minScore) params.set('minScore', String(minScore))
        const r = await api.career.bulkQueuePreview(params)
        setPreview(r)
      } catch (e) { console.warn('preview err:', e); setPreview({ count: 0, rows: [] }) }
      setLP(false)
    }, 250)
    return () => clearTimeout(t)
  }, [minGrade, minScore])

  async function queueAll() {
    setQueuing(true)
    try { const r = await api.career.bulkQueue({ minGrade, minScore }); setResult({ kind:'queued', n: r.queued }) }
    catch (e) { setResult({ kind:'error', msg: e.message }) }
    setQueuing(false)
  }

  async function runQueue() {
    setRunning(true)
    try { const r = await api.career.autoApplyRun(); setResult({ kind:'ran', summary: r }) }
    catch (e) { setResult({ kind:'error', msg: e.message }) }
    setRunning(false)
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:18 }}>
      <div style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:14, padding:'24px 28px' }}>
        <h2 style={{ fontSize:15, fontWeight:700, color:'#0f172a', margin:'0 0 18px' }}>Bulk Queue Evaluations</h2>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:24, marginBottom:24 }}>
          <div>
            <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#64748b', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:8 }}>Minimum grade</label>
            <div style={{ display:'flex', gap:6 }}>
              {GRADE_ORDER.map(g => (
                <button key={g} onClick={() => setMinGrade(g)}
                  style={{ flex:1, padding:'8px 0', fontSize:13, fontWeight:700, border:`1px solid ${minGrade === g ? '#6366f1' : '#e2e8f0'}`, borderRadius:8, cursor:'pointer',
                    background: minGrade === g ? '#eef2ff' : '#fff',
                    color: minGrade === g ? '#4f46e5' : '#64748b' }}>{g}+</button>
              ))}
              <button onClick={() => setMinGrade('')}
                style={{ flex:1, padding:'8px 0', fontSize:13, fontWeight:700, border:`1px solid ${!minGrade ? '#6366f1' : '#e2e8f0'}`, borderRadius:8, cursor:'pointer',
                  background: !minGrade ? '#eef2ff' : '#fff',
                  color: !minGrade ? '#4f46e5' : '#64748b' }}>Any</button>
            </div>
          </div>
          <div>
            <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#64748b', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:8 }}>
              Minimum score: <span style={{ color:'#0f172a' }}>{minScore}</span>
            </label>
            <input type="range" min={0} max={100} step={5} value={minScore} onChange={e => setMinScore(Number(e.target.value))}
              style={{ width:'100%', accentColor:'#6366f1' }}/>
          </div>
        </div>

        <div style={{ padding:'14px 16px', background: preview.count > 0 ? '#f0fdf4' : '#f8fafc', border:`1px solid ${preview.count > 0 ? '#bbf7d0' : '#e2e8f0'}`, borderRadius:10, marginBottom:16, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div style={{ fontSize:13, fontWeight:600, color: preview.count > 0 ? '#15803d' : '#64748b' }}>
            {loadingPreview ? '…' : `${preview.count} evaluation${preview.count === 1 ? '' : 's'} match${preview.count === 1 ? 'es' : ''}`}
          </div>
          <button onClick={queueAll} disabled={queuing || preview.count === 0}
            style={{ padding:'8px 18px', fontSize:13, fontWeight:700, border:'none', borderRadius:8, cursor: queuing || preview.count === 0 ? 'default' : 'pointer',
              background: preview.count > 0 ? 'linear-gradient(135deg,#6366f1,#7c3aed)' : '#e2e8f0',
              color: preview.count > 0 ? '#fff' : '#94a3b8', opacity: queuing ? 0.6 : 1 }}>
            {queuing ? 'Queueing…' : `Queue ${preview.count}`}
          </button>
        </div>

        {/* Preview rows */}
        {preview.rows.length > 0 && (
          <div style={{ display:'flex', flexDirection:'column', gap:6, marginBottom:8 }}>
            {preview.rows.slice(0, 5).map(r => (
              <div key={r.id} style={{ padding:'8px 12px', background:'#f8fafc', borderRadius:7, fontSize:12, display:'flex', alignItems:'center', gap:10 }}>
                <span style={{ display:'inline-block', minWidth:24, fontWeight:700, color:'#4f46e5' }}>{r.grade || '—'}</span>
                <span style={{ flex:1, color:'#0f172a' }}>{r.job_title}</span>
                <span style={{ color:'#94a3b8' }}>{r.company_name}</span>
                <span style={{ color:'#64748b', fontVariantNumeric:'tabular-nums' }}>{r.score ?? '—'}</span>
              </div>
            ))}
            {preview.rows.length > 5 && <div style={{ fontSize:11, color:'#94a3b8', textAlign:'center' }}>… +{preview.rows.length - 5} more</div>}
          </div>
        )}
      </div>

      <div style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:14, padding:'24px 28px' }}>
        <h2 style={{ fontSize:15, fontWeight:700, color:'#0f172a', margin:'0 0 8px' }}>Run Auto-Apply Worker</h2>
        <p style={{ fontSize:12, color:'#94a3b8', margin:'0 0 18px' }}>Processes every evaluation marked Auto + queued. Supported portals: Greenhouse, Lever, Ashby.</p>
        <button onClick={runQueue} disabled={running}
          style={{ padding:'10px 22px', fontSize:13, fontWeight:700, background:'linear-gradient(135deg,#16a34a,#15803d)', color:'#fff', border:'none', borderRadius:10, cursor: running ? 'default':'pointer' }}>
          {running ? 'Running…' : '⚡ Run Auto-Apply Queue'}
        </button>
      </div>

      {result && (
        <div style={{ padding:'14px 18px', background: result.kind === 'error' ? '#fef2f2' : '#f0fdf4', border:`1px solid ${result.kind === 'error' ? '#fca5a5' : '#bbf7d0'}`, borderRadius:10, fontSize:13, color: result.kind === 'error' ? '#dc2626' : '#15803d', fontWeight:600 }}>
          {result.kind === 'queued' && `✓ Queued ${result.n} evaluation${result.n === 1 ? '' : 's'} for auto-apply.`}
          {result.kind === 'ran'    && <span>✓ Run complete. {JSON.stringify(result.summary)}</span>}
          {result.kind === 'error'  && `✗ ${result.msg}`}
        </div>
      )}
    </div>
  )
}

function CompletedTab() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)

  useEffect(() => {
    api.career.pipeline()
      .then(d => {
        const items = Object.values(d?.columns || {}).flatMap(col => col.items || [])
        const completed = items
          .filter(r => r.apply_status === 'submitted')
          .sort((a, b) => new Date(b.applied_at || b.created_at || 0) - new Date(a.applied_at || a.created_at || 0))
        setRows(completed)
      })
      .catch(e => { setErr(e.message); setRows([]) })
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div style={{ padding:'40px 0', textAlign:'center', color:'#94a3b8' }}>Loading…</div>

  return (
    <div style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:14, padding:'24px 28px' }}>
      <h2 style={{ fontSize:15, fontWeight:700, color:'#0f172a', margin:'0 0 18px' }}>Completed Applications · {rows.length}</h2>

      {err && <div style={{ padding:'10px 14px', background:'#fef2f2', border:'1px solid #fca5a5', borderRadius:8, fontSize:12, color:'#dc2626', marginBottom:16 }}>✗ {err}</div>}

      {rows.length === 0 && !err && (
        <div style={{ padding:'40px 0', textAlign:'center', color:'#94a3b8' }}>
          <div style={{ fontSize:36, marginBottom:8 }}>✅</div>
          <div style={{ fontSize:13, fontWeight:600 }}>No completed auto-applications yet</div>
          <div style={{ fontSize:11, marginTop:4 }}>Submitted applications will appear here after the worker completes them.</div>
        </div>
      )}

      <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
        {rows.map(r => (
          <div key={r.id} style={{ padding:'12px 16px', border:'1px solid #e2e8f0', borderRadius:10, display:'grid', gridTemplateColumns:'1fr 72px 120px 96px', gap:14, alignItems:'center', fontSize:13 }}>
            <div>
              <div style={{ fontWeight:700, color:'#0f172a' }}>{r.job_title || 'Untitled role'}</div>
              <div style={{ fontSize:11, color:'#94a3b8' }}>{r.company_name || 'Unknown company'}</div>
            </div>
            <div style={{ fontWeight:700, color:'#16a34a' }}>{r.grade || '—'}</div>
            <div style={{ fontSize:11, fontWeight:700, padding:'4px 8px', borderRadius:6, background:'#dcfce7', color:'#15803d', textAlign:'center' }}>submitted</div>
            <div style={{ fontSize:11, color:'#94a3b8', textAlign:'right' }}>{r.applied_at ? new Date(r.applied_at).toLocaleDateString() : '—'}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function ResumeFolderTab() {
  const [data, setData] = useState({ resumeDir: '', resumes: [] })
  const [err, setErr]   = useState(null)
  useEffect(() => {
    api.career.resumesLibrary().then(setData).catch(e => setErr(e.message))
  }, [])
  return (
    <div style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:14, padding:'24px 28px' }}>
      <h2 style={{ fontSize:15, fontWeight:700, color:'#0f172a', margin:'0 0 6px' }}>Resume Folder</h2>
      <p style={{ fontSize:12, color:'#94a3b8', margin:'0 0 6px' }}>
        The auto-apply worker picks the resume from the sub-folder whose name matches the role's archetype.
      </p>
      <p style={{ fontSize:11, fontFamily:'ui-monospace, monospace', color:'#64748b', background:'#f8fafc', padding:'6px 10px', borderRadius:6, display:'inline-block', marginBottom:18 }}>
        Scanning: {data.resumeDir || '(not set — update Profile)'}
      </p>

      {err && <div style={{ padding:'10px 14px', background:'#fef2f2', border:'1px solid #fca5a5', borderRadius:8, fontSize:12, color:'#dc2626' }}>✗ {err}</div>}

      {data.resumes.length === 0 && !err && (
        <div style={{ padding:'40px 0', textAlign:'center', color:'#94a3b8' }}>
          <div style={{ fontSize:36, marginBottom:8 }}>📁</div>
          <div style={{ fontSize:13, fontWeight:600 }}>No resume folders found</div>
          <div style={{ fontSize:11, marginTop:4 }}>Drop role-specific PDFs into folders named AIML, SWE, DS, etc.</div>
        </div>
      )}

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(220px, 1fr))', gap:12 }}>
        {data.resumes.map(r => (
          <div key={r.absPath} style={{ padding:'14px 16px', border:'1px solid #e2e8f0', borderRadius:10, background:'#fafbfc' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:6 }}>
              <span style={{ fontSize:11, fontWeight:700, color:'#4f46e5', textTransform:'uppercase', letterSpacing:'0.06em' }}>{r.archetype}</span>
              <span style={{ fontSize:10, color:'#94a3b8' }}>{Math.round((r.sizeBytes || 0) / 1024)} KB</span>
            </div>
            <div style={{ fontSize:13, fontWeight:600, color:'#0f172a', marginBottom:2, wordBreak:'break-word' }}>{r.folder}</div>
            <div style={{ fontSize:11, color:'#94a3b8', wordBreak:'break-word' }}>{r.filename}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function HistoryTab() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    api.career.evaluations()
      .then(d => {
        const arr = Array.isArray(d) ? d : (d?.evaluations || [])
        const applied = arr.filter(e => e.apply_status && e.apply_status !== 'not_started')
        applied.sort((a, b) => (b.applied_at || '').localeCompare(a.applied_at || ''))
        setRows(applied)
      })
      .catch(() => setRows([]))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div style={{ padding:'40px 0', textAlign:'center', color:'#94a3b8' }}>Loading…</div>

  return (
    <div style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:14, padding:'24px 28px' }}>
      <h2 style={{ fontSize:15, fontWeight:700, color:'#0f172a', margin:'0 0 18px' }}>Past Auto-Apply Runs · {rows.length}</h2>

      {rows.length === 0 && (
        <div style={{ padding:'40px 0', textAlign:'center', color:'#94a3b8' }}>
          <div style={{ fontSize:36, marginBottom:8 }}>📜</div>
          <div style={{ fontSize:13, fontWeight:600 }}>No applications submitted yet</div>
          <div style={{ fontSize:11, marginTop:4 }}>Mark evaluations as auto + queued, then run the queue.</div>
        </div>
      )}

      <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
        {rows.map(r => (
          <div key={r.id} style={{ padding:'12px 16px', border:'1px solid #e2e8f0', borderRadius:10, display:'grid', gridTemplateColumns:'1fr 100px 100px 90px', gap:14, alignItems:'center', fontSize:13 }}>
            <div>
              <div style={{ fontWeight:700, color:'#0f172a' }}>{r.job_title}</div>
              <div style={{ fontSize:11, color:'#94a3b8' }}>{r.company_name}</div>
            </div>
            <div style={{ fontWeight:700, color:'#4f46e5' }}>{r.grade || '—'}</div>
            <div style={{ fontSize:11, fontWeight:600, padding:'3px 8px', borderRadius:5, background:'#eef2ff', color:'#4f46e5', textAlign:'center' }}>{r.apply_status}</div>
            <div style={{ fontSize:11, color:'#94a3b8', textAlign:'right' }}>{r.applied_at ? new Date(r.applied_at).toLocaleDateString() : '—'}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
