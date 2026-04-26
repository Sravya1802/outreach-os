import { Router } from 'express';
import { one, all, run, tx } from '../db.js';
import * as apollo from '../services/apollo.js';
import * as apify from '../services/apify.js';

const router = Router();

// Search people at a company by name — the main endpoint
router.post('/search', async (req, res) => {
  try {
    const { companyName, companyWebsite } = req.body;
    if (!companyName) return res.status(400).json({ error: 'companyName required' });

    // Upsert company into DB
    await run(
      `INSERT INTO companies (name, role, source, status, user_id) VALUES ($1, '', 'manual', 'researching', $2)
       ON CONFLICT (user_id, name, role) DO NOTHING`,
      [companyName, req.user.id]
    );

    const company = await one(
      'SELECT * FROM companies WHERE name = $1 AND user_id = $2 ORDER BY id DESC LIMIT 1',
      [companyName, req.user.id]
    );

    const stage = company?.stage || 'mid-cap';
    const titles = apollo.getTitlesForStage(stage);

    let contacts = [];

    // Apollo search
    try {
      const apolloResults = await apollo.searchPeople(companyName, titles);
      contacts.push(...apolloResults.map(c => ({
        name: c.name, title: c.title, linkedin_url: c.linkedin_url,
        email: c.email, email_status: c.email_status, source: 'apollo',
      })));
      console.log(`Apollo found ${apolloResults.length} people at ${companyName}`);
    } catch (err) {
      console.error('Apollo search failed:', err.message);
    }

    // Apify LinkedIn fallback
    if (contacts.length < 3) {
      try {
        const linkedinResults = await apify.findLinkedInDecisionMakers(companyName, stage);
        for (const lr of linkedinResults) {
          const exists = contacts.some(c =>
            (c.linkedin_url && c.linkedin_url === lr.linkedin_url) ||
            c.name.toLowerCase() === (lr.name || '').toLowerCase()
          );
          if (!exists && lr.name && lr.name !== 'Unknown') {
            contacts.push({
              name: lr.name, title: lr.title, linkedin_url: lr.linkedin_url,
              email: '', email_status: '', source: 'linkedin',
            });
          }
        }
        console.log(`Apify found additional people, total now: ${contacts.length}`);
      } catch (err) {
        console.error('Apify search failed:', err.message);
      }
    }

    await tx(async (client) => {
      for (const c of contacts) {
        await client.query(`
          INSERT INTO contacts (company_id, name, title, linkedin_url, email, email_status, user_id)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [company.id, c.name || null, c.title || null, c.linkedin_url || null, c.email || null, c.email_status || null, req.user.id]);
      }
    });

    const saved = await all(`
      SELECT contacts.*, $1::text AS company_name, $2::text AS company_stage
      FROM contacts WHERE company_id = $3 AND user_id = $4
    `, [companyName, stage, company.id, req.user.id]);

    res.json({ contacts: saved, companyId: company.id, companyName });
  } catch (err) {
    console.error('Search contacts error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// List all contacts (with optional company_id filter)
router.get('/', async (req, res) => {
  try {
    const { company_id } = req.query;
    let sql = `
      SELECT contacts.*,
             COALESCE(companies.name, '') as company_name,
             COALESCE(companies.stage, '') as company_stage
      FROM contacts
      LEFT JOIN companies ON contacts.company_id = companies.id AND companies.user_id = $1
      WHERE contacts.user_id = $1
    `;
    const params = [req.user.id];
    let i = 2;
    if (company_id) {
      sql += ` AND contacts.company_id = $${i++}`;
      params.push(company_id);
    }
    sql += ' ORDER BY contacts.created_at DESC LIMIT 200';
    res.json(await all(sql, params));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single contact with company info
router.get('/:id', async (req, res) => {
  try {
    const contact = await one(`
      SELECT contacts.*,
             COALESCE(companies.name, '') as company_name,
             COALESCE(companies.role, '') as company_role,
             COALESCE(companies.stage, '') as company_stage
      FROM contacts
      LEFT JOIN companies ON contacts.company_id = companies.id AND companies.user_id = $2
      WHERE contacts.id = $1 AND contacts.user_id = $2
    `, [req.params.id, req.user.id]);
    if (!contact) return res.status(404).json({ error: 'Contact not found' });
    res.json(contact);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Find decision makers for a company already in DB
router.post('/find/:company_id', async (req, res) => {
  try {
    const company = await one(
      'SELECT * FROM companies WHERE id = $1 AND user_id = $2',
      [req.params.company_id, req.user.id]
    );
    if (!company) return res.status(404).json({ error: 'Company not found' });

    const titles = apollo.getTitlesForStage(company.stage || 'mid-cap');
    let contacts = [];

    try {
      const apolloResults = await apollo.searchPeople(company.name, titles);
      contacts.push(...apolloResults.map(c => ({
        name: c.name, title: c.title, linkedin_url: c.linkedin_url,
        email: c.email, email_status: c.email_status,
      })));
    } catch (err) { console.error('Apollo:', err.message); }

    if (contacts.length < 3) {
      try {
        const lr = await apify.findLinkedInDecisionMakers(company.name, company.stage || 'mid-cap');
        for (const p of lr) {
          if (!contacts.some(c => c.name?.toLowerCase() === p.name?.toLowerCase())) {
            contacts.push({ name: p.name, title: p.title, linkedin_url: p.linkedin_url, email: '', email_status: '' });
          }
        }
      } catch (err) { console.error('Apify:', err.message); }
    }

    await tx(async (client) => {
      for (const c of contacts) {
        await client.query(`
          INSERT INTO contacts (company_id, name, title, linkedin_url, email, email_status, user_id)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [company.id, c.name, c.title, c.linkedin_url, c.email || null, c.email_status || null, req.user.id]);
      }
    });

    res.json(await all(
      'SELECT * FROM contacts WHERE company_id = $1 AND user_id = $2',
      [company.id, req.user.id]
    ));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Enrich contact — get email via Apollo
router.post('/enrich/:id', async (req, res) => {
  try {
    const contact = await one(
      'SELECT * FROM contacts WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (!contact) return res.status(404).json({ error: 'Contact not found' });
    if (!contact.linkedin_url) return res.status(400).json({ error: 'No LinkedIn URL' });

    const enriched = await apollo.enrichPerson(contact.linkedin_url);
    await run(`
      UPDATE contacts SET email = COALESCE($1, email), email_status = COALESCE($2, email_status), phone = COALESCE($3, phone)
      WHERE id = $4 AND user_id = $5
    `, [enriched.email || null, enriched.email_status || null, enriched.phone || null, contact.id, req.user.id]);

    res.json(await one(
      'SELECT * FROM contacts WHERE id = $1 AND user_id = $2',
      [contact.id, req.user.id]
    ));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete contact
router.delete('/:id', async (req, res) => {
  try {
    await run(
      'DELETE FROM contacts WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
