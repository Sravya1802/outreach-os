import { useState, useEffect, useMemo } from 'react'
import { Routes, Route, NavLink, Navigate } from 'react-router-dom'
import { api } from './api'
import { supabase } from './supabaseClient'
import Spin from './components/Spin'
import { timeAgo } from './utils/time'
import CompanyDashboard from './components/CompanyDashboard'
import CategoryView     from './components/CategoryView'
import CompanyDetail    from './components/CompanyDetail'
import Dashboard        from './components/Dashboard'
import DashboardPage    from './components/DashboardPage'
import OutreachPage     from './components/OutreachPage'
import ScraperPage      from './components/ScraperPage'
import CareerOpsPage    from './components/CareerOpsPage'
import CareerOps        from './components/CareerOps'
import ApplicationPipeline from './components/ApplicationPipeline'
import JobDashboard     from './components/JobDashboard'
import Login            from './components/Login'


// ── Settings page ─────────────────────────────────────────────────────────────
function Settings({ name, setName, aiProvider, setAiProvider, onSignOut, userEmail }) {
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  return (
    <div style={{ flex:1, overflowY:'auto', padding:40, maxWidth:520 }}>
      <h2 style={{ fontSize:22, fontWeight:800, color:'#0f172a', marginBottom:4 }}>Settings</h2>
      <p style={{ fontSize:13, color:'#64748b', marginBottom:32 }}>Profile and API configuration</p>

      <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:28, padding:18, background:'#f8fafc', borderRadius:12, border:'1px solid #e2e8f0' }}>
        <div style={{ width:52, height:52, borderRadius:'50%', background:'linear-gradient(135deg,#6366f1,#7c3aed)', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontSize:18, fontWeight:800, flexShrink:0 }}>
          {initials}
        </div>
        <div>
          <div style={{ fontWeight:700, color:'#0f172a', fontSize:15 }}>{name}</div>
          <div style={{ fontSize:12, color:'#94a3b8', marginTop:2 }}>CS Intern Candidate · Summer 2026</div>
        </div>
      </div>

      <div style={{ marginBottom:18 }}>
        <label style={{ fontSize:11, fontWeight:700, color:'#64748b', textTransform:'uppercase', letterSpacing:'0.06em', display:'block', marginBottom:6 }}>Display Name</label>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Your name"
          style={{ width:'100%', padding:'9px 12px', borderRadius:8, border:'1px solid #e2e8f0', fontSize:14, color:'#0f172a', outline:'none', boxSizing:'border-box' }} />
      </div>

      <div style={{ marginBottom:28 }}>
        <label style={{ fontSize:11, fontWeight:700, color:'#64748b', textTransform:'uppercase', letterSpacing:'0.06em', display:'block', marginBottom:6 }}>AI Provider</label>
        <select value={aiProvider} onChange={e => setAiProvider(e.target.value)}
          style={{ width:'100%', padding:'9px 12px', borderRadius:8, border:'1px solid #e2e8f0', fontSize:14, color:'#0f172a', outline:'none' }}>
          <option value="gemini">Gemini 2.0 Flash (default · free tier)</option>
          <option value="anthropic">Claude Haiku 4.5 (Anthropic)</option>
          <option value="openai">GPT-4o Mini (OpenAI)</option>
        </select>
        <p style={{ fontSize:11, color:'#94a3b8', marginTop:6 }}>Set AI_PROVIDER in .env — restart backend to apply.</p>
      </div>

      <div style={{ padding:16, background:'#eff6ff', borderRadius:10, border:'1px solid #bfdbfe', marginBottom:20 }}>
        <div style={{ fontSize:12, fontWeight:700, color:'#1d4ed8', marginBottom:8 }}>API Keys (set in .env)</div>
        {[['GEMINI_API_KEY', 'Gemini AI (free tier available)'], ['APIFY_API_TOKEN', 'Apify (web scraping)'], ['APOLLO_API_KEY', 'Apollo.io (contact enrichment)'], ['LINKEDIN_SESSION_COOKIE', 'LinkedIn li_at cookie'], ['SERPER_API_KEY', 'Serper.dev (Google search)']].map(([key, label]) => (
          <div key={key} style={{ fontSize:11, color:'#3b82f6', marginBottom:3 }}>
            <code style={{ background:'#dbeafe', padding:'1px 5px', borderRadius:3 }}>{key}</code> — {label}
          </div>
        ))}
      </div>

      {onSignOut && (
        <div style={{ padding:16, background:'#fef2f2', borderRadius:10, border:'1px solid #fecaca' }}>
          <div style={{ fontSize:12, fontWeight:700, color:'#b91c1c', marginBottom:4 }}>Account</div>
          {userEmail && <div style={{ fontSize:11, color:'#7f1d1d', marginBottom:10 }}>{userEmail}</div>}
          <button onClick={onSignOut}
            style={{ padding:'7px 14px', background:'#fff', color:'#dc2626', border:'1px solid #fca5a5', borderRadius:8, fontSize:12, fontWeight:700, cursor:'pointer' }}>
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}

// ── Refresh badge ─────────────────────────────────────────────────────────────
function RefreshBadge() {
  const [lastRefresh, setLastRefresh] = useState(null)
  const [refreshing, setRefreshing]   = useState(false)
  const [progress, setProgress]       = useState('')
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000)
    return () => clearInterval(timer)
  }, [])

  // Bulk refresh isn't available on the serverless deployment; keep badge read-only.
  async function refresh() {
    setRefreshing(true); setProgress('Not available on this deployment')
    setTimeout(() => { setRefreshing(false); setProgress('') }, 1500)
  }

  const isStale = useMemo(() => lastRefresh && (now - new Date(lastRefresh)) > 48 * 3600000, [lastRefresh, now])

  return (
    <div style={{ padding:'10px 14px', borderTop:'1px solid #1e293b' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:6 }}>
        <span style={{ fontSize:11, color:'#475569' }}>
          Updated: <span style={{ color: isStale ? '#f59e0b' : '#64748b' }}>{timeAgo(lastRefresh, now)}</span>
        </span>
        <button onClick={refresh} disabled={refreshing}
          style={{ fontSize:11, padding:'3px 9px', borderRadius:6, background:'#1e293b', color: refreshing ? '#64748b' : '#94a3b8', border:'1px solid #334155', cursor: refreshing ? 'default' : 'pointer', fontWeight:600, display:'flex', alignItems:'center', gap:5 }}>
          {refreshing ? <Spin color="#94a3b8" size={10} /> : '↻'} {refreshing ? 'Syncing' : 'Sync'}
        </button>
      </div>
      {refreshing && progress && (
        <div style={{ fontSize:10, color:'#475569', marginTop:4, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{progress}</div>
      )}
    </div>
  )
}

function StatusDot({ ok }) {
  return <span style={{ width:7, height:7, borderRadius:'50%', background: ok ? '#22c55e' : '#475569', display:'inline-block', flexShrink:0 }} />
}

function NavBadge({ n }) {
  if (!n || n < 1) return null
  return (
    <span style={{ fontSize:9, fontWeight:700, padding:'2px 6px', borderRadius:10, background:'#1e293b', color:'#64748b' }}>
      {n.toLocaleString()}
    </span>
  )
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [session, setSession]         = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [health, setHealth]           = useState(null)
  const [stats, setStats]             = useState(null)
  const [profileName, setProfileName] = useState('')
  const [aiProvider, setAiProvider]   = useState('gemini')

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setAuthLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, sess) => setSession(sess))
    return () => subscription?.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) return
    const email = session.user?.email || ''
    setProfileName(email.split('@')[0] || 'User')
  }, [session])

  useEffect(() => { if (session) api.health().then(setHealth).catch(() => {}) }, [session])
  useEffect(() => {
    if (!session) return
    const refresh = () => api.stats().then(setStats).catch(() => {})
    refresh()
    window.addEventListener('stats-refresh', refresh)
    return () => window.removeEventListener('stats-refresh', refresh)
  }, [session])

  if (authLoading) {
    return (
      <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#0f172a' }}>
        <Spin size={28} color="#a5b4fc" />
      </div>
    )
  }
  if (!session) return <Login />

  async function signOut() {
    await supabase.auth.signOut()
  }

  const initials = profileName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()

  const navStyle = (isActive) => ({
    display:'flex', alignItems:'center', justifyContent:'space-between',
    padding:'8px 12px', borderRadius:8, marginBottom:2,
    fontSize:13, fontWeight:600, cursor:'pointer', border:'none', width:'100%', textAlign:'left',
    background: isActive ? 'rgba(99,102,241,0.12)' : 'transparent',
    color: isActive ? '#a5b4fc' : '#94a3b8',
    textDecoration:'none', transition:'all 0.12s',
  })

  const sectionLabel = (text) => (
    <div style={{ fontSize:10, fontWeight:700, color:'#334155', textTransform:'uppercase', letterSpacing:'0.1em', padding:'12px 6px 6px' }}>
      {text}
    </div>
  )

  return (
    <div style={{ height:'100vh', display:'flex', overflow:'hidden', fontFamily:'var(--font)', background:'var(--bg)' }}>

      {/* ── Sidebar ── */}
      <aside style={{ width:228, background:'#0f172a', display:'flex', flexDirection:'column', flexShrink:0, borderRight:'1px solid #1e293b' }}>

        {/* Logo */}
        <div style={{ padding:'20px 18px 16px', borderBottom:'1px solid #1e293b' }}>
          <div style={{ fontSize:16, fontWeight:800, letterSpacing:'-0.01em', color:'#f8fafc', marginBottom:1 }}>
            <span style={{ color:'#818cf8' }}>◈</span> OutreachOS
          </div>
          <div style={{ fontSize:11, color:'#475569', marginTop:2 }}>Summer 2026 Internship</div>
        </div>

        {/* Nav */}
        <nav style={{ flex:1, padding:'4px 10px', overflowY:'auto' }}>

          {/* MAIN section */}
          {sectionLabel('Main')}

          <NavLink to="/dashboard" end style={({ isActive }) => navStyle(isActive)}>
            <span style={{ flex:1 }}>Dashboard</span>
          </NavLink>

          <NavLink to="/companies" end style={({ isActive }) => navStyle(isActive)}>
            <span style={{ flex:1 }}>Companies</span>
            <NavBadge n={stats?.totalCompanies} />
          </NavLink>

          <NavLink to="/pipeline" style={({ isActive }) => navStyle(isActive)}>
            <span style={{ flex:1 }}>Pipeline</span>
          </NavLink>

          {/* TOOLS section */}
          {sectionLabel('Tools')}

          <NavLink to="/job-dashboard" style={({ isActive }) => navStyle(isActive)}>
            <span style={{ flex:1 }}>Job Dashboard</span>
          </NavLink>

          <NavLink to="/outreach" style={({ isActive }) => navStyle(isActive)}>
            <span style={{ flex:1 }}>Outreach</span>
            <NavBadge n={stats?.totalContacts} />
          </NavLink>

          <NavLink to="/scraper" style={({ isActive }) => navStyle(isActive)}>
            <span style={{ flex:1 }}>Job Scraper</span>
          </NavLink>

          <NavLink to="/career-ops" style={({ isActive }) => navStyle(isActive)}>
            <span style={{ flex:1 }}>Role Eligibility Info</span>
            <NavBadge n={stats?.totalApplications} />
          </NavLink>

          <NavLink to="/career-ops-workflow" style={({ isActive }) => navStyle(isActive)}>
            <span style={{ flex:1 }}>Career Ops</span>
          </NavLink>

        </nav>

        {/* API Status */}
        {health && (
          <div style={{ padding:'12px 16px', borderTop:'1px solid #1e293b' }}>
            <div style={{ fontSize:10, fontWeight:700, color:'#334155', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:8 }}>
              API Status
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
              {[['Gemini AI', health.has_gemini], ['Apify', health.has_apify], ['Apollo', health.has_apollo], ['LinkedIn', health.has_linkedin]].map(([label, ok]) => (
                <div key={label} style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <StatusDot ok={ok} />
                  <span style={{ fontSize:11, color: ok ? '#64748b' : '#475569' }}>{label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Refresh */}
        <RefreshBadge />

        {/* Settings link at bottom */}
        <NavLink to="/settings"
          style={{ margin:'10px', padding:'11px 12px', borderRadius:10, border:'1px solid #1e293b', background:'#111827', cursor:'pointer', display:'flex', alignItems:'center', gap:10, textDecoration:'none', transition:'all 0.15s' }}
          onMouseEnter={e => e.currentTarget.style.background='#1e293b'}
          onMouseLeave={e => e.currentTarget.style.background='#111827'}>
          <div style={{ width:34, height:34, borderRadius:'50%', background:'linear-gradient(135deg,#6366f1,#7c3aed)', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontSize:13, fontWeight:800, flexShrink:0 }}>
            {initials}
          </div>
          <div style={{ flex:1, minWidth:0, textAlign:'left' }}>
            <div style={{ fontSize:12, fontWeight:700, color:'#e2e8f0', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{profileName}</div>
            <div style={{ fontSize:10, color:'#475569' }}>Settings & profile</div>
          </div>
          <span style={{ fontSize:14, color:'#334155' }}>⚙</span>
        </NavLink>
      </aside>

      {/* ── Main content ── */}
      <main style={{ flex:1, overflow:'hidden', display:'flex', flexDirection:'column' }}>
        <Routes>
          <Route path="/"                  element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard"         element={<DashboardPage onStatsChange={setStats} />} />
          <Route path="/companies"         element={<CompanyDashboard onStatsChange={setStats} />} />
          <Route path="/category/:name"    element={<CategoryView />} />
          <Route path="/company/:id"       element={<CompanyDetail />} />
          <Route path="/pipeline"          element={<ApplicationPipeline />} />
          <Route path="/outreach"          element={<OutreachPage />} />
          <Route path="/scraper"           element={<ScraperPage />} />
          <Route path="/career-ops"        element={<CareerOpsPage />} />
          <Route path="/career-ops-workflow" element={<CareerOps />} />
          <Route path="/job-dashboard"     element={<JobDashboard />} />
          <Route path="/settings"          element={<Settings name={profileName} setName={setProfileName} aiProvider={aiProvider} setAiProvider={setAiProvider} onSignOut={signOut} userEmail={session.user?.email} />} />
          <Route path="*"                  element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </main>
    </div>
  )
}
