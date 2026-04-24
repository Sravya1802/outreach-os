/**
 * careerOps.js
 * Routes for Career Ops: resume upload, job evaluation, tailored resume PDF.
 */

import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { one, all, run, tx } from '../db.js';
import { evaluateJob, fetchJobFromUrl } from '../services/jobEvaluator.js';
import { tailorResume, generateResumePDF } from '../services/resumeGenerator.js';
import { saveEvaluationReport, syncTracker, getTrackerRows } from '../services/reportManager.js';
import { scanResumes, pickResumeForRole, detectPlatform } from '../services/resumeRegistry.js';
import { processOneEvaluation, runQueueOnce } from '../services/autoApplier.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RESUME_DIR = path.join(__dirname, '..', 'data', 'resume');
fs.mkdirSync(RESUME_DIR, { recursive: true });

const router = Router();

// ── PDF text extraction helper (works with pdf-parse v2) ──────────────────────
async function extractPdfText(bufferOrPath) {
  const { PDFParse } = await import('pdf-parse');
  const buf = typeof bufferOrPath === 'string' ? fs.readFileSync(bufferOrPath) : bufferOrPath;
  const parser = new PDFParse({ verbosity: -1, data: buf });
  await parser.load();
  const result = await parser.getText();
  // v2 returns { pages: [{ text: '...' }, ...] }
  if (result && typeof result === 'object' && Array.isArray(result.pages)) {
    return result.pages.map(p => p.text || '').join('\n').trim();
  }
  // Fallback: stringify if unexpected shape
  return String(result || '').trim();
}

// ── Multer config for PDF upload ──────────────────────────────────────────────
const upload = multer({
  dest: RESUME_DIR,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('Only PDF files are accepted'));
  },
});

// ── GET /api/career/resume — get current resume info ─────────────────────────
router.get('/resume', async (req, res) => {
  try {
    const text = (await one("SELECT value FROM meta WHERE key = $2 AND user_id = $1", [req.user.id, 'user_resume_text']))?.value;
    const name = (await one("SELECT value FROM meta WHERE key = $2 AND user_id = $1", [req.user.id, 'user_resume_name']))?.value;
    const date = (await one("SELECT value FROM meta WHERE key = $2 AND user_id = $1", [req.user.id, 'user_resume_date']))?.value;
    res.json({ hasResume: !!text, name, date, textPreview: text?.slice(0, 300) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/career/resume — upload + parse PDF ──────────────────────────────
router.post('/resume', upload.single('resume'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    // Parse PDF
    const text = await extractPdfText(req.file.path);

    if (!text || text.length < 50) {
      return res.status(400).json({ error: 'Could not extract text from PDF. Make sure it is not a scanned image.' });
    }

    // Save original PDF
    const destPath = path.join(RESUME_DIR, 'original.pdf');
    fs.copyFileSync(req.file.path, destPath);
    fs.unlinkSync(req.file.path); // remove temp

    // Store in DB meta table
    const upsertSql = "INSERT INTO meta (user_id, key, value) VALUES ($1, $2, $3) ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value";
    await run(upsertSql, [req.user.id, 'user_resume_text', text]);
    await run(upsertSql, [req.user.id, 'user_resume_name', req.file.originalname]);
    await run(upsertSql, [req.user.id, 'user_resume_date', new Date().toISOString()]);

    console.log(`[careerOps] Resume uploaded: ${req.file.originalname}, ${text.length} chars`);
    res.json({ ok: true, name: req.file.originalname, chars: text.length, preview: text.slice(0, 300) });
  } catch (err) {
    console.error('[careerOps] resume upload error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/career/evaluate — evaluate a job ───────────────────────────────
router.post('/evaluate', async (req, res) => {
  try {
    const { jobUrl, jobDescription: rawDescription } = req.body;
    if (!jobUrl && !rawDescription) {
      return res.status(400).json({ error: 'Provide either a job URL or job description' });
    }

    // Get resume
    const resumeText = (await one("SELECT value FROM meta WHERE key = $2 AND user_id = $1", [req.user.id, 'user_resume_text']))?.value;
    if (!resumeText) return res.status(400).json({ error: 'No resume uploaded. Please upload your resume first.' });

    // If URL given, fetch job content
    let jobDescription = rawDescription || '';
    let sourceUrl = jobUrl;

    if (jobUrl && !rawDescription) {
      console.log(`[careerOps] Fetching job from URL: ${jobUrl}`);
      const fetched = await fetchJobFromUrl(jobUrl);
      if (!fetched.text) return res.status(400).json({ error: `Could not fetch job page: ${fetched.error}` });
      jobDescription = fetched.text;
    }

    console.log(`[careerOps] Evaluating job (${jobDescription.length} chars)`);
    const evaluation = await evaluateJob({ jobDescription, resumeText, jobUrl: sourceUrl });

    // Save to DB
    const result = await run(`
      INSERT INTO evaluations
        (user_id, job_url, job_title, company_name, job_description, grade, score, report_json, source)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'career_ops')
      RETURNING id
    `, [
      req.user.id,
      sourceUrl || null,
      evaluation.jobTitle || 'Unknown Role',
      evaluation.companyName || 'Unknown Company',
      jobDescription.slice(0, 5000),
      evaluation.grade,
      evaluation.overallScore,
      JSON.stringify(evaluation),
    ]);

    const evalId = result.insertId;

    // Save markdown report
    try {
      const { mdPath } = saveEvaluationReport(
        evaluation,
        evaluation.companyName,
        evaluation.jobTitle
      );
      await run("UPDATE evaluations SET report_path = $1 WHERE id = $2 AND user_id = $3", [mdPath, evalId, req.user.id]);
    } catch (err) {
      console.error('[careerOps] report save failed:', err.message);
    }

    res.json({ ok: true, evalId, evaluation });
  } catch (err) {
    console.error('[careerOps] evaluate error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/career/evaluations — list all evaluations ───────────────────────
router.get('/evaluations', async (req, res) => {
  try {
    const rows = await all(`
      SELECT id, job_title, company_name, grade, score, source, report_path, pdf_path, created_at
      FROM evaluations WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50
    `, [req.user.id]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/career/evaluations/:id — get single evaluation ──────────────────
router.get('/evaluations/:id', async (req, res) => {
  try {
    const row = await one('SELECT * FROM evaluations WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json({ ...row, evaluation: row.report_json ? JSON.parse(row.report_json) : null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── User profile (singleton — drives auto-apply form filling) ────────────────

router.get('/profile', async (req, res) => {
  try {
    const row = (await one('SELECT * FROM user_profile WHERE user_id = $1', [req.user.id])) || {};
    res.json(row);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/profile', async (req, res) => {
  try {
    const ALLOWED = ['first_name','last_name','email','phone','linkedin_url','github_url','portfolio_url','location','work_authorization','needs_sponsorship','gender','race','veteran_status','disability_status','resume_dir'];
    const data = req.body || {};
    const cols = [], placeholders = [], updates = [], args = [];
    let i = 1;
    // user_id is always first param for both INSERT + UPDATE WHERE
    args.push(req.user.id);
    const userIdPos = i++;
    for (const k of ALLOWED) {
      if (Object.prototype.hasOwnProperty.call(data, k)) {
        cols.push(k);
        placeholders.push(`$${i}`);
        updates.push(`${k} = $${i}`);
        args.push(data[k]);
        i++;
      }
    }
    if (!cols.length) return res.status(400).json({ error: 'No fields to update' });
    // Upsert on user_id (one row per user). user_id stays out of the SET clause.
    const sql = `
      INSERT INTO user_profile (user_id, ${cols.join(', ')}, updated_at)
      VALUES ($${userIdPos}, ${placeholders.join(', ')}, NOW())
      ON CONFLICT (user_id) DO UPDATE SET ${updates.join(', ')}, updated_at = NOW()
    `;
    await run(sql, args);
    res.json(await one('SELECT * FROM user_profile WHERE user_id = $1', [req.user.id]));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Resume registry — list available resumes in the configured folder ────────
router.get('/resumes-library', async (req, res) => {
  try {
    const profile = await one('SELECT resume_dir FROM user_profile WHERE user_id = $1', [req.user.id]);
    const resumes = scanResumes(profile?.resume_dir);
    res.json({ resumeDir: profile?.resume_dir, resumes });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Auto-apply queue — trigger a worker run ──────────────────────────────────
// The worker runs in-process (Playwright). This endpoint returns when all
// currently-queued evaluations have been attempted. For large queues the caller
// can poll again.
router.post('/auto-apply/run', async (req, res) => {
  try {
    const { dryRun = false, headless = true, limit = 10 } = req.body || {};
    const summary = await runQueueOnce({ dryRun, headless, limit, userId: req.user.id });
    res.json(summary);
  } catch (err) {
    console.error('[auto-apply/run]', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Bulk queue: preview how many evaluations match a threshold ──────────────
// Used by the slider in the Auto-Apply Setup UI to show a live count as the
// user drags. Does NOT mutate anything.
//
// Query params:
//   minGrade = 'A' | 'B' | 'C' | 'D' | 'F'   — inclusive lower bound
//   minScore = 0..100                        — inclusive lower bound
// Either or both may be specified. Rows already queued/applied are excluded.
router.get('/bulk-queue/preview', async (req, res) => {
  try {
    const { minGrade, minScore } = req.query;
    const { sql, params } = buildBulkQueueFilter({ minGrade, minScore, userId: req.user.id });
    const rows = await all(
      `SELECT id, job_title, company_name, grade, score FROM evaluations WHERE ${sql} ORDER BY score DESC NULLS LAST LIMIT 500`,
      params
    );
    res.json({ count: rows.length, rows });
  } catch (err) {
    console.error('[bulk-queue/preview]', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Bulk queue: flip matching evaluations to apply_mode='auto' + status='queued' ──
// Same filter as /preview. Returns { queued: N } = number of rows actually updated.
router.post('/bulk-queue', async (req, res) => {
  try {
    const { minGrade, minScore } = req.body || {};
    const { sql, params } = buildBulkQueueFilter({ minGrade, minScore, userId: req.user.id });
    const r = await run(
      `UPDATE evaluations SET apply_mode='auto', apply_status='queued' WHERE ${sql}`,
      params
    );
    res.json({ queued: r.rowCount });
  } catch (err) {
    console.error('[bulk-queue]', err);
    res.status(500).json({ error: err.message });
  }
});

// Build the shared WHERE fragment for bulk-queue preview + apply.
// Excludes rows that are already queued or past "not_started" (don't clobber
// in-flight applications). Scoped to the caller's user_id.
function buildBulkQueueFilter({ minGrade, minScore, userId }) {
  const GRADE_ORDER = ['A', 'B', 'C', 'D', 'F'];
  const params = [];
  let i = 1;
  // user_id scope comes first — ahead of the grade/score clauses.
  const parts = [`user_id = $${i++}`];
  params.push(userId);
  parts.push("(apply_status IS NULL OR apply_status = 'not_started')");

  if (minGrade && GRADE_ORDER.includes(String(minGrade).toUpperCase())) {
    const allowed = GRADE_ORDER.slice(0, GRADE_ORDER.indexOf(String(minGrade).toUpperCase()) + 1);
    parts.push(`grade = ANY($${i++})`);
    params.push(allowed);
  }
  if (minScore !== undefined && minScore !== null && minScore !== '') {
    const n = Number(minScore);
    if (!Number.isNaN(n)) {
      parts.push(`score >= $${i++}`);
      params.push(n);
    }
  }
  return { sql: parts.join(' AND '), params };
}

// ── Preview which resume a URL will use when auto-apply runs ─────────────────
// Looks up an existing evaluation by job_url (if any) and reports whether a
// tailored PDF already exists. Used by the Job Automation tab to show the user
// which resume will fire for each role before they hit Apply.
router.post('/auto-apply/resume-preview', async (req, res) => {
  try {
    const { jobUrls = [] } = req.body || {};
    if (!Array.isArray(jobUrls) || jobUrls.length === 0) return res.json({ previews: {} });
    const previews = {};
    for (const url of jobUrls) {
      const ev = await one(`
        SELECT id, pdf_path, job_description, report_json
        FROM evaluations
        WHERE job_url = $1 AND user_id = $2
        ORDER BY id DESC
        LIMIT 1
      `, [url, req.user.id]);
      if (!ev) {
        previews[url] = { source: 'fallback', label: 'Will use common-folder resume (no evaluation yet)' };
        continue;
      }
      if (ev.pdf_path && fs.existsSync(ev.pdf_path)) {
        previews[url] = {
          source: 'tailored',
          evalId: ev.id,
          filename: path.basename(ev.pdf_path),
          label: `Tailored resume: ${path.basename(ev.pdf_path)}`,
        };
      } else if (ev.job_description) {
        previews[url] = {
          source: 'tailored-pending',
          evalId: ev.id,
          label: 'Will tailor resume at apply time from Career Ops evaluation',
        };
      } else {
        previews[url] = { source: 'fallback', evalId: ev.id, label: 'Will use common-folder resume (evaluation has no JD)' };
      }
    }
    res.json({ previews });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Direct auto-apply — skip evaluation, just submit the form ────────────────
// Used by the per-company "Job Automation" tab where the user wants to apply
// to a scraped role without running the full A-G evaluation first. Creates a
// minimal evaluations row so the application still appears in the pipeline +
// job dashboard.
router.post('/auto-apply-direct', async (req, res) => {
  try {
    const { jobUrl, companyName, jobTitle, dryRun = false, headless = true } = req.body || {};
    if (!jobUrl)    return res.status(400).json({ error: 'jobUrl is required' });
    if (!companyName || !jobTitle) return res.status(400).json({ error: 'companyName and jobTitle are required' });

    // Deduplicate: if we've already seen this URL, reuse the existing evaluation
    let row = await one('SELECT * FROM evaluations WHERE job_url = $1 AND user_id = $2 ORDER BY id DESC LIMIT 1', [jobUrl, req.user.id]);
    if (!row) {
      const r = await run(`
        INSERT INTO evaluations (user_id, job_url, job_title, company_name, apply_mode, apply_status, source)
        VALUES ($1, $2, $3, $4, 'auto', 'queued', 'auto_apply_direct')
        RETURNING id
      `, [req.user.id, jobUrl, jobTitle, companyName]);
      row = await one('SELECT * FROM evaluations WHERE id = $1 AND user_id = $2', [r.insertId, req.user.id]);
    } else {
      // Re-queue for another attempt
      await run("UPDATE evaluations SET apply_mode='auto', apply_status='queued' WHERE id = $1 AND user_id = $2", [row.id, req.user.id]);
    }

    const result = await processOneEvaluation(req.user.id, row.id, { dryRun, headless });
    const updated = await one('SELECT apply_status, apply_error, apply_platform, apply_resume_used FROM evaluations WHERE id = $1 AND user_id = $2', [row.id, req.user.id]);
    res.json({ ok: !!result.ok, evalId: row.id, ...updated, ...result });
  } catch (err) {
    console.error('[auto-apply-direct]', err);
    res.status(500).json({ error: err.message });
  }
});

// Apply to a single evaluation on demand — used by the Career Ops "Apply" button
// when the user has set apply_mode='auto' and wants to execute immediately.
router.post('/auto-apply/:id', async (req, res) => {
  try {
    const { dryRun = false, headless = true } = req.body || {};
    const r = await processOneEvaluation(req.user.id, Number(req.params.id), { dryRun, headless });
    res.json(r);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/career/pipeline — job-search Kanban data ────────────────────────
// Groups evaluations by apply_status into the columns the frontend renders.
router.get('/pipeline', async (req, res) => {
  try {
    const rows = await all(`
      SELECT id, job_title, company_name, job_url, grade, score,
             apply_mode, apply_status, applied_at, created_at
      FROM evaluations
      WHERE user_id = $1
      ORDER BY COALESCE(applied_at, created_at::text) DESC
    `, [req.user.id]);

    const columns = {
      evaluated:  { label: 'Evaluated',     hint: 'Scored but not yet applied',            items: [] },
      applied:    { label: 'Applied',       hint: 'Application submitted',                 items: [] },
      responded:  { label: 'Responded',     hint: 'Recruiter replied',                     items: [] },
      interview:  { label: 'Interviewing',  hint: 'Active interview loop',                 items: [] },
      offer:      { label: 'Offer',         hint: 'Offer received',                        items: [] },
      rejected:   { label: 'Rejected',      hint: 'Closed — offer declined or rejected',   items: [] },
    };

    // Map of raw apply_status → column id. Anything not here falls into "evaluated".
    const STATUS_MAP = {
      not_started: 'evaluated',
      opened:      'applied',
      queued:      'applied',
      submitted:   'applied',
      responded:   'responded',
      interview:   'interview',
      offer:       'offer',
      rejected:    'rejected',
    };

    for (const r of rows) {
      const col = STATUS_MAP[r.apply_status] || 'evaluated';
      columns[col].items.push(r);
    }

    res.json({
      columns,
      totals: Object.fromEntries(Object.entries(columns).map(([k, v]) => [k, v.items.length])),
      total: rows.length,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/career/evaluations/:id/apply-status — move card in Kanban ─────
router.patch('/evaluations/:id/apply-status', async (req, res) => {
  try {
    const VALID = ['not_started', 'opened', 'queued', 'submitted', 'responded', 'interview', 'offer', 'rejected'];
    const { status } = req.body || {};
    if (!VALID.includes(status)) return res.status(400).json({ error: `status must be one of ${VALID.join(', ')}` });
    const row = await one('SELECT id FROM evaluations WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    if (!row) return res.status(404).json({ error: 'Evaluation not found' });
    await run('UPDATE evaluations SET apply_status = $1 WHERE id = $2 AND user_id = $3', [status, req.params.id, req.user.id]);
    res.json({ ok: true, status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/career/evaluations/:id/apply-mode — toggle manual | auto ──────
router.patch('/evaluations/:id/apply-mode', async (req, res) => {
  try {
    const { mode } = req.body || {};
    if (!['manual', 'auto'].includes(mode)) {
      return res.status(400).json({ error: 'mode must be "manual" or "auto"' });
    }
    const row = await one('SELECT id FROM evaluations WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    if (!row) return res.status(404).json({ error: 'Evaluation not found' });
    await run('UPDATE evaluations SET apply_mode = $1 WHERE id = $2 AND user_id = $3', [mode, req.params.id, req.user.id]);
    res.json({ ok: true, applyMode: mode });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/career/evaluations/:id/apply — trigger application flow ────────
// manual mode: returns the apply URL; frontend opens it in a new tab so the user
//              can fill + submit the form themselves (santifer human-in-the-loop).
// auto mode:   enqueues a Playwright worker (stub for now — real submit lands in #9).
router.post('/evaluations/:id/apply', async (req, res) => {
  try {
    const row = await one('SELECT * FROM evaluations WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    if (!row) return res.status(404).json({ error: 'Evaluation not found' });
    if (!row.job_url) return res.status(400).json({ error: 'This evaluation has no job URL to apply to' });

    const mode = row.apply_mode || 'manual';

    if (mode === 'manual') {
      // Nothing to do server-side — frontend opens URL. Just mark as "opened" so
      // the user can later confirm submission via updateStatus.
      await run("UPDATE evaluations SET apply_status = 'opened', applied_at = NOW() WHERE id = $1 AND user_id = $2", [row.id, req.user.id]);
      return res.json({ ok: true, mode, url: row.job_url, status: 'opened' });
    }

    // auto mode — mark queued, then run the Playwright worker synchronously for
    // immediate feedback. Long-running so we return once the worker finishes.
    await run("UPDATE evaluations SET apply_status = 'queued' WHERE id = $1 AND user_id = $2", [row.id, req.user.id]);
    try {
      const result = await processOneEvaluation(req.user.id, row.id, { headless: true });
      const updated = await one('SELECT apply_status, apply_error, apply_platform, apply_resume_used FROM evaluations WHERE id = $1 AND user_id = $2', [row.id, req.user.id]);
      return res.json({
        ok: !!result.ok,
        mode,
        url: row.job_url,
        ...updated,
        platform: result.platform,
        resume: result.resume,
        error: result.error,
      });
    } catch (err) {
      console.error('[auto-apply execute]', err);
      return res.status(500).json({ ok: false, mode, error: err.message });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/career/evaluations/:id/mark-applied — user confirms manual submit ─
router.post('/evaluations/:id/mark-applied', async (req, res) => {
  try {
    const row = await one('SELECT id FROM evaluations WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    if (!row) return res.status(404).json({ error: 'Evaluation not found' });
    await run("UPDATE evaluations SET apply_status = 'submitted', applied_at = COALESCE(applied_at, NOW()::text) WHERE id = $1 AND user_id = $2", [req.params.id, req.user.id]);
    res.json({ ok: true, status: 'submitted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/career/evaluations/:id ───────────────────────────────────────
router.delete('/evaluations/:id', async (req, res) => {
  try {
    await run('DELETE FROM evaluations WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/career/tailored-resume/:id — generate tailored resume PDF ──────
router.post('/tailored-resume/:id', async (req, res) => {
  try {
    const row = await one('SELECT * FROM evaluations WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    if (!row) return res.status(404).json({ error: 'Evaluation not found' });

    const resumeText = (await one("SELECT value FROM meta WHERE key = $2 AND user_id = $1", [req.user.id, 'user_resume_text']))?.value;
    if (!resumeText) return res.status(400).json({ error: 'No resume found' });

    const candidateName = (await one("SELECT value FROM meta WHERE key = $2 AND user_id = $1", [req.user.id, 'user_resume_name']))?.value?.replace('.pdf','') || 'Candidate';

    console.log(`[careerOps] Generating tailored resume for ${row.company_name} - ${row.job_title}`);

    // AI tailor
    const tailored = await tailorResume(resumeText, row.job_description, row.job_title, row.company_name);

    // Generate PDF
    const { pdfPath, relativePath } = await generateResumePDF(tailored, row.company_name, row.job_title, 'Sravya Rachakonda');

    // Update DB
    await run('UPDATE evaluations SET pdf_path = $1 WHERE id = $2 AND user_id = $3', [pdfPath, row.id, req.user.id]);

    res.json({ ok: true, pdfPath: relativePath, downloadUrl: `/api/career/download/${row.id}` });
  } catch (err) {
    console.error('[careerOps] tailored-resume error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/career/download/:id — download PDF ──────────────────────────────
router.get('/download/:id', async (req, res) => {
  try {
    const row = await one('SELECT pdf_path, job_title, company_name FROM evaluations WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    if (!row || !row.pdf_path) return res.status(404).json({ error: 'PDF not found. Generate it first.' });
    if (!fs.existsSync(row.pdf_path)) return res.status(404).json({ error: 'PDF file missing from disk.' });

    const filename = `${row.company_name}-${row.job_title}-tailored-resume.pdf`.replace(/[^a-zA-Z0-9\-_.]/g, '_');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/pdf');
    fs.createReadStream(row.pdf_path).pipe(res);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/career/scan-portals — scan Greenhouse/Lever/Ashby for CS/intern roles ──
const SCAN_GREENHOUSE = [
  'stripe','airbnb','robinhood','figma','coinbase','plaid','brex','ramp','notion','anthropic',
  'openai','scale','databricks','cloudflare','datadog','palantir','anduril','gusto','rippling','lattice',
];

const SCAN_LEVER = [
  'netflix','atlassian','duolingo','airtable','carta','flexport','klaviyo','canva','hubspot',
  'chime','affirm','databricks','snowflake','coda','asana',
];

const SCAN_ASHBY = [
  'linear','cursor','replit','railway','render','resend','raycast','supabase','clerk',
  'mercury','brex','ramp','posthog','cal','hex',
];

const CS_TITLE_RE = /intern|engineer|developer|researcher|scientist|data|ml|software|swe/i;
const INTERN_RE   = /\b(intern|internship|trainee|co-?op|working student|summer analyst)\b/i;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

// Filter by role-type. 'intern' keeps only intern/co-op/trainee titles,
// 'fulltime' keeps only non-intern engineering titles, 'all' keeps both.
function matchesRoleType(title, roleType) {
  if (!title) return false;
  if (roleType === 'intern')   return INTERN_RE.test(title);
  if (roleType === 'fulltime') return CS_TITLE_RE.test(title) && !INTERN_RE.test(title);
  return CS_TITLE_RE.test(title); // 'all' / undefined → keep any CS-ish title
}

function isRecent(timestamp) {
  if (!timestamp) return true; // no timestamp — include anyway
  const posted = new Date(typeof timestamp === 'number' && timestamp < 1e12
    ? timestamp * 1000  // seconds → ms
    : timestamp);
  return !isNaN(posted) && (Date.now() - posted.getTime()) <= SEVEN_DAYS_MS;
}

async function scanGreenhouse(roleType = 'intern') {
  const jobs = [];
  for (const token of SCAN_GREENHOUSE) {
    try {
      const res = await fetch(
        `https://boards-api.greenhouse.io/v1/boards/${token}/jobs?content=true`,
        { signal: AbortSignal.timeout(5000) }
      );
      if (!res.ok) continue;
      const data = await res.json();
      for (const job of (data.jobs || [])) {
        if (!matchesRoleType(job.title, roleType)) continue;
        const ts = job.updated_at || job.created_at;
        if (!isRecent(ts)) continue;
        jobs.push({
          title:    job.title,
          company:  token,
          location: job.location?.name || '',
          postedAt: ts || null,
          applyUrl: job.absolute_url || `https://boards.greenhouse.io/${token}`,
          source:   'greenhouse',
        });
      }
    } catch (_) { /* one failure doesn't stop others */ }
  }
  return jobs;
}

async function scanLever(roleType = 'intern') {
  const jobs = [];
  for (const company of SCAN_LEVER) {
    try {
      const res = await fetch(
        `https://api.lever.co/v0/postings/${company}?mode=json`,
        { signal: AbortSignal.timeout(5000) }
      );
      if (!res.ok) continue;
      const data = await res.json();
      for (const job of (Array.isArray(data) ? data : [])) {
        if (!matchesRoleType(job.text || '', roleType)) continue;
        const ts = job.createdAt; // epoch ms
        if (!isRecent(ts)) continue;
        jobs.push({
          title:    job.text,
          company:  company,
          location: job.categories?.location || job.country || '',
          postedAt: ts ? new Date(ts).toISOString() : null,
          applyUrl: job.hostedUrl || `https://jobs.lever.co/${company}`,
          source:   'lever',
        });
      }
    } catch (_) { /* one failure doesn't stop others */ }
  }
  return jobs;
}

async function scanAshby(roleType = 'intern') {
  const jobs = [];
  for (const company of SCAN_ASHBY) {
    try {
      const res = await fetch(
        `https://api.ashbyhq.com/posting-api/job-board/${company}`,
        {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ jobBoardName: company }),
          signal:  AbortSignal.timeout(5000),
        }
      );
      if (!res.ok) continue;
      const data = await res.json();
      for (const job of (data.jobs || data.jobPostings || [])) {
        if (!matchesRoleType(job.title || '', roleType)) continue;
        const ts = job.publishedAt || job.createdAt || job.updatedAt;
        if (!isRecent(ts)) continue;
        jobs.push({
          title:    job.title,
          company:  company,
          location: job.location || job.locationName || '',
          postedAt: ts || null,
          applyUrl: job.jobUrl || job.applyUrl || `https://jobs.ashbyhq.com/${company}`,
          source:   'ashby',
        });
      }
    } catch (_) { /* one failure doesn't stop others */ }
  }
  return jobs;
}

router.post('/scan-portals', async (req, res) => {
  try {
    // roleType = 'intern' (default) | 'fulltime' | 'all'
    const roleType = ['intern', 'fulltime', 'all'].includes(req.body?.roleType) ? req.body.roleType : 'intern';
    console.log(`[careerOps] Starting portal scan across Greenhouse / Lever / Ashby — roleType=${roleType}`);

    const [ghResult, lvResult, ashResult] = await Promise.allSettled([
      scanGreenhouse(roleType),
      scanLever(roleType),
      scanAshby(roleType),
    ]);

    const ghJobs  = ghResult.status  === 'fulfilled' ? ghResult.value  : [];
    const lvJobs  = lvResult.status  === 'fulfilled' ? lvResult.value  : [];
    const ashJobs = ashResult.status === 'fulfilled' ? ashResult.value : [];

    const jobs = [...ghJobs, ...lvJobs, ...ashJobs];

    console.log(`[careerOps] Portal scan complete — ${jobs.length} jobs (gh:${ghJobs.length} lv:${lvJobs.length} ash:${ashJobs.length})`);

    res.json({
      jobs,
      total: jobs.length,
      bySource: {
        greenhouse: ghJobs.length,
        lever:      lvJobs.length,
        ashby:      ashJobs.length,
      },
    });
  } catch (err) {
    console.error('[careerOps] scan-portals error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/career/batch-evaluate — evaluate multiple URLs in parallel ──────
router.post('/batch-evaluate', async (req, res) => {
  const { urls } = req.body;
  if (!Array.isArray(urls) || urls.length === 0) {
    return res.status(400).json({ error: 'Provide an array of URLs' });
  }

  const resumeText = (await one("SELECT value FROM meta WHERE key = $2 AND user_id = $1", [req.user.id, 'user_resume_text']))?.value;
  if (!resumeText) return res.status(400).json({ error: 'No resume uploaded' });

  const batch = urls.slice(0, 10); // max 10
  const results = [];

  // Process in parallel batches of 3 to avoid rate limits
  for (let i = 0; i < batch.length; i += 3) {
    const chunk = batch.slice(i, i + 3);
    const settled = await Promise.allSettled(chunk.map(async (url) => {
      const fetched = await fetchJobFromUrl(url.trim());
      if (!fetched.text) throw new Error(`Could not fetch: ${url}`);
      const evaluation = await evaluateJob({ jobDescription: fetched.text, resumeText, jobUrl: url });

      // Save to DB
      const r = await run(`
        INSERT INTO evaluations (user_id, job_url, job_title, company_name, job_description, grade, score, report_json, source)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'career_ops_batch')
        RETURNING id
      `, [req.user.id, url, evaluation.jobTitle, evaluation.companyName, fetched.text.slice(0, 5000), evaluation.grade, evaluation.overallScore, JSON.stringify(evaluation)]);

      return { url, evalId: r.insertId, evaluation, status: 'done' };
    }));

    for (let j = 0; j < settled.length; j++) {
      const s = settled[j];
      if (s.status === 'fulfilled') results.push(s.value);
      else results.push({ url: chunk[j], status: 'failed', error: s.reason?.message });
    }

    // Small delay between chunks to avoid Gemini rate limits
    if (i + 3 < batch.length) await new Promise(r => setTimeout(r, 3000));
  }

  // Sort by score descending
  results.sort((a, b) => (b.evaluation?.overallScore || 0) - (a.evaluation?.overallScore || 0));

  res.json({ results, total: results.length, done: results.filter(r => r.status === 'done').length });
});

// ── Document upload storage ───────────────────────────────────────────────────
const DOC_BASE = path.join(__dirname, '..', 'data', 'documents');
fs.mkdirSync(DOC_BASE, { recursive: true });

const docStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(DOC_BASE, String(req.params.companyId || 'profile'));
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/[^a-z0-9.\-_]/gi, '_')}`),
});
const docUpload = multer({
  storage: docStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, ['.pdf', '.docx'].includes(ext));
  },
});

// ── GET /api/career/stats — career ops summary ─────────────────────────────────
router.get('/stats', async (req, res) => {
  try {
    const total    = Number((await one("SELECT COUNT(*) as n FROM company_applications WHERE user_id = $1", [req.user.id])).n);
    const avgRow   = await one("SELECT AVG(fit_score) as avg FROM company_applications WHERE fit_score IS NOT NULL AND user_id = $1", [req.user.id]);
    const topRow   = await one("SELECT ca.*, j.name as company_name FROM company_applications ca JOIN jobs j ON j.id = ca.company_id WHERE ca.fit_score IS NOT NULL AND ca.user_id = $1 ORDER BY ca.fit_score DESC LIMIT 1", [req.user.id]);
    const applyCount = Number((await one("SELECT COUNT(*) as n FROM company_applications WHERE fit_score >= 4.2 AND user_id = $1", [req.user.id])).n);
    res.json({ total, avgScore: avgRow?.avg ? Number(avgRow.avg).toFixed(1) : null, topPick: topRow, applyCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/career/ranked — all applications ranked by fit_score ───────────────
router.get('/ranked', async (req, res) => {
  try {
    const rows = await all(`
      SELECT ca.*, j.name as company_name, j.category, j.location, j.website
      FROM company_applications ca
      JOIN jobs j ON j.id = ca.company_id
      WHERE ca.user_id = $1
      ORDER BY ca.fit_score DESC NULLS LAST, ca.updated_at DESC
    `, [req.user.id]);
    res.json({ applications: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/career/:companyId/documents — list documents ─────────────────────
router.get('/:companyId/documents', async (req, res) => {
  try {
    const rows = await all("SELECT * FROM documents WHERE company_id = $1 AND user_id = $2 ORDER BY created_at DESC", [req.params.companyId, req.user.id]);
    res.json({ documents: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/career/:companyId/documents — upload document ────────────────────
router.post('/:companyId/documents', docUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const result = await run(`
      INSERT INTO documents (user_id, company_id, filename, original_name, mime_type, size)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id
    `, [req.user.id, req.params.companyId, req.file.filename, req.file.originalname, req.file.mimetype, req.file.size]);
    const doc = await one("SELECT * FROM documents WHERE id = $1 AND user_id = $2", [result.insertId, req.user.id]);
    res.json({ document: doc });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/career/:companyId/documents/:docId ────────────────────────────
router.delete('/:companyId/documents/:docId', async (req, res) => {
  try {
    const doc = await one("SELECT * FROM documents WHERE id = $1 AND company_id = $2 AND user_id = $3", [req.params.docId, req.params.companyId, req.user.id]);
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    const filePath = path.join(DOC_BASE, String(req.params.companyId), doc.filename);
    try { fs.unlinkSync(filePath); } catch (_) {}
    await run("DELETE FROM documents WHERE id = $1 AND user_id = $2", [req.params.docId, req.user.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/career/:companyId/documents/:docId/download ──────────────────────
router.get('/:companyId/documents/:docId/download', async (req, res) => {
  try {
    const doc = await one("SELECT * FROM documents WHERE id = $1 AND company_id = $2 AND user_id = $3", [req.params.docId, req.params.companyId, req.user.id]);
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    const filePath = path.join(DOC_BASE, String(req.params.companyId), doc.filename);
    res.setHeader('Content-Disposition', `inline; filename="${doc.original_name}"`);
    res.setHeader('Content-Type', doc.mime_type || 'application/octet-stream');
    res.sendFile(filePath);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/career/company/:id — get application tracking for a company ───────
router.get('/company/:id', async (req, res) => {
  try {
    const row = await one('SELECT * FROM company_applications WHERE company_id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    res.json(row || {
      company_id: req.params.id,
      status: 'interested',
      applied_date: null,
      follow_up_date: null,
      notes: '',
      fit_score: null,
      resume_path: null,
      resume_original_name: null,
      resume_size: null,
      job_title: null,
      job_url: null,
      job_source: null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/career/company/:id — upsert application tracking ─────────────────
router.put('/company/:id', async (req, res) => {
  try {
    const {
      status, applied_date, follow_up_date, notes, fit_score, salary,
      location_type, start_date, end_date, fit_assessment,
      resume_path, resume_original_name, resume_size,
      job_title, job_url, job_source,
    } = req.body;
    await run(`
      INSERT INTO company_applications (
        user_id, company_id, status, applied_date, follow_up_date, notes, fit_score,
        salary, location_type, start_date, end_date, fit_assessment,
        resume_path, resume_original_name, resume_size,
        job_title, job_url, job_source, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, NOW())
      ON CONFLICT(user_id, company_id) DO UPDATE SET
        status = EXCLUDED.status,
        applied_date = EXCLUDED.applied_date,
        follow_up_date = EXCLUDED.follow_up_date,
        notes = EXCLUDED.notes,
        fit_score = EXCLUDED.fit_score,
        salary = EXCLUDED.salary,
        location_type = EXCLUDED.location_type,
        start_date = EXCLUDED.start_date,
        end_date = EXCLUDED.end_date,
        fit_assessment = EXCLUDED.fit_assessment,
        resume_path = COALESCE(EXCLUDED.resume_path, company_applications.resume_path),
        resume_original_name = COALESCE(EXCLUDED.resume_original_name, company_applications.resume_original_name),
        resume_size = COALESCE(EXCLUDED.resume_size, company_applications.resume_size),
        job_title = COALESCE(EXCLUDED.job_title, company_applications.job_title),
        job_url = COALESCE(EXCLUDED.job_url, company_applications.job_url),
        job_source = COALESCE(EXCLUDED.job_source, company_applications.job_source),
        updated_at = NOW()
    `, [
      req.user.id,
      req.params.id,
      status || 'interested',
      applied_date || null,
      follow_up_date || null,
      notes || null,
      fit_score != null ? Number(fit_score) : null,
      salary || null,
      location_type || 'onsite',
      start_date || null,
      end_date || null,
      fit_assessment || null,
      resume_path || null,
      resume_original_name || null,
      resume_size != null ? Number(resume_size) : null,
      job_title || null,
      job_url || null,
      job_source || null,
    ]);
    const row = await one('SELECT * FROM company_applications WHERE company_id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/career/company/:id/score-fit — full AI role analysis ───────────
router.post('/company/:id/score-fit', async (req, res) => {
  // Hard 90s timeout — prevents the request hanging forever
  const timeout = setTimeout(() => {
    if (!res.headersSent) res.status(504).json({ error: 'Analysis timed out. Try again — Gemini may be rate-limited.' });
  }, 90000);

  try {
    const row = await one('SELECT * FROM company_applications WHERE company_id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    const company = await one('SELECT * FROM jobs WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    if (!company) { clearTimeout(timeout); return res.status(404).json({ error: 'Company not found' }); }
    if (!row?.job_title) {
      clearTimeout(timeout); return res.status(400).json({ error: 'No tracked role found. Track a role from Job Scraper first.' });
    }

    let resumeText = (await one("SELECT value FROM meta WHERE key = $2 AND user_id = $1", [req.user.id, 'user_resume_text']))?.value;
    if (!resumeText) {
      // Check if resume file exists on disk and parse it on-the-fly
      if (row?.resume_path) {
        try {
          const text = await extractPdfText(row.resume_path);
          if (text && text.length > 50) {
            const upsertSql = "INSERT INTO meta (user_id, key, value) VALUES ($1, $2, $3) ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value";
            await run(upsertSql, [req.user.id, 'user_resume_text', text]);
            await run(upsertSql, [req.user.id, 'user_resume_name', row.resume_original_name || 'resume.pdf']);
            await run(upsertSql, [req.user.id, 'user_resume_date', new Date().toISOString()]);
            resumeText = text;
            console.log(`[score-fit] Parsed resume on-the-fly: ${text.length} chars`);
          } else {
            clearTimeout(timeout); return res.status(400).json({ error: 'Resume PDF appears to be a scanned image — re-upload a text-based PDF.' });
          }
        } catch (parseErr) {
          console.error('[score-fit] on-the-fly parse failed:', parseErr.message);
          clearTimeout(timeout); return res.status(400).json({ error: 'Could not read resume. Re-upload your resume.' });
        }
      } else {
        clearTimeout(timeout); return res.status(400).json({ error: 'No resume uploaded. Upload your resume in Career Ops first.' });
      }
    }

    // Try to get real JD from the job URL (8s max — don't block on slow job sites)
    let jobDescription = '';
    if (row.job_url) {
      try {
        const fetched = await Promise.race([
          fetchJobFromUrl(row.job_url),
          new Promise((_, rej) => setTimeout(() => rej(new Error('JD fetch timeout')), 8000)),
        ]);
        if (fetched?.text && fetched.text.length > 100) {
          jobDescription = fetched.text;
          console.log(`[score-fit] fetched ${fetched.text.length} chars from ${row.job_url}`);
        }
      } catch (e) {
        console.log('[score-fit] JD fetch skipped:', e.message);
      }
    }

    // Fallback: company info + role title
    if (!jobDescription) {
      jobDescription = [
        `Company: ${company.name}`,
        company.wikipedia_summary ? `About: ${company.wikipedia_summary.slice(0, 800)}` : '',
        `Role: ${row.job_title}`,
        row.job_source ? `Source: ${row.job_source}` : '',
      ].filter(Boolean).join('\n');
    }

    const evaluation = await evaluateJob({ jobDescription, resumeText, jobUrl: row.job_url || null });
    const fitScore = Math.max(1, Math.min(5, Number((evaluation.overallScore / 20).toFixed(1))));

    await run("UPDATE company_applications SET fit_score = $1, fit_assessment = $2, updated_at = NOW() WHERE company_id = $3 AND user_id = $4",
      [fitScore, JSON.stringify(evaluation), req.params.id, req.user.id]);

    // Save to evaluations table so PDF generation can reference it
    let evalId = null;
    try {
      const r = await run(`
        INSERT INTO evaluations (user_id, job_url, job_title, company_name, job_description, grade, score, report_json, source)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'score_fit')
        RETURNING id
      `, [
        req.user.id,
        row.job_url || null,
        row.job_title,
        company.name,
        jobDescription.slice(0, 5000),
        evaluation.grade,
        evaluation.overallScore,
        JSON.stringify(evaluation),
      ]);
      evalId = r.insertId;
    } catch (eErr) {
      console.error('[careerOps] evaluations insert failed:', eErr.message);
    }

    // Save markdown report + TSV tracker entry (santifer pipeline)
    let reportFile = null;
    try {
      const { filename } = saveEvaluationReport(
        evaluation,
        company.name,
        row.job_title,
        row.job_url || null
      );
      syncTracker();
      reportFile = filename;
    } catch (rErr) {
      console.error('[careerOps] report/tracker save failed:', rErr.message);
    }

    const updated = await one('SELECT * FROM company_applications WHERE company_id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    clearTimeout(timeout);
    if (!res.headersSent) res.json({ fit_score: updated.fit_score, evaluation, reportFile, evalId });
  } catch (err) {
    clearTimeout(timeout);
    console.error('[careerOps] score-fit error:', err.message);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

// ── GET /api/career/tracker — applications.md as JSON rows ────────────────────
router.get('/tracker', (req, res) => {
  try {
    syncTracker(); // drain any pending TSV first
    const rows = getTrackerRows();
    res.json({ rows, total: rows.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/career/tracker/raw — raw applications.md text ───────────────────
router.get('/tracker/raw', (req, res) => {
  const p = path.join(__dirname, '..', 'data', 'applications.md');
  if (!fs.existsSync(p)) return res.send('No evaluations yet.');
  res.setHeader('Content-Type', 'text/plain');
  res.send(fs.readFileSync(p, 'utf8'));
});

// ── GET /api/career/evaluations/:id/report.html — standalone styled HTML ─────
// Renders the full A-G evaluation as a self-contained HTML page (no JS, all
// styles inline) — suitable for saving, printing, or emailing. Replaces the
// raw .md report the user was seeing before.
router.get('/evaluations/:id/report.html', async (req, res) => {
  try {
    const row = await one('SELECT * FROM evaluations WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    if (!row) return res.status(404).send('<h1>Report not found</h1>');
    const e = row.report_json ? JSON.parse(row.report_json) : null;
    if (!e) return res.status(404).send('<h1>No evaluation data for this report</h1>');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(renderEvaluationHtml(e, row));
  } catch (err) {
    res.status(500).send(`<h1>Error</h1><pre>${String(err.message).replace(/[<>&]/g, c => ({ '<':'&lt;','>':'&gt;','&':'&amp;' }[c]))}</pre>`);
  }
});

function esc(s) {
  if (s == null) return '';
  return String(s).replace(/[<>&"]/g, c => ({ '<':'&lt;', '>':'&gt;', '&':'&amp;', '"':'&quot;' }[c]));
}

function renderEvaluationHtml(e, row) {
  const grade = e.grade || 'F';
  const gradeColor = { A:'#16a34a', B:'#0d9488', C:'#d97706', D:'#ea580c', F:'#dc2626' }[grade] || '#64748b';
  const gradeBg    = { A:'#dcfce7', B:'#ccfbf1', C:'#fef3c7', D:'#ffedd5', F:'#fee2e2' }[grade] || '#f8fafc';
  const legit = e.blockG_legitimacy?.assessment || 'Proceed with Caution';
  const legitColor = legit === 'High Confidence' ? '#16a34a' : legit === 'Suspicious' ? '#dc2626' : '#d97706';
  const legitBg    = legit === 'High Confidence' ? '#dcfce7' : legit === 'Suspicious' ? '#fee2e2' : '#fef3c7';
  const legitHint  = legit === 'High Confidence'
    ? 'Multiple signals suggest this is a real, active opening — safe to invest effort.'
    : legit === 'Suspicious'
    ? 'Multiple ghost-job indicators. Investigate before applying.'
    : 'Mixed signals — consider applying but don\'t over-invest until you confirm the role is live.';

  const createdAt = row.created_at ? new Date(row.created_at).toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' }) : '';
  const score = (typeof e.globalScore === 'number') ? e.globalScore.toFixed(1) : ((e.overallScore || 0) / 20).toFixed(1);

  const requirementsRows = (e.blockB_cvMatch?.requirements || []).map(r => {
    const statusColor = r.status === 'match' ? '#16a34a' : r.status === 'partial' ? '#d97706' : '#dc2626';
    const statusBg    = r.status === 'match' ? '#dcfce7' : r.status === 'partial' ? '#fef3c7' : '#fee2e2';
    return `<tr>
      <td><span class="pill" style="background:${statusBg};color:${statusColor}">${esc(r.status)}</span></td>
      <td><strong>${esc(r.requirement)}</strong></td>
      <td>${esc(r.cvEvidence)}</td>
    </tr>`;
  }).join('');

  const gapsHtml = (e.blockB_cvMatch?.gaps || []).map(g => `
    <div class="gap">
      <div class="gap-head">
        <span class="pill" style="background:${g.severity === 'hard blocker' ? '#fee2e2' : '#fef3c7'};color:${g.severity === 'hard blocker' ? '#991b1b' : '#92400e'}">${esc(g.severity)}</span>
        <strong>${esc(g.gap)}</strong>
      </div>
      ${g.adjacentExperience ? `<div class="muted">Adjacent: ${esc(g.adjacentExperience)}</div>` : ''}
      <div class="italic">→ ${esc(g.mitigation)}</div>
    </div>`).join('');

  const starHtml = (e.blockF_interviewPrep?.starStories || []).map(s => `
    <div class="star">
      <div class="star-req">Maps to: ${esc(s.jdRequirement)}</div>
      <div><strong>S</strong>: ${esc(s.situation)}</div>
      <div><strong>T</strong>: ${esc(s.task)}</div>
      <div><strong>A</strong>: ${esc(s.action)}</div>
      <div><strong>R</strong>: ${esc(s.result)}</div>
      ${s.reflection ? `<div class="muted italic">Reflection: ${esc(s.reflection)}</div>` : ''}
    </div>`).join('');

  const redFlagHtml = (e.blockF_interviewPrep?.redFlagQuestions || []).map(q => `
    <div class="redflag">
      <div class="q"><strong>Q:</strong> ${esc(q.question)}</div>
      <div class="a"><strong>A:</strong> ${esc(q.answer)}</div>
    </div>`).join('');

  const signalRows = (e.blockG_legitimacy?.signals || []).map(s => {
    const wColor = s.weight === 'Positive' ? '#16a34a' : s.weight === 'Concerning' ? '#dc2626' : '#64748b';
    const wBg    = s.weight === 'Positive' ? '#dcfce7' : s.weight === 'Concerning' ? '#fee2e2' : '#f1f5f9';
    return `<tr>
      <td><strong>${esc(s.signal)}</strong></td>
      <td>${esc(s.finding)}</td>
      <td><span class="pill" style="background:${wBg};color:${wColor}">${esc(s.weight)}</span></td>
    </tr>`;
  }).join('');

  const cvChangesHtml = (e.blockE_personalization?.cvChanges || []).map(c => `
    <div class="change">
      <div class="change-head">${esc(c.section)}</div>
      <div><strong>Before:</strong> ${esc(c.currentState)}</div>
      <div style="color:#16a34a"><strong>After:</strong> ${esc(c.proposedChange)}</div>
      <div class="muted italic">Why: ${esc(c.why)}</div>
    </div>`).join('');

  const atsKeywords = (e.atsKeywords || []).map(k => `<span class="chip">${esc(k)}</span>`).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${esc(e.jobTitle || 'Evaluation')} — ${esc(e.companyName || '')}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    * { box-sizing: border-box }
    body { margin:0; padding:40px 24px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, sans-serif; background:#f8fafc; color:#0f172a; line-height:1.55 }
    .page { max-width: 880px; margin: 0 auto; background:#fff; border:1px solid #e2e8f0; border-radius:16px; padding:40px; box-shadow:0 2px 16px rgba(0,0,0,0.04) }
    .hdr { display:flex; align-items:center; gap:20px; padding:20px 24px; background:${gradeBg}; border-radius:14px; margin-bottom:24px }
    .grade-circle { width:74px; height:74px; border-radius:50%; background:${gradeColor}20; border:3px solid ${gradeColor}; display:flex; align-items:center; justify-content:center; flex-shrink:0; color:${gradeColor}; font-size:32px; font-weight:900 }
    .hdr h1 { margin:0 0 4px; font-size:22px; font-weight:800 }
    .hdr .sub { color:${gradeColor}; font-weight:700; font-size:13px; margin-bottom:2px }
    .hdr .meta { font-size:12px; color:#64748b }
    .hdr .score { font-weight:700; color:#0f172a }
    h2 { font-size:16px; border-bottom:1px solid #e2e8f0; padding-bottom:8px; margin-top:32px; color:#0f172a }
    h2 .tag { font-size:11px; color:#94a3b8; font-weight:600; margin-left:8px }
    .stats-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(140px,1fr)); gap:10px; margin:14px 0 }
    .stat { padding:10px 12px; background:#f8fafc; border-radius:8px; border:1px solid #f1f5f9 }
    .stat-label { font-size:10px; font-weight:700; color:#94a3b8; text-transform:uppercase; letter-spacing:.07em; margin-bottom:3px }
    .stat-val { font-size:13px; font-weight:600 }
    table { width:100%; border-collapse:collapse; font-size:13px; margin:12px 0 }
    th, td { text-align:left; padding:8px 10px; border-bottom:1px solid #f1f5f9; vertical-align:top }
    th { font-size:10px; color:#94a3b8; font-weight:700; text-transform:uppercase; letter-spacing:.06em }
    .pill { display:inline-block; padding:2px 8px; border-radius:12px; font-size:10px; font-weight:700; text-transform:capitalize }
    .gap, .change, .star, .redflag { padding:10px 12px; margin:6px 0; border-radius:8px; background:#f8fafc; border-left:3px solid #6366f1; font-size:12px }
    .gap { background:#fef2f2; border-left-color:#dc2626 }
    .star { border-left-color:#7c3aed }
    .redflag { background:#fef2f2; border-left-color:#dc2626 }
    .change-head, .star-req { font-size:11px; font-weight:700; color:#4f46e5; margin-bottom:4px }
    .muted { color:#64748b; font-size:11px }
    .italic { font-style:italic }
    .legit { padding:14px 16px; border-radius:10px; border:1px solid ${legitColor}40; background:${legitBg}; margin:12px 0 }
    .legit-label { font-weight:800; color:${legitColor}; font-size:14px; margin-bottom:4px }
    .legit-hint { font-size:12px }
    .chip { display:inline-block; padding:4px 10px; margin:3px 3px 0 0; background:#eef2ff; color:#4f46e5; border-radius:12px; font-size:11px; font-weight:600 }
    .tldr { padding:12px 14px; background:#f8fafc; border-radius:8px; margin:12px 0; font-size:13px }
    .footer { margin-top:36px; padding-top:16px; border-top:1px solid #e2e8f0; font-size:11px; color:#94a3b8; text-align:center }
    @media print { body { background:#fff; padding:0 } .page { border:none; box-shadow:none; padding:24px } }
  </style>
</head>
<body>
  <div class="page">
    <div class="hdr">
      <div class="grade-circle">${esc(grade)}</div>
      <div style="flex:1">
        <h1>${esc(e.jobTitle || 'Unknown Role')} <span style="font-weight:400;color:#64748b;font-size:16px">at</span> ${esc(e.companyName || 'Unknown')}</h1>
        <div class="sub">${esc(e.recommendation || '')}</div>
        <div class="meta">Score: <span class="score">${esc(score)}/5.0</span>${e.archetype?.primary ? ` · Archetype: <span class="score">${esc(e.archetype.primary)}</span>` : ''}${createdAt ? ` · ${esc(createdAt)}` : ''}</div>
      </div>
    </div>

    <h2>A · Role Summary</h2>
    ${e.blockA_roleSummary?.tldr ? `<div class="tldr">${esc(e.blockA_roleSummary.tldr)}</div>` : ''}
    <div class="stats-grid">
      ${[['Domain','domain'],['Function','function'],['Seniority','seniority'],['Remote','remote'],['Team','teamSize']]
        .filter(([_, k]) => e.blockA_roleSummary?.[k])
        .map(([lbl, k]) => `<div class="stat"><div class="stat-label">${lbl}</div><div class="stat-val">${esc(e.blockA_roleSummary[k])}</div></div>`)
        .join('')}
    </div>

    <h2>B · CV Match <span class="tag">${(e.blockB_cvMatch?.requirements || []).length} requirements · ${(e.blockB_cvMatch?.gaps || []).length} gaps</span></h2>
    ${requirementsRows ? `<table><thead><tr><th style="width:90px">Status</th><th>Requirement</th><th>CV evidence</th></tr></thead><tbody>${requirementsRows}</tbody></table>` : '<div class="muted">No requirements analyzed.</div>'}
    ${gapsHtml ? `<h3 style="font-size:12px;color:#94a3b8;text-transform:uppercase;letter-spacing:.07em;margin-top:20px">Gap mitigation</h3>${gapsHtml}` : ''}

    <h2>C · Level & Strategy</h2>
    <div class="stats-grid">
      <div class="stat"><div class="stat-label">JD Level</div><div class="stat-val">${esc(e.blockC_levelAndStrategy?.jdLevel || 'unknown')}</div></div>
      <div class="stat"><div class="stat-label">Your Natural Level</div><div class="stat-val">${esc(e.blockC_levelAndStrategy?.candidateNaturalLevel || 'unknown')}</div></div>
    </div>
    ${(e.blockC_levelAndStrategy?.sellSeniorPlan || []).length ? `<h3 style="font-size:12px;color:#94a3b8;text-transform:uppercase;letter-spacing:.07em;margin-top:20px">Sell-senior tactics</h3><ul>${e.blockC_levelAndStrategy.sellSeniorPlan.map(p => `<li>${esc(p)}</li>`).join('')}</ul>` : ''}
    ${(e.blockC_levelAndStrategy?.ifDownleveledPlan || []).length ? `<h3 style="font-size:12px;color:#94a3b8;text-transform:uppercase;letter-spacing:.07em">If they downlevel you</h3><ul>${e.blockC_levelAndStrategy.ifDownleveledPlan.map(p => `<li>${esc(p)}</li>`).join('')}</ul>` : ''}

    <h2>D · Comp & Demand</h2>
    <div class="stats-grid">
      <div class="stat"><div class="stat-label">Salary Range</div><div class="stat-val">${esc(e.blockD_compAndDemand?.salaryRange || 'unknown')}</div></div>
      <div class="stat"><div class="stat-label">Demand</div><div class="stat-val">${esc(e.blockD_compAndDemand?.roleDemandTrend || 'unknown')}</div></div>
    </div>
    ${e.blockD_compAndDemand?.companyCompReputation ? `<p>${esc(e.blockD_compAndDemand.companyCompReputation)}</p>` : ''}
    ${(e.blockD_compAndDemand?.sources || []).length ? `<div class="muted">Sources: ${e.blockD_compAndDemand.sources.map(s => esc(s)).join(' · ')}</div>` : ''}

    <h2>E · CV & LinkedIn Edits</h2>
    ${cvChangesHtml || '<div class="muted">No edits suggested.</div>'}
    ${(e.blockE_personalization?.linkedinChanges || []).length ? `<h3 style="font-size:12px;color:#94a3b8;text-transform:uppercase;letter-spacing:.07em;margin-top:16px">LinkedIn</h3><ul>${e.blockE_personalization.linkedinChanges.map(c => `<li>${esc(c)}</li>`).join('')}</ul>` : ''}

    <h2>F · Interview Prep</h2>
    ${starHtml || '<div class="muted">No stories generated.</div>'}
    ${e.blockF_interviewPrep?.caseStudyRecommendation ? `<div class="tldr" style="background:#fef3c7"><strong>Case study:</strong> ${esc(e.blockF_interviewPrep.caseStudyRecommendation)}</div>` : ''}
    ${redFlagHtml ? `<h3 style="font-size:12px;color:#dc2626;text-transform:uppercase;letter-spacing:.07em;margin-top:16px">⚠ Red-flag questions</h3>${redFlagHtml}` : ''}

    <h2>G · Posting Legitimacy</h2>
    <div class="legit">
      <div class="legit-label">${esc(legit)}</div>
      <div class="legit-hint">${esc(legitHint)}</div>
    </div>
    ${signalRows ? `<table><thead><tr><th>Signal</th><th>Finding</th><th style="width:110px;text-align:center">Weight</th></tr></thead><tbody>${signalRows}</tbody></table>` : ''}
    ${e.blockG_legitimacy?.contextNotes ? `<div class="muted italic" style="margin-top:12px">${esc(e.blockG_legitimacy.contextNotes)}</div>` : ''}

    ${atsKeywords ? `<h2>ATS Keywords</h2><div>${atsKeywords}</div>` : ''}

    <div class="footer">Generated by Career Ops · santifer methodology</div>
  </div>
</body>
</html>`;
}

// ── GET /api/career/reports — list saved reports ─────────────────────────────
// Prefer the styled .html version per report; fall back to .md when HTML hasn't
// been generated yet (e.g. reports saved before HTML generation was added).
router.get('/reports', (req, res) => {
  const dir = path.join(__dirname, '..', 'data', 'reports');
  try {
    const all = fs.readdirSync(dir);
    const htmlNames = new Set(all.filter(f => f.endsWith('.html')).map(f => f.slice(0, -5)));
    const mdStems   = all.filter(f => f.endsWith('.md')).map(f => f.slice(0, -3));
    // Canonical list: one entry per stem, preferring the HTML variant.
    const stems = Array.from(new Set([...htmlNames, ...mdStems])).sort().reverse();
    const files = stems.map(stem => {
      const isHtml = htmlNames.has(stem);
      const filename = stem + (isHtml ? '.html' : '.md');
      return {
        filename,
        format: isHtml ? 'html' : 'md',
        url: `/api/career/reports/${filename}`,
      };
    });
    res.json({ reports: files });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/career/reports/:filename — serve a saved report ──────────────────
// - *.html → text/html (browser renders it as a page)
// - *.md   → text/html too (render markdown as a basic HTML page so users no
//            longer see raw markdown in the browser)
router.get('/reports/:filename', (req, res) => {
  const safe = path.basename(req.params.filename);
  const dir  = path.join(__dirname, '..', 'data', 'reports');
  const p    = path.join(dir, safe);
  if (!fs.existsSync(p)) return res.status(404).send('<h1>Report not found</h1>');

  if (safe.endsWith('.html')) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(fs.readFileSync(p, 'utf8'));
  }

  if (safe.endsWith('.md')) {
    // Auto-upgrade: if a sibling .html already exists, redirect to it.
    const htmlSibling = path.join(dir, safe.replace(/\.md$/, '.html'));
    if (fs.existsSync(htmlSibling)) return res.redirect(`/api/career/reports/${safe.replace(/\.md$/, '.html')}`);
    // Otherwise render the markdown as a simple styled HTML page on the fly.
    const md = fs.readFileSync(p, 'utf8');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(renderMarkdownAsHtml(md, safe));
  }

  res.status(400).send('<h1>Unsupported report format</h1>');
});

// Tiny, dependency-free markdown → HTML renderer. Covers the subset used in
// santifer reports: #/##/### headers, tables, bold, italic, lists, links.
function renderMarkdownAsHtml(md, filename) {
  const esc = s => s.replace(/[<>&]/g, c => ({ '<':'&lt;', '>':'&gt;', '&':'&amp;' }[c]));
  const lines = md.split(/\r?\n/);
  const out = [];
  let inTable = false, inList = false;

  function closeList() { if (inList) { out.push('</ul>'); inList = false; } }
  function closeTable() { if (inTable) { out.push('</tbody></table>'); inTable = false; } }
  function inlineFmt(s) {
    return esc(s)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Table row (header row followed by separator row `|---|---|`)
    if (/^\|.+\|$/.test(line) && /^\|[\s\-:|]+\|$/.test(lines[i + 1] || '')) {
      closeList();
      const cells = line.split('|').slice(1, -1).map(c => `<th>${inlineFmt(c.trim())}</th>`).join('');
      out.push(`<table><thead><tr>${cells}</tr></thead><tbody>`);
      inTable = true;
      i++; // skip separator
      continue;
    }
    if (inTable && /^\|.+\|$/.test(line)) {
      const cells = line.split('|').slice(1, -1).map(c => `<td>${inlineFmt(c.trim())}</td>`).join('');
      out.push(`<tr>${cells}</tr>`);
      continue;
    } else if (inTable) { closeTable(); }

    if (/^#{1,6}\s/.test(line)) {
      closeList();
      const level = line.match(/^#+/)[0].length;
      out.push(`<h${level}>${inlineFmt(line.replace(/^#+\s*/, ''))}</h${level}>`);
      continue;
    }
    if (/^-\s+/.test(line)) {
      if (!inList) { out.push('<ul>'); inList = true; }
      out.push(`<li>${inlineFmt(line.replace(/^-\s+/, ''))}</li>`);
      continue;
    }
    closeList();
    if (line.trim() === '---') { out.push('<hr>'); continue; }
    if (line.trim() === '')    { out.push(''); continue; }
    out.push(`<p>${inlineFmt(line)}</p>`);
  }
  closeList(); closeTable();

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${esc(filename)}</title>
<style>
  body { font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; max-width:820px; margin:0 auto; padding:36px 24px; line-height:1.6; color:#0f172a; background:#f8fafc }
  h1,h2,h3 { color:#0f172a }
  h1 { border-bottom:2px solid #e2e8f0; padding-bottom:10px }
  h2 { border-bottom:1px solid #e2e8f0; padding-bottom:6px; margin-top:32px }
  table { border-collapse:collapse; width:100%; font-size:14px; margin:12px 0 }
  th,td { border:1px solid #e2e8f0; padding:8px 10px; text-align:left; vertical-align:top }
  th { background:#f1f5f9; font-size:11px; text-transform:uppercase; letter-spacing:.06em; color:#475569 }
  hr { border:none; border-top:1px solid #e2e8f0; margin:24px 0 }
  a { color:#4f46e5 }
  p { margin:8px 0 }
  ul { padding-left:22px }
  li { margin:4px 0 }
  @media print { body { background:#fff } }
</style>
</head><body>${out.join('\n')}</body></html>`;
}

export default router;

