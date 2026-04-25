import React, { useState, useEffect, useRef, useCallback } from 'react'
import { api } from '../api'

// ── Inject styles ─────────────────────────────────────────────────────────────
function injectStyles() {
  if (document.getElementById('co-styles')) return
  const s = document.createElement('style')
  s.id = 'co-styles'
  s.textContent = `
    @keyframes cospin { to { transform: rotate(360deg); } }
    @keyframes cofade { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
    .co-fade { animation: cofade 0.22s ease; }
    .co-card:hover { box-shadow: 0 4px 18px rgba(99,102,241,0.12) !important; border-color: #c7d2fe !important; }
    .co-block summary { cursor: pointer; user-select: none; list-style: none; }
    .dropzone-active { border-color: #6366f1 !important; background: #eef2ff !important; }
  `
  document.head.appendChild(s)
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function gradeColor(g) { return { A:'#16a34a', B:'#0d9488', C:'#d97706', D:'#ea580c', F:'#dc2626' }[g] || '#94a3b8' }
function gradeBg(g)    { return { A:'#dcfce7', B:'#ccfbf1', C:'#fef3c7', D:'#ffedd5', F:'#fee2e2' }[g] || '#f8fafc' }

function Spin({ size=16, color='#6366f1' }) {
  return <span style={{ display:'inline-block', width:size, height:size, border:`2px solid ${color}25`, borderTopColor:color, borderRadius:'50%', animation:'cospin 0.7s linear infinite', flexShrink:0 }} />
}

function ScoreBar({ label, value, max=10 }) {
  const pct = (value / max) * 100
  const color = pct >= 70 ? '#16a34a' : pct >= 50 ? '#d97706' : '#dc2626'
  const display = label.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase()).trim()
  return (
    <div style={{ marginBottom:10 }}>
      <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, color:'#374151', marginBottom:4 }}>
        <span>{display}</span>
        <span style={{ fontWeight:700, color }}>{value}/10</span>
      </div>
      <div style={{ height:6, background:'#f1f5f9', borderRadius:4, overflow:'hidden' }}>
        <div style={{ height:'100%', width:`${pct}%`, background:color, borderRadius:4, transition:'width 0.6s ease' }} />
      </div>
    </div>
  )
}

function Block({ title, icon, defaultOpen=false, children }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={{ border:'1px solid #e2e8f0', borderRadius:12, marginBottom:10, overflow:'hidden' }}>
      <div onClick={() => setOpen(v=>!v)}
        style={{ display:'flex', alignItems:'center', gap:10, padding:'13px 16px', background: open ? '#fafafa' : '#fff', cursor:'pointer', borderBottom: open ? '1px solid #f1f5f9':'none', transition:'background 0.12s' }}>
        <span style={{ fontSize:17 }}>{icon}</span>
        <span style={{ fontSize:14, fontWeight:700, color:'#0f172a', flex:1 }}>{title}</span>
        <span style={{ fontSize:12, color:'#94a3b8', transition:'transform 0.2s', display:'inline-block', transform: open ? 'rotate(90deg)':'rotate(0deg)' }}>▶</span>
      </div>
      {open && <div style={{ padding:'16px' }}>{children}</div>}
    </div>
  )
}

// ── Resume upload ─────────────────────────────────────────────────────────────
function ResumeUpload({ resumeInfo, onUploaded }) {
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState(null)
  const fileRef = useRef()

  async function handleFile(file) {
    if (!file || file.type !== 'application/pdf') { setError('PDF files only, please.'); return }
    setUploading(true); setError(null)
    try {
      const r = await api.career.uploadResume(file)
      if (!r.success) throw new Error(r.error || 'Upload failed')
      onUploaded(r)
    } catch (err) { setError(err.message) }
    finally { setUploading(false) }
  }

  if (resumeInfo?.hasResume) {
    return (
      <div style={{ display:'flex', alignItems:'center', gap:14, padding:'14px 18px', background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:12 }}>
        <div style={{ width:40, height:40, borderRadius:10, background:'#dcfce7', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, flexShrink:0 }}>📄</div>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:13, fontWeight:700, color:'#166534' }}>{resumeInfo.name}</div>
          <div style={{ fontSize:11, color:'#15803d', marginTop:2 }}>
            Uploaded {resumeInfo.date ? new Date(resumeInfo.date).toLocaleDateString() : ''}
          </div>
        </div>
        <button onClick={() => fileRef.current.click()} style={{ padding:'7px 16px', fontSize:12, fontWeight:700, background:'#fff', color:'#374151', border:'1px solid #e2e8f0', borderRadius:8, cursor:'pointer' }}>
          Replace
        </button>
        <input ref={fileRef} type="file" accept=".pdf" style={{ display:'none' }} onChange={e => handleFile(e.target.files[0])} />
      </div>
    )
  }

  return (
    <div>
      <div className={dragging ? 'dropzone-active' : ''}
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]) }}
        onClick={() => fileRef.current.click()}
        style={{ border:'2px dashed #c7d2fe', borderRadius:12, padding:'36px', textAlign:'center', cursor:'pointer', background:'#fafbff', transition:'all 0.15s' }}>
        {uploading ? (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:10, color:'#6366f1', fontSize:13, fontWeight:600 }}>
            <Spin /> Parsing PDF…
          </div>
        ) : (
          <>
            <div style={{ fontSize:36, marginBottom:10 }}>📤</div>
            <div style={{ fontSize:14, fontWeight:700, color:'#374151', marginBottom:4 }}>Drop your resume PDF here</div>
            <div style={{ fontSize:12, color:'#94a3b8' }}>or click to browse · PDF only · max 10MB</div>
          </>
        )}
        <input ref={fileRef} type="file" accept=".pdf" style={{ display:'none' }} onChange={e => handleFile(e.target.files[0])} />
      </div>
      {error && <div style={{ marginTop:8, fontSize:12, color:'#dc2626', fontWeight:600 }}>⚠ {error}</div>}
    </div>
  )
}

// ── Evaluation report — renders santifer's A-G schema ────────────────────────
function EvaluationReport({ evaluation: e, onGeneratePDF, pdfLoading, pdfUrl, applyMode, applyStatus, onApplyModeChange, onApply, applying }) {
  const gc = gradeColor(e.grade)
  const gb = gradeBg(e.grade)

  // Legitimacy assessment → color + plain-English meaning.
  // Santifer's G block uses: "High Confidence" / "Proceed with Caution" / "Suspicious".
  const legitAssess = e.blockG_legitimacy?.assessment || 'Proceed with Caution'
  const legitMeta = legitAssess === 'High Confidence'
    ? { color:'#16a34a', bg:'#dcfce7', hint:'Multiple signals suggest this is a real, active opening — safe to invest effort.' }
    : legitAssess === 'Suspicious'
    ? { color:'#dc2626', bg:'#fee2e2', hint:'Multiple ghost-job indicators. Investigate (layoffs, posting age, reposts) before applying.' }
    : { color:'#d97706', bg:'#fef3c7', hint:'Mixed signals — consider applying but don\'t over-invest until you confirm the role is live.' }

  return (
    <div className="co-fade">
      {/* Grade header card */}
      <div style={{ display:'flex', alignItems:'center', gap:20, padding:'22px 24px', background:gb, border:`1px solid ${gc}30`, borderRadius:16, marginBottom:20, flexWrap:'wrap' }}>
        <div style={{ width:76, height:76, borderRadius:'50%', background:`${gc}20`, border:`3px solid ${gc}`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
          <span style={{ fontSize:34, fontWeight:900, color:gc }}>{e.grade}</span>
        </div>
        <div style={{ flex:1, minWidth:220 }}>
          <div style={{ fontSize:19, fontWeight:800, color:'#0f172a', marginBottom:4 }}>
            {e.jobTitle} <span style={{ fontWeight:400, color:'#64748b', fontSize:16 }}>at</span> {e.companyName}
          </div>
          <div style={{ fontSize:13, fontWeight:700, color:gc, marginBottom:4 }}>{e.recommendation}</div>
          <div style={{ fontSize:12, color:'#64748b' }}>
            Score: <strong>{e.globalScore ? e.globalScore.toFixed(1) : (e.overallScore / 20).toFixed(1)}/5.0</strong>
            {e.archetype?.primary && <> · Archetype: <strong>{e.archetype.primary}</strong>{e.archetype.secondary ? ` / ${e.archetype.secondary}` : ''}</>}
          </div>
        </div>

        {/* Apply mode toggle + Apply button */}
        <div style={{ display:'flex', flexDirection:'column', gap:8, alignItems:'stretch', minWidth:200 }}>
          <div style={{ display:'inline-flex', background:'#fff', borderRadius:9, padding:3, border:'1px solid #e2e8f0' }}>
            {[['manual','👤 Manual'],['auto','⚡ Auto']].map(([k, l]) => (
              <button key={k} onClick={() => onApplyModeChange?.(k)}
                style={{ padding:'6px 14px', fontSize:11, fontWeight:700, border:'none', borderRadius:7, cursor:'pointer', flex:1,
                  background: applyMode === k ? (k === 'auto' ? '#7c3aed' : '#4f46e5') : 'transparent',
                  color: applyMode === k ? '#fff' : '#64748b',
                  transition:'all 0.12s' }}>
                {l}
              </button>
            ))}
          </div>
          <button onClick={onApply} disabled={applying}
            style={{ padding:'9px 18px', fontSize:12, fontWeight:700, background: applying ? '#f1f5f9' : (applyMode === 'auto' ? 'linear-gradient(135deg,#7c3aed,#a855f7)' : 'linear-gradient(135deg,#6366f1,#4f46e5)'), color: applying ? '#64748b' : '#fff', border:'none', borderRadius:9, cursor: applying ? 'default':'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:7 }}>
            {applying
              ? <><Spin size={13} color="#64748b" /> Working…</>
              : applyStatus === 'submitted' ? '✓ Submitted'
              : applyStatus === 'opened' ? (applyMode === 'auto' ? '⚡ Run auto apply' : '↗ Open again')
              : applyStatus === 'queued' ? '⋯ Queued for auto apply'
              : (applyMode === 'auto' ? '⚡ Auto apply' : '↗ Open & apply')}
          </button>
          <div style={{ fontSize:10, color:'#94a3b8', textAlign:'center', lineHeight:1.4 }}>
            {applyMode === 'auto'
              ? 'Playwright worker submits for you'
              : 'Opens the job page — you submit'}
          </div>
          {pdfUrl ? (
            <a href={pdfUrl} download style={{ padding:'8px 14px', fontSize:11, fontWeight:700, background:'#16a34a', color:'#fff', borderRadius:8, textAlign:'center', textDecoration:'none' }}>
              ⬇ Download Tailored CV
            </a>
          ) : (
            <button onClick={onGeneratePDF} disabled={pdfLoading}
              style={{ padding:'8px 14px', fontSize:11, fontWeight:700, background:'#fff', color:'#4f46e5', border:'1px solid #c7d2fe', borderRadius:8, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
              {pdfLoading ? <><Spin size={11} color="#4f46e5" /> Generating…</> : '✨ Tailored CV PDF'}
            </button>
          )}
        </div>
      </div>

      {/* Block A — Role Summary */}
      <Block title="A · Role Summary" icon="📋" defaultOpen={true}>
        <p style={{ fontSize:13, color:'#374151', lineHeight:1.75, marginBottom:14 }}>{e.blockA_roleSummary?.tldr}</p>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(140px, 1fr))', gap:10 }}>
          {[
            ['Archetype', e.blockA_roleSummary?.archetypeDetected],
            ['Domain', e.blockA_roleSummary?.domain],
            ['Function', e.blockA_roleSummary?.function],
            ['Seniority', e.blockA_roleSummary?.seniority],
            ['Remote', e.blockA_roleSummary?.remote],
            ['Team', e.blockA_roleSummary?.teamSize],
          ].map(([lbl, val]) => val && (
            <div key={lbl} style={{ padding:'10px 12px', background:'#f8fafc', borderRadius:8, border:'1px solid #f1f5f9' }}>
              <div style={{ fontSize:10, fontWeight:700, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:3 }}>{lbl}</div>
              <div style={{ fontSize:12, fontWeight:600, color:'#0f172a' }}>{val}</div>
            </div>
          ))}
        </div>
      </Block>

      {/* Block B — CV Match */}
      <Block title="B · CV Match" icon="📊" defaultOpen={true}>
        <div style={{ fontSize:11, fontWeight:700, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:10 }}>Requirements vs Your CV</div>
        {(e.blockB_cvMatch?.requirements || []).map((r, i) => (
          <div key={i} style={{ padding:'10px 12px', marginBottom:6, background: r.status === 'match' ? '#f0fdf4' : r.status === 'partial' ? '#fffbeb' : '#fef2f2', borderRadius:8, borderLeft:`3px solid ${r.status === 'match' ? '#16a34a' : r.status === 'partial' ? '#d97706' : '#dc2626'}` }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:3 }}>
              <span style={{ fontSize:10, fontWeight:700, padding:'1px 7px', borderRadius:10, background: r.status === 'match' ? '#dcfce7' : r.status === 'partial' ? '#fef3c7' : '#fee2e2', color: r.status === 'match' ? '#15803d' : r.status === 'partial' ? '#92400e' : '#991b1b' }}>
                {r.status}
              </span>
              <span style={{ fontSize:12, fontWeight:700, color:'#0f172a' }}>{r.requirement}</span>
            </div>
            <div style={{ fontSize:11, color:'#64748b', lineHeight:1.55 }}>{r.cvEvidence}</div>
          </div>
        ))}
        {(e.blockB_cvMatch?.gaps || []).length > 0 && (
          <>
            <div style={{ fontSize:11, fontWeight:700, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.07em', marginTop:14, marginBottom:10 }}>Gap Mitigation</div>
            {e.blockB_cvMatch.gaps.map((g, i) => (
              <div key={i} style={{ padding:'10px 12px', marginBottom:6, background:'#fef2f2', borderRadius:8, border:'1px solid #fecaca' }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:3 }}>
                  <span style={{ fontSize:10, fontWeight:700, padding:'1px 7px', borderRadius:10, background: g.severity === 'hard blocker' ? '#fee2e2' : '#fef3c7', color: g.severity === 'hard blocker' ? '#991b1b' : '#92400e' }}>
                    {g.severity}
                  </span>
                  <span style={{ fontSize:12, fontWeight:700, color:'#0f172a' }}>{g.gap}</span>
                </div>
                {g.adjacentExperience && <div style={{ fontSize:11, color:'#475569', marginBottom:3 }}>Adjacent: {g.adjacentExperience}</div>}
                <div style={{ fontSize:11, color:'#374151', fontStyle:'italic' }}>→ {g.mitigation}</div>
              </div>
            ))}
          </>
        )}
      </Block>

      {/* Block C — Level & Strategy */}
      <Block title="C · Level & Strategy" icon="🎯">
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:14 }}>
          <div style={{ padding:'10px 12px', background:'#eef2ff', borderRadius:8 }}>
            <div style={{ fontSize:10, fontWeight:700, color:'#4f46e5', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:3 }}>JD Level</div>
            <div style={{ fontSize:13, fontWeight:700, color:'#0f172a' }}>{e.blockC_levelAndStrategy?.jdLevel || 'Unknown'}</div>
          </div>
          <div style={{ padding:'10px 12px', background:'#f0fdf4', borderRadius:8 }}>
            <div style={{ fontSize:10, fontWeight:700, color:'#16a34a', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:3 }}>Your Natural Level</div>
            <div style={{ fontSize:13, fontWeight:700, color:'#0f172a' }}>{e.blockC_levelAndStrategy?.candidateNaturalLevel || 'Unknown'}</div>
          </div>
        </div>
        {(e.blockC_levelAndStrategy?.sellSeniorPlan || []).length > 0 && (
          <>
            <div style={{ fontSize:11, fontWeight:700, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:8 }}>"Sell senior without lying" tactics</div>
            {e.blockC_levelAndStrategy.sellSeniorPlan.map((p, i) => (
              <div key={i} style={{ fontSize:12, color:'#374151', marginBottom:6, display:'flex', gap:8, lineHeight:1.6 }}>
                <span style={{ color:'#6366f1', flexShrink:0 }}>→</span>{p}
              </div>
            ))}
          </>
        )}
        {(e.blockC_levelAndStrategy?.ifDownleveledPlan || []).length > 0 && (
          <div style={{ marginTop:12, padding:'10px 12px', background:'#fffbeb', borderRadius:8, border:'1px solid #fde68a' }}>
            <div style={{ fontSize:10, fontWeight:700, color:'#92400e', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:5 }}>If they downlevel you</div>
            {e.blockC_levelAndStrategy.ifDownleveledPlan.map((p, i) => (
              <div key={i} style={{ fontSize:11, color:'#374151', marginBottom:3 }}>· {p}</div>
            ))}
          </div>
        )}
      </Block>

      {/* Block D — Comp & Demand */}
      <Block title="D · Comp & Demand" icon="💰">
        <div style={{ padding:'14px 16px', background:'#f0fdf4', borderRadius:10, marginBottom:14, border:'1px solid #bbf7d0' }}>
          <div style={{ fontSize:10, fontWeight:700, color:'#16a34a', marginBottom:5, textTransform:'uppercase', letterSpacing:'0.07em' }}>Estimated Range</div>
          <div style={{ fontSize:18, fontWeight:800, color:'#0f172a' }}>{e.blockD_compAndDemand?.salaryRange || 'Not available'}</div>
          {e.blockD_compAndDemand?.companyCompReputation && (
            <div style={{ fontSize:11, color:'#475569', marginTop:5, lineHeight:1.5 }}>{e.blockD_compAndDemand.companyCompReputation}</div>
          )}
        </div>
        <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginBottom:8 }}>
          <span style={{ fontSize:11, padding:'4px 10px', borderRadius:20, background:'#eef2ff', color:'#4f46e5', fontWeight:600 }}>
            Demand: {e.blockD_compAndDemand?.roleDemandTrend || 'unknown'}
          </span>
          {(e.blockD_compAndDemand?.sources || []).map((s, i) => (
            <span key={i} style={{ fontSize:11, padding:'4px 10px', borderRadius:20, background:'#f1f5f9', color:'#475569', fontWeight:500 }}>{s}</span>
          ))}
        </div>
      </Block>

      {/* Block E — Personalization */}
      <Block title="E · CV & LinkedIn Edits" icon="✏">
        {(e.blockE_personalization?.cvChanges || []).length > 0 && (
          <>
            <div style={{ fontSize:11, fontWeight:700, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:10 }}>CV Changes</div>
            {e.blockE_personalization.cvChanges.map((c, i) => (
              <div key={i} style={{ padding:'10px 12px', marginBottom:6, background:'#f8fafc', borderRadius:8, borderLeft:'3px solid #6366f1' }}>
                <div style={{ fontSize:12, fontWeight:700, color:'#0f172a', marginBottom:3 }}>{c.section}</div>
                <div style={{ fontSize:11, color:'#64748b', marginBottom:3 }}><strong>Before:</strong> {c.currentState}</div>
                <div style={{ fontSize:11, color:'#16a34a', marginBottom:3 }}><strong>After:</strong> {c.proposedChange}</div>
                <div style={{ fontSize:10, color:'#94a3b8', fontStyle:'italic' }}>Why: {c.why}</div>
              </div>
            ))}
          </>
        )}
        {(e.blockE_personalization?.linkedinChanges || []).length > 0 && (
          <>
            <div style={{ fontSize:11, fontWeight:700, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.07em', marginTop:14, marginBottom:10 }}>LinkedIn Changes</div>
            {e.blockE_personalization.linkedinChanges.map((c, i) => (
              <div key={i} style={{ fontSize:12, color:'#374151', marginBottom:5, display:'flex', gap:7 }}>
                <span style={{ color:'#0077b5', flexShrink:0 }}>·</span>{c}
              </div>
            ))}
          </>
        )}
      </Block>

      {/* Block F — Interview Prep */}
      <Block title="F · Interview Prep" icon="🎤">
        {(e.blockF_interviewPrep?.starStories || []).length > 0 && (
          <>
            <div style={{ fontSize:11, fontWeight:700, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:10 }}>STAR+R stories mapped to the JD</div>
            {e.blockF_interviewPrep.starStories.map((s, i) => (
              <div key={i} style={{ padding:'11px 14px', marginBottom:8, background:'#fafafa', borderRadius:9, borderLeft:'3px solid #7c3aed' }}>
                <div style={{ fontSize:11, fontWeight:700, color:'#7c3aed', marginBottom:4 }}>Maps to: {s.jdRequirement}</div>
                <div style={{ fontSize:12, color:'#0f172a', lineHeight:1.55 }}>
                  <strong>S</strong>: {s.situation}<br/>
                  <strong>T</strong>: {s.task}<br/>
                  <strong>A</strong>: {s.action}<br/>
                  <strong>R</strong>: {s.result}
                </div>
                {s.reflection && <div style={{ fontSize:11, color:'#475569', marginTop:4, fontStyle:'italic' }}>Reflection: {s.reflection}</div>}
              </div>
            ))}
          </>
        )}
        {e.blockF_interviewPrep?.caseStudyRecommendation && (
          <div style={{ padding:'12px 14px', background:'#fef3c7', borderRadius:9, marginTop:10, border:'1px solid #fde68a' }}>
            <div style={{ fontSize:10, fontWeight:700, color:'#d97706', marginBottom:5, textTransform:'uppercase', letterSpacing:'0.07em' }}>Case Study Recommendation</div>
            <p style={{ fontSize:12, color:'#374151', lineHeight:1.65, margin:0 }}>{e.blockF_interviewPrep.caseStudyRecommendation}</p>
          </div>
        )}
        {(e.blockF_interviewPrep?.redFlagQuestions || []).length > 0 && (
          <>
            <div style={{ fontSize:11, fontWeight:700, color:'#dc2626', textTransform:'uppercase', letterSpacing:'0.07em', marginTop:14, marginBottom:10 }}>⚠ Red-flag questions</div>
            {e.blockF_interviewPrep.redFlagQuestions.map((q, i) => (
              <div key={i} style={{ padding:'10px 12px', marginBottom:6, background:'#fef2f2', borderRadius:8 }}>
                <div style={{ fontSize:12, fontWeight:700, color:'#991b1b', marginBottom:4 }}>Q: {q.question}</div>
                <div style={{ fontSize:11, color:'#374151', lineHeight:1.55 }}>A: {q.answer}</div>
              </div>
            ))}
          </>
        )}
      </Block>

      {/* Block G — Legitimacy */}
      <Block title="G · Posting Legitimacy" icon="🔎" defaultOpen={true}>
        <div style={{ padding:'12px 14px', background: legitMeta.bg, borderRadius:9, marginBottom:12, border:`1px solid ${legitMeta.color}30` }}>
          <div style={{ fontSize:13, fontWeight:800, color: legitMeta.color, marginBottom:4 }}>{legitAssess}</div>
          <div style={{ fontSize:11, color:'#374151', lineHeight:1.55 }}>{legitMeta.hint}</div>
        </div>
        {(e.blockG_legitimacy?.signals || []).length > 0 && (
          <table style={{ width:'100%', fontSize:11, borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ borderBottom:'1px solid #e2e8f0' }}>
                <th style={{ textAlign:'left', padding:'6px 8px', color:'#94a3b8', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', fontSize:10 }}>Signal</th>
                <th style={{ textAlign:'left', padding:'6px 8px', color:'#94a3b8', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', fontSize:10 }}>Finding</th>
                <th style={{ textAlign:'center', padding:'6px 8px', color:'#94a3b8', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', fontSize:10, width:110 }}>Weight</th>
              </tr>
            </thead>
            <tbody>
              {e.blockG_legitimacy.signals.map((s, i) => {
                const wColor = s.weight === 'Positive' ? '#16a34a' : s.weight === 'Concerning' ? '#dc2626' : '#64748b'
                const wBg    = s.weight === 'Positive' ? '#dcfce7' : s.weight === 'Concerning' ? '#fee2e2' : '#f1f5f9'
                return (
                  <tr key={i} style={{ borderBottom:'1px solid #f1f5f9' }}>
                    <td style={{ padding:'8px', color:'#0f172a', fontWeight:600, verticalAlign:'top' }}>{s.signal}</td>
                    <td style={{ padding:'8px', color:'#475569', lineHeight:1.55 }}>{s.finding}</td>
                    <td style={{ padding:'8px', textAlign:'center' }}>
                      <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:20, background: wBg, color: wColor }}>
                        {s.weight}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
        {e.blockG_legitimacy?.contextNotes && (
          <div style={{ marginTop:12, padding:'10px 12px', background:'#f8fafc', borderRadius:8, fontSize:11, color:'#475569', fontStyle:'italic', lineHeight:1.6 }}>
            {e.blockG_legitimacy.contextNotes}
          </div>
        )}
      </Block>

      {/* ATS Keywords */}
      {(e.atsKeywords || []).length > 0 && (
        <Block title="ATS Keywords" icon="🏷">
          <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
            {e.atsKeywords.map((k, i) => (
              <span key={i} style={{ padding:'4px 10px', background:'#eef2ff', color:'#4f46e5', borderRadius:20, fontSize:11, fontWeight:600 }}>{k}</span>
            ))}
          </div>
        </Block>
      )}
    </div>
  )
}

// ── Auto-Apply Setup (profile + resume library + queue runner) ───────────────
// Exported so CompanyDetail's Job Automation tab can reuse the exact same form.
export function AutoApplySetup() {
  const [profile, setProfile]     = useState(null)
  const [resumes, setResumes]     = useState([])
  const [resumeDir, setResumeDir] = useState('')
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState(false)
  const [savedMsg, setSavedMsg]   = useState(null)
  const [running, setRunning]     = useState(false)
  const [runResult, setRunResult] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [p, lib] = await Promise.all([api.career.profile(), api.career.resumesLibrary()])
      setProfile(p || {})
      setResumeDir(lib.resumeDir || '')
      setResumes(lib.resumes || [])
    } catch (e) { console.warn('Profile load error:', e) }
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  async function saveProfile() {
    setSaving(true); setSavedMsg(null)
    try {
      const updated = await api.career.updateProfile(profile)
      setProfile(updated)
      setSavedMsg({ ok: true, text: 'Profile saved' })
      // Re-scan resumes in case resume_dir changed
      const lib = await api.career.resumesLibrary()
      setResumeDir(lib.resumeDir || ''); setResumes(lib.resumes || [])
    } catch (err) { setSavedMsg({ ok: false, text: err.message }) }
    setSaving(false)
    setTimeout(() => setSavedMsg(null), 4000)
  }

  async function runQueue(dryRun = false) {
    setRunning(true); setRunResult(null)
    try {
      const r = await api.career.autoApplyRun({ dryRun, headless: true, limit: 10 })
      setRunResult(r)
    } catch (err) { setRunResult({ error: err.message }) }
    setRunning(false)
  }

  if (loading) return <div style={{ padding:40, textAlign:'center' }}><Spin size={24} /></div>
  const p = profile || {}
  const set = (k, v) => setProfile({ ...p, [k]: v })

  const field = (label, key, opts = {}) => (
    <div style={{ marginBottom:12 }}>
      <label style={{ fontSize:11, fontWeight:700, color:'#64748b', textTransform:'uppercase', letterSpacing:'0.06em', display:'block', marginBottom:4 }}>{label}</label>
      <input type={opts.type || 'text'} value={p[key] || ''} onChange={e => set(key, e.target.value)} placeholder={opts.placeholder}
        style={{ width:'100%', padding:'8px 12px', border:'1px solid #e2e8f0', borderRadius:8, fontSize:13, outline:'none', background:'#fff' }} />
    </div>
  )

  return (
    <div>
      {/* Profile card */}
      <div style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:12, padding:20, marginBottom:16 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
          <div>
            <h2 style={{ fontSize:16, fontWeight:800, color:'#0f172a', margin:0 }}>Profile</h2>
            <p style={{ fontSize:12, color:'#64748b', margin:'2px 0 0' }}>Used by the auto-apply worker to fill application forms</p>
          </div>
          <button onClick={saveProfile} disabled={saving}
            style={{ padding:'9px 18px', fontSize:12, fontWeight:700, background:'linear-gradient(135deg,#6366f1,#7c3aed)', color:'#fff', border:'none', borderRadius:9, cursor: saving ? 'default':'pointer', display:'flex', alignItems:'center', gap:7 }}>
            {saving ? <><Spin size={13} color="#fff" /> Saving…</> : 'Save Profile'}
          </button>
        </div>
        {savedMsg && (
          <div style={{ padding:'8px 12px', borderRadius:8, fontSize:12, fontWeight:600, marginBottom:12,
            background: savedMsg.ok ? '#f0fdf4' : '#fef2f2', color: savedMsg.ok ? '#15803d' : '#dc2626',
            border: `1px solid ${savedMsg.ok ? '#bbf7d0' : '#fecaca'}` }}>
            {savedMsg.ok ? '✓' : '✗'} {savedMsg.text}
          </div>
        )}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
          {field('First Name', 'first_name')}
          {field('Last Name',  'last_name')}
          {field('Email',      'email',      { type:'email' })}
          {field('Phone',      'phone',      { type:'tel' })}
          {field('LinkedIn URL', 'linkedin_url', { placeholder:'https://linkedin.com/in/yourname' })}
          {field('GitHub URL',   'github_url',   { placeholder:'https://github.com/yourname' })}
          {field('Portfolio URL','portfolio_url')}
          {field('Location (City, ST)', 'location')}
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginTop:4 }}>
          <div style={{ marginBottom:12 }}>
            <label style={{ fontSize:11, fontWeight:700, color:'#64748b', textTransform:'uppercase', letterSpacing:'0.06em', display:'block', marginBottom:4 }}>Work Authorization</label>
            <select value={p.work_authorization || 'US Citizen'} onChange={e => set('work_authorization', e.target.value)}
              style={{ width:'100%', padding:'8px 12px', border:'1px solid #e2e8f0', borderRadius:8, fontSize:13, outline:'none', background:'#fff' }}>
              {['US Citizen','Permanent Resident','F-1 (OPT/STEM)','H-1B','TN Visa','Other'].map(o => <option key={o}>{o}</option>)}
            </select>
          </div>
          <div style={{ marginBottom:12 }}>
            <label style={{ fontSize:11, fontWeight:700, color:'#64748b', textTransform:'uppercase', letterSpacing:'0.06em', display:'block', marginBottom:4 }}>Needs Sponsorship?</label>
            <select value={p.needs_sponsorship ? '1' : '0'} onChange={e => set('needs_sponsorship', e.target.value === '1' ? 1 : 0)}
              style={{ width:'100%', padding:'8px 12px', border:'1px solid #e2e8f0', borderRadius:8, fontSize:13, outline:'none', background:'#fff' }}>
              <option value="0">No</option>
              <option value="1">Yes</option>
            </select>
          </div>
        </div>
        {field('Resume folder (local path)', 'resume_dir', { placeholder:'/Users/you/Documents/Common resumes' })}
      </div>

      {/* Resume library */}
      <div style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:12, padding:20, marginBottom:16 }}>
        <h2 style={{ fontSize:16, fontWeight:800, color:'#0f172a', margin:'0 0 4px' }}>Resume Library <span style={{ fontSize:11, fontWeight:600, color:'#94a3b8', letterSpacing:0 }}>— fallback only</span></h2>
        <p style={{ fontSize:12, color:'#64748b', margin:'0 0 10px' }}>
          Auto-apply uses the <strong style={{ color:'#7c3aed' }}>tailored resume generated by Career Ops</strong> for each role.
          These local PDFs are only used when no tailored resume exists yet.
        </p>
        <div style={{ padding:'10px 12px', background:'#f5f3ff', border:'1px solid #ddd6fe', borderRadius:8, fontSize:11, color:'#6d28d9', marginBottom:12, lineHeight:1.5 }}>
          <strong>How it picks the resume:</strong>
          <div style={{ marginTop:4 }}>1. Tailored PDF from Career Ops (if generated for this evaluation)</div>
          <div>2. Auto-generated on the fly during apply (if an evaluation exists but no tailored PDF yet)</div>
          <div>3. Closest match from this folder by role archetype (last resort)</div>
        </div>
        <p style={{ fontSize:12, color:'#64748b', margin:'0 0 14px' }}>Scanned from <code style={{ background:'#f1f5f9', padding:'1px 6px', borderRadius:4 }}>{resumeDir || 'not set'}</code></p>
        {resumes.length === 0 ? (
          <div style={{ fontSize:13, color:'#94a3b8' }}>No resumes found. Set a path above + save, or add PDFs into the folder.</div>
        ) : (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(220px, 1fr))', gap:10 }}>
            {resumes.map((r, i) => (
              <div key={i} style={{ padding:'12px 14px', border:'1px solid #e2e8f0', borderRadius:10, background:'#fafbff' }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:5 }}>
                  <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:20, background:'#eef2ff', color:'#4f46e5', textTransform:'uppercase' }}>{r.archetype}</span>
                  <span style={{ fontSize:11, fontWeight:700, color:'#0f172a' }}>{r.folder}</span>
                </div>
                <div style={{ fontSize:11, color:'#64748b', fontFamily:'monospace', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.filename}</div>
                <div style={{ fontSize:10, color:'#94a3b8', marginTop:3 }}>{Math.round(r.sizeBytes / 1024)} KB</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Queue runner */}
      <div style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:12, padding:20 }}>
        <h2 style={{ fontSize:16, fontWeight:800, color:'#0f172a', margin:'0 0 4px' }}>Auto-Apply Queue</h2>
        <p style={{ fontSize:12, color:'#64748b', margin:'0 0 14px' }}>Runs the Playwright worker against every evaluation marked <strong>Auto</strong> and <strong>queued</strong>. Supported platforms: Greenhouse, Lever, Ashby. Others are marked "platform_unsupported" for manual apply.</p>
        <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
          <button onClick={() => runQueue(false)} disabled={running}
            style={{ padding:'10px 22px', fontSize:13, fontWeight:700, background: running ? '#f1f5f9' : 'linear-gradient(135deg,#7c3aed,#a855f7)', color: running ? '#64748b':'#fff', border:'none', borderRadius:10, cursor: running ? 'default':'pointer', display:'flex', alignItems:'center', gap:8 }}>
            {running ? <><Spin size={14} color="#64748b" /> Running…</> : '⚡ Run auto-apply queue'}
          </button>
          <button onClick={() => runQueue(true)} disabled={running}
            style={{ padding:'10px 22px', fontSize:13, fontWeight:700, background:'#fff', color:'#475569', border:'1px solid #e2e8f0', borderRadius:10, cursor: running ? 'default':'pointer' }}>
            Dry-run (no submit)
          </button>
        </div>

        {runResult && (
          <div style={{ marginTop:16, padding:'14px 16px', background:'#f8fafc', borderRadius:10, border:'1px solid #e2e8f0' }}>
            {runResult.error ? (
              <div style={{ color:'#dc2626', fontSize:13 }}>✗ {runResult.error}</div>
            ) : (
              <>
                <div style={{ fontSize:13, fontWeight:700, color:'#0f172a', marginBottom:8 }}>
                  Processed {runResult.processed} · Submitted {runResult.submitted} · Failed {runResult.failed} · Skipped {runResult.skipped}
                </div>
                {(runResult.results || []).map(r => (
                  <div key={r.evalId} style={{ fontSize:11, padding:'5px 0', borderTop:'1px solid #e2e8f0', display:'flex', gap:10 }}>
                    <span style={{ fontFamily:'monospace', color:'#94a3b8' }}>#{r.evalId}</span>
                    <span style={{ color: r.ok ? '#16a34a' : '#dc2626', fontWeight:600, minWidth:70 }}>{r.ok ? '✓ ok' : '✗ fail'}</span>
                    <span style={{ color:'#475569', minWidth:90 }}>{r.platform || '—'}</span>
                    <span style={{ color:'#64748b' }}>{r.error || r.resume || '—'}</span>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── History card ──────────────────────────────────────────────────────────────
function EvalCard({ ev, onClick, onDelete }) {
  const gc = gradeColor(ev.grade)
  return (
    <div className="co-card" onClick={onClick}
      style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:12, padding:'14px 18px', cursor:'pointer', display:'flex', alignItems:'center', gap:16, transition:'all 0.15s', marginBottom:10 }}>
      <div style={{ width:48, height:48, borderRadius:'50%', background:gradeBg(ev.grade), border:`2px solid ${gc}`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
        <span style={{ fontSize:20, fontWeight:900, color:gc }}>{ev.grade}</span>
      </div>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:14, fontWeight:700, color:'#0f172a', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{ev.job_title || 'Unknown Role'}</div>
        <div style={{ fontSize:12, color:'#64748b', marginTop:2 }}>{ev.company_name} · Score: {ev.score}/100</div>
        <div style={{ fontSize:11, color:'#94a3b8', marginTop:3 }}>{new Date(ev.created_at).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' })}</div>
      </div>
      <a href={api.career.reportHtmlUrl(ev.id)} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
        style={{ padding:'6px 12px', fontSize:11, fontWeight:700, background:'#eef2ff', color:'#4f46e5', border:'1px solid #c7d2fe', borderRadius:7, textDecoration:'none', flexShrink:0 }}>
        HTML ↗
      </a>
      {ev.pdf_path && <span title="PDF generated" style={{ fontSize:18 }}>📄</span>}
      <button onClick={e => { e.stopPropagation(); onDelete(ev.id) }}
        style={{ padding:'5px 10px', fontSize:11, background:'none', border:'1px solid #fecaca', color:'#dc2626', borderRadius:7, cursor:'pointer', flexShrink:0 }}>
        ✕
      </button>
    </div>
  )
}

// ── Portal scanner ────────────────────────────────────────────────────────────
function PortalScanner({ hasResume, onSendToEvaluate }) {
  const [scanning, setScanning] = useState(false)
  const [jobs, setJobs]         = useState([])
  const [bySource, setBySource] = useState({})
  const [filter, setFilter]     = useState('all')
  const [error, setError]       = useState(null)
  const [sending, setSending]   = useState(null)

  async function handleScan() {
    setScanning(true); setError(null); setJobs([])
    try {
      const r = await api.career.scanPortals()
      setJobs(r.jobs || []); setBySource(r.bySource || {})
    } catch (err) { setError(err.message) }
    finally { setScanning(false) }
  }

  const filtered = filter === 'all' ? jobs : jobs.filter(j => j.source === filter)
  const srcColors = { greenhouse:'#16a34a', lever:'#2563eb', ashby:'#7c3aed' }

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:18 }}>
        <div>
          <div style={{ fontSize:15, fontWeight:700, color:'#0f172a', marginBottom:3 }}>Live Portal Scanner</div>
          <div style={{ fontSize:12, color:'#94a3b8' }}>Scans Greenhouse, Lever & Ashby for CS/engineering roles posted this week</div>
        </div>
        <button onClick={handleScan} disabled={scanning}
          style={{ padding:'10px 22px', fontSize:13, fontWeight:700, background:'linear-gradient(135deg,#6366f1,#7c3aed)', color:'#fff', border:'none', borderRadius:10, cursor: scanning ? 'default':'pointer', display:'flex', alignItems:'center', gap:8 }}>
          {scanning ? <><Spin size={14} color="#fff" /> Scanning…</> : '🔍 Scan Now'}
        </button>
      </div>

      {jobs.length > 0 && (
        <div style={{ display:'flex', gap:8, marginBottom:18, flexWrap:'wrap' }}>
          {[{ k:'all', l:`All ${jobs.length}` }, ...Object.entries(bySource).filter(([,n])=>n>0).map(([src,n]) => ({ k:src, l:`${src.charAt(0).toUpperCase()+src.slice(1)} ${n}` }))].map(({ k, l }) => (
            <button key={k} onClick={() => setFilter(k)}
              style={{ padding:'5px 16px', fontSize:12, fontWeight:700, border:'none', borderRadius:20, cursor:'pointer', transition:'all 0.12s',
                background: filter===k ? (k==='all' ? '#6366f1' : srcColors[k]||'#6366f1') : '#f1f5f9',
                color: filter===k ? '#fff' : '#64748b' }}>
              {l}
            </button>
          ))}
        </div>
      )}

      {error && <div style={{ padding:'12px 16px', background:'#fee2e2', border:'1px solid #fca5a5', borderRadius:10, fontSize:13, color:'#dc2626', marginBottom:16 }}>⚠ {error}</div>}

      {!scanning && jobs.length === 0 && !error && (
        <div style={{ textAlign:'center', padding:'72px 0', color:'#94a3b8' }}>
          <div style={{ fontSize:44, marginBottom:14 }}>🔍</div>
          <div style={{ fontSize:14, fontWeight:600, color:'#64748b', marginBottom:6 }}>Ready to scan 50+ company portals</div>
          <div style={{ fontSize:12 }}>Filters to CS/SWE internship roles posted in the last 7 days</div>
        </div>
      )}

      <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
        {filtered.map((job, i) => (
          <div key={i} style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:12, padding:'14px 18px', display:'flex', alignItems:'flex-start', gap:14 }}>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:14, fontWeight:700, color:'#0f172a', marginBottom:3 }}>{job.title}</div>
              <div style={{ fontSize:12, color:'#64748b' }}>
                {job.company.charAt(0).toUpperCase() + job.company.slice(1)}
                {job.location ? ` · ${job.location}` : ''}
                {job.postedAt ? ` · ${new Date(job.postedAt).toLocaleDateString()}` : ''}
              </div>
              <span style={{ fontSize:10, fontWeight:700, marginTop:6, display:'inline-block', padding:'2px 8px', borderRadius:20, background:`${srcColors[job.source]||'#6366f1'}15`, color:srcColors[job.source]||'#6366f1', textTransform:'capitalize' }}>
                {job.source}
              </span>
            </div>
            <div style={{ display:'flex', gap:8, flexShrink:0 }}>
              <a href={job.applyUrl} target="_blank" rel="noreferrer"
                style={{ padding:'8px 14px', fontSize:12, fontWeight:700, background:'#f8fafc', color:'#374151', border:'1px solid #e2e8f0', borderRadius:8, textDecoration:'none' }}>
                View ↗
              </a>
              {hasResume && (
                <button disabled={sending === i}
                  onClick={async () => { setSending(i); await onSendToEvaluate(job.applyUrl || job.title); setSending(null) }}
                  style={{ padding:'8px 14px', fontSize:12, fontWeight:700, background:'#eef2ff', color:'#6366f1', border:'1px solid #c7d2fe', borderRadius:8, cursor:'pointer', display:'flex', alignItems:'center', gap:6 }}>
                  {sending === i ? <Spin size={11} /> : '⚡ Evaluate'}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Batch evaluation ──────────────────────────────────────────────────────────
function BatchEval({ hasResume }) {
  const [urlsText, setUrlsText] = useState('')
  const [running, setRunning]   = useState(false)
  const [results, setResults]   = useState([])
  const [progress, setProgress] = useState(null)
  const [error, setError]       = useState(null)

  async function handleBatch() {
    const urls = urlsText.split('\n').map(u=>u.trim()).filter(u=>u.startsWith('http'))
    if (!urls.length) return
    if (urls.length > 10) { setError('Max 10 URLs at a time'); return }
    setRunning(true); setError(null); setResults([]); setProgress(`Evaluating ${urls.length} jobs…`)
    try {
      const r = await api.career.batchEvaluate(urls)
      setResults(r.results || []); setProgress(null)
    } catch (err) { setError(err.message); setProgress(null) }
    finally { setRunning(false) }
  }

  const urlCount = urlsText.split('\n').filter(u=>u.trim().startsWith('http')).length

  return (
    <div>
      <div style={{ fontSize:15, fontWeight:700, color:'#0f172a', marginBottom:3 }}>Batch Job Evaluation</div>
      <div style={{ fontSize:12, color:'#94a3b8', marginBottom:18 }}>Paste up to 10 job URLs — AI evaluates all in parallel and ranks by fit score</div>

      <textarea value={urlsText} onChange={e => setUrlsText(e.target.value)}
        placeholder={'https://jobs.lever.co/stripe/abc123\nhttps://boards.greenhouse.io/openai/jobs/456\nhttps://jobs.ashbyhq.com/linear/789'}
        rows={7}
        style={{ fontFamily:'monospace', fontSize:12, lineHeight:1.75, marginBottom:12, background:'#fff', borderRadius:10 }} />

      <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:20 }}>
        <button onClick={handleBatch} disabled={running || !hasResume || !urlCount}
          style={{ padding:'11px 26px', fontSize:13, fontWeight:700, background:'linear-gradient(135deg,#6366f1,#7c3aed)', color:'#fff', border:'none', borderRadius:10, cursor: running ? 'default':'pointer', display:'flex', alignItems:'center', gap:8 }}>
          {running ? <><Spin size={14} color="#fff" /> Evaluating…</> : `⚡ Evaluate All (${urlCount})`}
        </button>
        <span style={{ fontSize:12, color:'#94a3b8' }}>{urlCount} URL{urlCount !== 1 ? 's' : ''} detected</span>
      </div>

      {!hasResume && <div style={{ padding:'10px 16px', background:'#fef3c7', borderRadius:9, fontSize:12, color:'#d97706', fontWeight:600, marginBottom:14 }}>⚠ Upload your resume first</div>}
      {error && <div style={{ padding:'12px 16px', background:'#fee2e2', border:'1px solid #fca5a5', borderRadius:10, fontSize:13, color:'#dc2626', marginBottom:14 }}>⚠ {error}</div>}

      {progress && (
        <div style={{ display:'flex', alignItems:'center', gap:14, padding:'22px 20px', background:'#eef2ff', borderRadius:12, marginBottom:18, border:'1px solid #c7d2fe' }}>
          <Spin size={22} />
          <div>
            <div style={{ fontSize:14, fontWeight:700, color:'#6366f1' }}>{progress}</div>
            <div style={{ fontSize:11, color:'#94a3b8', marginTop:3 }}>Takes 1–3 minutes. Keep this tab open.</div>
          </div>
        </div>
      )}

      {results.length > 0 && (
        <div>
          <div style={{ fontSize:11, fontWeight:700, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:14 }}>Results — ranked by fit score</div>
          {results.map((r, i) => r.status === 'done' ? (
            <div key={i} style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:12, padding:'14px 18px', marginBottom:10, display:'flex', alignItems:'center', gap:16 }}>
              <span style={{ fontSize:12, fontWeight:700, color:'#94a3b8', width:24, flexShrink:0, textAlign:'center' }}>#{i+1}</span>
              <div style={{ width:46, height:46, borderRadius:'50%', background:gradeBg(r.evaluation?.grade), border:`2px solid ${gradeColor(r.evaluation?.grade)}`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                <span style={{ fontSize:18, fontWeight:900, color:gradeColor(r.evaluation?.grade) }}>{r.evaluation?.grade}</span>
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:14, fontWeight:700, color:'#0f172a' }}>{r.evaluation?.jobTitle} <span style={{ fontWeight:400, color:'#94a3b8' }}>at</span> {r.evaluation?.companyName}</div>
                <div style={{ fontSize:12, color:'#64748b', marginTop:2 }}>Score: {r.evaluation?.overallScore}/100 · {r.evaluation?.recommendation}</div>
              </div>
              <a href={r.url} target="_blank" rel="noreferrer" style={{ padding:'7px 14px', fontSize:12, fontWeight:700, background:'#f8fafc', color:'#374151', border:'1px solid #e2e8f0', borderRadius:8, textDecoration:'none', flexShrink:0 }}>View ↗</a>
            </div>
          ) : (
            <div key={i} style={{ background:'#fafafa', border:'1px solid #fecaca', borderRadius:12, padding:'12px 18px', marginBottom:10, display:'flex', alignItems:'center', gap:12 }}>
              <span style={{ fontSize:16 }}>⚠</span>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:12, color:'#dc2626', fontWeight:600 }}>Failed: {r.error}</div>
                <div style={{ fontSize:11, color:'#94a3b8', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.url}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function CareerOps() {
  const [tab, setTab]               = useState('evaluate')
  const [resumeInfo, setResumeInfo] = useState(null)
  const [jobInput, setJobInput]     = useState('')
  const [inputMode, setInputMode]   = useState('url')
  const [evaluating, setEvaluating] = useState(false)
  const [evaluation, setEvaluation] = useState(null)
  const [evalId, setEvalId]         = useState(null)
  const [evalError, setEvalError]   = useState(null)
  const [history, setHistory]       = useState([])
  const [histLoading, setHistLoading] = useState(false)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [pdfUrl, setPdfUrl]         = useState(null)
  const [applyMode, setApplyMode]   = useState('manual') // per-evaluation: 'manual' | 'auto'
  const [applyStatus, setApplyStatus] = useState('not_started')
  const [applying, setApplying]     = useState(false)
  const [roleTypeFilter, setRoleTypeFilter] = useState('all') // 'all' | 'intern' | 'fulltime'

  // Classify job type from title
  const classifyRoleType = (title) => {
    if (!title) return 'intern'
    const internKw = /\binterns?\b|\binternships?\b|\bco-op\b|\bcoop\b|\bsummer 2026\b/i
    const fulltimeKw = /\bfull.?time\b|\bfull time\b|\bnew grad\b|\bnew-grad\b|\bnew.?graduate\b|\bentry.?level\b|\bjunior\b|\bjr\b|\bsenior\b|\blead\b|\bstaff\b/i
    if (internKw.test(title)) return 'intern'
    if (fulltimeKw.test(title)) return 'fulltime'
    return 'intern'
  }

  useEffect(() => { injectStyles() }, [])
  useEffect(() => { api.career.resume().then(setResumeInfo).catch(() => {}) }, [])
  useEffect(() => { if (tab === 'history') loadHistory() }, [tab])

  async function loadHistory() {
    setHistLoading(true)
    try { setHistory(await api.career.evaluations()) } finally { setHistLoading(false) }
  }

  async function handleEvaluate(prefillUrl = null) {
    const input = prefillUrl || jobInput
    if (!input?.trim()) return
    if (prefillUrl) { setTab('evaluate'); setJobInput(prefillUrl); setInputMode('url') }
    setEvaluating(true); setEvalError(null); setEvaluation(null); setPdfUrl(null)
    setApplyMode('manual'); setApplyStatus('not_started') // reset per-eval apply state
    try {
      const isUrl = input.trim().startsWith('http')
      const r = await api.career.evaluate(isUrl ? { jobUrl: input.trim() } : { jobDescription: input.trim() })
      setEvaluation(r.evaluation); setEvalId(r.evalId)
    } catch (err) { setEvalError(err.message) }
    finally { setEvaluating(false) }
  }

  // Persist apply-mode choice to DB so history/auto-apply worker can honor it.
  async function handleApplyModeChange(mode) {
    setApplyMode(mode)
    if (!evalId) return
    try { await api.career.setApplyMode(evalId, mode) } catch (e) { console.warn('Apply mode change error:', e) }
  }

  // Manual mode: opens the job URL in a new tab — user submits the form and then
  // clicks "Mark applied" to confirm.  Auto mode: enqueues the evaluation for the
  // Playwright worker (worker itself lands in issue #9).
  async function handleApply() {
    if (!evalId) return
    setApplying(true)
    try {
      const r = await api.career.apply(evalId)
      setApplyStatus(r.status || 'opened')
      if (r.mode === 'manual' && r.url) {
        window.open(r.url, '_blank', 'noopener,noreferrer')
      }
    } catch (err) {
      alert('Apply failed: ' + err.message)
    } finally { setApplying(false) }
  }

  async function handleGeneratePDF() {
    if (!evalId) return
    setPdfLoading(true)
    try { const r = await api.career.tailoredResume(evalId); if (r.ok) setPdfUrl(r.downloadUrl) }
    catch (err) { alert('PDF generation failed: ' + err.message) }
    finally { setPdfLoading(false) }
  }

  async function handleDeleteEval(id) {
    await api.career.deleteEvaluation(id)
    setHistory(h => h.filter(e => e.id !== id))
  }

  async function loadEvalFromHistory(ev) {
    const r = await api.career.evaluation(ev.id)
    setEvaluation(r.evaluation); setEvalId(r.id)
    setPdfUrl(r.pdf_path ? api.career.downloadUrl(r.id) : null)
    setApplyMode(r.apply_mode || 'manual')
    setApplyStatus(r.apply_status || 'not_started')
    setTab('evaluate')
  }

  const TABS = [
    { k:'evaluate', l:'⚡ Evaluate' },
    { k:'scanner',  l:'🔍 Portal Scanner' },
    { k:'batch',    l:'📦 Batch Evaluate' },
    { k:'history',  l:`📋 History${history.length > 0 ? ` (${history.length})`:''}`},
    { k:'profile',  l:'⚙ Auto-Apply Setup' },
  ]

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', overflow:'hidden', background:'#f8fafc' }}>

      {/* Page header */}
      <div style={{ background:'#fff', borderBottom:'1px solid #e2e8f0', flexShrink:0 }}>
        <div style={{ padding:'18px 28px 0', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div>
            <h1 style={{ margin:0, fontSize:20, fontWeight:800, color:'#0f172a', display:'flex', alignItems:'center', gap:10 }}>
              🧠 Career Ops
            </h1>
            <p style={{ margin:'4px 0 0', fontSize:12, color:'#94a3b8' }}>Evaluate roles · Tailor your resume · Discover opportunities</p>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display:'flex', padding:'0 28px', overflowX:'auto' }}>
          {TABS.map(t => (
            <button key={t.k} onClick={() => setTab(t.k)}
              style={{ padding:'12px 18px', fontSize:13, fontWeight: tab===t.k ? 700:500, cursor:'pointer', background:'none', border:'none', whiteSpace:'nowrap', borderBottom: tab===t.k ? '2px solid #6366f1':'2px solid transparent', color: tab===t.k ? '#6366f1':'#94a3b8', transition:'all 0.12s', marginBottom:'-1px' }}>
              {t.l}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div style={{ flex:1, overflowY:'auto', padding:'24px 28px' }}>

        {/* Resume section — only render when needed:
            - on profile/setup tab (manage resume there), or
            - on any tab when the user has no resume yet (so the prompt to upload is visible).
            Returning users on evaluate/scanner/batch/history skip the redundant green
            "uploaded" box and see the actual workflow first. */}
        {(tab === 'profile' || resumeInfo?.hasResume === false) && (
          <div style={{ marginBottom:22 }}>
            <div style={{ fontSize:11, fontWeight:700, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:8 }}>Your Resume</div>
            <ResumeUpload resumeInfo={resumeInfo} onUploaded={info => setResumeInfo({ hasResume:true, ...info })} />
          </div>
        )}

        {/* ── Evaluate tab ── */}
        {tab === 'evaluate' && (
          <div>
            {/* Mode toggle */}
            <div style={{ display:'inline-flex', background:'#f1f5f9', borderRadius:9, padding:3, marginBottom:16, gap:3 }}>
              {[['url','🔗 Job URL'],['paste','📝 Paste JD']].map(([k,l]) => (
                <button key={k} onClick={() => setInputMode(k)}
                  style={{ padding:'7px 18px', fontSize:12, fontWeight:700, cursor:'pointer', border:'none', borderRadius:7,
                    background: inputMode===k ? '#fff':'transparent',
                    color: inputMode===k ? '#6366f1':'#64748b',
                    boxShadow: inputMode===k ? '0 1px 4px rgba(0,0,0,0.08)':'none',
                    transition:'all 0.15s' }}>
                  {l}
                </button>
              ))}
            </div>

            {inputMode === 'url' ? (
              <div style={{ display:'flex', gap:10, marginBottom:16 }}>
                <input value={jobInput} onChange={e => setJobInput(e.target.value)} onKeyDown={e => e.key==='Enter' && handleEvaluate()}
                  placeholder="https://jobs.lever.co/company/… or any job posting URL"
                  style={{ flex:1, background:'#fff', borderRadius:10, fontSize:13 }} />
                <button onClick={() => handleEvaluate()} disabled={evaluating || !resumeInfo?.hasResume}
                  style={{ padding:'10px 24px', fontSize:13, fontWeight:700, background:'linear-gradient(135deg,#6366f1,#7c3aed)', color:'#fff', border:'none', borderRadius:10, cursor: evaluating ? 'default':'pointer', display:'flex', alignItems:'center', gap:8, whiteSpace:'nowrap', flexShrink:0 }}>
                  {evaluating ? <><Spin size={14} color="#fff" /> Evaluating…</> : '⚡ Evaluate'}
                </button>
              </div>
            ) : (
              <div style={{ marginBottom:16 }}>
                <textarea value={jobInput} onChange={e => setJobInput(e.target.value)}
                  placeholder="Paste the full job description here…" rows={8}
                  style={{ background:'#fff', borderRadius:10, fontSize:13, lineHeight:1.65 }} />
                <div style={{ display:'flex', justifyContent:'flex-end', marginTop:10 }}>
                  <button onClick={() => handleEvaluate()} disabled={evaluating || !resumeInfo?.hasResume}
                    style={{ padding:'10px 26px', fontSize:13, fontWeight:700, background:'linear-gradient(135deg,#6366f1,#7c3aed)', color:'#fff', border:'none', borderRadius:10, cursor: evaluating ? 'default':'pointer', display:'flex', alignItems:'center', gap:8 }}>
                    {evaluating ? <><Spin size={14} color="#fff" /> Evaluating…</> : '⚡ Evaluate Job'}
                  </button>
                </div>
              </div>
            )}

            {!resumeInfo?.hasResume && (
              <div style={{ padding:'10px 16px', background:'#fef3c7', border:'1px solid #fde68a', borderRadius:9, fontSize:12, color:'#d97706', fontWeight:600, marginBottom:16 }}>
                ⚠ Upload your resume above before evaluating
              </div>
            )}

            {evaluating && (
              <div style={{ display:'flex', flexDirection:'column', alignItems:'center', padding:'56px 0', gap:14 }}>
                <Spin size={36} />
                <div style={{ fontSize:15, color:'#6366f1', fontWeight:700 }}>Analyzing role against your resume…</div>
                <div style={{ fontSize:12, color:'#94a3b8' }}>Generating 6 analysis blocks — typically 10–30 seconds</div>
              </div>
            )}

            {evalError && (
              <div style={{ padding:'14px 18px', background:'#fee2e2', border:'1px solid #fca5a5', borderRadius:12, fontSize:13, color:'#dc2626', fontWeight:600 }}>
                ⚠ {evalError}
              </div>
            )}

            {evaluation && !evaluating && (
              <EvaluationReport
                evaluation={evaluation}
                evalId={evalId}
                onGeneratePDF={handleGeneratePDF}
                pdfLoading={pdfLoading}
                pdfUrl={pdfUrl}
                applyMode={applyMode}
                applyStatus={applyStatus}
                onApplyModeChange={handleApplyModeChange}
                onApply={handleApply}
                applying={applying}
              />
            )}
          </div>
        )}

        {tab === 'scanner' && <PortalScanner hasResume={!!resumeInfo?.hasResume} onSendToEvaluate={url => handleEvaluate(url)} />}
        {tab === 'batch'   && <BatchEval hasResume={!!resumeInfo?.hasResume} />}
        {tab === 'profile' && <AutoApplySetup />}

        {tab === 'history' && (
          <div>
            <div style={{ fontSize:11, fontWeight:700, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:16 }}>Past Evaluations</div>
            {histLoading ? (
              <div style={{ display:'flex', alignItems:'center', gap:10, padding:'40px 0', justifyContent:'center' }}>
                <Spin /> <span style={{ fontSize:13, color:'#64748b' }}>Loading evaluations…</span>
              </div>
            ) : history.length === 0 ? (
              <div style={{ textAlign:'center', padding:'64px 0', color:'#94a3b8' }}>
                <div style={{ fontSize:44, marginBottom:12 }}>📋</div>
                <div style={{ fontSize:14, fontWeight:600, color:'#64748b' }}>No evaluations yet</div>
                <div style={{ fontSize:12, marginTop:4 }}>Evaluate a job to see it here</div>
              </div>
            ) : (
              <>
                {/* Role Type Filter */}
                {history.length > 0 && (
                  <div style={{ display:'flex', gap:8, marginBottom:16, flexWrap:'wrap' }}>
                    {[
                      { k:'all', l:`All ${history.length}` },
                      { k:'intern', l:`🎓 Intern (${history.filter(ev => classifyRoleType(ev.jobTitle) === 'intern').length})` },
                      { k:'fulltime', l:`💼 Full-Time/New Grad (${history.filter(ev => classifyRoleType(ev.jobTitle) === 'fulltime').length})` }
                    ].map(({ k, l }) => (
                      <button key={k} onClick={() => setRoleTypeFilter(k)}
                        style={{ padding:'6px 16px', fontSize:12, fontWeight:700, border:'none', borderRadius:20, cursor:'pointer', transition:'all 0.12s',
                          background: roleTypeFilter === k ? '#6366f1' : '#f1f5f9',
                          color: roleTypeFilter === k ? '#fff' : '#64748b' }}>
                        {l}
                      </button>
                    ))}
                  </div>
                )}
                {/* Filtered Evaluations */}
                {history.filter(ev => roleTypeFilter === 'all' || classifyRoleType(ev.jobTitle) === roleTypeFilter).map(ev => (
                  <EvalCard key={ev.id} ev={ev} onClick={() => loadEvalFromHistory(ev)} onDelete={handleDeleteEval} />
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
