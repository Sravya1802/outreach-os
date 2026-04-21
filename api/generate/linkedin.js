import { generateOutreach } from '../../backend/services/ai.js'

export default async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end()

  const {
    recipientName,
    recipientTitle,
    companyName,
    companyCategory,
    companyStage,
    hasApplied = false,
    rolesAvailable = null,
    position,
    isRecruiter = false,
    extraContext,
    specificAchievement,
  } = req.body || {}

  if (!recipientName || !companyName) {
    return res.status(400).json({ error: 'recipientName and companyName required' })
  }

  try {
    const message = await generateOutreach({
      type: 'linkedin',
      recipientName,
      recipientTitle,
      companyName,
      companyCategory,
      companyStage,
      hasApplied,
      rolesAvailable,
      position,
      isRecruiter,
      extraContext,
      specificAchievement,
    })
    res.json(message)
  } catch (err) {
    console.error('Generate LinkedIn error:', err)
    res.status(500).json({ error: err.message })
  }
}
