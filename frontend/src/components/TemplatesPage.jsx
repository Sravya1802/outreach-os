// Templates page — placeholder until the user pastes their preferred email
// + DM templates. Once we have those, this becomes a small CRUD UI that
// edits backend/services/ai.js prompt anchors per-user (stored in meta).

export default function TemplatesPage() {
  return (
    <div style={{ flex:1, overflowY:'auto', background:'#f8fafc', padding:'40px' }}>
      <div style={{ maxWidth:760, margin:'0 auto' }}>
        <h1 style={{ fontSize:22, fontWeight:800, color:'#0f172a', margin:'0 0 4px' }}>Templates</h1>
        <p style={{ fontSize:13, color:'#64748b', margin:'0 0 24px' }}>
          Email + LinkedIn DM templates the AI uses as a style anchor when generating outreach.
        </p>

        <div style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:14, padding:'40px', textAlign:'center' }}>
          <div style={{ fontSize:36, marginBottom:12 }}>✏️</div>
          <div style={{ fontSize:15, fontWeight:700, color:'#0f172a', marginBottom:6 }}>Templates editor coming soon</div>
          <div style={{ fontSize:12, color:'#64748b', maxWidth:480, margin:'0 auto' }}>
            Paste your preferred email + DM templates and the generator will mirror your tone, structure, and length.
            Until then, the default prompt in <code style={{ background:'#f1f5f9', padding:'1px 6px', borderRadius:4 }}>backend/services/ai.js</code> is used.
          </div>
        </div>
      </div>
    </div>
  )
}
