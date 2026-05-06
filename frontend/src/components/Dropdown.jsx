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
  compact = false,
  // When compact + colorMap is provided, the trigger pill takes the
  // active option's color instead of the default theme. Pass a map like
  // { new: { bg:'#eff6ff', color:'#2563eb', border:'#bfdbfe' } }.
  colorMap = null,
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

  const colorTheme = compact && colorMap ? colorMap[value] : null
  const triggerStyle = colorTheme
    ? { color: colorTheme.color, background: colorTheme.bg, border: `1px solid ${colorTheme.border}` }
    : variant === 'filled'
    ? { color:'#4f46e5', background:'#eef2ff', border:'1px solid #c7d2fe' }
    : { color:'#0f172a', background:'#fff',    border:'1px solid #e2e8f0' }

  // compact = pill-style trigger for inline/metadata use (status badge,
  // category tag, etc.). Full-width otherwise so it slots into form layouts.
  return (
    <div ref={ref} style={{ position:'relative', width: compact ? 'auto' : '100%', display: compact ? 'inline-block' : 'block' }}>
      <button type="button" onClick={(e) => { e.stopPropagation(); !disabled && setOpen(v => !v) }}
        aria-haspopup="listbox" aria-expanded={open} aria-label={ariaLabel}
        disabled={disabled}
        style={{
          ...triggerStyle,
          width: compact ? 'auto' : '100%',
          padding: compact ? '2px 8px' : '9px 12px',
          fontSize: compact ? 10 : 13,
          fontWeight: compact ? 700 : 600,
          borderRadius: compact ? 20 : 9,
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.6 : 1,
          display:'inline-flex', alignItems:'center', gap: compact ? 4 : 8, justifyContent:'space-between',
          textAlign:'left',
          textTransform: compact ? 'lowercase' : 'none',
          letterSpacing: compact ? '0.02em' : 'normal',
          transition:'all 0.12s',
        }}>
        <span style={{ minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
          {active?.label ?? placeholder}
        </span>
        <span aria-hidden="true" style={{ fontSize: compact ? 8 : 11, transition:'transform 0.18s', transform: open ? 'rotate(180deg)' : 'rotate(0deg)', flexShrink:0 }}>▼</span>
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
