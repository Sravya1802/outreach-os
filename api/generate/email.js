import { generateOutreach } from '../../backend/services/ai.js'

export default async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end()

  const {
    type = 'email',
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
  } = req.body

  if (!recipientName || !companyName) {
    return res.status(400).json({ error: 'recipientName and companyName required' })
  }

  try {
    const email = await generateOutreach({
      type,
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
    })

    res.json(email)
  } catch (err) {
    console.error('Generate email error:', err)
    res.status(500).json({ error: err.message })
  }
}
