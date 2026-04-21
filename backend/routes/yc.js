import { Router } from 'express';
import db from '../db.js';
import { getYCHiringCompanies, filterYCCompanies, findYCCompany, ycToJobRow } from '../services/yc.js';
import { ApifyClient } from 'apify-client';

const router = Router();

function getApifyClient() {
  return new ApifyClient({ token: process.env.APIFY_API_TOKEN || '' });
}

// GET /api/yc/companies — filtered list from cache
router.get('/companies', async (req, res) => {
  try {
    const companies = await getYCHiringCompanies();
    const { location, industry, maxTeamSize, minTeamSize, batch, search, page = 0, pageSize = 50 } = req.query;

    const filtered = filterYCCompanies(companies, {
      location,
      industry,
      maxTeamSize: maxTeamSize ? Number(maxTeamSize) : null,
      minTeamSize: minTeamSize ? Number(minTeamSize) : null,
      batch,
      search,
    });

    const total   = filtered.length;
    const pg      = Number(page);
    const ps      = Number(pageSize);
    const slice   = filtered.slice(pg * ps, pg * ps + ps);
    const hasMore = (pg + 1) * ps < total;

    // Get distinct batches and industries for filter dropdowns
    const batches    = [...new Set(companies.map(c => c.batch).filter(Boolean))].sort().reverse();
    const industries = [...new Set(companies.map(c => c.industry).filter(Boolean))].sort();

    res.json({ companies: slice, total, hasMore, page: pg, batches, industries });
  } catch (err) {
    console.error('[yc] list error:', err.message);
    res.status(500).json({ error: err.message, companies: [], total: 0 });
  }
});

// GET /api/yc/companies/:slug — single company detail + optional WaaS scrape
router.get('/companies/:slug', async (req, res) => {
  try {
    const companies = await getYCHiringCompanies();
    const company   = companies.find(c => c.slug === req.params.slug);
    if (!company) return res.status(404).json({ error: 'Company not found' });

    // Optionally fetch jobs from WaaS page via Apify rag-web-browser
    let jobs = [];
    const apifyToken = process.env.APIFY_API_TOKEN || '';
    if (apifyToken && apifyToken.length > 10 && req.query.fetchJobs === 'true') {
      try {
        const client = getApifyClient();
        const run = await client.actor('apify/rag-web-browser').call({
          startUrls: [{ url: `https://www.workatastartup.com/companies/${company.slug}` }],
          maxCrawlDepth: 0,
          maxCrawlPages: 1,
          outputFormats: ['text'],
        }, { waitForFinish: 60 });
        const { items } = await client.dataset(run.defaultDatasetId).listItems();
        const text = items[0]?.text || '';
        // Parse job titles from WaaS page
        const lines = text.split('\n');
        for (const line of lines) {
          const m = line.match(/^(Software|ML|Machine Learning|Data|Frontend|Backend|Full Stack|iOS|Android|Infrastructure|Platform|Security|DevOps|SRE)[^\n]{3,60}(Intern|Engineer|Developer)/i);
          if (m) {
            const title = line.trim().slice(0, 80);
            jobs.push({ title, location: company.all_locations || 'Unknown', apply_url: `https://www.workatastartup.com/companies/${company.slug}` });
          }
        }
      } catch (err) {
        console.log(`[yc] WaaS job fetch failed for ${company.slug}: ${err.message}`);
      }
    }

    res.json({ company, jobs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/yc/import — import selected companies into jobs table
router.post('/import', async (req, res) => {
  try {
    const { slugs = [] } = req.body;
    console.log(`[yc] Import request for slugs:`, slugs);
    if (!slugs.length) return res.json({ imported: 0, skipped: 0, companies: [] });

    const allCompanies = await getYCHiringCompanies();
    console.log(`[yc] Found ${allCompanies.length} YC companies`);
    const toImport     = allCompanies.filter(c => slugs.includes(c.slug));
    console.log(`[yc] Filtered to import: ${toImport.length} companies`, toImport.map(c => c.name));

    const insert = db.prepare(`
      INSERT OR IGNORE INTO jobs (name, roles, location, source, url, tag, category, subcategory, yc_batch, description, website, team_size)
      VALUES (?, ?, ?, 'yc', ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    let imported = 0, skipped = 0;
    const importedRows = [];

    const tx = db.transaction(() => {
      for (const c of toImport) {
        const r = ycToJobRow(c);
        const result = insert.run(
          r.name, r.role, r.location, r.careersUrl, c.slug,
          r.category, r.subcategory,
          c.batch || null, c.one_liner || c.long_description?.slice(0, 300) || null,
          c.website || null, c.team_size || null
        );
        if (result.changes > 0) {
          imported++;
          const insertedId = result.lastInsertRowid;
          importedRows.push({ id: insertedId, name: r.name });
          console.log(`[yc] Inserted ${r.name} with id ${insertedId}`);
        } else {
          // Already exists — get its id
          const existing = db.prepare("SELECT id, name FROM jobs WHERE name = ?").get(r.name);
          if (existing) {
            importedRows.push(existing);
            console.log(`[yc] ${r.name} already exists with id ${existing.id}`);
          }
          skipped++;
        }
      }
    });
    tx();

    try {
      db.prepare("INSERT INTO activity_log (action, details) VALUES ('yc_import', ?)")
        .run(`Imported ${imported} YC companies`);
    } catch (_) {}

    // Return first company's id for single-import navigation
    const first = importedRows[0] || null;
    console.log(`[yc] Import response: imported=${imported}, first=${first?.id}`);
    res.json({ imported, skipped, id: first?.id, name: first?.name, companies: importedRows });
  } catch (err) {
    console.error('[yc] import error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/yc/import-all — bulk import all filtered companies
router.post('/import-all', async (req, res) => {
  try {
    const filters = req.body?.filters || {};
    const companies = await getYCHiringCompanies();
    const toImport  = filterYCCompanies(companies, filters);

    const insert = db.prepare(`
      INSERT OR IGNORE INTO jobs (name, roles, location, source, url, tag, category, subcategory, yc_batch)
      VALUES (?, ?, ?, 'yc', ?, ?, ?, ?, ?)
    `);

    let imported = 0, skipped = 0;
    const tx = db.transaction(() => {
      for (const c of toImport) {
        const r = ycToJobRow(c);
        const result = insert.run(r.name, r.role, r.location, r.careersUrl, c.slug, r.category, r.subcategory, c.batch || null);
        if (result.changes > 0) imported++; else skipped++;
      }
    });
    tx();

    try {
      db.prepare("INSERT INTO activity_log (action, details) VALUES ('yc_import_all', ?)")
        .run(`Bulk imported ${imported} YC companies (${skipped} skipped)`);
    } catch (_) {}

    res.json({ imported, skipped, total: toImport.length });
  } catch (err) {
    console.error('[yc] import-all error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/yc/scrape-waas — scrape WaaS intern listings
router.post('/scrape-waas', async (req, res) => {
  try {
    // Use the free YC API as primary source — no Apify needed
    const companies = await getYCHiringCompanies();
    const usFilter  = filterYCCompanies(companies, { location: 'us' });

    const insert = db.prepare(`
      INSERT OR IGNORE INTO jobs (name, roles, location, source, url, tag, category, subcategory, yc_batch)
      VALUES (?, ?, ?, 'yc', ?, ?, ?, ?, ?)
    `);

    let imported = 0, skipped = 0;
    const tx = db.transaction(() => {
      for (const c of usFilter.slice(0, 500)) {
        const r = ycToJobRow(c);
        const result = insert.run(r.name, r.role, r.location, r.careersUrl, c.slug, r.category, r.subcategory, c.batch || null);
        if (result.changes > 0) imported++; else skipped++;
      }
    });
    tx();

    try {
      db.prepare("INSERT INTO activity_log (action, details) VALUES ('yc_waas_scrape', ?)")
        .run(`Scraped WaaS: ${imported} new YC companies imported`);
    } catch (_) {}

    res.json({ imported, skipped, total: usFilter.length, source: 'yc-oss-api' });
  } catch (err) {
    console.error('[yc] scrape-waas error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
