/**
 * automations.js
 * Job Automations: LinkedIn Finder, AI Search, Auto-Apply, Scheduled Runs.
 */

import { Router } from 'express';
import db from '../db.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { scrapeAllSources } from '../services/scraper.js';
import { evaluateJob } from '../services/jobEvaluator.js';
import { fetchJobFromUrl } from '../services/jobEvaluator.js';

const router = Router();

// ── Automation log helpers ────────────────────────────────────────────────────
function logEntry(automationId, message) {
  const ts = new Date().toTimeString().slice(0, 8);
  const line = `[${ts}] ${message}`;
  try {
    const cur = db.prepare("SELECT value FROM meta WHERE key = ?").get(`log_${automationId}`)?.value;
    const prev = cur ? JSON.parse(cur) : [];
    prev.unshift({ ts: new Date().toISOString(), msg: message });
    if (prev.length > 200) prev.length = 200;
    db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)").run(`log_${automationId}`, JSON.stringify(prev));
  } catch (_) {}
  console.log(`[auto:${automationId}]`, message);
}

// ── GET /api/automations/logs/:id ─────────────────────────────────────────────
router.get('/logs/:id', (req, res) => {
  try {
    const raw = db.prepare("SELECT value FROM meta WHERE key = ?").get(`log_${req.params.id}`)?.value;
    res.json(raw ? JSON.parse(raw) : []);
  } catch (err) {
    res.json([]);
  }
});

// ── GET /api/automations/scheduled ───────────────────────────────────────────
router.get('/scheduled', (req, res) => {
  try {
    const raw = db.prepare("SELECT value FROM meta WHERE key = 'scheduled_automations'").get()?.value;
    res.json(raw ? JSON.parse(raw) : []);
  } catch (err) { res.json([]); }
});

// ── POST /api/automations/scheduled ──────────────────────────────────────────
router.post('/scheduled', (req, res) => {
  try {
    const { automationId, label, cronTime, params } = req.body;
    const raw = db.prepare("SELECT value FROM meta WHERE key = 'scheduled_automations'").get()?.value;
    const list = raw ? JSON.parse(raw) : [];
    const existing = list.findIndex(s => s.automationId === automationId);
    const entry = { automationId, label, cronTime, params, createdAt: new Date().toISOString(), lastRun: null, lastResult: null };
    if (existing >= 0) list[existing] = entry;
    else list.push(entry);
    db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)").run('scheduled_automations', JSON.stringify(list));
    res.json({ ok: true, list });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── DELETE /api/automations/scheduled/:id ────────────────────────────────────
router.delete('/scheduled/:id', (req, res) => {
  try {
    const raw = db.prepare("SELECT value FROM meta WHERE key = 'scheduled_automations'").get()?.value;
    const list = raw ? JSON.parse(raw) : [];
    const filtered = list.filter(s => s.automationId !== req.params.id);
    db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)").run('scheduled_automations', JSON.stringify(filtered));
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── POST /api/automations/linkedin-finder ─────────────────────────────────────
router.post('/linkedin-finder', async (req, res) => {
  const { jobTitle = 'Software Engineer Intern', location = 'United States', jobType = 'intern' } = req.body;

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

  const id = 'linkedin-finder';
  try {
    logEntry(id, `Starting LinkedIn Job Finder — "${jobTitle}" in ${location}`);
    emit('log', { msg: `Searching LinkedIn for "${jobTitle}" in ${location}…` });

    // Use Apify LinkedIn scraper via scrapeAllSources with the query as subcategory
    const query = `${jobTitle} ${jobType}`.trim();
    const { results } = await scrapeAllSources(query, 'Tech & Software');

    logEntry(id, `Found ${results.length} results for "${query}"`);
    emit('log', { msg: `Found ${results.length} results` });

    // Filter to matching job title
    const titleRe = new RegExp(jobTitle.split(' ').join('|'), 'i');
    const filtered = results.filter(r => titleRe.test(r.name) || titleRe.test(r.role || ''));
    const jobs = results.slice(0, 50).map(r => ({
      title: r.role || jobTitle,
      company: r.name,
      location: r.location || location,
      postedAt: null,
      applyUrl: r.careersUrl || '',
      source: 'linkedin_finder',
    }));

    logEntry(id, `Returning ${jobs.length} jobs to UI`);
    emit('results', { jobs, total: jobs.length });
    emit('done', { msg: `Done — ${jobs.length} jobs found` });
    if (!closed) res.end();
  } catch (err) {
    logEntry(id, `Error: ${err.message}`);
    emit('error', { error: err.message });
    if (!closed) res.end();
  }
});

// ── POST /api/automations/ai-search ──────────────────────────────────────────
router.post('/ai-search', async (req, res) => {
  const { description, salaryMin, salaryMax, remote } = req.body;

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

  const id = 'ai-search';
  try {
    // Step 1: Generate search queries via AI
    emit('log', { msg: 'Generating optimized search queries from your description…' });
    logEntry(id, `AI search started: "${description}"`);

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    const queryPrompt = `Generate 4 optimized job search queries based on this description: "${description}"
    ${salaryMin ? `Salary range: $${salaryMin}k-$${salaryMax}k` : ''}
    ${remote ? 'Preference: Remote' : ''}

    Return ONLY a JSON array of 4 search query strings, no explanation. Example:
    ["ML engineering intern NYC AI startup", "machine learning intern new york", "AI engineer intern fintech", "data science intern startup NYC"]`;

    const result = await model.generateContent(queryPrompt);
    let queries = [];
    try {
      const raw = result.response.text().replace(/```json?/g, '').replace(/```/g, '').trim();
      queries = JSON.parse(raw);
    } catch (_) {
      queries = [description, `${description} intern`, `${description} entry level`];
    }

    emit('log', { msg: `Generated ${queries.length} search queries — running across all sources…` });
    logEntry(id, `Generated queries: ${queries.join(' | ')}`);

    // Step 2: Run searches
    const allJobs = [];
    for (const q of queries.slice(0, 3)) {
      if (closed) break;
      try {
        emit('log', { msg: `Searching: "${q}"` });
        logEntry(id, `Searching: "${q}"`);
        const { results } = await scrapeAllSources(q, 'Tech & Software');
        const jobs = results.slice(0, 20).map(r => ({
          title: r.role || q,
          company: r.name,
          location: r.location || 'USA',
          applyUrl: r.careersUrl || '',
          source: 'ai_search',
          query: q,
        }));
        allJobs.push(...jobs);
        emit('log', { msg: `"${q}" → ${jobs.length} results` });
      } catch (err) {
        emit('log', { msg: `"${q}" failed: ${err.message}` });
      }
      await new Promise(r => setTimeout(r, 1000));
    }

    // Dedupe by company name
    const seen = new Set();
    const unique = allJobs.filter(j => {
      if (seen.has(j.company.toLowerCase())) return false;
      seen.add(j.company.toLowerCase());
      return true;
    });

    logEntry(id, `AI search complete — ${unique.length} unique results`);
    emit('results', { jobs: unique, total: unique.length });
    emit('done', { msg: `Done — ${unique.length} unique jobs found` });
    if (!closed) res.end();
  } catch (err) {
    logEntry(id, `Error: ${err.message}`);
    emit('error', { error: err.message });
    if (!closed) res.end();
  }
});

// ── POST /api/automations/auto-apply ─────────────────────────────────────────
// mode: 'review' (default) | 'auto'
// For now implements LinkedIn Easy Apply + Greenhouse/Lever detection
router.post('/auto-apply', async (req, res) => {
  const { jobs, mode = 'review' } = req.body;

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

  const id = 'auto-apply';
  const resumeText = db.prepare("SELECT value FROM meta WHERE key = 'user_resume_text'").get()?.value;
  if (!resumeText) {
    emit('error', { error: 'No resume uploaded. Upload your resume in Career Ops first.' });
    if (!closed) res.end();
    return;
  }

  logEntry(id, `Auto-apply started — ${jobs.length} jobs — mode: ${mode}`);
  emit('log', { msg: `Starting ${mode === 'auto' ? 'Auto' : 'Review'} Mode for ${jobs.length} jobs…` });

  const results = [];

  for (const job of jobs) {
    if (closed) break;
    const applyUrl = job.applyUrl || '';

    logEntry(id, `Processing: ${job.title} at ${job.company}`);
    emit('log', { msg: `Checking: ${job.title} at ${job.company}` });

    // Detect apply type
    let applyType = 'unknown';
    if (applyUrl.includes('linkedin.com/jobs') || applyUrl.includes('linkedin.com/easy')) {
      applyType = 'linkedin_easy_apply';
    } else if (applyUrl.includes('greenhouse.io') || applyUrl.includes('boards.greenhouse')) {
      applyType = 'greenhouse';
    } else if (applyUrl.includes('lever.co')) {
      applyType = 'lever';
    } else if (applyUrl.includes('ashbyhq.com')) {
      applyType = 'ashby';
    }

    emit('log', { msg: `  → Detected: ${applyType}` });
    logEntry(id, `Apply type: ${applyType} for ${applyUrl}`);

    if (mode === 'review') {
      // In review mode: emit each job for user review, don't auto-submit
      emit('review', {
        job: { ...job, applyType },
        msg: `Review required: ${job.title} at ${job.company}`,
      });
      results.push({ job, status: 'pending_review', applyType });
    } else {
      // Auto mode: attempt apply based on type
      try {
        let status = 'skipped';
        let note = '';

        if (applyType === 'linkedin_easy_apply') {
          // LinkedIn Easy Apply via Playwright
          const result = await applyLinkedIn(job, resumeText);
          status = result.status;
          note = result.note;
        } else if (['greenhouse', 'lever', 'ashby'].includes(applyType)) {
          const result = await applyATS(job, applyUrl, applyType, resumeText);
          status = result.status;
          note = result.note;
        } else {
          status = 'skipped';
          note = 'Unknown apply type — manual application required';
        }

        logEntry(id, `${job.company}: ${status} — ${note}`);
        emit('log', { msg: `  → ${status}: ${note}` });
        results.push({ job, status, note, applyType });

        // Log to DB
        db.prepare(`
          INSERT OR IGNORE INTO evaluations (job_url, job_title, company_name, grade, score, source)
          VALUES (?, ?, ?, 'N/A', 0, 'auto_apply')
        `).run(applyUrl, job.title, job.company);

      } catch (err) {
        logEntry(id, `${job.company}: failed — ${err.message}`);
        emit('log', { msg: `  → Failed: ${err.message}` });
        results.push({ job, status: 'failed', note: err.message, applyType });
      }

      await new Promise(r => setTimeout(r, 2000));
    }
  }

  emit('results', { results, total: results.length, mode });
  emit('done', { msg: `${mode === 'review' ? 'Review mode complete' : 'Auto-apply complete'} — ${results.length} jobs processed` });
  logEntry(id, `Done — ${results.length} processed`);
  if (!closed) res.end();
});

// ── Playwright LinkedIn Easy Apply ───────────────────────────────────────────
async function applyLinkedIn(job, resumeText) {
  try {
    const { chromium } = await import('playwright');
    const cookie = process.env.LINKEDIN_SESSION_COOKIE;
    if (!cookie) return { status: 'skipped', note: 'No LinkedIn session cookie configured' };

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    await context.addCookies([{ name: 'li_at', value: cookie.trim(), domain: '.linkedin.com', path: '/' }]);
    const page = await context.newPage();

    try {
      await page.goto(job.applyUrl, { timeout: 15000 });
      await page.waitForTimeout(2000);

      // Look for Easy Apply button
      const easyApplyBtn = page.locator('button:has-text("Easy Apply"), .jobs-apply-button').first();
      if (!(await easyApplyBtn.isVisible({ timeout: 5000 }).catch(() => false))) {
        return { status: 'skipped', note: 'No Easy Apply button found — requires manual application' };
      }

      // In review mode this won't be called, in auto mode we click
      await easyApplyBtn.click();
      await page.waitForTimeout(1500);

      // Check if multi-step modal opened
      const modal = page.locator('.jobs-easy-apply-modal, [data-test-modal-id="easy-apply-modal"]');
      if (!(await modal.isVisible({ timeout: 5000 }).catch(() => false))) {
        return { status: 'skipped', note: 'Easy Apply modal did not open' };
      }

      // Fill contact info if prompted
      const phoneInput = page.locator('input[id*="phone"], input[name*="phone"]').first();
      if (await phoneInput.isVisible({ timeout: 2000 }).catch(() => false)) {
        await phoneInput.fill(process.env.CANDIDATE_PHONE || '');
      }

      // Try to submit (click through steps)
      for (let step = 0; step < 5; step++) {
        const nextBtn = page.locator('button:has-text("Next"), button:has-text("Continue"), button:has-text("Review")').first();
        const submitBtn = page.locator('button:has-text("Submit application")').first();

        if (await submitBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await submitBtn.click();
          await page.waitForTimeout(2000);
          return { status: 'submitted', note: 'LinkedIn Easy Apply submitted successfully' };
        }
        if (await nextBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await nextBtn.click();
          await page.waitForTimeout(1000);
        } else {
          break;
        }
      }

      return { status: 'partial', note: 'Reached review step — manual submission required' };
    } finally {
      await browser.close();
    }
  } catch (err) {
    if (err.message.includes('Cannot find module')) {
      return { status: 'skipped', note: 'Playwright not installed — run: npm install playwright && npx playwright install chromium' };
    }
    return { status: 'failed', note: err.message };
  }
}

// ── ATS Apply (Greenhouse / Lever / Ashby) ────────────────────────────────────
async function applyATS(job, applyUrl, type, resumeText) {
  try {
    const { chromium } = await import('playwright');
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    try {
      await page.goto(applyUrl, { timeout: 15000 });
      await page.waitForTimeout(2000);

      // Fill common fields
      const nameInput = page.locator('input[name*="name"], input[id*="first_name"], input[placeholder*="First name"]').first();
      if (await nameInput.isVisible({ timeout: 2000 }).catch(() => false)) {
        await nameInput.fill('Sravya');
      }
      const lastInput = page.locator('input[name*="last_name"], input[id*="last_name"], input[placeholder*="Last name"]').first();
      if (await lastInput.isVisible({ timeout: 2000 }).catch(() => false)) {
        await lastInput.fill('Rachakonda');
      }
      const emailInput = page.locator('input[type="email"], input[name*="email"], input[id*="email"]').first();
      if (await emailInput.isVisible({ timeout: 2000 }).catch(() => false)) {
        await emailInput.fill(process.env.CANDIDATE_EMAIL || '');
      }

      return { status: 'filled', note: `Form filled on ${type} portal — manual submit required in Review mode` };
    } finally {
      await browser.close();
    }
  } catch (err) {
    if (err.message.includes('Cannot find module')) {
      return { status: 'skipped', note: 'Playwright not installed — run: npm install playwright && npx playwright install chromium' };
    }
    return { status: 'failed', note: err.message };
  }
}

export default router;
