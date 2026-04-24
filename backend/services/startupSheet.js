/**
 * Imports companies from a publicly-accessible Google Sheet (CSV export).
 * Requires the sheet to be shared as "Anyone with the link can view".
 */

import db, { run } from '../db.js';

const ATS_SLUG_MAP = {}; // cache: companySlug -> { ats, token }

function toSlug(name) {
  return (name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/, '');
}

// Parse CSV text into array of objects
function parseCSV(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];

  // Handle quoted fields
  function parseLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '"') { inQuotes = !inQuotes; continue; }
      if (line[i] === ',' && !inQuotes) { result.push(current.trim()); current = ''; continue; }
      current += line[i];
    }
    result.push(current.trim());
    return result;
  }

  const headers = parseLine(lines[0]);
  return lines.slice(1).map(line => {
    const vals = parseLine(line);
    const row = {};
    headers.forEach((h, i) => row[h] = vals[i] || '');
    return row;
  }).filter(row => Object.values(row).some(v => v.trim()));
}

function detectColumns(headers) {
  const nameCol     = headers.find(h => /company|name|startup|org/i.test(h));
  const domainCol   = headers.find(h => /website|domain|url|site|link/i.test(h));
  const categoryCol = headers.find(h => /category|industry|sector|type|stage/i.test(h));
  const careersCol  = headers.find(h => /career|jobs|hiring/i.test(h));
  return { nameCol, domainCol, categoryCol, careersCol };
}

function extractDomainFromUrl(url) {
  if (!url) return '';
  try {
    const u = url.startsWith('http') ? url : `https://${url}`;
    return new URL(u).hostname.replace(/^www\./, '');
  } catch { return url.trim(); }
}

async function detectATS(companyName, domain) {
  const slug = toSlug(companyName);
  const candidates = [slug, domain?.split('.')[0] || ''].filter(Boolean);

  for (const token of candidates) {
    // Greenhouse
    try {
      const r = await fetch(`https://boards-api.greenhouse.io/v1/boards/${token}/jobs`, { signal: AbortSignal.timeout(4000) });
      if (r.ok) return { ats: 'greenhouse', token };
    } catch {}
    // Lever
    try {
      const r = await fetch(`https://api.lever.co/v0/postings/${token}?mode=json`, { signal: AbortSignal.timeout(4000) });
      if (r.ok) return { ats: 'lever', token };
    } catch {}
    // Ashby
    try {
      const r = await fetch(`https://api.ashbyhq.com/posting-api/job-board/${token}/jobPostings`, { signal: AbortSignal.timeout(4000) });
      if (r.ok) return { ats: 'ashby', token };
    } catch {}
  }
  return { ats: 'unknown' };
}

const CS_ROLE_PATTERN = /software\s*engineer|swe\b|backend|frontend|full.?stack|mobile\s*engineer|\bios\b|\bandroid\b|data\s*engineer|ml\s*engineer|machine\s*learning|ai\s*engineer|infrastructure|platform\s*engineer|devops|site\s*reliability|security\s*engineer|research\s*engineer|quantitative|quant\b|algorithms|systems\s*engineer|\bintern\b|new\s*grad/i;

async function fetchCSRoles(ats, token) {
  try {
    if (ats === 'greenhouse') {
      const r = await fetch(`https://boards-api.greenhouse.io/v1/boards/${token}/jobs`, { signal: AbortSignal.timeout(8000) });
      if (!r.ok) return [];
      const data = await r.json();
      return (data.jobs || []).filter(j => CS_ROLE_PATTERN.test(j.title || '')).map(j => ({
        title: j.title, url: j.absolute_url, location: (j.location?.name || ''),
      }));
    }
    if (ats === 'lever') {
      const r = await fetch(`https://api.lever.co/v0/postings/${token}?mode=json`, { signal: AbortSignal.timeout(8000) });
      if (!r.ok) return [];
      const jobs = await r.json();
      return (Array.isArray(jobs) ? jobs : []).filter(j => CS_ROLE_PATTERN.test(j.text || '')).map(j => ({
        title: j.text, url: j.hostedUrl, location: j.categories?.location || '',
      }));
    }
    if (ats === 'ashby') {
      const r = await fetch(`https://api.ashbyhq.com/posting-api/job-board/${token}/jobPostings`, { signal: AbortSignal.timeout(8000) });
      if (!r.ok) return [];
      const data = await r.json();
      return (data.jobPostings || []).filter(j => CS_ROLE_PATTERN.test(j.title || '')).map(j => ({
        title: j.title, url: j.jobUrl, location: j.location || '',
      }));
    }
  } catch {}
  return [];
}

export async function importStartupSheet(userId, onProgress = null) {
  if (!userId) throw new Error('importStartupSheet requires userId (caller must pass req.user.id)');
  const sheetUrl = process.env.STARTUP_SHEET_URL;
  if (!sheetUrl) throw new Error('STARTUP_SHEET_URL not set in .env');

  function emit(msg) {
    console.log('[StartupSheet]', msg);
    if (onProgress) onProgress(msg);
  }

  // Step 1: Fetch CSV
  emit('Fetching Google Sheet...');
  const res = await fetch(sheetUrl, { signal: AbortSignal.timeout(15000) });
  const text = await res.text();

  if (text.trim().startsWith('<!')) {
    throw new Error('Sheet is not publicly accessible. In Google Sheets → Share → Anyone with the link → Viewer');
  }

  const rows = parseCSV(text);
  if (rows.length === 0) throw new Error('No data rows found in sheet');

  const headers = Object.keys(rows[0]);
  const { nameCol, domainCol, categoryCol, careersCol } = detectColumns(headers);

  emit(`Columns: ${headers.join(', ')}`);
  emit(`Fetched ${rows.length} rows`);

  if (!nameCol) throw new Error(`Could not find company name column. Headers: ${headers.join(', ')}`);

  // Step 2: Normalize rows
  const companies = rows
    .map(row => ({
      name:       (row[nameCol] || '').trim(),
      domain:     extractDomainFromUrl(row[domainCol]),
      category:   row[categoryCol] || '',
      careersUrl: row[careersCol] || '',
    }))
    .filter(c => c.name && c.name.length > 1 && !/^(company|name|startup)/i.test(c.name));

  emit(`Parsed ${companies.length} valid companies`);

  // Step 3: Process in batches of 10
  const BATCH = 10;
  let withRoles = 0, noRoles = 0, errors = 0;

  const INSERT_SQL = `
    INSERT INTO jobs (name, domain, url, category, subcategory, source, is_hiring, user_id)
    VALUES ($1, $2, $3, 'Startups', $4, 'startup_sheet', $5, $6)
    ON CONFLICT (name) DO NOTHING
  `;

  for (let i = 0; i < companies.length; i += BATCH) {
    const batch = companies.slice(i, i + BATCH);

    await Promise.allSettled(batch.map(async company => {
      try {
        const { ats, token } = await detectATS(company.name, company.domain);
        let csRoles = [];

        if (ats !== 'unknown') {
          csRoles = await fetchCSRoles(ats, token);
          emit(`✓ ${company.name} — ${csRoles.length} CS roles (${ats})`);
        } else {
          emit(`○ ${company.name} — no ATS detected`);
        }

        const isHiring = csRoles.length > 0 ? 1 : 0;
        const careersUrl = csRoles[0]?.url || company.careersUrl || '';
        const subcategory = company.category || 'Series A';

        await run(INSERT_SQL, [company.name, company.domain, careersUrl, subcategory, isHiring, userId]);

        if (isHiring) withRoles++;
        else noRoles++;
      } catch (err) {
        errors++;
        emit(`✗ ${company.name} — error: ${err.message}`);
      }
    }));

    emit(`Progress: ${Math.min(i + BATCH, companies.length)} / ${companies.length}`);
    await new Promise(r => setTimeout(r, 500));
  }

  emit(`Done: ${withRoles} with CS roles · ${noRoles} no roles · ${errors} errors`);
  return { withRoles, noRoles, errors, total: companies.length };
}
