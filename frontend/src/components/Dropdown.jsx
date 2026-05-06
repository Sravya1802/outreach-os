import { useState, useRef, useEffect } from 'react'

/**
 * Generic themed dropdown — drop-in replacement for a native <select> with
 * styling that matches the rest of the app instead of the OS picker.
 *
 *   <Dropdown
 *     options={[{ value:'all', label:'All Statuses' }, …]}
 *     value={status}
 *     onChange={setStatus}
 *     // optional:
 *     placeholder="All Statuses"
 *     ariaLabel="Filter by status"
 *     variant="filled"  // 'filled' (indigo) | 'outline' (white)
 *   />
 */
export default function Dropdown({
  options,
  value,
  onChange,
  placeholder = 'Select…',
  ariaLabel,
  variant = 'outline',
  disabled = false,
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

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

  const active = options.find(o => o.value === value)

  const triggerStyle = variant === 'filled'
    ? { color:'#4f46e5', background:'#eef2ff', border:'1px solid #c7d2fe' }
    : { color:'#0f172a', background:'#fff',    border:'1px solid #e2e8f0' }

  return (
    <div ref={ref} style={{ position:'relative', width:'100%' }}>
      <button type="button" onClick={() => !disabled && setOpen(v => !v)}
        aria-haspopup="listbox" aria-expanded={open} aria-label={ariaLabel}
        disabled={disabled}
        style={{
          ...triggerStyle,
          width:'100%', padding:'9px 12px',
          fontSize:13, fontWeight:600,
          borderRadius:9,
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.6 : 1,
          display:'flex', alignItems:'center', gap:8, justifyContent:'space-between',
          textAlign:'left',
          transition:'all 0.12s',
        }}>
        <span style={{ minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
          {active?.label ?? placeholder}
        </span>
        <span aria-hidden="true" style={{ fontSize:11, transition:'transform 0.18s', transform: open ? 'rotate(180deg)' : 'rotate(0deg)', flexShrink:0 }}>▼</span>
      </button>

      {open && (
        <div role="listbox"
          style={{
            position:'absolute', top:'calc(100% + 6px)', left:0, right:0,
            background:'#fff', border:'1px solid #e2e8f0',
            borderRadius:10, padding:6, zIndex:120,
            boxShadow:'0 12px 32px rgba(15,23,42,0.14)',
            display:'flex', flexDirection:'column', gap:2,
            maxHeight:300, overflowY:'auto',
          }}>
          {options.map(opt => {
            const isActive = opt.value === value
            return (
              <button key={String(opt.value)} role="option" aria-selected={isActive}
                onClick={() => { onChange(opt.value); setOpen(false) }}
                style={{
                  display:'flex', alignItems:'center', gap:10,
                  padding:'9px 11px', borderRadius:7,
                  fontSize:13, fontWeight: isActive ? 700 : 500,
                  color: isActive ? '#4f46e5' : '#0f172a',
                  background: isActive ? '#eef2ff' : 'transparent',
                  border:'none', cursor:'pointer', textAlign:'left',
                  transition:'background 0.12s',
                }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = '#f8fafc' }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}>
                <span style={{ flex:1 }}>{opt.label}</span>
                {isActive && <span aria-hidden="true" style={{ color:'#4f46e5', fontSize:14 }}>✓</span>}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
