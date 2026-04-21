import { Router } from 'express';
import { checkAllCredits } from '../services/creditChecker.js';

const router = Router();

router.get('/status', async (req, res) => {
  try {
    const force = req.query.refresh === 'true';
    const status = await checkAllCredits(force);
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
