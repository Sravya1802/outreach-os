import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'

// Category taxonomy — labels match DB values
const CATEGORIES = [
  { id:'finance',      label:'Finance & Investing',         abbr:'FI', tint:'#059669', bg:'rgba(5,150,105,0.07)',  border:'rgba(5,150,105,0.2)',  desc:'Quant funds, investment banks, fintech, crypto' },
  { id:'tech',         label:'Tech & Software',             abbr:'TS', tint:'#2563eb', bg:'rgba(37,99,235,0.07)', border:'rgba(37,99,235,0.2)',  desc:'Big Tech, enterprise software, cloud, SaaS' },
  { id:'startups',     label:'Startups',                    abbr:'ST', tint:'#7c3aed', bg:'rgba(124,58,237,0.07)',border:'rgba(124,58,237,0.2)', desc:'YC companies, seed to series B startups' },
  { id:'ai',           label:'AI & Research',               abbr:'AI', tint:'#6d28d9', bg:'rgba(109,40,217,0.07)',border:'rgba(109,40,217,0.2)', desc:'AI labs, AI infra, applied AI, robotics AI' },
  { id:'hardware',     label:'Hardware & Semiconductors',   abbr:'HW', tint:'#6b7280', bg:'rgba(107,114,128,0.07)',border:'rgba(107,114,128,0.2)',desc:'Chip makers, consumer electronics, networking' },
  { id:'data',         label:'Data & Analytics',            abbr:'DA', tint:'#4f46e5', bg:'rgba(79,70,229,0.07)', border:'rgba(79,70,229,0.2)',  desc:'Data infra, BI platforms, market data' },
  { id:'auto',         label:'Automotive & Mobility',       abbr:'AM', tint:'#0f172a', bg:'rgba(15,23,42,0.07)',  border:'rgba(15,23,42,0.2)',   desc:'EV, autonomous vehicles, aerospace' },
  { id:'health',       label:'Healthcare & Life Sciences',  abbr:'HL', tint:'#dc2626', bg:'rgba(220,38,38,0.07)', border:'rgba(220,38,38,0.2)',  desc:'Pharma, biotech, health tech, medical devices' },
  { id:'energy',       label:'Energy & Climate',            abbr:'EC', tint:'#15803d', bg:'rgba(21,128,61,0.07)', border:'rgba(21,128,61,0.2)',  desc:'Renewables, energy storage, climate tech' },
  { id:'consumer',     label:'Consumer & Retail',           abbr:'CR', tint:'#ea580c', bg:'rgba(234,88,12,0.07)', border:'rgba(234,88,12,0.2)',  desc:'E-commerce, CPG, retail, food delivery' },
  { id:'food',         label:'Food & Beverage',             abbr:'FB', tint:'#d97706', bg:'rgba(217,119,6,0.07)', border:'rgba(217,119,6,0.2)',  desc:'Food tech, restaurant chains, alt protein' },
  { id:'fashion',      label:'Fashion & Apparel',           abbr:'FA', tint:'#db2777', bg:'rgba(219,39,119,0.07)',border:'rgba(219,39,119,0.2)', desc:'Fast fashion, sportswear, fashion tech' },
  { id:'media',        label:'Media & Entertainment',       abbr:'ME', tint:'#9333ea', bg:'rgba(147,51,234,0.07)',border:'rgba(147,51,234,0.2)', desc:'Gaming, streaming, social media, ad tech' },
  { id:'sports',       label:'Sports & Fitness',            abbr:'SF', tint:'#16a34a', bg:'rgba(22,163,74,0.07)', border:'rgba(22,163,74,0.2)',  desc:'Sports tech, fitness wearables, esports' },
  { id:'travel',       label:'Travel & Hospitality',        abbr:'TH', tint:'#0891b2', bg:'rgba(8,145,178,0.07)', border:'rgba(8,145,178,0.2)',  desc:'Airlines, hotels, travel agencies' },
  { id:'logistics',    label:'Logistics & Supply Chain',    abbr:'LS', tint:'#92400e', bg:'rgba(146,64,14,0.07)', border:'rgba(146,64,14,0.2)',  desc:'Shipping, delivery, supply chain tech' },
  { id:'manufacturing',label:'Manufacturing & Industrials', abbr:'MI', tint:'#475569', bg:'rgba(71,85,105,0.07)', border:'rgba(71,85,105,0.2)',  desc:'Heavy manufacturing, industrial automation' },
  { id:'defense',      label:'Defense & Government',        abbr:'DG', tint:'#1e3a8a', bg:'rgba(30,58,138,0.07)', border:'rgba(30,58,138,0.2)',  desc:'Defense contractors, GovTech' },
  { id:'hr',           label:'HR & Workforce',              abbr:'HR', tint:'#7c3aed', bg:'rgba(124,58,237,0.05)',border:'rgba(124,58,237,0.15)',desc:'HR tech, staffing, payroll platforms' },
  { id:'marketing',    label:'Marketing & Creative',        abbr:'MC', tint:'#be185d', bg:'rgba(190,24,93,0.07)', border:'rgba(190,24,93,0.2)',  desc:'Agencies, PR, market research, creator platforms' },
  { id:'legal',        label:'Legal & Compliance',          abbr:'LC', tint:'#1e40af', bg:'rgba(30,64,175,0.07)', border:'rgba(30,64,175,0.2)',  desc:'Law firms, compliance tech, LegalTech' },
  { id:'education',    label:'Education',                   abbr:'ED', tint:'#7c3aed', bg:'rgba(124,58,237,0.05)',border:'rgba(124,58,237,0.15)',desc:'EdTech, academic research institutions' },
  { id:'emerging',     label:'Emerging & Niche',            abbr:'EN', tint:'#ea580c', bg:'rgba(234,88,12,0.07)', border:'rgba(234,88,12,0.2)',  desc:'SpaceTech, AgriTech, BioInformatics, PropTech' },
]

const DASH_CSS = `
  .dash-cat-card { transition: all 0.18s; cursor: pointer; }
  .dash-cat-card:hover { transform: translateY(-3px) !important; box-shadow: 0 16px 40px rgba(0,0,0,0.1) !important; }
  .dash-search-result { transition: background 0.1s; cursor: pointer; }
  .dash-search-result:hover { background: #f1f5f9 !important; }
  .dash-stat-card { transition: all 0.15s; }
`

function Spin({ color = '#6366f1', size = 14 }) {
  return <span style={{ display:'inline-block', width:size, height:size, border:`2px solid ${color}30`, borderTopColor:color, borderRadius:'50%', animation:'spin 0.7s linear infinite', flexShrink:0 }} />
}

export default function CompanyDashboard({ onStatsChange }) {
  const navigate = useNavigate()
  const [stats, setStats]         = useState(null)
  const [catCounts, setCatCounts] = useState({})
  const [ycCount, setYcCount]     = useState(null)
  const [search, setSearch]       = useState('')
  const [results, setResults]     = useState([])
  const [searching, setSearching] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const [hideEmpty, setHideEmpty] = useState(false)
  const [sortBy, setSortBy]       = useState('count') // count | az | za
  const searchRef  = useRef(null)
  const debounce   = useRef(null)

  function refreshCounts() {
    api.unified.categoryCounts().then(d => {
      const map = {}
      for (const row of (d.counts || [])) map[row.category] = row.count
      setCatCounts(map)
    }).catch(() => {})
    api.stats().then(s => { setStats(s); onStatsChange?.(s) }).catch(() => {})
  }

  // Inject CSS
  useEffect(() => {
    const el = document.createElement('style')
    el.textContent = DASH_CSS
    document.head.appendChild(el)
    return () => el.remove()
  }, [])

  // Load stats + category counts (re-runs on `stats-refresh` events)
  useEffect(() => {
    const loadStats = () => {
      api.stats().then(s => { setStats(s); onStatsChange?.(s) }).catch(() => {})
      api.unified.categoryCounts().then(d => {
        const map = {}
        for (const r of (d.counts || [])) map[r.category] = r.count
        setCatCounts(map)
      }).catch(() => {})
    }
    loadStats()
    fetch('https://yc-oss.github.io/api/companies/hiring.json')
      .then(r => r.json()).then(d => setYcCount(Array.isArray(d) ? d.length : null))
      .catch(() => setYcCount(null))
    window.addEventListener('stats-refresh', loadStats)
    return () => window.removeEventListener('stats-refresh', loadStats)
  }, [])

  // Debounced search
  const doSearch = useCallback((q) => {
    clearTimeout(debounce.current)
    if (!q.trim()) { setResults([]); setShowDropdown(false); return }
    debounce.current = setTimeout(async () => {
      setSearching(true)
      try {
        const rows = await api.jobs.search(q)
        setResults(rows)
        setShowDropdown(true)
      } catch (e) { console.warn('Search error:', e) }
      setSearching(false)
    }, 280)
  }, [])

  function onSearchChange(e) {
    const v = e.target.value
    setSearch(v)
    doSearch(v)
  }

  function goToCompany(id) {
    setShowDropdown(false)
    setSearch('')
    navigate(`/company/${id}`)
  }

  function goToCategory(label) {
    const slug = label === 'YC Startups' ? 'yc-startups' : encodeURIComponent(label)
    navigate(`/category/${slug}`)
  }

  // Build sorted category list with counts.
  // Use stats.totalCompanies (authoritative COUNT(*) from jobs table) as the
  // single source of truth so the header count matches the stats card below.
  const totalInDb = stats?.totalCompanies ?? Object.values(catCounts).reduce((a, b) => a + b, 0)
  const maxCount  = Math.max(...CATEGORIES.map(c => catCounts[c.label] || 0), 1)

  const sortedCats = [...CATEGORIES]
    .map(c => ({ ...c, count: catCounts[c.label] || 0 }))
    .sort((a, b) => {
      if (sortBy === 'az') return a.label.localeCompare(b.label)
      if (sortBy === 'za') return b.label.localeCompare(a.label)
      return b.count - a.count // 'count' default
    })
    .filter(c => !hideEmpty || c.count > 0)

  return (
    <div style={{ flex:1, overflowY:'auto', background:'#f8fafc' }}>
      {/* Header */}
      <div style={{ padding:'32px 40px 20px', background:'#fff', borderBottom:'1px solid #e2e8f0' }}>
        <div style={{ marginBottom:4 }}>
          <h1 style={{ fontSize:24, fontWeight:800, color:'#0f172a', margin:0 }}>Companies</h1>
          <p style={{ fontSize:13, color:'#64748b', margin:'4px 0 0' }}>
            {totalInDb.toLocaleString()} companies · {sortedCats.filter(c => c.count > 0).length} industries
          </p>
        </div>

        {/* Stats row */}
        {stats && (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(5, 1fr)', gap:12, marginTop:20 }}>
            {[
              { label:'Companies', value: stats.totalCompanies?.toLocaleString() ?? '—', sub:'in database' },
              { label:'Contacts',  value: stats.totalContacts?.toLocaleString() ?? '—', sub:[
                stats.contactsWithEmail != null ? `${stats.contactsWithEmail.toLocaleString()} emails` : null,
                stats.totalLinkedInContacts != null ? `${stats.totalLinkedInContacts.toLocaleString()} LinkedIn` : null,
              ].filter(Boolean).join(' · ') || 'people found' },
              { label:'Outreach Sent', value: stats.totalSent?.toLocaleString() ?? '—', sub:'messages sent' },
              { label:'Response Rate', value: stats.responseRate != null ? `${stats.responseRate}%` : '—', sub:'reply rate' },
              { label:'Sources', value: stats.activeSources?.toLocaleString() ?? '—', sub:'active feeds' },
            ].map(s => (
              <div key={s.label} className="dash-stat-card" style={{ padding:'14px 16px', background:'#f8fafc', borderRadius:10, border:'1px solid #e2e8f0' }}>
                <div style={{ fontSize:20, fontWeight:800, color:'#0f172a' }}>{s.value}</div>
                <div style={{ fontSize:11, color:'#94a3b8', marginTop:3, fontWeight:600 }}>{s.label}</div>
                <div style={{ fontSize:10, color:'#94a3b8', marginTop:2 }}>{s.sub}</div>
              </div>
            ))}
          </div>
        )}

        {/* Search bar */}
        <div style={{ position:'relative', marginTop:20 }} ref={searchRef}>
          <div style={{ display:'flex', alignItems:'center', gap:10, padding:'11px 16px', background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:10, transition:'border-color 0.15s' }}
            onFocus={() => search && setShowDropdown(true)}>
            {searching ? <Spin color="#64748b" size={15} /> : <span style={{ fontSize:15, color:'#94a3b8' }}>⌕</span>}
            <input value={search} onChange={onSearchChange}
              onFocus={() => search && results.length > 0 && setShowDropdown(true)}
              placeholder="Search companies by name…"
              style={{ flex:1, border:'none', background:'transparent', outline:'none', fontSize:14, color:'#0f172a' }} />
            {search && <button onClick={() => { setSearch(''); setResults([]); setShowDropdown(false) }}
              style={{ border:'none', background:'none', color:'#94a3b8', cursor:'pointer', fontSize:16, padding:0 }}>×</button>}
          </div>

          {showDropdown && (
            <div style={{ position:'absolute', top:'calc(100% + 6px)', left:0, right:0, background:'#fff', border:'1px solid #e2e8f0', borderRadius:10, boxShadow:'0 8px 24px rgba(0,0,0,0.08)', zIndex:50, overflow:'hidden' }}>
              {results.length === 0 ? (
                <div style={{ padding:'14px 18px' }}>
                  <div style={{ fontSize:13, color:'#64748b', marginBottom:10 }}>No companies found for "{search}"</div>
                  <button
                    onClick={async () => {
                      setShowDropdown(false)
                      setSearching(true)
                      try {
                        const r = await api.companies.searchByName(search)
                        if (r.company) {
                          // find in DB now and navigate
                          const rows2 = await api.jobs.search(r.company.name)
                          if (rows2?.[0]) navigate(`/company/${rows2[0].id}`)
                        }
                      } catch (_) {}
                      setSearching(false)
                      setSearch('')
                    }}
                    style={{ padding:'7px 14px', background:'#6366f1', color:'#fff', border:'none', borderRadius:7, fontSize:12, fontWeight:700, cursor:'pointer' }}>
                    Search & scrape "{search}" →
                  </button>
                </div>
              ) : (
                results.map(r => {
                  const label = r.name || r.company_name || r.title || '?'
                  return (
                    <div key={r.id} className="dash-search-result"
                      onClick={() => goToCompany(r.id)}
                      style={{ padding:'11px 18px', borderBottom:'1px solid #f1f5f9', display:'flex', alignItems:'center', gap:12 }}>
                      <div style={{ width:32, height:32, borderRadius:7, background:'#e0e7ff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:800, color:'#4f46e5', flexShrink:0 }}>
                        {label.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontSize:13, fontWeight:700, color:'#0f172a' }}>{label}</div>
                        <div style={{ fontSize:11, color:'#94a3b8' }}>{r.category} {r.location ? `· ${r.location}` : ''}</div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          )}
        </div>
      </div>

      {/* Category grid */}
      <div style={{ padding:'24px 40px 40px' }}>
        {/* Controls */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
          <span style={{ fontSize:13, color:'#64748b', fontWeight:600 }}>
            {sortedCats.filter(c => c.count > 0).length} active{!hideEmpty && ` · ${sortedCats.filter(c => c.count === 0).length} empty`}
          </span>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <select value={sortBy} onChange={e => setSortBy(e.target.value)}
              style={{ padding:'5px 10px', borderRadius:7, border:'1px solid #e2e8f0', fontSize:12, fontWeight:600, color:'#475569', background:'#fff', outline:'none' }}>
              <option value="count">↓ Most companies</option>
              <option value="az">A → Z</option>
              <option value="za">Z → A</option>
            </select>
            <button onClick={() => setHideEmpty(v => !v)}
              style={{ padding:'5px 12px', borderRadius:7, border:'1px solid #e2e8f0', background: hideEmpty ? '#eff6ff' : '#fff', color: hideEmpty ? '#2563eb' : '#64748b', fontSize:12, fontWeight:600, cursor:'pointer' }}>
              {hideEmpty ? '✓ Hide empty' : 'Hide empty'}
            </button>
          </div>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:16 }}>
          {/* YC Startups special card */}
          <div className="dash-cat-card" onClick={() => goToCategory('YC Startups')}
            style={{ background:'#fff', border:'1px solid rgba(242,102,37,0.3)', borderLeft:'4px solid #F26625', borderRadius:12, padding:'18px 20px', boxShadow:'0 1px 4px rgba(0,0,0,0.05)' }}>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
              <div style={{ width:38, height:38, borderRadius:8, background:'rgba(242,102,37,0.1)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:15, fontWeight:800, color:'#F26625', flexShrink:0 }}>
                YC
              </div>
              <div>
                <div style={{ fontSize:13, fontWeight:800, color:'#0f172a' }}>YC Startups</div>
                <span style={{ fontSize:9, fontWeight:700, padding:'2px 7px', borderRadius:20, background:'rgba(242,102,37,0.1)', color:'#F26625', border:'1px solid rgba(242,102,37,0.25)' }}>
                  In your DB
                </span>
              </div>
            </div>
            <div style={{ fontSize:24, fontWeight:800, color:'#F26625', marginBottom:4 }}>
              {(stats?.ycImported ?? 0).toLocaleString()}
            </div>
            <div style={{ fontSize:11, color:'#64748b', marginBottom:12, lineHeight:1.4 }}>
              YC-backed companies you've imported
              {ycCount != null && <> · <span style={{ color:'#94a3b8' }}>{ycCount.toLocaleString()} available on YC</span></>}
            </div>
            <div style={{ height:4, background:'#f1f5f9', borderRadius:2 }}>
              <div style={{ height:'100%', background:'#F26625', borderRadius:2, width:'100%' }} />
            </div>
          </div>

          {/* Regular categories */}
          {sortedCats.map(cat => {
            const barW = Math.max(cat.count > 0 ? 3 : 0, Math.round((cat.count / maxCount) * 100))
            return (
              <div key={cat.id} className="dash-cat-card"
                onClick={() => goToCategory(cat.label)}
                style={{ background:'#fff', border:`1px solid ${cat.count === 0 ? '#f1f5f9' : cat.border}`, borderRadius:12, padding:'18px 20px', boxShadow:'0 1px 4px rgba(0,0,0,0.04)', opacity: cat.count === 0 ? 0.5 : 1 }}>
                <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
                  <div style={{ width:38, height:38, borderRadius:8, background:cat.bg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:800, color:cat.tint, flexShrink:0 }}>
                    {cat.abbr}
                  </div>
                  <div style={{ fontSize:12, fontWeight:700, color:'#0f172a', lineHeight:1.3 }}>{cat.label}</div>
                </div>
                <div style={{ fontSize:24, fontWeight:800, color: cat.count === 0 ? '#94a3b8' : cat.tint, marginBottom:4 }}>
                  {cat.count.toLocaleString()}
                </div>
                <div style={{ fontSize:11, color:'#64748b', marginBottom:12, lineHeight:1.4, display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden' }}>
                  {cat.desc}
                </div>
                <div style={{ height:4, background:'#f1f5f9', borderRadius:2 }}>
                  <div style={{ height:'100%', background: cat.count === 0 ? '#e2e8f0' : cat.tint, borderRadius:2, width:`${barW}%`, transition:'width 0.5s' }} />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Close dropdown on outside click */}
      {showDropdown && <div onClick={() => setShowDropdown(false)} style={{ position:'fixed', inset:0, zIndex:40 }} />}
    </div>
  )
}
