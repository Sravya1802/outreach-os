import { Router } from 'express';
import { importStartupSheet } from '../services/startupSheet.js';

const router = Router();

// SSE streaming import
router.post('/import-startup-sheet', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  let closed = false;
  req.on('close', () => { closed = true; });

  function emit(event, data) {
    if (!closed) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }

  try {
    emit('start', { message: 'Starting import...' });

    const result = await importStartupSheet(req.user.id, msg => emit('progress', { message: msg }));

    emit('complete', result);
    if (!closed) res.end();
  } catch (err) {
    emit('error', { error: err.message });
    if (!closed) res.end();
  }
});

export default router;
