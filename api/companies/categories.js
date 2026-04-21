import { getSupabase } from '../_lib/supabase.js'

export default async (req, res) => {
  try {
    const supabase = getSupabase()
    const { data, error } = await supabase.from('companies').select('category')
    if (error) throw error

    const counts = {}
    for (const row of data || []) {
      if (!row.category) continue
      counts[row.category] = (counts[row.category] || 0) + 1
    }
    res.json({
      categories: Object.keys(counts),
      counts: Object.entries(counts).map(([category, count]) => ({ category, count })),
    })
  } catch (err) {
    console.error('[categories] error:', err)
    res.status(500).json({ error: err.message })
  }
}
