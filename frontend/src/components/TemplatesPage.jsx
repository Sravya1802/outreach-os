import { useEffect, useState } from 'react'
import { api } from '../api'
import Spin from './Spin'

const fieldStyle = {
  width: '100%',
  minHeight: 220,
  resize: 'vertical',
  border: '1px solid #dbe3ef',
  borderRadius: 10,
  padding: 14,
  fontSize: 13,
  lineHeight: 1.55,
  color: '#0f172a',
  background: '#fff',
  outline: 'none',
  boxSizing: 'border-box',
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState({ email: '', linkedin: '' })
  const [defaults, setDefaults] = useState({ email: '', linkedin: '' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState(null)

  useEffect(() => {
    let alive = true
    api.generate.templates()
      .then(d => {
        if (!alive) return
        setTemplates(d.templates || {})
        setDefaults(d.defaults || d.templates || {})
      })
      .catch(err => alive && setStatus({ ok: false, text: err.message || 'Could not load templates' }))
      .finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [])

  async function save() {
    setSaving(true)
    setStatus(null)
    try {
      const d = await api.generate.saveTemplates(templates)
      setTemplates(d.templates || templates)
      setStatus({ ok: true, text: 'Templates saved' })
    } catch (err) {
      setStatus({ ok: false, text: err.message || 'Save failed' })
    }
    setSaving(false)
  }

  function resetToDefaults() {
    setTemplates(defaults)
    setStatus({ ok: true, text: 'Defaults loaded. Save to apply them.' })
  }

  return (
    <div style={{ flex:1, overflowY:'auto', background:'#f8fafc', padding:'40px' }}>
      <div style={{ maxWidth:980, margin:'0 auto' }}>
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:20, marginBottom:24 }}>
          <div>
            <h1 style={{ fontSize:24, fontWeight:800, color:'#0f172a', margin:'0 0 4px' }}>Templates</h1>
            <p style={{ fontSize:13, color:'#64748b', margin:0 }}>
              Email and LinkedIn style anchors used when the AI generates outreach.
            </p>
          </div>
          <div style={{ display:'flex', gap:10 }}>
            <button type="button" onClick={resetToDefaults} disabled={loading || saving}
              style={{ padding:'9px 14px', borderRadius:9, border:'1px solid #dbe3ef', background:'#fff', color:'#475569', fontSize:12, fontWeight:700, cursor: loading || saving ? 'default' : 'pointer' }}>
              Reset defaults
            </button>
            <button type="button" onClick={save} disabled={loading || saving}
              style={{ padding:'9px 16px', borderRadius:9, border:'none', background: saving ? '#cbd5e1' : '#4f46e5', color:'#fff', fontSize:12, fontWeight:800, cursor: loading || saving ? 'default' : 'pointer' }}>
              {saving ? 'Saving...' : 'Save templates'}
            </button>
          </div>
        </div>

        {status && (
          <div style={{ marginBottom:16, padding:'10px 12px', borderRadius:9, border:`1px solid ${status.ok ? '#bbf7d0' : '#fecaca'}`, background: status.ok ? '#f0fdf4' : '#fef2f2', color: status.ok ? '#166534' : '#991b1b', fontSize:12, fontWeight:700 }}>
            {status.text}
          </div>
        )}

        {loading ? (
          <div style={{ display:'flex', justifyContent:'center', paddingTop:80 }}><Spin /></div>
        ) : (
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:18 }}>
            <section style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:12, padding:18 }}>
              <div style={{ fontSize:14, fontWeight:800, color:'#0f172a', marginBottom:6 }}>Cold Email</div>
              <div style={{ fontSize:12, color:'#64748b', marginBottom:12 }}>
                Use placeholders like {'{{first_name}}'} and {'{{company}}'} if helpful.
              </div>
              <textarea value={templates.email || ''} onChange={e => setTemplates(t => ({ ...t, email: e.target.value }))} style={fieldStyle} />
            </section>

            <section style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:12, padding:18 }}>
              <div style={{ fontSize:14, fontWeight:800, color:'#0f172a', marginBottom:6 }}>LinkedIn DM</div>
              <div style={{ fontSize:12, color:'#64748b', marginBottom:12 }}>
                Keep this short; LinkedIn connection notes should stay under 280 characters.
              </div>
              <textarea value={templates.linkedin || ''} onChange={e => setTemplates(t => ({ ...t, linkedin: e.target.value }))} style={{ ...fieldStyle, minHeight: 140 }} />
              <div style={{ marginTop:8, fontSize:11, color: (templates.linkedin || '').length > 280 ? '#dc2626' : '#94a3b8', fontWeight:700 }}>
                {(templates.linkedin || '').length}/280
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  )
}
