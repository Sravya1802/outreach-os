import { useState, useRef, useEffect } from 'react'

/**
 * Dropdown-style tab picker for narrow viewports. Drop-in replacement for
 * a native <select> that styles consistently with the rest of the app
 * (indigo theme, rounded card, hover/active states). Used on phone widths
 * where a horizontal tab strip can't fit all options.
 *
 *   <TabPicker
 *     tabs={[{ id, icon, full }]}
 *     value={activeId}
 *     onChange={setActiveId}
 *   />
 */
export default function TabPicker({ tabs, value, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  // Close on outside click + Escape.
  useEffect(() => {
    if (!open) return
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const active = tabs.find(t => (t.id ?? t.k) === value) || tabs[0]
  const idOf = (t) => t.id ?? t.k

  return (
    <div ref={ref} style={{ position:'relative', width:'100%' }}>
      <button type="button" onClick={() => setOpen(v => !v)}
        aria-haspopup="listbox" aria-expanded={open}
        style={{
          width:'100%', padding:'12px 14px',
          fontSize:14, fontWeight:700,
          color:'#4f46e5', background:'#eef2ff',
          border:'1px solid #c7d2fe', borderRadius:10,
          cursor:'pointer',
          display:'flex', alignItems:'center', gap:8, justifyContent:'space-between',
          transition:'all 0.12s',
        }}>
        <span style={{ display:'flex', alignItems:'center', gap:8, minWidth:0, overflow:'hidden' }}>
          <span aria-hidden="true" style={{ fontSize:16, flexShrink:0 }}>{active?.icon}</span>
          <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{active?.full}</span>
        </span>
        <span aria-hidden="true" style={{ fontSize:12, transition:'transform 0.18s', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
      </button>

      {open && (
        <div role="listbox"
          style={{
            position:'absolute', top:'calc(100% + 6px)', left:0, right:0,
            background:'#fff', border:'1px solid #e2e8f0',
            borderRadius:10, padding:6, zIndex:60,
            boxShadow:'0 10px 30px rgba(15,23,42,0.12)',
            display:'flex', flexDirection:'column', gap:2,
          }}>
          {tabs.map(t => {
            const id = idOf(t)
            const isActive = id === value
            return (
              <button key={id} role="option" aria-selected={isActive}
                onClick={() => { onChange(id); setOpen(false) }}
                style={{
                  display:'flex', alignItems:'center', gap:10,
                  padding:'10px 12px', borderRadius:7,
                  fontSize:13, fontWeight: isActive ? 700 : 500,
                  color: isActive ? '#4f46e5' : '#0f172a',
                  background: isActive ? '#eef2ff' : 'transparent',
                  border:'none', cursor:'pointer', textAlign:'left',
                  transition:'background 0.12s',
                }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = '#f8fafc' }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}>
                <span aria-hidden="true" style={{ fontSize:16, width:20, textAlign:'center', flexShrink:0 }}>{t.icon}</span>
                <span style={{ flex:1 }}>{t.full}</span>
                {isActive && <span aria-hidden="true" style={{ color:'#4f46e5', fontSize:14 }}>✓</span>}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
