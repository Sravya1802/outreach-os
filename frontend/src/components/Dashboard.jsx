import React, { useState, useEffect } from 'react'
import { api } from '../api'

// ── Stage config ──────────────────────────────────────────────────────────────
const STAGES = [
  { key:'pending',   label:'Identified',    color:'#64748b', bg:'#f1f5f9' },
  { key:'generated', label:'Ready to Send', color:'#d97706', bg:'#fef3c7' },
  { key:'dm_sent',   label:'DM Sent',       color:'#7c3aed', bg:'#ede9fe' },
  { key:'sent',      label:'Email Sent',    color:'#2563eb', bg:'#dbeafe' },
  { key:'replied',   label:'Replied',       color:'#16a34a', bg:'#dcfce7' },
  { key:'closed',    label:'Closed',        color:'#94a3b8', bg:'#f8fafc' },
]

function getStage(status) {
  if (['closed','skip'].includes(status)) return 'closed'
  if (status === 'dm_sent') return 'dm_sent'
  if (status === 'sent' || status === 'email_sent') return 'sent'
  if (status === 'replied') return 'replied'
  if (status === 'generated') return 'generated'
  return 'pending'
}

function stageConf(key) { return STAGES.find(s => s.key === key) || STAGES[0] }

const CAT_META = {
  'Tech & Software':  { icon:'💻', color:'#6366f1' },
  'Finance':          { icon:'🏦', color:'#f59e0b' },
  'Fintech':          { icon:'💳', color:'#f59e0b' },
  'Startups':         { icon:'🚀', color:'#7c3aed' },
  'AI / ML':          { icon:'🤖', color:'#6366f1' },
  'Healthcare':       { icon:'🏥', color:'#22c55e' },
  'Defense':          { icon:'🛡️', color:'#64748b' },
  'Energy':           { icon:'⚡', color:'#f97316' },
  'Climate':          { icon:'🌿', color:'#84cc16' },
  'Consumer':         { icon:'🛍️', color:'#ec4899' },
  'EdTech':           { icon:'📚', color:'#3b82f6' },
  'Media':            { icon:'📺', color:'#8b5cf6' },
  'Logistics':        { icon:'📦', color:'#14b8a6' },
  'Real Estate':      { icon:'🏠', color:'#f97316' },
  'Government':       { icon:'🏛️', color:'#64748b' },
  'Nonprofit':        { icon:'❤️', color:'#ef4444' },
  'Other':            { icon:'🏢', color:'#94a3b8' },
}
function catMeta(cat) { return CAT_META[cat] || { icon:'🏢', color:'#94a3b8' } }

// ── Inject global styles ──────────────────────────────────────────────────────
function injectStyles() {
  if (document.getElementById('dash-styles')) return
  const s = document.createElement('style')
  s.id = 'dash-styles'
  s.textContent = `
    @keyframes dspin  { to { transform: rotate(360deg); } }
    @keyframes dslide { from { opacity:0; transform:translateX(24px); } to { opacity:1; transform:translateX(0); } }
    .drow:hover { box-shadow: 0 4px 16px rgba(99,102,241,0.1) !important; border-color: #c7d2fe !important; }
    .dco-row { transition: background 0.1s; }
    .dco-row:hover { background: #f8fafc !important; }
    .dco-row.sel { background: #ede9fe !important; border-left-color: #7c3aed !important; }
    .dcat-hd { transition: background 0.1s; }
    .dcat-hd:hover { background: #f1f5f9 !important; }
    .dspin { display:inline-block; width:22px; height:22px; border:3px solid #e2e8f0; border-top-color:#6366f1; border-radius:50%; animation:dspin 0.7s linear infinite; }
  `
  document.head.appendChild(s)
}

// ── Pipeline mini bar ─────────────────────────────────────────────────────────
function PipeBar({ people }) {
  if (!people.length) return null
  const counts = {}
  for (const s of STAGES) counts[s.key] = 0
  for (const p of people) counts[getStage(p.status)]++
  return (
    <div style={{ display:'flex', height:3, borderRadius:4, overflow:'hidden', gap:1, marginTop:6 }}>
      {STAGES.map(s => counts[s.key] > 0 && (
        <div key={s.key} title={`${s.label}: ${counts[s.key]}`}
          style={{ flex:counts[s.key], background:s.color, minWidth:3 }} />
      ))}
    </div>
  )
}

// ── Stage pill ────────────────────────────────────────────────────────────────
function StagePill({ status }) {
  const s = stageConf(getStage(status))
  return (
    <span style={{ fontSize:10, fontWeight:700, padding:'3px 9px', borderRadius:20, background:s.bg, color:s.color, whiteSpace:'nowrap', flexShrink:0 }}>
      {s.label}
    </span>
  )
}

// ── Contact drawer ────────────────────────────────────────────────────────────
function ContactDrawer({ card, onClose, onUpdate }) {
  const [tab, setTab]       = useState('email')
  const [subject, setSub]   = useState(card.generated_subject || '')
  const [body, setBody]     = useState(card.generated_body || '')
  const [dm, setDm]         = useState(card.generated_dm || '')
  const [saving, setSaving] = useState(false)
  const [regen, setRegen]   = useState(false)
  const [copied, setCopied] = useState(false)

  async function save() {
    setSaving(true)
    try {
      await api.jobs.updateContact(card.id, { generated_subject:subject, generated_body:body, generated_dm:dm })
      onUpdate(card.id, { generated_subject:subject, generated_body:body, generated_dm:dm })
    } finally { setSaving(false) }
  }

  async function regenerate() {
    setRegen(true)
    try {
      const r = await api.jobs.generate(card.id, tab === 'email' ? 'email' : 'linkedin')
      if (tab === 'email') { setSub(r.subject || subject); setBody(r.body || body); onUpdate(card.id, { generated_subject:r.subject, generated_body:r.body }) }
      else { setDm(r.message || dm); onUpdate(card.id, { generated_dm:r.message }) }
    } finally { setRegen(false) }
  }

  function copyContent() {
    navigator.clipboard.writeText(tab === 'email' ? `Subject: ${subject}\n\n${body}` : dm)
    setCopied(true); setTimeout(() => setCopied(false), 1800)
  }

  async function setStatus(st) {
    await api.jobs.updateContact(card.id, { status: st })
    onUpdate(card.id, { status: st })
  }

  const stage = stageConf(getStage(card.status))
  const initials = (card.name||'?').split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase()

  return (
    <>
      <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(15,23,42,0.4)', zIndex:100, backdropFilter:'blur(2px)' }} />
      <div style={{ position:'fixed', right:0, top:0, bottom:0, width:520, background:'#fff', boxShadow:'-8px 0 40px rgba(0,0,0,0.15)', zIndex:101, display:'flex', flexDirection:'column', animation:'dslide 0.2s ease' }}>

        {/* Header */}
        <div style={{ padding:'22px 24px 16px', borderBottom:'1px solid #f1f5f9', flexShrink:0 }}>
          <div style={{ display:'flex', gap:14, alignItems:'flex-start' }}>
            <div style={{ width:48, height:48, borderRadius:'50%', background:'linear-gradient(135deg,#6366f1,#7c3aed)', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontSize:17, fontWeight:800, flexShrink:0 }}>
              {initials}
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:18, fontWeight:800, color:'#0f172a', marginBottom:2 }}>{card.name}</div>
              <div style={{ fontSize:13, color:'#64748b' }}>{card.title} · <strong style={{ color:'#374151' }}>{card.company}</strong></div>
              <div style={{ display:'flex', gap:6, flexWrap:'wrap', alignItems:'center', marginTop:8 }}>
                <span style={{ fontSize:11, fontWeight:700, padding:'3px 10px', borderRadius:20, background:stage.bg, color:stage.color }}>{stage.label}</span>
                {card.email && <span style={{ fontSize:11, color:'#64748b', padding:'3px 10px', background:'#f8fafc', borderRadius:20, border:'1px solid #e2e8f0', fontFamily:'monospace' }}>{card.email}</span>}
                {card.linkedin_url && <a href={card.linkedin_url} target="_blank" rel="noreferrer" style={{ fontSize:11, color:'#2563eb', padding:'3px 10px', background:'#eff6ff', borderRadius:20, border:'1px solid #bfdbfe', textDecoration:'none', fontWeight:600 }}>LinkedIn ↗</a>}
              </div>
            </div>
            <button onClick={onClose} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:'#94a3b8', padding:4, lineHeight:1, flexShrink:0 }}>✕</button>
          </div>

          {/* Quick actions */}
          <div style={{ display:'flex', gap:6, marginTop:14, flexWrap:'wrap' }}>
            {!['sent','email_sent'].includes(card.status) && (
              <button onClick={() => setStatus('sent')} style={{ padding:'5px 12px', fontSize:11, fontWeight:700, cursor:'pointer', background:'#dbeafe', color:'#1e40af', border:'none', borderRadius:20 }}>✉ Email Sent</button>
            )}
            {card.status !== 'dm_sent' && (
              <button onClick={() => setStatus('dm_sent')} style={{ padding:'5px 12px', fontSize:11, fontWeight:700, cursor:'pointer', background:'#ede9fe', color:'#6d28d9', border:'none', borderRadius:20 }}>💬 DM Sent</button>
            )}
            {card.status !== 'replied' && (
              <button onClick={() => setStatus('replied')} style={{ padding:'5px 12px', fontSize:11, fontWeight:700, cursor:'pointer', background:'#dcfce7', color:'#166534', border:'none', borderRadius:20 }}>✓ Got Reply</button>
            )}
            {card.status !== 'closed' && (
              <button onClick={() => setStatus('closed')} style={{ padding:'5px 12px', fontSize:11, fontWeight:700, cursor:'pointer', background:'#f1f5f9', color:'#64748b', border:'none', borderRadius:20 }}>✕ Close</button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display:'flex', borderBottom:'1px solid #f1f5f9', flexShrink:0 }}>
          {[['email','✉ Cold Email'],['dm','💬 LinkedIn DM']].map(([k,l]) => (
            <button key={k} onClick={() => setTab(k)} style={{ flex:1, padding:'12px 0', fontSize:13, fontWeight: tab===k ? 700 : 500, cursor:'pointer', background:'none', border:'none', borderBottom: tab===k ? '2px solid #6366f1' : '2px solid transparent', color: tab===k ? '#6366f1' : '#94a3b8', transition:'all 0.12s' }}>
              {l}
            </button>
          ))}
        </div>

        {/* Body */}
        <div style={{ flex:1, overflowY:'auto', padding:'18px 24px' }}>
          {tab === 'email' ? (
            <>
              <label style={{ fontSize:11, fontWeight:700, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.07em', display:'block', marginBottom:6 }}>Subject</label>
              <input value={subject} onChange={e => setSub(e.target.value)} placeholder="Email subject…" style={{ marginBottom:14 }} />
              <label style={{ fontSize:11, fontWeight:700, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.07em', display:'block', marginBottom:6 }}>Body</label>
              <textarea value={body} onChange={e => setBody(e.target.value)} placeholder="Email body…" rows={14} style={{ lineHeight:1.65 }} />
            </>
          ) : (
            <>
              <label style={{ fontSize:11, fontWeight:700, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.07em', display:'block', marginBottom:6 }}>Message</label>
              <textarea value={dm} onChange={e => setDm(e.target.value)} placeholder="LinkedIn message…" rows={12} style={{ lineHeight:1.65 }} />
              <div style={{ fontSize:11, color: dm.length > 300 ? '#dc2626' : '#94a3b8', textAlign:'right', marginTop:4 }}>{dm.length}/300</div>
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding:'14px 24px', borderTop:'1px solid #f1f5f9', display:'flex', gap:8, flexShrink:0, flexWrap:'wrap' }}>
          <button onClick={save} disabled={saving} style={{ flex:1, padding:'10px', fontSize:13, fontWeight:700, cursor:'pointer', background:'#6366f1', color:'#fff', border:'none', borderRadius:8, minWidth:80 }}>
            {saving ? 'Saving…' : '💾 Save'}
          </button>
          <button onClick={regenerate} disabled={regen} style={{ padding:'10px 16px', fontSize:13, fontWeight:700, cursor:'pointer', background:'#f5f3ff', color:'#7c3aed', border:'1px solid #e9d5ff', borderRadius:8 }}>
            {regen ? '⏳ …' : '⚡ Regen'}
          </button>
          <button onClick={copyContent} style={{ padding:'10px 16px', fontSize:13, fontWeight:700, cursor:'pointer', background:'#f8fafc', color:'#475569', border:'1px solid #e2e8f0', borderRadius:8 }}>
            {copied ? '✓ Copied!' : '📋 Copy'}
          </button>
          {tab === 'email' && card.email && (
            <a href={`https://mail.google.com/mail/?view=cm&to=${encodeURIComponent(card.email)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`}
              target="_blank" rel="noreferrer"
              style={{ padding:'10px 14px', fontSize:13, fontWeight:700, background:'#fff7ed', color:'#ea580c', border:'1px solid #fed7aa', borderRadius:8, textDecoration:'none', display:'inline-flex', alignItems:'center' }}>
              Gmail ↗
            </a>
          )}
        </div>
      </div>
    </>
  )
}

// ── Left sidebar ──────────────────────────────────────────────────────────────
function CategorySidebar({ companies, search, setSearch, selectedCo, setSelectedCo, stageFilter }) {
  const grouped = {}
  for (const co of companies) {
    const cat = co.category || 'Other'
    if (!grouped[cat]) grouped[cat] = []
    grouped[cat].push(co)
  }

  const searchLow = search.toLowerCase()
  const filteredGrouped = {}
  for (const [cat, cos] of Object.entries(grouped)) {
    const matching = cos.filter(co => {
      if (searchLow && !co.company.toLowerCase().includes(searchLow)) return false
      if (stageFilter !== 'all') return (co.people||[]).some(p => getStage(p.status) === stageFilter)
      return true
    })
    if (matching.length > 0) filteredGrouped[cat] = matching
  }

  const sortedCats = Object.keys(filteredGrouped).sort()
  const [openCats, setOpenCats] = useState({})
  function toggleCat(cat) { setOpenCats(prev => ({ ...prev, [cat]: !prev[cat] })) }
  const totalCos = Object.values(filteredGrouped).reduce((a,b) => a + b.length, 0)

  return (
    <div style={{ width:290, flexShrink:0, borderRight:'1px solid #e2e8f0', display:'flex', flexDirection:'column', background:'#fff' }}>
      {/* Search */}
      <div style={{ padding:'14px', borderBottom:'1px solid #f1f5f9', flexShrink:0 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search companies…" style={{ background:'#f8fafc' }} />
      </div>

      {/* Count */}
      <div style={{ padding:'8px 16px', borderBottom:'1px solid #f8fafc', flexShrink:0 }}>
        <span style={{ fontSize:11, fontWeight:700, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.06em' }}>
          {sortedCats.length} categories · {totalCos} companies
        </span>
      </div>

      {/* Scrollable list */}
      <div style={{ flex:1, overflowY:'auto' }}>
        {sortedCats.map(cat => {
          const cos = filteredGrouped[cat]
          const meta = catMeta(cat)
          const isOpen = openCats[cat] === true
          const readyPeople = cos.reduce((a, co) => a + (co.people||[]).filter(p => getStage(p.status)==='generated').length, 0)

          return (
            <div key={cat}>
              {/* Category header */}
              <div className="dcat-hd" onClick={() => toggleCat(cat)}
                style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', cursor:'pointer', background:'#fafafa', borderBottom:'1px solid #f1f5f9', position:'sticky', top:0, zIndex:1 }}>
                <span style={{ fontSize:15 }}>{meta.icon}</span>
                <span style={{ fontSize:12, fontWeight:800, color:'#0f172a', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{cat}</span>
                <div style={{ display:'flex', gap:5, alignItems:'center', flexShrink:0 }}>
                  {readyPeople > 0 && (
                    <span style={{ fontSize:9, fontWeight:700, color:'#d97706', background:'#fef3c7', borderRadius:20, padding:'2px 7px' }}>
                      {readyPeople} ready
                    </span>
                  )}
                  <span style={{ fontSize:10, fontWeight:700, color:meta.color, background:`${meta.color}15`, borderRadius:20, padding:'2px 8px' }}>{cos.length}</span>
                  <span style={{ fontSize:11, color:'#94a3b8', width:12, textAlign:'center' }}>{isOpen ? '▾' : '▸'}</span>
                </div>
              </div>

              {/* Companies */}
              {isOpen && cos.map(co => {
                const isSelected = selectedCo === co.company
                const people = stageFilter === 'all' ? (co.people||[]) : (co.people||[]).filter(p => getStage(p.status)===stageFilter)
                const ready = people.filter(p => getStage(p.status)==='generated').length

                return (
                  <div key={co.company} className={`dco-row${isSelected ? ' sel' : ''}`} onClick={() => setSelectedCo(isSelected ? null : co.company)}
                    style={{ padding:'9px 14px 9px 36px', cursor:'pointer', borderBottom:'1px solid #f8fafc', borderLeft:`3px solid ${isSelected ? '#7c3aed' : 'transparent'}`, background: isSelected ? '#ede9fe' : '#fff' }}>
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8 }}>
                      <span style={{ fontSize:13, fontWeight: isSelected ? 700:500, color: isSelected ? '#5b21b6':'#374151', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1 }}>
                        {co.company}
                      </span>
                      <div style={{ display:'flex', gap:4, alignItems:'center', flexShrink:0 }}>
                        {ready > 0 && <span style={{ fontSize:9, fontWeight:700, color:'#d97706', background:'#fef3c7', borderRadius:20, padding:'1px 5px' }}>{ready}✓</span>}
                        <span style={{ fontSize:11, fontWeight:600, color:'#94a3b8' }}>{people.length}</span>
                      </div>
                    </div>
                    <PipeBar people={co.people||[]} />
                  </div>
                )
              })}
            </div>
          )
        })}

        {sortedCats.length === 0 && (
          <div className="empty" style={{ paddingTop:40 }}>
            <div className="empty-title">No companies found</div>
            {search && <div className="empty-sub">Try a different search term</div>}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Company panel (right) ─────────────────────────────────────────────────────
function CompanyPanel({ company, onCardClick }) {
  const [tab, setTab] = useState('all')
  if (!company) return null
  const people = company.people || []
  const byStage = {}
  for (const s of STAGES) byStage[s.key] = []
  for (const p of people) byStage[getStage(p.status)].push(p)
  const activeStages = STAGES.filter(s => byStage[s.key].length > 0)
  const displayed = tab === 'all' ? people : (byStage[tab] || [])
  const readyCount = byStage['generated']?.length || 0
  const meta = catMeta(company.category || 'Other')

  return (
    <div className="fade-in">
      {/* Header */}
      <div style={{ marginBottom:20 }}>
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:12, marginBottom:10 }}>
          <div>
            <h2 style={{ fontSize:22, fontWeight:800, color:'#0f172a', marginBottom:6 }}>{company.company}</h2>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
              {company.category && (
                <span style={{ fontSize:12, fontWeight:700, padding:'4px 12px', borderRadius:20, background:`${meta.color}15`, color:meta.color }}>
                  {meta.icon} {company.category}
                </span>
              )}
              <span style={{ fontSize:12, color:'#94a3b8' }}>{people.length} contacts</span>
              {readyCount > 0 && (
                <span style={{ fontSize:11, fontWeight:700, color:'#d97706', background:'#fef3c7', padding:'4px 12px', borderRadius:20 }}>
                  ⚡ {readyCount} ready to send
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Stage tabs */}
      <div style={{ display:'flex', borderBottom:'1px solid #e2e8f0', marginBottom:18, overflowX:'auto', background:'#fff', borderRadius:'10px 10px 0 0', padding:'0 4px' }}>
        {[{ key:'all', label:'All', count:people.length, color:'#6366f1' }, ...activeStages.map(s => ({ ...s, count:byStage[s.key].length }))].map(s => (
          <button key={s.key} onClick={() => setTab(s.key)}
            style={{ padding:'10px 16px', fontSize:12, fontWeight: tab===s.key ? 700:500, cursor:'pointer', background:'none', border:'none', whiteSpace:'nowrap', borderBottom: tab===s.key ? `2px solid ${s.color}` : '2px solid transparent', color: tab===s.key ? s.color : '#94a3b8', transition:'all 0.12s' }}>
            {s.label} <span style={{ fontWeight:800 }}>{s.count}</span>
          </button>
        ))}
      </div>

      {/* Contact cards */}
      {displayed.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">👤</div>
          <div className="empty-title">No contacts in this stage</div>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {displayed.map(c => <ContactCard key={c.id} contact={c} onClick={() => onCardClick(c)} />)}
        </div>
      )}
    </div>
  )
}

// ── Contact card ──────────────────────────────────────────────────────────────
function ContactCard({ contact: c, onClick }) {
  const hasEmail = !!(c.generated_subject || c.generated_body)
  const hasDm    = !!c.generated_dm
  const initials = (c.name||'?').split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase()

  return (
    <div className="drow" onClick={onClick}
      style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:12, padding:'14px 16px', cursor:'pointer', display:'flex', alignItems:'center', gap:14, transition:'all 0.15s' }}>
      <div style={{ width:42, height:42, borderRadius:'50%', flexShrink:0, background:'linear-gradient(135deg,#6366f1,#8b5cf6)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, fontWeight:800, color:'#fff' }}>
        {initials}
      </div>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:14, fontWeight:700, color:'#0f172a', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.name}</div>
        <div style={{ fontSize:12, color:'#64748b', marginTop:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.title || 'Contact'}</div>
        {c.email && <div style={{ fontSize:11, color:'#94a3b8', marginTop:3, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontFamily:'monospace' }}>{c.email}</div>}
      </div>
      <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:6, flexShrink:0 }}>
        <StagePill status={c.status} />
        <div style={{ display:'flex', gap:6 }}>
          <span title={hasEmail ? 'Email ready':'No email'} style={{ fontSize:15, opacity:hasEmail?1:0.2 }}>📧</span>
          <span title={hasDm ? 'DM ready':'No DM'} style={{ fontSize:15, opacity:hasDm?1:0.2 }}>💬</span>
        </div>
      </div>
    </div>
  )
}

// ── Stage view (no company selected) ─────────────────────────────────────────
function StageView({ allCards, stageFilter, onCardClick }) {
  const filtered = stageFilter === 'all' ? allCards : allCards.filter(c => getStage(c.status) === stageFilter)

  if (stageFilter === 'all') {
    return (
      <div className="empty" style={{ height:'60%' }}>
        <div style={{ fontSize:48, marginBottom:12 }}>👈</div>
        <div className="empty-title">Select a company from the sidebar</div>
        <div className="empty-sub">Or click a pipeline stage above to filter all contacts</div>
      </div>
    )
  }

  const s = stageConf(stageFilter)
  return (
    <div>
      <div style={{ marginBottom:20 }}>
        <h2 style={{ fontSize:20, fontWeight:800, color:'#0f172a', marginBottom:4 }}>{s.label}</h2>
        <span style={{ fontSize:13, color:'#94a3b8' }}>{filtered.length} contacts across all companies</span>
      </div>
      <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
        {filtered.map(c => (
          <div key={c.id}>
            <div style={{ fontSize:10, fontWeight:700, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:4, marginLeft:2 }}>{c.company}</div>
            <ContactCard contact={c} onClick={() => onCardClick(c)} />
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="empty">
            <div className="empty-title">No contacts in this stage</div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [companies, setCompanies]     = useState([])
  const [allCards, setAllCards]       = useState([])
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState(null)
  const [selectedCo, setSelectedCo]   = useState(null)
  const [activeCard, setActiveCard]   = useState(null)
  const [search, setSearch]           = useState('')
  const [stageFilter, setStageFilter] = useState('all')
  const [sourceFilter, setSourceFilter] = useState('all')

  useEffect(() => { injectStyles() }, [])

  useEffect(() => {
    setLoading(true)
    api.unified.dashboard()
      .then(data => {
        const cos = data.companies || []
        setCompanies(cos)
        const flat = []
        for (const co of cos) for (const p of (co.people||[])) flat.push({ ...p, company:co.company||p.company, company_category:co.category })
        setAllCards(flat); setLoading(false)
      })
      .catch(err => { setError(err.message); setLoading(false) })
  }, [])

  function onUpdate(id, fields) {
    setAllCards(prev => prev.map(c => c.id===id ? {...c,...fields} : c))
    setCompanies(prev => prev.map(co => ({ ...co, people:(co.people||[]).map(p => p.id===id ? {...p,...fields}:p) })))
    if (activeCard?.id === id) setActiveCard(prev => ({...prev,...fields}))
  }

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', gap:14, flexDirection:'column' }}>
      <span className="dspin" style={{ width:32, height:32, borderWidth:3 }} />
      <span style={{ fontSize:14, color:'#64748b', fontWeight:600 }}>Loading pipeline…</span>
    </div>
  )

  if (error) return (
    <div className="empty" style={{ height:'100%' }}>
      <div style={{ fontSize:36 }}>⚠️</div>
      <div className="empty-title" style={{ color:'#dc2626' }}>{error}</div>
    </div>
  )

  if (allCards.length === 0) return (
    <div className="empty" style={{ height:'100%' }}>
      <div style={{ fontSize:56, marginBottom:16 }}>📭</div>
      <div style={{ fontSize:20, fontWeight:800, color:'#0f172a', marginBottom:8 }}>No contacts yet</div>
      <div style={{ fontSize:14, color:'#64748b', lineHeight:1.7, maxWidth:340, textAlign:'center' }}>
        Head to the <strong>Outreach Hub</strong> to discover companies, find decision-makers, and generate outreach.
      </div>
    </div>
  )

  const SOURCE_FILTERS = [
    { key:'all', label:'All', color:'#6366f1' },
    { key:'outreach', label:'Outreach', color:'#7c3aed' },
    { key:'career_ops', label:'Career Ops', color:'#2563eb' },
  ]

  function getSource(card) { return card.source || 'outreach' }

  const sourceFiltered = sourceFilter === 'all' ? allCards
    : allCards.filter(c => {
        const s = getSource(c)
        if (sourceFilter === 'outreach') return !s.includes('career_ops')
        return s.includes(sourceFilter)
      })

  const companiesFiltered = sourceFilter === 'all' ? companies
    : companies.map(co => ({
        ...co,
        people: (co.people||[]).filter(p => {
          const s = getSource(p)
          if (sourceFilter === 'outreach') return !s.includes('career_ops')
          return s.includes(sourceFilter)
        })
      })).filter(co => co.people.length > 0)

  const globalCounts = {}
  for (const s of STAGES) globalCounts[s.key] = 0
  for (const c of sourceFiltered) globalCounts[getStage(c.status)]++

  const selectedCompany = selectedCo ? companiesFiltered.find(co => co.company === selectedCo) : null

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', overflow:'hidden' }}>

      {/* Top bar */}
      <div style={{ background:'#fff', borderBottom:'1px solid #e2e8f0', flexShrink:0 }}>
        {/* Source filter */}
        <div style={{ padding:'10px 24px 0', display:'flex', alignItems:'center', gap:6, borderBottom:'1px solid #f1f5f9' }}>
          <span style={{ fontSize:10, fontWeight:700, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.08em', marginRight:4 }}>Source</span>
          {SOURCE_FILTERS.map(sf => (
            <button key={sf.key} onClick={() => { setSourceFilter(sf.key); setSelectedCo(null) }}
              style={{ padding:'4px 14px', fontSize:11, fontWeight:700, cursor:'pointer', border:'none', borderRadius:20, marginBottom:10, transition:'all 0.12s',
                background: sourceFilter===sf.key ? sf.color : '#f1f5f9',
                color: sourceFilter===sf.key ? '#fff' : '#64748b' }}>
              {sf.label}
            </button>
          ))}
        </div>

        {/* Stage filter */}
        <div style={{ padding:'0 24px', display:'flex', alignItems:'center', overflowX:'auto', gap:0 }}>
          <div style={{ fontSize:14, fontWeight:800, color:'#0f172a', marginRight:20, whiteSpace:'nowrap', padding:'12px 0' }}>Pipeline</div>
          <button onClick={() => { setStageFilter('all'); setSelectedCo(null) }}
            style={{ padding:'12px 14px', fontSize:12, fontWeight: stageFilter==='all' ? 700:500, cursor:'pointer', background:'none', border:'none', whiteSpace:'nowrap', borderBottom: stageFilter==='all' ? '2px solid #6366f1':'2px solid transparent', color: stageFilter==='all' ? '#6366f1':'#94a3b8', transition:'all 0.12s' }}>
            All <strong>{sourceFiltered.length}</strong>
          </button>
          {STAGES.filter(s => globalCounts[s.key] > 0).map(s => (
            <button key={s.key} onClick={() => { setStageFilter(s.key); setSelectedCo(null) }}
              style={{ padding:'12px 14px', fontSize:12, fontWeight: stageFilter===s.key ? 700:500, cursor:'pointer', background:'none', border:'none', whiteSpace:'nowrap', borderBottom: stageFilter===s.key ? `2px solid ${s.color}`:'2px solid transparent', color: stageFilter===s.key ? s.color:'#94a3b8', transition:'all 0.12s' }}>
              {s.label} <strong>{globalCounts[s.key]}</strong>
            </button>
          ))}
        </div>
      </div>

      {/* Two-panel body */}
      <div style={{ display:'flex', flex:1, overflow:'hidden' }}>
        <CategorySidebar
          companies={companiesFiltered}
          search={search} setSearch={setSearch}
          selectedCo={selectedCo}
          setSelectedCo={co => { setSelectedCo(co); if(co) setStageFilter('all') }}
          stageFilter={stageFilter}
        />
        <div style={{ flex:1, overflowY:'auto', padding:'24px 28px', background:'#f8fafc' }}>
          {selectedCo
            ? <CompanyPanel company={selectedCompany} onCardClick={setActiveCard} />
            : <StageView allCards={sourceFiltered} stageFilter={stageFilter} onCardClick={setActiveCard} />
          }
        </div>
      </div>

      {activeCard && <ContactDrawer card={activeCard} onClose={() => setActiveCard(null)} onUpdate={onUpdate} />}
    </div>
  )
}
