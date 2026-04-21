import { createClient } from '@supabase/supabase-js'
import { evaluateJob, fetchJobFromUrl } from '../../backend/services/jobEvaluator.js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end()

  const { jobUrl, jobTitle, companyName, resumeText } = req.body

  if (!jobUrl) return res.status(400).json({ error: 'jobUrl required' })
  if (!resumeText) return res.status(400).json({ error: 'resumeText required' })

  try {
    // Fetch job description from URL
    const { text: jobDescription, error: fetchError } = await fetchJobFromUrl(jobUrl)
    if (!jobDescription) {
      return res.status(400).json({ error: fetchError || 'Could not fetch job description' })
    }

    // Evaluate job against resume
    const evaluation = await evaluateJob({
      jobDescription,
      resumeText,
      jobUrl
    })

    // Save to Supabase
    const record = {
      job_url: jobUrl,
      job_title: evaluation.jobTitle || jobTitle || 'Role',
      company_name: evaluation.companyName || companyName || 'Company',
      grade: evaluation.grade || 'C',
      score: evaluation.globalScore || 3.0,
      report_json: JSON.stringify(evaluation),
      apply_status: 'not_started',
      apply_mode: 'manual',
    }

    const { data, error: insertError } = await supabase
      .from('evaluations')
      .insert([record])
      .select()

    if (insertError) throw insertError

    res.json(data[0])
  } catch (err) {
    console.error('Evaluate error:', err)
    res.status(500).json({ error: err.message })
  }
}
