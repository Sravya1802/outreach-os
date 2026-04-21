import { getSupabase } from '../_lib/supabase.js'

export default async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { companyName } = req.body || {}
  if (!companyName) return res.status(400).json({ error: 'companyName required' })

  try {
    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('companies')
      .select('*')
      .ilike('name', `%${companyName}%`)
      .limit(20)
    if (error) throw error
    res.json({ companies: data || [] })
  } catch (err) {
    console.error('[search-by-name] error:', err)
    res.status(500).json({ error: err.message })
  }
}
