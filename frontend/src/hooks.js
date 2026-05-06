import { useState, useEffect } from 'react'

/**
 * Track a CSS media query and re-render when it flips.
 * Used to swap tab strips for select dropdowns on phones, etc.
 *
 *   const isPhone = useMediaQuery('(max-width: 480px)')
 */
export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia(query).matches
      : false
  )
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mql = window.matchMedia(query)
    const onChange = () => setMatches(mql.matches)
    mql.addEventListener?.('change', onChange) || mql.addListener?.(onChange)
    return () => {
      mql.removeEventListener?.('change', onChange) || mql.removeListener?.(onChange)
    }
  }, [query])
  return matches
}
