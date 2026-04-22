import { Router } from 'express';
import { one, run } from '../db.js';
import { generateOutreach, generateWaaSMessage, generateCoverLetter } from '../services/ai.js';

const router = Router();

async function getContactInfo(contactId) {
  return one(`
    SELECT contacts.*,
           COALESCE(companies.name, contacts.name) as company_name,
           COALESCE(companies.role, '') as company_role,
           COALESCE(companies.stage, 'startup') as company_stage
    FROM contacts
    LEFT JOIN companies ON contacts.company_id = companies.id
    WHERE contacts.id = $1
  `, [contactId]);
}

// Generate cold email
router.post('/email', async (req, res) => {
  try {
    const { contactId, companyName, recipientName, recipientTitle, extraContext, hasApplied, rolesAvailable, specificAchievement, position, isRecruiter } = req.body;

    let name, title, company, stage, role;

    if (contactId) {
      const contact = await getContactInfo(contactId);
      if (!contact) return res.status(404).json({ error: 'Contact not found' });
      name = contact.name; title = contact.title; company = contact.company_name;
      stage = contact.company_stage; role = contact.company_role;
    } else {
      name = recipientName; title = recipientTitle; company = companyName;
      stage = 'startup'; role = '';
    }

    const result = await generateOutreach({
      type: 'cold_email',
      recipientName: name, recipientTitle: title, companyName: company,
      companyStage: stage, role, extraContext, hasApplied, rolesAvailable,
      specificAchievement, position, isRecruiter,
    });

    if (contactId) {
      await run(`
        INSERT INTO outreach (contact_id, type, subject, body, status)
        VALUES ($1, 'email', $2, $3, 'draft')
      `, [contactId, result.subject, result.body]);
    }

    res.json(result);
  } catch (err) {
    console.error('Generate email error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Generate LinkedIn message
router.post('/linkedin', async (req, res) => {
  try {
    const { contactId, companyName, recipientName, recipientTitle, extraContext, hasApplied, rolesAvailable, specificAchievement, position, isRecruiter } = req.body;

    let name, title, company, stage, role;

    if (contactId) {
      const contact = await getContactInfo(contactId);
      if (!contact) return res.status(404).json({ error: 'Contact not found' });
      name = contact.name; title = contact.title; company = contact.company_name;
      stage = contact.company_stage; role = contact.company_role;
    } else {
      name = recipientName; title = recipientTitle; company = companyName;
      stage = 'startup'; role = '';
    }

    const result = await generateOutreach({
      type: 'linkedin',
      recipientName: name, recipientTitle: title, companyName: company,
      companyStage: stage, role, extraContext, hasApplied, rolesAvailable,
      specificAchievement, position, isRecruiter,
    });

    if (contactId) {
      await run(`
        INSERT INTO outreach (contact_id, type, subject, body, status)
        VALUES ($1, 'linkedin', NULL, $2, 'draft')
      `, [contactId, result.message || result.body]);
    }

    res.json(result);
  } catch (err) {
    console.error('Generate LinkedIn error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Generate both at once
router.post('/both', async (req, res) => {
  try {
    const { contactId, companyName, recipientName, recipientTitle, extraContext, hasApplied, rolesAvailable, specificAchievement, position, isRecruiter } = req.body;

    let name, title, company, stage, role;

    if (contactId) {
      const contact = await getContactInfo(contactId);
      if (!contact) return res.status(404).json({ error: 'Contact not found' });
      name = contact.name; title = contact.title; company = contact.company_name;
      stage = contact.company_stage; role = contact.company_role;
    } else {
      name = recipientName; title = recipientTitle; company = companyName;
      stage = 'startup'; role = '';
    }

    const params = { recipientName: name, recipientTitle: title, companyName: company, companyStage: stage, role, extraContext, hasApplied, rolesAvailable, specificAchievement, position, isRecruiter };

    const [email, linkedin] = await Promise.all([
      generateOutreach({ ...params, type: 'cold_email' }),
      generateOutreach({ ...params, type: 'linkedin' }),
    ]);

    if (contactId) {
      await run(`INSERT INTO outreach (contact_id, type, subject, body, status) VALUES ($1, 'email', $2, $3, 'draft')`, [contactId, email.subject, email.body]);
      await run(`INSERT INTO outreach (contact_id, type, subject, body, status) VALUES ($1, 'linkedin', NULL, $2, 'draft')`, [contactId, linkedin.message || linkedin.body]);
    }

    res.json({ email, linkedin });
  } catch (err) {
    console.error('Generate both error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Generate WaaS (Work at a Startup) direct message
router.post('/waas', async (req, res) => {
  try {
    const { companyName, companyDescription, industry, ycBatch, contactName, extraContext } = req.body;
    if (!companyName) return res.status(400).json({ error: 'companyName required' });

    const result = await generateWaaSMessage({ companyName, companyDescription, industry, ycBatch, contactName, extraContext });

    if (req.body.contactId) {
      try {
        await run("INSERT INTO outreach (contact_id, type, body, status) VALUES ($1, 'waas', $2, 'draft')",
          [req.body.contactId, result.message]);
      } catch (_) {}
    }

    res.json(result);
  } catch (err) {
    console.error('Generate WaaS error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Generate cover letter
router.post('/cover-letter', async (req, res) => {
  try {
    const { companyId, roleTitle, extraContext } = req.body;
    let companyName = 'this company';
    let companyDescription = '';

    if (companyId) {
      const company = await one('SELECT * FROM jobs WHERE id = $1', [companyId]);
      if (company) {
        companyName = company.name;
        companyDescription = company.description || company.wikipedia_summary || '';
      }
    } else if (req.body.companyName) {
      companyName = req.body.companyName;
      companyDescription = req.body.companyDescription || '';
    }

    const result = await generateCoverLetter({ companyName, companyDescription, roleTitle, extraContext });
    res.json(result);
  } catch (err) {
    console.error('Cover letter error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
