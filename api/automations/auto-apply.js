import { createClient } from '@supabase/supabase-js'
import { processOneEvaluation, runQueueOnce } from '../../backend/services/autoApplier.js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end()

  // Set up SSE response
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')

  let closed = false
  req.on('close', () => {
    closed = true
  })

  function emit(event, data) {
    if (!closed) {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    }
  }

  try {
    emit('progress', { message: 'Starting auto-apply queue...' })

    // Get queued evaluations from Supabase
    const { data: evaluations, error: queryError } = await supabase
      .from('evaluations')
      .select('*')
      .eq('apply_mode', 'auto')
      .eq('apply_status', 'queued')
      .order('created_at', { ascending: true })
      .limit(10)

    if (queryError) throw queryError

    emit('progress', { message: `Found ${evaluations?.length || 0} jobs to process` })

    let successCount = 0
    let failCount = 0

    for (const evaluation of evaluations || []) {
      try {
        emit('progress', { message: `Processing: ${evaluation.company_name}` })

        // Call autoApplier for this evaluation
        const result = await processOneEvaluation(evaluation.id, { headless: true })

        if (result.ok) {
          successCount++
          emit('progress', { message: `✓ Applied to ${evaluation.company_name}` })
        } else {
          failCount++
          emit('progress', {
            message: `✗ Failed to apply to ${evaluation.company_name}: ${result.error}`,
            error: result.error
          })
        }
      } catch (err) {
        failCount++
        emit('error', {
          message: `Error processing ${evaluation.company_name}`,
          error: err.message
        })
      }
    }

    emit('complete', {
      message: `Auto-apply complete! ${successCount} submitted, ${failCount} failed`,
      successCount,
      failCount
    })
    if (!closed) res.end()
  } catch (err) {
    emit('error', { error: err.message })
    if (!closed) res.end()
  }
}
