import { Router } from 'express';
import db from '../db.js';
import * as apollo from '../services/apollo.js';
import * as apify from '../services/apify.js';
import { generateOutreach } from '../services/ai.js';

const router = Router();

// ── Curated target companies ────────────────────────────────────────────────

// ── US-only curated companies ─────────────────────────────────────────────────

const STARTUP_COMPANIES = [
  // AI / ML — all US-headquartered
  'Perplexity AI', 'Together AI', 'Anyscale', 'Modal', 'Character AI',
  'LangChain', 'Weights & Biases', 'Scale AI', 'Hugging Face', 'Replicate',
  // Dev tools — US-based
  'Cursor', 'Replit', 'Supabase', 'Neon', 'PlanetScale',
  'Temporal', 'Buf', 'Redpanda', 'Fly.io', 'Railway',
  // Productivity / SaaS — US-based
  'Linear', 'Loom', 'Coda', 'Superhuman', 'Superblocks',
  // Fintech — US-based
  'Ramp', 'Brex', 'Mercury', 'Pilot', 'Deel',
  // Infrastructure — US-based
  'Retool', 'Render', 'Clerk', 'Doppler', 'WorkOS',
];

const MIDCAP_COMPANIES = [
  // All US-headquartered
  'Stripe', 'Databricks', 'Cloudflare', 'Confluent', 'Sentry',
  'Airtable', 'MongoDB', 'Elastic', 'Amplitude', 'Mixpanel',
  'Notion', 'Figma', 'Vercel', 'Twilio', 'Datadog',
  'PagerDuty', 'Okta', 'Zendesk', 'Intercom', 'HubSpot',
  'HashiCorp', 'Segment', 'Netlify', 'LaunchDarkly', 'Postman',
];

const STARTUP_TITLES  = ['founder','co-founder','ceo','cto','head of engineering','vp of engineering'];
const MIDCAP_TITLES   = ['vp of engineering','director of engineering','head of engineering','engineering manager','vp product','technical recruiter'];

// ── Routes ──────────────────────────────────────────────────────────────────

// List all prospects (with filters)
router.get('/', (req, res) => {
  try {
    const { type, status, search } = req.query;
    let sql = 'SELECT * FROM prospects WHERE 1=1';
    const params = [];
    if (type)   { sql += ' AND company_type = ?'; params.push(type); }
    if (status) { sql += ' AND status = ?';        params.push(status); }
    if (search) {
      sql += ' AND (name LIKE ? OR company_name LIKE ? OR title LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    sql += ' ORDER BY created_at DESC';
    res.json(db.prepare(sql).all(...params));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Stats for the dashboard header
router.get('/stats', (req, res) => {
  try {
    const total     = db.prepare("SELECT COUNT(*) as n FROM prospects").get().n;
    const verified  = db.prepare("SELECT COUNT(*) as n FROM prospects WHERE email_status IN ('verified','likely')").get().n;
    const generated = db.prepare("SELECT COUNT(*) as n FROM prospects WHERE status = 'generated'").get().n;
    const sent      = db.prepare("SELECT COUNT(*) as n FROM prospects WHERE status = 'sent'").get().n;
    const replied   = db.prepare("SELECT COUNT(*) as n FROM prospects WHERE status = 'replied'").get().n;
    res.json({ total, verified, generated, sent, replied });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Auto-discover prospects for a company type
// Streams progress via JSON lines
router.post('/discover', async (req, res) => {
  const { mode = 'startup', limit = 10 } = req.body;
  const companies = mode === 'startup' ? STARTUP_COMPANIES : MIDCAP_COMPANIES;
  const titles    = mode === 'startup' ? STARTUP_TITLES : MIDCAP_TITLES;
  const batch     = companies.slice(0, Number(limit));

  const results = { added: 0, skipped: 0, companies: [] };

  for (const companyName of batch) {
    // Skip if we already have prospects for this company
    const existing = db.prepare("SELECT COUNT(*) as n FROM prospects WHERE company_name = ?").get(companyName).n;
    if (existing > 0) {
      results.skipped++;
      results.companies.push({ company: companyName, status: 'already_exists', count: existing });
      continue;
    }

    let people = [];

    // Apollo first
    try {
      const apolloRes = await apollo.searchPeople(companyName, titles);
      people.push(...apolloRes.map(p => ({
        name:         p.name,
        title:        p.title,
        linkedin_url: p.linkedin_url,
        email:        p.email,
        email_status: p.email_status,
      })));
    } catch (err) {
      console.error(`Apollo failed for ${companyName}:`, err.message);
    }

    // Apify Google → LinkedIn if Apollo returned nothing
    if (people.length === 0) {
      try {
        const apifyRes = await apify.findLinkedInDecisionMakers(companyName, mode);
        people.push(...apifyRes.map(p => ({
          name:         p.name,
          title:        p.title,
          linkedin_url: p.linkedin_url,
          email:        '',
          email_status: 'unknown',
        })));
      } catch (err) {
        console.error(`Apify failed for ${companyName}:`, err.message);
      }
    }

    // Save top 3 people per company
    const insert = db.prepare(`
      INSERT OR IGNORE INTO prospects
        (name, title, linkedin_url, email, email_status, company_name, company_type)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    let saved = 0;
    db.transaction(() => {
      for (const p of people.slice(0, 3)) {
        if (!p.name || p.name === 'Unknown') continue;
        const r = insert.run(p.name, p.title, p.linkedin_url, p.email || null, p.email_status || 'unknown', companyName, mode);
        if (r.changes > 0) { results.added++; saved++; }
      }
    })();

    results.companies.push({ company: companyName, status: 'done', count: saved });
    console.log(`${companyName}: ${saved} prospects saved`);
  }

  res.json(results);
});

// Add a single company manually
router.post('/add-company', async (req, res) => {
  try {
    const { companyName, companyType = 'startup' } = req.body;
    if (!companyName) return res.status(400).json({ error: 'companyName required' });

    const titles = companyType === 'startup' ? STARTUP_TITLES : MIDCAP_TITLES;
    let people = [];

    try {
      const apolloRes = await apollo.searchPeople(companyName, titles);
      people.push(...apolloRes);
    } catch (err) { console.error('Apollo:', err.message); }

    if (people.length === 0) {
      try {
        const apifyRes = await apify.findLinkedInDecisionMakers(companyName, companyType);
        people.push(...apifyRes);
      } catch (err) { console.error('Apify:', err.message); }
    }

    const insert = db.prepare(`
      INSERT OR IGNORE INTO prospects (name, title, linkedin_url, email, email_status, company_name, company_type)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    let added = 0;
    db.transaction(() => {
      for (const p of people) {
        if (!p.name || p.name === 'Unknown') continue;
        const r = insert.run(p.name, p.title || '', p.linkedin_url || null, p.email || null, p.email_status || 'unknown', companyName, companyType);
        if (r.changes > 0) added++;
      }
    })();

    res.json({ added, people: db.prepare('SELECT * FROM prospects WHERE company_name = ?').all(companyName) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Generate cold email + LinkedIn DM for a prospect
router.post('/:id/generate', async (req, res) => {
  try {
    const prospect = db.prepare('SELECT * FROM prospects WHERE id = ?').get(req.params.id);
    if (!prospect) return res.status(404).json({ error: 'Prospect not found' });

    const { extraContext = '' } = req.body;
    const params = {
      recipientName:  prospect.name,
      recipientTitle: prospect.title,
      companyName:    prospect.company_name,
      companyStage:   prospect.company_type,
      extraContext,
    };

    const [email, linkedin] = await Promise.all([
      generateOutreach({ ...params, type: 'cold_email' }),
      generateOutreach({ ...params, type: 'linkedin' }),
    ]);

    db.prepare(`
      UPDATE prospects
      SET email_subject = ?, email_body = ?, linkedin_dm = ?, status = 'generated', updated_at = datetime('now')
      WHERE id = ?
    `).run(email.subject, email.body, linkedin.message || linkedin.body, prospect.id);

    res.json({ email, linkedin });
  } catch (err) {
    console.error('Generate prospect outreach error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Find / verify email for a prospect
router.post('/:id/find-email', async (req, res) => {
  try {
    const prospect = db.prepare('SELECT * FROM prospects WHERE id = ?').get(req.params.id);
    if (!prospect) return res.status(404).json({ error: 'Prospect not found' });

    // Try Apollo enrichment if we have a LinkedIn URL
    if (prospect.linkedin_url) {
      try {
        const enriched = await apollo.enrichPerson(prospect.linkedin_url);
        if (enriched.email) {
          db.prepare("UPDATE prospects SET email = ?, email_status = ?, updated_at = datetime('now') WHERE id = ?")
            .run(enriched.email, enriched.email_status, prospect.id);
          return res.json({ email: enriched.email, email_status: enriched.email_status });
        }
      } catch (err) { console.error('Enrich failed:', err.message); }
    }

    // Fall back to email pattern guesses
    const nameParts = prospect.name.toLowerCase().split(/\s+/);
    const first = nameParts[0] || '';
    const last  = nameParts[nameParts.length - 1] || '';
    let domain  = '';
    try { domain = await apollo.getCompanyDomain(prospect.company_name); } catch {}
    if (!domain) domain = prospect.company_name.toLowerCase().replace(/[^a-z0-9]/g,'') + '.com';

    const patterns = [
      `${first}.${last}@${domain}`,
      `${first}@${domain}`,
      `${first[0]}${last}@${domain}`,
      `${first}${last}@${domain}`,
      `${first}_${last}@${domain}`,
    ];

    res.json({ email: null, patterns, domain, note: 'No verified email found — use patterns below' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Verify existing email
router.post('/:id/verify-email', async (req, res) => {
  try {
    const prospect = db.prepare('SELECT * FROM prospects WHERE id = ?').get(req.params.id);
    if (!prospect?.email) return res.status(400).json({ error: 'No email to verify' });

    const result = await apollo.verifyEmail(prospect.email);
    db.prepare("UPDATE prospects SET email_status = ?, updated_at = datetime('now') WHERE id = ?")
      .run(result.status, prospect.id);

    res.json({ email: prospect.email, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update status / notes
router.put('/:id', (req, res) => {
  try {
    const { status, notes, email, email_subject, email_body, linkedin_dm } = req.body;
    const prospect = db.prepare('SELECT * FROM prospects WHERE id = ?').get(req.params.id);
    if (!prospect) return res.status(404).json({ error: 'Not found' });

    db.prepare(`
      UPDATE prospects SET
        status        = COALESCE(?, status),
        notes         = COALESCE(?, notes),
        email         = COALESCE(?, email),
        email_subject = COALESCE(?, email_subject),
        email_body    = COALESCE(?, email_body),
        linkedin_dm   = COALESCE(?, linkedin_dm),
        updated_at    = datetime('now')
      WHERE id = ?
    `).run(status || null, notes || null, email || null, email_subject || null, email_body || null, linkedin_dm || null, prospect.id);

    res.json(db.prepare('SELECT * FROM prospects WHERE id = ?').get(prospect.id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete a prospect
router.delete('/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM prospects WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
