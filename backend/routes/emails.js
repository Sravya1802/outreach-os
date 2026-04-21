import { Router } from 'express';
import db from '../db.js';
import * as apollo from '../services/apollo.js';

const router = Router();

// Find email for a contact via Apollo enrichment
router.post('/find/:contact_id', async (req, res) => {
  try {
    const contact = db.prepare('SELECT * FROM contacts WHERE id = ?').get(req.params.contact_id);
    if (!contact) return res.status(404).json({ error: 'Contact not found' });

    if (contact.email && contact.email_status === 'verified') {
      return res.json({ email: contact.email, email_status: contact.email_status, cached: true });
    }

    if (!contact.linkedin_url) {
      return res.status(400).json({ error: 'No LinkedIn URL — use email guess instead' });
    }

    const enriched = await apollo.enrichPerson(contact.linkedin_url);

    if (enriched.email) {
      db.prepare('UPDATE contacts SET email = ?, email_status = ? WHERE id = ?')
        .run(enriched.email, enriched.email_status, contact.id);
    }

    res.json({ email: enriched.email || null, email_status: enriched.email_status || 'unknown', cached: false });
  } catch (err) {
    console.error('Find email error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Verify existing email
router.post('/verify/:contact_id', async (req, res) => {
  try {
    const contact = db.prepare('SELECT * FROM contacts WHERE id = ?').get(req.params.contact_id);
    if (!contact) return res.status(404).json({ error: 'Contact not found' });
    if (!contact.email) return res.status(400).json({ error: 'No email to verify' });

    const result = await apollo.verifyEmail(contact.email);

    db.prepare('UPDATE contacts SET email_status = ? WHERE id = ?')
      .run(result.status, contact.id);

    res.json({ email: contact.email, ...result });
  } catch (err) {
    console.error('Verify email error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Guess email patterns (no API call)
router.get('/guess/:contact_id', async (req, res) => {
  try {
    const contact = db.prepare(`
      SELECT contacts.*, companies.name as company_name
      FROM contacts LEFT JOIN companies ON contacts.company_id = companies.id
      WHERE contacts.id = ?
    `).get(req.params.contact_id);

    if (!contact) return res.status(404).json({ error: 'Contact not found' });
    if (!contact.name) return res.status(400).json({ error: 'Contact has no name' });

    // Try to get domain from Apollo or guess from company name
    let domain = '';
    try {
      domain = await apollo.getCompanyDomain(contact.company_name);
    } catch {
      // Guess domain from company name
      domain = contact.company_name
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')
        + '.com';
    }

    const nameParts = contact.name.toLowerCase().split(/\s+/);
    const first = nameParts[0] || '';
    const last = nameParts[nameParts.length - 1] || '';

    const patterns = [
      `${first}.${last}@${domain}`,
      `${first}${last}@${domain}`,
      `${first}@${domain}`,
      `${first[0]}${last}@${domain}`,
      `${first}_${last}@${domain}`,
    ];

    res.json({
      patterns,
      domain,
      note: 'Verify with Apollo or send test to check bounce',
    });
  } catch (err) {
    console.error('Guess email error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
