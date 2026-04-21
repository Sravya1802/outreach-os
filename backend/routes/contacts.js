import { Router } from 'express';
import db from '../db.js';
import * as apollo from '../services/apollo.js';
import * as apify from '../services/apify.js';

const router = Router();

// Search people at a company by name — the main endpoint
// No DB entry needed upfront
router.post('/search', async (req, res) => {
  try {
    const { companyName, companyWebsite } = req.body;
    if (!companyName) return res.status(400).json({ error: 'companyName required' });

    // Upsert company into DB
    db.prepare(`
      INSERT OR IGNORE INTO companies (name, source, status)
      VALUES (?, 'manual', 'researching')
    `).run(companyName);

    const company = db.prepare('SELECT * FROM companies WHERE name = ? ORDER BY id DESC LIMIT 1').get(companyName);

    // Determine company stage from name heuristics or default
    const stage = company?.stage || 'mid-cap';
    const titles = apollo.getTitlesForStage(stage);

    let contacts = [];

    // Apollo search
    try {
      const apolloResults = await apollo.searchPeople(companyName, titles);
      contacts.push(...apolloResults.map(c => ({
        name: c.name,
        title: c.title,
        linkedin_url: c.linkedin_url,
        email: c.email,
        email_status: c.email_status,
        source: 'apollo',
      })));
      console.log(`Apollo found ${apolloResults.length} people at ${companyName}`);
    } catch (err) {
      console.error('Apollo search failed:', err.message);
    }

    // Apify Google → LinkedIn profiles (runs in parallel-ish, fallback)
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
              name: lr.name,
              title: lr.title,
              linkedin_url: lr.linkedin_url,
              email: '',
              email_status: '',
              source: 'linkedin',
            });
          }
        }
        console.log(`Apify found additional people, total now: ${contacts.length}`);
      } catch (err) {
        console.error('Apify search failed:', err.message);
      }
    }

    // Save to DB, return with IDs
    const insert = db.prepare(`
      INSERT OR IGNORE INTO contacts (company_id, name, title, linkedin_url, email, email_status)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const insertMany = db.transaction((items) => {
      for (const c of items) {
        insert.run(
          company.id,
          c.name || null,
          c.title || null,
          c.linkedin_url || null,
          c.email || null,
          c.email_status || null
        );
      }
    });
    insertMany(contacts);

    const saved = db.prepare(`
      SELECT contacts.*, ? as company_name, ? as company_stage
      FROM contacts WHERE company_id = ?
    `).all(companyName, stage, company.id);

    res.json({ contacts: saved, companyId: company.id, companyName });
  } catch (err) {
    console.error('Search contacts error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// List all contacts (with optional company_id filter)
router.get('/', (req, res) => {
  try {
    const { company_id } = req.query;
    let sql = `
      SELECT contacts.*,
             COALESCE(companies.name, '') as company_name,
             COALESCE(companies.stage, '') as company_stage
      FROM contacts
      LEFT JOIN companies ON contacts.company_id = companies.id
    `;
    const params = [];
    if (company_id) {
      sql += ' WHERE contacts.company_id = ?';
      params.push(company_id);
    }
    sql += ' ORDER BY contacts.created_at DESC LIMIT 200';
    res.json(db.prepare(sql).all(...params));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single contact with company info
router.get('/:id', (req, res) => {
  try {
    const contact = db.prepare(`
      SELECT contacts.*,
             COALESCE(companies.name, '') as company_name,
             COALESCE(companies.role, '') as company_role,
             COALESCE(companies.stage, '') as company_stage
      FROM contacts
      LEFT JOIN companies ON contacts.company_id = companies.id
      WHERE contacts.id = ?
    `).get(req.params.id);
    if (!contact) return res.status(404).json({ error: 'Contact not found' });
    res.json(contact);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Find decision makers for a company already in DB
router.post('/find/:company_id', async (req, res) => {
  try {
    const company = db.prepare('SELECT * FROM companies WHERE id = ?').get(req.params.company_id);
    if (!company) return res.status(404).json({ error: 'Company not found' });

    // Reuse the search logic
    req.body = { companyName: company.name, companyWebsite: company.apply_url };
    // Forward to search handler logic inline
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

    const insert = db.prepare(`
      INSERT OR IGNORE INTO contacts (company_id, name, title, linkedin_url, email, email_status)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    db.transaction((items) => {
      for (const c of items) insert.run(company.id, c.name, c.title, c.linkedin_url, c.email || null, c.email_status || null);
    })(contacts);

    res.json(db.prepare('SELECT * FROM contacts WHERE company_id = ?').all(company.id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Enrich contact — get email via Apollo
router.post('/enrich/:id', async (req, res) => {
  try {
    const contact = db.prepare('SELECT * FROM contacts WHERE id = ?').get(req.params.id);
    if (!contact) return res.status(404).json({ error: 'Contact not found' });
    if (!contact.linkedin_url) return res.status(400).json({ error: 'No LinkedIn URL' });

    const enriched = await apollo.enrichPerson(contact.linkedin_url);
    db.prepare(`
      UPDATE contacts SET email = COALESCE(?, email), email_status = COALESCE(?, email_status), phone = COALESCE(?, phone)
      WHERE id = ?
    `).run(enriched.email || null, enriched.email_status || null, enriched.phone || null, contact.id);

    res.json(db.prepare('SELECT * FROM contacts WHERE id = ?').get(contact.id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete contact
router.delete('/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM contacts WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
