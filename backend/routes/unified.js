import { Router } from 'express';
import { one, all } from '../db.js';

const router = Router();

// ── Merged company list (jobs table + prospect-only companies) ────────────────

// ── Category counts (lightweight — for category card badges) ─────────────────

router.get('/category-counts', async (req, res) => {
  try {
    const rows = await all(`
      SELECT COALESCE(NULLIF(category,''), 'Unclassified') AS category, COUNT(*)::int AS count
      FROM jobs
      GROUP BY COALESCE(NULLIF(category,''), 'Unclassified')
      ORDER BY count DESC
    `);
    res.json({ counts: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── City counts for location filter pills ─────────────────────────────────────

router.get('/city-counts', async (req, res) => {
  try {
    const { category, subcategory } = req.query;
    let where = "city IS NOT NULL AND city != ''";
    const params = [];
    let i = 1;
    if (subcategory)                         { where += ` AND subcategory = $${i++}`; params.push(subcategory); }
    else if (category && category !== 'All') { where += ` AND category = $${i++}`;    params.push(category); }

    const rows = await all(`
      SELECT city, state, COUNT(*)::int AS count
      FROM jobs
      WHERE ${where}
      GROUP BY city, state
      ORDER BY count DESC
      LIMIT 30
    `, params);
    res.json({ cities: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/companies', async (req, res) => {
  try {
    const { category, subcategory, search, page: pageStr, pageSize: pageSizeStr, cities: citiesStr, includeRemote } = req.query;
    const page     = Math.max(0, parseInt(pageStr, 10) || 0);
    const pageSize = Math.min(200, Math.max(1, parseInt(pageSizeStr, 10) || 50));
    const offset   = page * pageSize;
    const cityList = citiesStr ? citiesStr.split(',').map(c => c.trim()).filter(Boolean) : [];
    const withRemote = includeRemote === 'true' || includeRemote === '1';

    let where = '1=1';
    const params = [];
    let i = 1;
    if (subcategory)                          { where += ` AND subcategory = $${i++}`; params.push(subcategory); }
    else if (category && category !== 'All')  { where += ` AND category = $${i++}`;    params.push(category); }
    if (search) { where += ` AND name ILIKE $${i++}`; params.push(`%${search}%`); }
    if (cityList.length > 0) {
      const placeholders = cityList.map(() => `$${i++}`).join(',');
      if (withRemote) {
        where += ` AND (city IN (${placeholders}) OR city = 'Remote')`;
      } else {
        where += ` AND city IN (${placeholders})`;
      }
      params.push(...cityList);
    }

    // Total count (for hasMore)
    const totalRow = await one(`SELECT COUNT(*)::int AS total FROM jobs j WHERE ${where}`, params);
    const jobTotal = totalRow?.total || 0;

    // Companies from jobs table — paginated
    const jobRows = await all(`
      SELECT
        'job'                AS source,
        j.id                 AS id,
        j.id                 AS job_id,
        j.name,
        j.category,
        j.subcategory,
        COALESCE(j.confidence, 0)  AS confidence,
        j.classified_at,
        j.pay                AS pay_per_hour,
        j.location,
        j.url                AS careers_url,
        j.domain,
        COALESCE(j.is_hiring, 0)   AS is_hiring,
        j.linkedin_company_url,
        j.city,
        j.state,
        j.country,
        j.intern_roles_count,
        j.intern_roles_checked_at,
        (SELECT COUNT(*)::int FROM job_contacts WHERE job_id = j.id AND source = 'linkedin') AS linkedin_count,
        (SELECT COUNT(*)::int FROM job_contacts WHERE job_id = j.id AND source = 'hunter')   AS email_count,
        (SELECT COUNT(*)::int FROM prospects WHERE company_name = j.name)                    AS prospects_count
      FROM jobs j
      WHERE ${where}
      ORDER BY j.is_hiring DESC NULLS LAST, j.pay DESC NULLS LAST
      LIMIT $${i++} OFFSET $${i++}
    `, [...params, pageSize, offset]);

    // Prospect-only companies — only included on page 0 when no category filter
    let prospectRows = [];
    if (page === 0 && !category && !subcategory) {
      const prospectWhere = search ? 'AND p.company_name ILIKE $1' : '';
      const prospectParams = search ? [`%${search}%`] : [];
      prospectRows = await all(`
        SELECT
          'prospect'       AS source,
          NULL             AS id,
          NULL             AS job_id,
          p.company_name   AS name,
          p.company_type   AS category,
          NULL             AS subcategory,
          0                AS confidence,
          NULL             AS classified_at,
          0                AS pay_per_hour,
          NULL             AS location,
          NULL             AS careers_url,
          NULL             AS domain,
          0                AS is_hiring,
          NULL             AS linkedin_company_url,
          NULL             AS intern_roles_count,
          NULL             AS intern_roles_checked_at,
          0                AS linkedin_count,
          0                AS email_count,
          COUNT(*)::int    AS prospects_count
        FROM prospects p
        WHERE p.company_name NOT IN (SELECT name FROM jobs)
        ${prospectWhere}
        GROUP BY p.company_name, p.company_type
      `, prospectParams);
    }

    const companies = [...jobRows, ...prospectRows].map(c => ({
      ...c,
      total_contacts: (c.linkedin_count || 0) + (c.email_count || 0) + (c.prospects_count || 0),
    }));

    const hasMore = (offset + jobRows.length) < jobTotal;

    res.json({ companies, total: jobTotal + prospectRows.length, page, pageSize, hasMore });
  } catch (err) {
    console.error('unified/companies error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── All contacts for a company (both tables) ──────────────────────────────────

router.get('/contacts/:name', async (req, res) => {
  try {
    const name = decodeURIComponent(req.params.name);

    // job_contacts (LinkedIn search + Hunter.io)
    const job = await one('SELECT id FROM jobs WHERE name = $1', [name]);
    const jobContacts = job
      ? await all('SELECT * FROM job_contacts WHERE job_id = $1 ORDER BY source, created_at DESC', [job.id])
      : [];

    // prospects (auto-discovered people)
    const prospectRows = await all('SELECT * FROM prospects WHERE company_name = $1 ORDER BY created_at DESC', [name]);

    // Normalize into a single contacts array that the frontend expects
    const contacts = [
      ...jobContacts.map(c => ({ ...c, type: 'job_contact' })),
      ...prospectRows.map(c => ({ ...c, type: 'prospect' })),
    ];

    res.json({ job_id: job?.id || null, contacts });
  } catch (err) {
    console.error('unified/contacts error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Dashboard stats + outreach pipeline ──────────────────────────────────────

router.get('/dashboard', async (req, res) => {
  try {
    const [stats, prospectRows, jobRows] = await Promise.all([
      one(`
        SELECT
          (SELECT COUNT(*)::int FROM prospects) +
          (SELECT COUNT(*)::int FROM job_contacts) AS total,

          (SELECT COUNT(*)::int FROM prospects   WHERE status = 'generated') +
          (SELECT COUNT(*)::int FROM job_contacts WHERE status = 'generated') AS generated,

          (SELECT COUNT(*)::int FROM prospects   WHERE status IN ('sent','email_sent')) +
          (SELECT COUNT(*)::int FROM job_contacts WHERE status IN ('sent','email_sent')) AS sent,

          (SELECT COUNT(*)::int FROM prospects   WHERE status = 'dm_sent') +
          (SELECT COUNT(*)::int FROM job_contacts WHERE status = 'dm_sent') AS dm_sent,

          (SELECT COUNT(*)::int FROM prospects   WHERE status = 'replied') +
          (SELECT COUNT(*)::int FROM job_contacts WHERE status = 'replied') AS replied,

          (SELECT COUNT(*)::int FROM prospects   WHERE status IN ('closed','skip')) +
          (SELECT COUNT(*)::int FROM job_contacts WHERE status IN ('closed','skip')) AS closed,

          (SELECT COUNT(*)::int FROM prospects   WHERE (email_subject IS NOT NULL AND email_subject != '') OR (linkedin_dm IS NOT NULL AND linkedin_dm != '')) +
          (SELECT COUNT(*)::int FROM job_contacts WHERE (generated_subject IS NOT NULL AND generated_subject != '') OR (generated_dm IS NOT NULL AND generated_dm != '')) AS has_content
      `),
      all(`
        SELECT
          'prospect' AS row_type,
          p.id,
          p.name,
          p.title,
          p.email,
          p.linkedin_url,
          p.linkedin_dm  AS generated_dm,
          p.email_subject AS generated_subject,
          p.email_body    AS generated_body,
          p.status,
          p.company_name  AS company,
          NULL            AS company_category,
          p.updated_at    AS activity_at
        FROM prospects p
        ORDER BY p.company_name, p.updated_at DESC
      `),
      all(`
        SELECT
          'job_contact' AS row_type,
          jc.id,
          jc.name,
          jc.title,
          jc.email,
          jc.linkedin_url,
          jc.generated_dm,
          jc.generated_subject,
          jc.generated_body,
          jc.status,
          j.name     AS company,
          j.category AS company_category,
          jc.created_at AS activity_at
        FROM job_contacts jc
        JOIN jobs j ON j.id = jc.job_id
        ORDER BY j.name, jc.created_at DESC
      `),
    ]);

    // Group by company
    const byCompany = {};
    for (const row of [...prospectRows, ...jobRows]) {
      if (!byCompany[row.company]) byCompany[row.company] = { company: row.company, category: row.company_category, people: [] };
      byCompany[row.company].people.push(row);
    }

    res.json({ stats, companies: Object.values(byCompany).sort((a, b) => a.company.localeCompare(b.company)) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/unified/all-contacts — all contacts across all companies ──────────
router.get('/all-contacts', async (req, res) => {
  try {
    const { limit = 200, hasEmail, noEmail } = req.query;
    let where = '';
    if (hasEmail === 'true') where = "WHERE jc.email IS NOT NULL AND jc.email != ''";
    else if (noEmail === 'true') where = "WHERE (jc.email IS NULL OR jc.email = '')";
    const rows = await all(`
      SELECT jc.id, jc.name, jc.title, jc.email, jc.email_status, jc.linkedin_url,
             jc.status, jc.job_id, j.name as company_name, j.category
      FROM job_contacts jc
      LEFT JOIN jobs j ON j.id = jc.job_id
      ${where}
      ORDER BY jc.created_at DESC
      LIMIT $1
    `, [Number(limit)]);
    const totalRow = await one(`SELECT COUNT(*)::int AS n FROM job_contacts jc ${where}`);
    res.json({ contacts: rows, total: totalRow?.n || 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
