import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_PATH = path.join(__dirname, '..', 'data', 'yc-hiring-cache.json');
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

let _memCache = null;
let _memFetchedAt = 0;

// Fetch and cache YC hiring companies list
export async function getYCHiringCompanies() {
  const now = Date.now();

  // Memory cache
  if (_memCache && (now - _memFetchedAt) < CACHE_TTL_MS) {
    return _memCache;
  }

  // Disk cache
  try {
    if (fs.existsSync(CACHE_PATH)) {
      const raw = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
      if (raw.fetchedAt && (now - new Date(raw.fetchedAt).getTime()) < CACHE_TTL_MS) {
        _memCache = raw.companies;
        _memFetchedAt = new Date(raw.fetchedAt).getTime();
        console.log(`[yc] loaded ${_memCache.length} companies from disk cache`);
        return _memCache;
      }
    }
  } catch (_) {}

  // Fetch fresh
  console.log('[yc] fetching fresh hiring.json from yc-oss API...');
  const res = await fetch('https://yc-oss.github.io/api/companies/hiring.json', {
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`YC API HTTP ${res.status}`);
  const companies = await res.json();
  console.log(`[yc] fetched ${companies.length} hiring companies`);

  // Save to disk
  try {
    fs.writeFileSync(CACHE_PATH, JSON.stringify({ fetchedAt: new Date().toISOString(), companies }, null, 2));
  } catch (_) {}

  _memCache = companies;
  _memFetchedAt = now;
  return companies;
}

// Fetch all YC companies (for name search)
let _allCache = null;
let _allFetchedAt = 0;
const ALL_CACHE_PATH = path.join(__dirname, '..', 'data', 'yc-all-cache.json');

export async function getAllYCCompanies() {
  const now = Date.now();
  if (_allCache && (now - _allFetchedAt) < CACHE_TTL_MS) return _allCache;

  try {
    if (fs.existsSync(ALL_CACHE_PATH)) {
      const raw = JSON.parse(fs.readFileSync(ALL_CACHE_PATH, 'utf8'));
      if (raw.fetchedAt && (now - new Date(raw.fetchedAt).getTime()) < CACHE_TTL_MS) {
        _allCache = raw.companies;
        _allFetchedAt = new Date(raw.fetchedAt).getTime();
        return _allCache;
      }
    }
  } catch (_) {}

  console.log('[yc] fetching all.json...');
  const res = await fetch('https://yc-oss.github.io/api/companies/all.json', {
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`YC all.json HTTP ${res.status}`);
  const companies = await res.json();
  console.log(`[yc] fetched ${companies.length} total YC companies`);

  try {
    fs.writeFileSync(ALL_CACHE_PATH, JSON.stringify({ fetchedAt: new Date().toISOString(), companies }, null, 2));
  } catch (_) {}

  _allCache = companies;
  _allFetchedAt = now;
  return companies;
}

// Search YC companies by name (case-insensitive, fuzzy)
export async function findYCCompany(name) {
  try {
    const all = await getAllYCCompanies();
    const lower = name.toLowerCase();
    return all.find(c =>
      c.name?.toLowerCase() === lower ||
      c.name?.toLowerCase().includes(lower) ||
      lower.includes(c.name?.toLowerCase() || '__')
    ) || null;
  } catch {
    return null;
  }
}

// Filter hiring companies by criteria
export function filterYCCompanies(companies, filters = {}) {
  let list = [...companies];

  if (filters.location === 'us') {
    list = list.filter(c =>
      c.regions?.some(r => /united states|remote/i.test(r)) ||
      c.all_locations?.toLowerCase().includes('san francisco') ||
      c.all_locations?.toLowerCase().includes('new york') ||
      c.all_locations?.toLowerCase().includes('united states') ||
      !c.all_locations
    );
  }

  if (filters.industry) {
    const q = filters.industry.toLowerCase();
    list = list.filter(c =>
      c.industry?.toLowerCase().includes(q) ||
      c.subindustry?.toLowerCase().includes(q) ||
      c.tags?.some(t => t.toLowerCase().includes(q))
    );
  }

  if (filters.maxTeamSize) {
    list = list.filter(c => !c.team_size || c.team_size <= Number(filters.maxTeamSize));
  }

  if (filters.minTeamSize) {
    list = list.filter(c => !c.team_size || c.team_size >= Number(filters.minTeamSize));
  }

  if (filters.batch) {
    list = list.filter(c => c.batch === filters.batch);
  }

  if (filters.search) {
    const q = filters.search.toLowerCase();
    list = list.filter(c =>
      c.name?.toLowerCase().includes(q) ||
      c.one_liner?.toLowerCase().includes(q) ||
      c.tags?.some(t => t.toLowerCase().includes(q))
    );
  }

  return list;
}

// Map YC company to standard jobs table format
export function ycToJobRow(c) {
  return {
    name:     c.name,
    role:     'Software Engineer Intern',
    location: c.all_locations || 'USA',
    pay:      0,
    careersUrl: `https://www.workatastartup.com/companies/${c.slug}`,
    category:   mapYCIndustry(c.industry),
    subcategory: c.subindustry || null,
    source:   'yc',
    stage:    c.batch || 'YC',
    // extra fields stored in jobs table
    _ycSlug:  c.slug,
    _ycBatch: c.batch,
    _ycOneLiner: c.one_liner,
    _teamSize:   c.team_size,
    _website:    c.website,
  };
}

// Map YC industry label → our category system
function mapYCIndustry(industry) {
  if (!industry) return 'Startups';
  const i = industry.toLowerCase();
  if (/fintech|finance|banking/.test(i)) return 'Finance & Investing';
  if (/health|medical|bio|pharma/.test(i)) return 'Healthcare & Life Sciences';
  if (/ai|machine learning|artificial intelligence|ml/.test(i)) return 'AI & Research';
  if (/education|edtech/.test(i)) return 'Education';
  if (/energy|climate|cleantech/.test(i)) return 'Energy & Climate';
  if (/consumer|retail|e-commerce/.test(i)) return 'Consumer & Retail';
  if (/b2b|enterprise|saas|software/.test(i)) return 'Tech & Software';
  if (/hardware|robotics|aerospace/.test(i)) return 'Hardware & Semiconductors';
  if (/media|entertainment|gaming/.test(i)) return 'Media & Entertainment';
  if (/real estate|proptech/.test(i)) return 'Real Estate';
  if (/transport|mobility|logistics/.test(i)) return 'Automotive & Mobility';
  if (/security|cyber/.test(i)) return 'Tech & Software';
  return 'Startups';
}
