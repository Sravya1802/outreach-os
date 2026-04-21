import { checkAllCredits } from '../../backend/services/creditChecker.js'

export default async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === 'true'
    const status = await checkAllCredits(forceRefresh)
    res.json(status)
  } catch (err) {
    console.error('Credits check error:', err)
    res.status(500).json({ error: err.message })
  }
}
