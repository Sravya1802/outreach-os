/**
 * autoApplier.js
 *
 * Playwright-based auto-apply worker. Reads the queue (evaluations with
 * apply_mode='auto' and apply_status='queued'), opens each job URL in a
 * headless browser, fills the form with the user's profile + picked resume,
 * and submits.
 *
 * Per user spec:
 *   - Skip captcha / login pages — leave status='in_progress' (revisit later)
 *   - Never retry a failed submit automatically (mark error, user reviews)
 *   - Uses the resume mapped to the job's role archetype via resumeRegistry
 *
 * Supported platforms today: greenhouse, lever, ashby (the 3 ATS that expose
 * structured, predictable forms). Workday/LinkedIn/custom are marked as
 * 'platform_unsupported' so the user can apply manually.
 *
 * TODO(auth): caller passes userId — every exported function takes userId as
 * the first argument. `runQueueOnce` receives userId in its options bag and
 * threads it to processOneEvaluation.
 */

import path from 'path';
import fs from 'fs';
import db, { one, all, run } from '../db.js';
import { scanResumes, pickResumeForRole, detectPlatform } from './resumeRegistry.js';
import { tailorResume, generateResumePDF } from './resumeGenerator.js';

// Status values we write back to evaluations.apply_status during processing.
const STATUS = {
  queued:        'queued',
  in_progress:   'in_progress',
  submitted:     'submitted',
  captcha:       'captcha_needed',
  login:         'login_needed',
  unsupported:   'platform_unsupported',
  failed:        'submit_failed',
};

// ── Helpers ──────────────────────────────────────────────────────────────────

async function getProfile(userId) {
  return (await one(
    'SELECT * FROM user_profile WHERE user_id = $1',
    [userId]
  )) || {};
}

async function setStatus(userId, evalId, status, { error = null, platform, resumeUsed, incrementAttempts = false } = {}) {
  const parts = [];
  const args  = [];
  let idx = 1;
  parts.push(`apply_status = $${idx++}`);             args.push(status);
  if (error !== null)   { parts.push(`apply_error = $${idx++}`);        args.push(error ? String(error).slice(0, 500) : null); }
  if (platform)         { parts.push(`apply_platform = $${idx++}`);     args.push(platform); }
  if (resumeUsed)       { parts.push(`apply_resume_used = $${idx++}`);  args.push(resumeUsed); }
  if (status === STATUS.submitted) { parts.push('applied_at = NOW()'); }
  if (incrementAttempts) { parts.push('apply_attempts = COALESCE(apply_attempts, 0) + 1'); }
  args.push(evalId);
  args.push(userId);
  await run(
    `UPDATE evaluations SET ${parts.join(', ')} WHERE id = $${idx} AND user_id = $${idx + 1}`,
    args
  );
}

// Safe wrapper around page.fill — ignores missing selectors, treats failures as skipped.
async function tryFill(page, selector, value) {
  if (value == null || value === '') return false;
  try {
    const loc = page.locator(selector).first();
    if (await loc.count() === 0) return false;
    await loc.waitFor({ state: 'visible', timeout: 2000 });
    await loc.fill(String(value));
    return true;
  } catch (_) { return false; }
}

async function tryClick(page, selector) {
  try {
    const loc = page.locator(selector).first();
    if (await loc.count() === 0) return false;
    await loc.waitFor({ state: 'visible', timeout: 2000 });
    await loc.click();
    return true;
  } catch (_) { return false; }
}

async function setFileInput(page, selector, filePath) {
  try {
    const loc = page.locator(selector).first();
    if (await loc.count() === 0) return false;
    await loc.setInputFiles(filePath);
    return true;
  } catch (_) { return false; }
}

// Does the page contain a captcha widget? Google reCAPTCHA + hCaptcha.
async function hasCaptcha(page) {
  try {
    const hit = await page.locator('iframe[src*="recaptcha"], iframe[src*="hcaptcha"], .g-recaptcha, [data-sitekey]').count();
    return hit > 0;
  } catch (_) { return false; }
}

// Does the page require a login? (sign-in form visible, no apply form yet)
async function looksLikeLogin(page) {
  try {
    const text = (await page.content()).toLowerCase();
    return /sign in|log in|password/.test(text) && !/apply for this job|submit application/.test(text);
  } catch (_) { return false; }
}

// ── Platform: Greenhouse ──────────────────────────────────────────────────────
// Greenhouse ATS forms are the cleanest: standard field names (first_name,
// last_name, email, phone) and a resume file input.

async function fillGreenhouse(page, profile, resumePath) {
  await tryFill(page, 'input#first_name, input[name="first_name"], input[autocomplete="given-name"]', profile.first_name);
  await tryFill(page, 'input#last_name,  input[name="last_name"],  input[autocomplete="family-name"]', profile.last_name);
  await tryFill(page, 'input#email,      input[name="email"],      input[autocomplete="email"]',      profile.email);
  await tryFill(page, 'input#phone,      input[name="phone"],      input[autocomplete="tel"]',        profile.phone);
  // LinkedIn / portfolio
  await tryFill(page, 'input[name*="linkedin"], input[name*="urls[LinkedIn]"]', profile.linkedin_url);
  await tryFill(page, 'input[name*="github"],   input[name*="urls[Github]"],   input[name*="urls[GitHub]"]', profile.github_url);
  await tryFill(page, 'input[name*="portfolio"], input[name*="urls[Portfolio]"], input[name*="urls[Website]"]', profile.portfolio_url);
  await tryFill(page, 'input[name*="location"], input[autocomplete*="address"]', profile.location);

  // Resume upload — Greenhouse uses a hidden file input under a styled "Attach resume" button.
  if (resumePath) {
    await setFileInput(page, 'input[type="file"][id*="resume"], input[type="file"][name*="resume"], input[type="file"]', resumePath);
  }

  // Work authorization questions (common in Greenhouse custom fields) — best-effort.
  // Questions typically appear as <select> or radio groups. We skip answers we can't
  // confidently fill (the user can finish them manually if the form rejects).

  // Submit
  await page.waitForTimeout(800);
  const submitted = await tryClick(page, 'button[type="submit"], input[type="submit"], button:has-text("Submit Application")');
  return submitted;
}

// ── Platform: Lever ──────────────────────────────────────────────────────────
async function fillLever(page, profile, resumePath) {
  await tryFill(page, 'input[name="name"], input#name', `${profile.first_name || ''} ${profile.last_name || ''}`.trim());
  await tryFill(page, 'input[name="email"], input#email', profile.email);
  await tryFill(page, 'input[name="phone"], input#phone', profile.phone);
  await tryFill(page, 'input[name="urls[LinkedIn]"], input[name*="linkedin"]', profile.linkedin_url);
  await tryFill(page, 'input[name="urls[GitHub]"],   input[name*="github"]',   profile.github_url);
  await tryFill(page, 'input[name="urls[Portfolio]"], input[name*="portfolio"]', profile.portfolio_url);
  await tryFill(page, 'input[name="location"], input[name*="location"]', profile.location);

  if (resumePath) {
    await setFileInput(page, 'input[type="file"][name*="resume"], input[type="file"]', resumePath);
  }

  await page.waitForTimeout(800);
  return await tryClick(page, 'button[type="submit"], .template-btn-submit, button:has-text("Submit application")');
}

// ── Platform: Ashby ──────────────────────────────────────────────────────────
async function fillAshby(page, profile, resumePath) {
  await tryFill(page, 'input[name="name"], input[id*="_name_"][id*="_firstName"]', `${profile.first_name || ''} ${profile.last_name || ''}`.trim());
  await tryFill(page, 'input[type="email"]', profile.email);
  await tryFill(page, 'input[type="tel"]',   profile.phone);
  await tryFill(page, 'input[id*="linkedin"], input[name*="linkedin"]', profile.linkedin_url);
  await tryFill(page, 'input[id*="github"],   input[name*="github"]',   profile.github_url);

  if (resumePath) {
    await setFileInput(page, 'input[type="file"]', resumePath);
  }

  await page.waitForTimeout(800);
  return await tryClick(page, 'button[type="submit"], button:has-text("Submit Application"), button:has-text("Submit")');
}

// ── Main: apply to a single evaluation ───────────────────────────────────────

export async function processOneEvaluation(userId, evalId, { headless = true, dryRun = false } = {}) {
  if (!userId) return { ok: false, error: 'Missing userId — auto-apply requires an authenticated caller' };
  const row = await one(
    'SELECT * FROM evaluations WHERE id = $1 AND user_id = $2',
    [evalId, userId]
  );
  if (!row) return { ok: false, error: 'Evaluation not found' };
  if (!row.job_url) {
    await setStatus(userId, evalId, STATUS.failed, { error: 'No job URL', incrementAttempts: true });
    return { ok: false, error: 'No job URL to apply to' };
  }

  const platform = detectPlatform(row.job_url);
  const profile  = await getProfile(userId);

  // Validate profile completeness before attempting auto-apply
  if (!profile.first_name || !profile.last_name || !profile.email || !profile.phone) {
    await setStatus(userId, evalId, STATUS.failed, { error: 'Profile incomplete — fill in first name, last name, email, and phone before auto-apply', platform, incrementAttempts: true });
    return { ok: false, error: 'Profile incomplete' };
  }

  // Resume selection — prefer the tailored PDF generated by Career Ops.
  // Only fall back to the common-resumes folder when no tailored PDF exists
  // or the file on disk has gone missing.
  let resume = null;

  if (row.pdf_path && fs.existsSync(row.pdf_path)) {
    resume = { filename: path.basename(row.pdf_path), absPath: row.pdf_path, source: 'tailored' };
    console.log(`[autoApply] using tailored resume for eval ${evalId}: ${resume.filename}`);
  } else if (row.job_description) {
    // No tailored PDF yet — generate one on the fly so auto-apply always submits
    // a role-personalized CV instead of a generic one.
    try {
      const resumeRow = await one(
        "SELECT value FROM meta WHERE key = 'user_resume_text' AND user_id = $1",
        [userId]
      );
      const resumeText = resumeRow?.value;
      if (resumeText) {
        console.log(`[autoApply] generating tailored resume for eval ${evalId}…`);
        const tailored = await tailorResume(resumeText, row.job_description, row.job_title, row.company_name);
        const { pdfPath } = await generateResumePDF(tailored, row.company_name, row.job_title, 'Sravya Rachakonda');
        await run(
          'UPDATE evaluations SET pdf_path = $1 WHERE id = $2 AND user_id = $3',
          [pdfPath, evalId, userId]
        );
        resume = { filename: path.basename(pdfPath), absPath: pdfPath, source: 'tailored-justnow' };
      }
    } catch (err) {
      console.warn(`[autoApply] tailored generation failed (${err.message}) — falling back to common resume`);
    }
  }

  if (!resume) {
    const resumes = scanResumes(profile.resume_dir);
    resume = pickResumeForRole(resumes, {
      jobTitle:       row.job_title,
      jobDescription: row.job_description || '',
      archetypeHint:  (row.report_json ? JSON.parse(row.report_json)?.archetype?.primary : '') || '',
    });
    if (resume) console.log(`[autoApply] fallback to common resume "${resume.filename}" for eval ${evalId}`);
  }

  if (!resume) {
    await setStatus(userId, evalId, STATUS.failed, { error: `No resume available (no tailored PDF and nothing in ${profile.resume_dir})`, platform, incrementAttempts: true });
    return { ok: false, error: 'No resume found' };
  }

  const supported = ['greenhouse', 'lever', 'ashby'];
  if (!supported.includes(platform)) {
    await setStatus(userId, evalId, STATUS.unsupported, { error: `Platform "${platform}" not yet supported for auto-apply — please apply manually`, platform, incrementAttempts: true });
    return { ok: false, platform, error: 'Platform not supported' };
  }

  await setStatus(userId, evalId, STATUS.in_progress, { platform, resumeUsed: resume.filename, incrementAttempts: true });

  // Lazy import so Playwright isn't loaded for non-auto-apply requests
  const { chromium } = await import('playwright');
  let browser;
  try {
    browser = await chromium.launch({ headless });
    const ctx  = await browser.newContext();
    const page = await ctx.newPage();

    await page.goto(row.job_url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);

    // Some Greenhouse/Lever job pages have a separate "Apply" CTA on the JD page
    // that expands or navigates to the form. Try clicking it first.
    await tryClick(page, 'a#apply_button, a.postings-btn, a:has-text("Apply for this job"), button:has-text("Apply")');
    await page.waitForTimeout(1500);

    if (await hasCaptcha(page)) {
      await setStatus(userId, evalId, STATUS.captcha, { error: 'Captcha detected — leaving in progress for manual completion', platform });
      return { ok: false, platform, error: 'Captcha present' };
    }
    if (await looksLikeLogin(page)) {
      await setStatus(userId, evalId, STATUS.login, { error: 'Login required — leaving in progress for manual completion', platform });
      return { ok: false, platform, error: 'Login required' };
    }

    if (dryRun) {
      await setStatus(userId, evalId, STATUS.in_progress, { error: '(dry run) form-fill skipped', platform });
      return { ok: true, platform, dryRun: true };
    }

    let submitted = false;
    if (platform === 'greenhouse') submitted = await fillGreenhouse(page, profile, resume.absPath);
    else if (platform === 'lever') submitted = await fillLever(page, profile, resume.absPath);
    else if (platform === 'ashby') submitted = await fillAshby(page, profile, resume.absPath);

    await page.waitForTimeout(2500);

    // Heuristic confirmation — the page either navigates to a thank-you URL
    // or renders a success message.
    const url  = page.url();
    const body = (await page.content()).toLowerCase();
    const looksSubmitted = submitted && (
         url.includes('thank')
      || url.includes('success')
      || url.includes('confirmation')
      || /application.*(received|submitted|complete)/i.test(body)
      || /thanks for applying|thank you for applying/i.test(body)
    );

    if (looksSubmitted) {
      await setStatus(userId, evalId, STATUS.submitted, { platform, resumeUsed: resume.filename });
      return { ok: true, platform, resume: resume.filename };
    }
    // Not obviously confirmed — mark as in_progress with note, so user can verify.
    await setStatus(userId, evalId, STATUS.in_progress, { error: 'Submitted button clicked but confirmation unclear — verify manually', platform });
    return { ok: false, platform, error: 'Submission unconfirmed' };
  } catch (err) {
    await setStatus(userId, evalId, STATUS.failed, { error: err.message, platform });
    return { ok: false, platform, error: err.message };
  } finally {
    if (browser) { try { await browser.close(); } catch (_) {} }
  }
}

/**
 * Pull all queued evaluations and process them sequentially.
 * Returns a summary { processed, submitted, failed, skipped }.
 *
 * `userId` is required — caller (routes/careerOps.js) passes req.user.id via
 * the options bag.
 */
export async function runQueueOnce({ headless = true, dryRun = false, limit = 10, userId } = {}) {
  if (!userId) throw new Error('runQueueOnce requires userId');
  const rows = await all(`
    SELECT id FROM evaluations
    WHERE apply_mode = 'auto'
      AND apply_status = 'queued'
      AND user_id = $1
    ORDER BY created_at ASC
    LIMIT $2
  `, [userId, limit]);

  const summary = { processed: 0, submitted: 0, failed: 0, skipped: 0, results: [] };
  for (const { id } of rows) {
    const r = await processOneEvaluation(userId, id, { headless, dryRun });
    summary.processed++;
    if (r.ok) summary.submitted++;
    else if (r.error === 'Captcha present' || r.error === 'Login required' || r.error === 'Platform not supported') summary.skipped++;
    else summary.failed++;
    summary.results.push({ evalId: id, ...r });
  }
  return summary;
}
