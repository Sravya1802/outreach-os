import express from 'express';
import cors from 'cors';
import { config } from 'dotenv';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';
import cron from 'node-cron';
import logger from './logger.js';
import { validateConfig } from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, '..', '.env') });
validateConfig();

import companiesRouter  from './routes/companies.js';
import contactsRouter   from './routes/contacts.js';
import emailsRouter     from './routes/emails.js';
import generateRouter   from './routes/generate.js';
import prospectsRouter  from './routes/prospects.js';
import db, { one, all, run, pingDb } from './db.js';
import jobsRouter from './routes/jobs.js';
import { runReclassifyUnclassified } from './routes/jobs.js';
import internRolesRouter from './routes/internRoles.js';
import unifiedRouter    from './routes/unified.js';
import creditsRouter    from './routes/credits.js';
import importSheetRouter from './routes/importSheet.js';
import careerOpsRouter   from './routes/careerOps.js';
import automationsRouter  from './routes/automations.js';
import ycRouter           from './routes/yc.js';
import { scrapeAllSources } from './services/scraper.js';
import { importStartupSheet } from './services/startupSheet.js';
import { checkAllCredits }   from './services/creditChecker.js';

const app = express();

// ── CORS — allow local dev + configured production frontend origin(s) ──────
// Single origin: set FRONTEND_ORIGIN=https://outreach-jt.vercel.app
// Multiple origins (e.g. preview URLs): set CORS_ORIGINS="https://a.vercel.app,https://b.vercel.app"
const DEFAULT_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173'];
const envOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN;
const CORS_ORIGINS = [...new Set([
  ...DEFAULT_ORIGINS,
  ...envOrigins,
  ...(FRONTEND_ORIGIN ? [FRONTEND_ORIGIN] : []),
])];
app.use(cors({ origin: CORS_ORIGINS, credentials: true }));
app.use(express.json({ limit: '10mb' }));

app.use('/api', rateLimit({ windowMs: 60_000, max: 200, standardHeaders: true, legacyHeaders: false }));

app.use('/api/companies',  companiesRouter);
app.use('/api/contacts',   contactsRouter);
app.use('/api/emails',     emailsRouter);
app.use('/api/generate',   generateRouter);
app.use('/api/prospects',  prospectsRouter);
app.use('/api/jobs',       jobsRouter);
app.use('/api/jobs',       internRolesRouter);
app.use('/api/unified',    unifiedRouter);
app.use('/api/credits',    creditsRouter);
app.use('/api/jobs',       importSheetRouter);
app.use('/api/career',    careerOpsRouter);
app.use('/api/automations', automationsRouter);
app.use('/api/yc',         ycRouter);

// ── Manual refresh endpoint (SSE) ────────────────────────────────────────────
app.post('/api/jobs/refresh-all', async (req, res) => {
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
    emit('progress', { message: 'Starting full refresh...' });
    await runDailyRefresh(msg => emit('progress', { message: msg }));
    emit('complete', { message: 'Refresh complete!' });
    if (!closed) res.end();
  } catch (err) {
    emit('error', { error: err.message });
    if (!closed) res.end();
  }
});

// ── Last refresh time endpoint ────────────────────────────────────────────────
app.get('/api/jobs/last-refresh', async (req, res) => {
  try {
    const row = await one("SELECT value FROM meta WHERE key = 'lastRefresh'");
    res.json({ lastRefresh: row?.value || null });
  } catch (err) {
    res.json({ lastRefresh: null });
  }
});

// ── Stats endpoint ────────────────────────────────────────────────────────────
app.get('/api/stats', async (req, res) => {
  try {
    const [
      c1, c2, c3, c4, c5, c6, c7,
    ] = await Promise.all([
      one("SELECT COUNT(*)::int AS n FROM jobs"),
      one("SELECT COUNT(*)::int AS n FROM job_contacts WHERE email IS NOT NULL AND email != ''"),
      one("SELECT COUNT(*)::int AS n FROM job_contacts WHERE linkedin_url IS NOT NULL AND linkedin_url != ''"),
      one("SELECT COUNT(*)::int AS n FROM outreach WHERE status = 'sent'"),
      one("SELECT COUNT(*)::int AS n FROM outreach WHERE status = 'replied'"),
      one("SELECT COUNT(DISTINCT source)::int AS n FROM jobs WHERE source IS NOT NULL AND source != ''"),
      one("SELECT COUNT(*)::int AS n FROM jobs WHERE yc_batch IS NOT NULL AND yc_batch != ''"),
    ]);
    let totalApplications = 0;
    try {
      const r = await one("SELECT COUNT(*)::int AS n FROM company_applications WHERE status != 'interested'");
      totalApplications = r?.n || 0;
    } catch (_) {}
    const totalSent = c4?.n || 0;
    const totalReplied = c5?.n || 0;
    res.json({
      totalCompanies: c1?.n || 0,
      totalContacts: c2?.n || 0,
      totalLinkedInContacts: c3?.n || 0,
      totalSent,
      responseRate: totalSent > 0 ? Math.round((totalReplied / totalSent) * 100) : 0,
      activeSources: c6?.n || 0,
      ycImported: c7?.n || 0,
      totalApplications,
    });
  } catch (err) {
    console.error('[stats]', err);
    res.json({ totalCompanies: 0, totalContacts: 0, totalSent: 0, responseRate: 0, activeSources: 0 });
  }
});

// ── Job Dashboard aggregate metrics ───────────────────────────────────────────
app.get('/api/dashboard/job-metrics', async (req, res) => {
  try {
    const [
      totalCompaniesR, totalEvaluationsR, totalContactsR,
      contactsWithEmailR, contactsWithLinkedInR,
      outreachGeneratedR, outreachSentR, outreachRepliedR,
      funnelEvaluatedR, funnelAppliedR, funnelSubmittedR, funnelRespondedR,
      funnelInterviewR, funnelOfferR, funnelRejectedR,
      modeManualR, modeAutoR,
      gradeDistRows, topOutreachCompanies, recentEvals, recentApplied,
    ] = await Promise.all([
      one("SELECT COUNT(*)::int AS n FROM jobs"),
      one("SELECT COUNT(*)::int AS n FROM evaluations"),
      one("SELECT COUNT(*)::int AS n FROM job_contacts"),
      one("SELECT COUNT(*)::int AS n FROM job_contacts WHERE email IS NOT NULL AND email != ''"),
      one("SELECT COUNT(*)::int AS n FROM job_contacts WHERE linkedin_url IS NOT NULL AND linkedin_url != ''"),
      one("SELECT COUNT(*)::int AS n FROM job_contacts WHERE generated_subject IS NOT NULL OR generated_dm IS NOT NULL"),
      one("SELECT COUNT(*)::int AS n FROM job_contacts WHERE status IN ('sent','dm_sent','email_sent')"),
      one("SELECT COUNT(*)::int AS n FROM job_contacts WHERE status = 'replied'"),
      one("SELECT COUNT(*)::int AS n FROM evaluations WHERE apply_status IS NULL OR apply_status = 'not_started'"),
      one("SELECT COUNT(*)::int AS n FROM evaluations WHERE apply_status IN ('opened','queued','submitted')"),
      one("SELECT COUNT(*)::int AS n FROM evaluations WHERE apply_status = 'submitted'"),
      one("SELECT COUNT(*)::int AS n FROM evaluations WHERE apply_status = 'responded'"),
      one("SELECT COUNT(*)::int AS n FROM evaluations WHERE apply_status = 'interview'"),
      one("SELECT COUNT(*)::int AS n FROM evaluations WHERE apply_status = 'offer'"),
      one("SELECT COUNT(*)::int AS n FROM evaluations WHERE apply_status = 'rejected'"),
      one("SELECT COUNT(*)::int AS n FROM evaluations WHERE apply_mode = 'manual' AND apply_status IS NOT NULL AND apply_status != 'not_started'"),
      one("SELECT COUNT(*)::int AS n FROM evaluations WHERE apply_mode = 'auto'   AND apply_status IS NOT NULL AND apply_status != 'not_started'"),
      all("SELECT grade, COUNT(*)::int AS n FROM evaluations WHERE grade IS NOT NULL GROUP BY grade"),
      all(`
        SELECT j.name, j.category,
               COUNT(jc.id)::int AS contact_count,
               SUM(CASE WHEN jc.email IS NOT NULL AND jc.email != '' THEN 1 ELSE 0 END)::int AS email_count,
               SUM(CASE WHEN jc.status IN ('sent','dm_sent','email_sent') THEN 1 ELSE 0 END)::int AS sent_count,
               SUM(CASE WHEN jc.status = 'replied' THEN 1 ELSE 0 END)::int AS replied_count
        FROM jobs j LEFT JOIN job_contacts jc ON jc.job_id = j.id
        GROUP BY j.id, j.name, j.category
        HAVING COUNT(jc.id) > 0
        ORDER BY contact_count DESC LIMIT 10
      `),
      all(`
        SELECT 'evaluation' AS kind, id, company_name, job_title, grade, created_at
        FROM evaluations ORDER BY created_at DESC LIMIT 10
      `),
      all(`
        SELECT 'applied' AS kind, id, company_name, job_title, apply_status, applied_at
        FROM evaluations WHERE applied_at IS NOT NULL ORDER BY applied_at DESC LIMIT 10
      `),
    ]);

    const appFunnel = {
      evaluated: funnelEvaluatedR?.n || 0,
      applied:   funnelAppliedR?.n || 0,
      submitted: funnelSubmittedR?.n || 0,
      responded: funnelRespondedR?.n || 0,
      interview: funnelInterviewR?.n || 0,
      offer:     funnelOfferR?.n || 0,
      rejected:  funnelRejectedR?.n || 0,
    };
    const applyModes = {
      manual: modeManualR?.n || 0,
      auto:   modeAutoR?.n || 0,
    };
    const gradeDist = (gradeDistRows || []).reduce(
      (acc, r) => { acc[r.grade] = r.n; return acc; },
      { A: 0, B: 0, C: 0, D: 0, F: 0 }
    );

    const outreachSent = outreachSentR?.n || 0;
    const outreachReplied = outreachRepliedR?.n || 0;
    const totalEvaluations = totalEvaluationsR?.n || 0;
    const responseRate = outreachSent > 0 ? Math.round((outreachReplied / outreachSent) * 100) : 0;
    const applyRate    = totalEvaluations > 0 ? Math.round((appFunnel.applied / totalEvaluations) * 100) : 0;

    res.json({
      summary: {
        totalCompanies: totalCompaniesR?.n || 0,
        totalEvaluations,
        totalContacts: totalContactsR?.n || 0,
        contactsWithEmail: contactsWithEmailR?.n || 0,
        contactsWithLinkedIn: contactsWithLinkedInR?.n || 0,
        outreachGenerated: outreachGeneratedR?.n || 0,
        outreachSent,
        outreachReplied,
        responseRate,
        applyRate,
      },
      applyFunnel: appFunnel,
      applyModes,
      gradeDist,
      topOutreachCompanies,
      recentEvals,
      recentApplied,
    });
  } catch (err) {
    console.error('[job-metrics]', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Activity feed endpoint ────────────────────────────────────────────────────
app.get('/api/activity', async (req, res) => {
  try {
    const rows = await all('SELECT * FROM activity_log ORDER BY created_at DESC LIMIT 10');
    res.json({ activity: rows });
  } catch (err) {
    res.json({ activity: [] });
  }
});

app.get('/api/health', (req, res) => {
  res.json({
    status:       'ok',
    ai_provider:  process.env.AI_PROVIDER || 'gemini',
    has_gemini:   !!process.env.GEMINI_API_KEY   && process.env.GEMINI_API_KEY   !== 'your_gemini_key_here',
    has_openai:   !!process.env.OPENAI_API_KEY,
    has_apify:    !!process.env.APIFY_API_TOKEN  && process.env.APIFY_API_TOKEN  !== 'your_apify_token_here',
    has_apollo:   !!process.env.APOLLO_API_KEY   && process.env.APOLLO_API_KEY   !== 'your_apollo_key_here',
    has_serper:   !!process.env.SERPER_API_KEY,
    has_hunter:   !!process.env.HUNTER_API_KEY,
    has_prospeo:  !!process.env.PROSPEO_API_KEY,
    has_linkedin: !!process.env.LINKEDIN_SESSION_COOKIE && process.env.LINKEDIN_SESSION_COOKIE !== 'your_li_at_cookie_here',
  });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({ error: err.message });
});

// ── Daily refresh logic ───────────────────────────────────────────────────────
async function runDailyRefresh(onProgress = null) {
  function log(msg) {
    console.log('[DailyRefresh]', msg);
    if (onProgress) onProgress(msg);
  }

  log('Daily refresh starting — ' + new Date().toISOString());

  // 1. Re-scrape previously-scraped subcategories
  try {
    const subs = await all(`
      SELECT category, subcategory, COUNT(*)::int AS count
      FROM jobs
      WHERE source NOT IN ('startup_sheet') AND subcategory IS NOT NULL
      GROUP BY category, subcategory
      HAVING COUNT(*) > 2
      LIMIT 20
    `);

    log(`Refreshing ${subs.length} subcategories...`);
    for (const sub of subs) {
      try {
        log(`Scraping: ${sub.category} > ${sub.subcategory}`);
        await scrapeAllSources(sub.subcategory, sub.category);
        await new Promise(r => setTimeout(r, 2000));
      } catch (err) {
        log(`Failed: ${sub.subcategory} — ${err.message}`);
      }
    }
  } catch (err) {
    log('Subcategory refresh failed: ' + err.message);
  }

  // 2. Re-import startup sheet
  if (process.env.STARTUP_SHEET_URL) {
    try {
      log('Refreshing startup sheet...');
      await importStartupSheet(msg => log(msg));
    } catch (err) {
      log('Startup sheet refresh failed: ' + err.message);
    }
  }

  // 3. Reclassify unclassified companies
  try {
    log('Reclassifying unclassified companies...');
    await runReclassifyUnclassified();
  } catch (err) {
    log('Reclassify failed: ' + err.message);
  }

  // 4. Refresh credit status cache
  try {
    await checkAllCredits(true);
    log('Credit status refreshed');
  } catch (err) {
    log('Credit check failed: ' + err.message);
  }

  // 5. Record last refresh time (upsert)
  await run(
    "INSERT INTO meta (key, value) VALUES ('lastRefresh', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
    [new Date().toISOString()],
  );
  log('Daily refresh complete — ' + new Date().toISOString());
}

// ── Cron: run every day at 6 AM UTC ──────────────────────────────────────────
cron.schedule('0 6 * * *', () => {
  runDailyRefresh().catch(err => console.error('[Cron] Daily refresh FAILED:', err.message));
});

// ── DB wipe on start (one-shot, auto-disables itself) ────────────────────────
async function maybeWipeDb() {
  if (process.env.WIPE_DB_ON_START !== 'true') return;
  try {
    await run('DELETE FROM job_contacts');
    await run('DELETE FROM jobs');
    await run('DELETE FROM prospects');
    await run('DELETE FROM contacts');
    await run('DELETE FROM outreach');
    await run('DELETE FROM companies');
    await run('DELETE FROM meta');
    console.log('[WIPE_DB] All tables wiped.');
    // Flip the flag to false so it never runs again on next restart
    const envPath = path.join(__dirname, '..', '.env');
    const fs = await import('fs');
    const content = fs.default.readFileSync(envPath, 'utf8');
    fs.default.writeFileSync(envPath, content.replace(/^WIPE_DB_ON_START=true/m, 'WIPE_DB_ON_START=false'));
    console.log('[WIPE_DB] Flag auto-disabled in .env');
  } catch (err) {
    console.error('[WIPE_DB] Failed:', err.message);
  }
}

const PORT = process.env.PORT || 3001;

async function startup() {
  await pingDb();
  await maybeWipeDb();

  app.listen(PORT, () => {
    console.log(`Backend on port ${PORT}`);
    if (process.env.WIPE_DB_ON_START !== 'true') {
      // Auto-reclassify unclassified companies in the background on startup
      (async () => {
        try {
          const r = await one("SELECT COUNT(*)::int AS n FROM jobs WHERE category = 'Unclassified' OR category IS NULL OR confidence < 0.40");
          if ((r?.n || 0) > 0) {
            console.log(`[startup] ${r.n} unclassified/low-confidence companies — starting background reclassification...`);
            runReclassifyUnclassified().catch(err => console.error('[startup reclassify]', err.message));
          }
        } catch (err) { console.error('[startup check]', err.message); }
      })();
    }
  });
}

startup().catch(err => {
  console.error('[startup] FATAL:', err);
  process.exit(1);
});
