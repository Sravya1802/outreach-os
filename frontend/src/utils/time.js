export function timeAgo(iso, now = Date.now()) {
  if (!iso) return 'never'
  const h = Math.floor((now - new Date(iso)) / 3600000)
  if (h < 1) return 'just now'
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export function daysSince(dateStr, now = Date.now()) {
  if (!dateStr) return null
  const diff = now - new Date(dateStr).getTime()
  return Math.floor(diff / (1000 * 60 * 60 * 24))
}
