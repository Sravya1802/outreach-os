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
import db from './db.js';
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

app.use(cors({ origin: ['http://localhost:5173', 'http://127.0.0.1:5173'] }));
app.use(express.json());

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
app.get('/api/jobs/last-refresh', (req, res) => {
  try {
    const row = db.prepare("SELECT value FROM meta WHERE key = 'lastRefresh'").get();
    res.json({ lastRefresh: row?.value || null });
  } catch (err) {
    res.json({ lastRefresh: null });
  }
});

// ── Stats endpoint ────────────────────────────────────────────────────────────
app.get('/api/stats', (req, res) => {
  try {
    const totalCompanies    = db.prepare("SELECT COUNT(*) as n FROM jobs").get().n;
    const totalContacts     = db.prepare("SELECT COUNT(*) as n FROM job_contacts WHERE email IS NOT NULL AND email != ''").get().n;
    const totalLinkedInContacts = db.prepare("SELECT COUNT(*) as n FROM job_contacts WHERE linkedin_url IS NOT NULL AND linkedin_url != ''").get().n;
    const totalSent         = db.prepare("SELECT COUNT(*) as n FROM outreach WHERE status = 'sent'").get().n;
    const totalReplied      = db.prepare("SELECT COUNT(*) as n FROM outreach WHERE status = 'replied'").get().n;
    const activeSources     = db.prepare("SELECT COUNT(DISTINCT source) as n FROM jobs WHERE source IS NOT NULL AND source != ''").get().n;
    const ycImported        = db.prepare("SELECT COUNT(*) as n FROM jobs WHERE yc_batch IS NOT NULL AND yc_batch != ''").get().n;
    let totalApplications   = 0;
    try { totalApplications = db.prepare("SELECT COUNT(*) as n FROM company_applications WHERE status != 'interested'").get().n; } catch (_) {}
    res.json({
      totalCompanies,
      totalContacts,
      totalLinkedInContacts,
      totalSent,
      responseRate: totalSent > 0 ? Math.round((totalReplied / totalSent) * 100) : 0,
      activeSources,
      ycImported,
      totalApplications,
    });
  } catch (err) {
    res.json({ totalCompanies: 0, totalContacts: 0, totalSent: 0, responseRate: 0, activeSources: 0 });
  }
});

// ── Job Dashboard aggregate metrics ───────────────────────────────────────────
app.get('/api/dashboard/job-metrics', (req, res) => {
  try {
    const totalCompanies      = db.prepare("SELECT COUNT(*) AS n FROM jobs").get().n;
    const totalEvaluations    = db.prepare("SELECT COUNT(*) AS n FROM evaluations").get().n;
    const totalContacts       = db.prepare("SELECT COUNT(*) AS n FROM job_contacts").get().n;
    const contactsWithEmail   = db.prepare("SELECT COUNT(*) AS n FROM job_contacts WHERE email IS NOT NULL AND email != ''").get().n;
    const contactsWithLinkedIn= db.prepare("SELECT COUNT(*) AS n FROM job_contacts WHERE linkedin_url IS NOT NULL AND linkedin_url != ''").get().n;
    const outreachGenerated   = db.prepare("SELECT COUNT(*) AS n FROM job_contacts WHERE generated_subject IS NOT NULL OR generated_dm IS NOT NULL").get().n;
    const outreachSent        = db.prepare("SELECT COUNT(*) AS n FROM job_contacts WHERE status IN ('sent','dm_sent','email_sent')").get().n;
    const outreachReplied     = db.prepare("SELECT COUNT(*) AS n FROM job_contacts WHERE status = 'replied'").get().n;

    // Apply funnel breakdown from evaluations.apply_status
    const appFunnel = {
      evaluated:  db.prepare("SELECT COUNT(*) AS n FROM evaluations WHERE apply_status IS NULL OR apply_status = 'not_started'").get().n,
      applied:    db.prepare("SELECT COUNT(*) AS n FROM evaluations WHERE apply_status IN ('opened','queued','submitted')").get().n,
      submitted:  db.prepare("SELECT COUNT(*) AS n FROM evaluations WHERE apply_status = 'submitted'").get().n,
      responded:  db.prepare("SELECT COUNT(*) AS n FROM evaluations WHERE apply_status = 'responded'").get().n,
      interview:  db.prepare("SELECT COUNT(*) AS n FROM evaluations WHERE apply_status = 'interview'").get().n,
      offer:      db.prepare("SELECT COUNT(*) AS n FROM evaluations WHERE apply_status = 'offer'").get().n,
      rejected:   db.prepare("SELECT COUNT(*) AS n FROM evaluations WHERE apply_status = 'rejected'").get().n,
    };

    // Apply mode breakdown
    const applyModes = {
      manual: db.prepare("SELECT COUNT(*) AS n FROM evaluations WHERE apply_mode = 'manual' AND apply_status NOT IN ('not_started') AND apply_status IS NOT NULL").get().n,
      auto:   db.prepare("SELECT COUNT(*) AS n FROM evaluations WHERE apply_mode = 'auto'   AND apply_status NOT IN ('not_started') AND apply_status IS NOT NULL").get().n,
    };

    // Grade distribution across all evaluations
    const gradeDist = db.prepare("SELECT grade, COUNT(*) AS n FROM evaluations WHERE grade IS NOT NULL GROUP BY grade").all()
      .reduce((acc, r) => { acc[r.grade] = r.n; return acc; }, { A:0, B:0, C:0, D:0, F:0 });

    // Top 10 companies by outreach volume (with emails OR dms) — helps identify where effort went
    const topOutreachCompanies = db.prepare(`
      SELECT j.name, j.category,
             COUNT(jc.id) AS contact_count,
             SUM(CASE WHEN jc.email IS NOT NULL AND jc.email != '' THEN 1 ELSE 0 END) AS email_count,
             SUM(CASE WHEN jc.status IN ('sent','dm_sent','email_sent') THEN 1 ELSE 0 END) AS sent_count,
             SUM(CASE WHEN jc.status = 'replied' THEN 1 ELSE 0 END) AS replied_count
      FROM jobs j LEFT JOIN job_contacts jc ON jc.job_id = j.id
      GROUP BY j.id HAVING contact_count > 0
      ORDER BY contact_count DESC LIMIT 10
    `).all();

    // Recent timeline — last 10 actions across evaluations + contacts
    const recentEvals = db.prepare(`
      SELECT 'evaluation' AS kind, id, company_name, job_title, grade, created_at
      FROM evaluations ORDER BY created_at DESC LIMIT 10
    `).all();
    const recentApplied = db.prepare(`
      SELECT 'applied' AS kind, id, company_name, job_title, apply_status, applied_at
      FROM evaluations WHERE applied_at IS NOT NULL ORDER BY applied_at DESC LIMIT 10
    `).all();

    const responseRate = outreachSent > 0 ? Math.round((outreachReplied / outreachSent) * 100) : 0;
    const applyRate    = totalEvaluations > 0 ? Math.round((appFunnel.applied / totalEvaluations) * 100) : 0;

    res.json({
      summary: {
        totalCompanies,
        totalEvaluations,
        totalContacts,
        contactsWithEmail,
        contactsWithLinkedIn,
        outreachGenerated,
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
app.get('/api/activity', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM activity_log ORDER BY created_at DESC LIMIT 10').all();
    res.json({ activity: rows });
  } catch (err) {
    res.json({ activity: [] });
  }
});

app.get('/api/health', (req, res) => {
  res.json({
    status:       'ok',
    ai_provider:  process.env.AI_PROVIDER || 'gemini',
    has_apify:    !!process.env.APIFY_API_TOKEN  && process.env.APIFY_API_TOKEN  !== 'your_apify_token_here',
    has_apollo:   !!process.env.APOLLO_API_KEY   && process.env.APOLLO_API_KEY   !== 'your_apollo_key_here',
    has_gemini:   !!process.env.GEMINI_API_KEY   && process.env.GEMINI_API_KEY   !== 'your_gemini_key_here',
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
    const subs = db.prepare(`
      SELECT DISTINCT category, subcategory, COUNT(*) as count
      FROM jobs
      WHERE source NOT IN ('startup_sheet') AND subcategory IS NOT NULL
      GROUP BY category, subcategory
      HAVING count > 2
      LIMIT 20
    `).all();

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

  // 5. Record last refresh time
  db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('lastRefresh', ?)").run(new Date().toISOString());
  log('Daily refresh complete — ' + new Date().toISOString());
}

// ── Cron: run every day at 6 AM UTC ──────────────────────────────────────────
cron.schedule('0 6 * * *', () => {
  runDailyRefresh().catch(err => console.error('[Cron] Daily refresh FAILED:', err.message));
});

// ── DB wipe on start (one-shot, auto-disables itself) ────────────────────────
if (process.env.WIPE_DB_ON_START === 'true') {
  try {
    db.exec(`
      DELETE FROM job_contacts;
      DELETE FROM jobs;
      DELETE FROM prospects;
      DELETE FROM contacts;
      DELETE FROM outreach;
      DELETE FROM companies;
      DELETE FROM meta;
    `);
    console.log('[WIPE_DB] All tables wiped.');
    // Flip the flag to false so it never runs again on next restart
    const envPath = path.join(__dirname, '..', '.env');
    import('fs').then(({ default: fs }) => {
      const content = fs.readFileSync(envPath, 'utf8');
      fs.writeFileSync(envPath, content.replace(/^WIPE_DB_ON_START=true/m, 'WIPE_DB_ON_START=false'));
      console.log('[WIPE_DB] Flag auto-disabled in .env');
    });
  } catch (err) {
    console.error('[WIPE_DB] Failed:', err.message);
  }
}

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Backend on port ${PORT}`);
  // Auto-reclassify unclassified companies in the background on startup
  if (process.env.WIPE_DB_ON_START !== 'true') {
    try {
      const { n } = db.prepare("SELECT COUNT(*) as n FROM jobs WHERE category = 'Unclassified' OR category IS NULL OR confidence < 0.40").get();
      if (n > 0) {
        console.log(`[startup] ${n} unclassified/low-confidence companies — starting background reclassification...`);
        runReclassifyUnclassified().catch(err => console.error('[startup reclassify]', err.message));
      }
    } catch (err) { console.error('[startup check]', err.message); }
  }
});
