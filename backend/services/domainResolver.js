import { findDomainByCompany } from './hunter.js';
import db from '../db.js';

// ATS subdomain prefixes to strip when parsing from careersUrl
const ATS_PREFIXES = [
  'careers.',
  'jobs.',
  'apply.',
  'hire.',
  'recruiting.',
  'recruitingbypaycor.',
  'greenhouse.',
  'lever.',
  'workday.',
  'taleo.',
  'icims.',
  'myworkdayjobs.',
  'ashby.',
];

// Hardcoded overrides for companies with non-obvious domains
const DOMAIN_OVERRIDES = {
  'goldman sachs': 'gs.com',
  'general motors': 'gm.com',
  'gm': 'gm.com',
  'procter & gamble': 'pg.com',
  'p&g': 'pg.com',
  'ernst & young': 'ey.com',
  'ey': 'ey.com',
  'pricewaterhousecoopers': 'pwc.com',
  'pwc': 'pwc.com',
  'johnson & johnson': 'jnj.com',
  'j&j': 'jnj.com',
  'general electric': 'ge.com',
  'ge': 'ge.com',
  'jpmorgan chase': 'jpmorganchase.com',
  'jp morgan': 'jpmorgan.com',
  'bank of america': 'bankofamerica.com',
  'morgan stanley': 'morganstanley.com',
};

/**
 * Strip ATS subdomain prefixes from a hostname to get the real company domain.
 * e.g. "careers.cloudflare.com" → "cloudflare.com"
 */
function stripAtsPrefixes(host) {
  let result = host;
  for (const prefix of ATS_PREFIXES) {
    if (result.startsWith(prefix)) {
      result = result.slice(prefix.length);
      break; // only strip one prefix
    }
  }
  return result;
}

/**
 * Check whether a domain string looks like a real domain (has a dot, not an ATS URL).
 */
function looksReal(domain) {
  if (!domain || !domain.includes('.')) return false;
  // Reject known ATS hostnames
  const atsHosts = [
    'greenhouse.io', 'lever.co', 'ashbyhq.com', 'workday.com',
    'myworkdayjobs.com', 'taleo.net', 'icims.com', 'jobvite.com',
    'smartrecruiters.com', 'bamboohr.com', 'recruitee.com', 'workable.com',
    'linkedin.com', 'indeed.com', 'glassdoor.com',
  ];
  const root = domain.split('.').slice(-2).join('.');
  return !atsHosts.includes(domain) && !atsHosts.includes(root);
}

/**
 * Build a slug from a company name for domain guessing.
 * Lowercased, spaces → hyphens, punctuation stripped.
 */
function toSlug(name) {
  return (name || '')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Attempt a HEAD request to a domain root URL with a 2-second timeout.
 * Returns true if the server responds (any HTTP status), false otherwise.
 */
async function headCheck(domain) {
  const url = `https://${domain}`;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(url, { method: 'HEAD', signal: controller.signal, redirect: 'follow' });
    clearTimeout(timer);
    return res.status < 600; // any real HTTP response
  } catch {
    return false;
  }
}

/**
 * Persist the resolved domain back to the jobs table.
 */
function saveResolvedDomain(jobId, domain) {
  try {
    db.prepare('UPDATE jobs SET resolved_domain = ? WHERE id = ?').run(domain, jobId);
  } catch (err) {
    console.warn(`[domainResolver] Failed to persist resolved_domain for job ${jobId}: ${err.message}`);
  }
}

/**
 * Resolve the real company domain for a job record.
 *
 * @param {Object} job - { id, name, url, domain } — job.domain may already exist
 * @returns {Promise<string|null>} - e.g. "cloudflare.com", or null if all methods fail
 */
export async function resolveCompanyDomain(job) {
  try {
    const companyName = (job.name || '').trim();

    // ── Fast path: job.domain is already a real domain ──────────────────────
    if (job.domain && looksReal(job.domain)) {
      console.log(`[domainResolver] Using existing domain for "${companyName}": ${job.domain}`);
      return job.domain;
    }

    // ── Step 1: Parse from careersUrl ────────────────────────────────────────
    const careersUrl = job.url || job.careersUrl || '';
    if (careersUrl) {
      try {
        const parsed = new URL(careersUrl);
        const host = parsed.hostname.replace(/^www\./, '');
        const stripped = stripAtsPrefixes(host);
        if (looksReal(stripped)) {
          console.log(`[domainResolver] Step 1 (careersUrl) resolved "${companyName}" → ${stripped}`);
          if (job.id) saveResolvedDomain(job.id, stripped);
          return stripped;
        }
      } catch (err) {
        console.warn(`[domainResolver] Step 1 URL parse failed for "${companyName}": ${err.message}`);
      }
    }

    // ── Step 2: Hardcoded overrides ──────────────────────────────────────────
    const nameLower = companyName.toLowerCase();
    for (const [key, domain] of Object.entries(DOMAIN_OVERRIDES)) {
      if (nameLower === key || nameLower.includes(key)) {
        console.log(`[domainResolver] Step 2 (override) resolved "${companyName}" → ${domain}`);
        if (job.id) saveResolvedDomain(job.id, domain);
        return domain;
      }
    }

    // ── Step 3: Clearbit autocomplete ────────────────────────────────────────
    try {
      const clearbitUrl = `https://autocomplete.clearbit.com/v1/companies/suggest?query=${encodeURIComponent(companyName)}`;
      console.log(`[domainResolver] Step 3 querying Clearbit for "${companyName}"`);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(clearbitUrl, { signal: controller.signal });
      clearTimeout(timer);
      if (res.ok) {
        const results = await res.json();
        const domain = results?.[0]?.domain;
        if (domain && looksReal(domain)) {
          console.log(`[domainResolver] Step 3 (Clearbit) resolved "${companyName}" → ${domain}`);
          if (job.id) saveResolvedDomain(job.id, domain);
          return domain;
        } else {
          console.log(`[domainResolver] Step 3 (Clearbit) no usable result for "${companyName}"`);
        }
      } else {
        console.warn(`[domainResolver] Step 3 (Clearbit) HTTP ${res.status} for "${companyName}"`);
      }
    } catch (err) {
      console.warn(`[domainResolver] Step 3 (Clearbit) failed for "${companyName}": ${err.message}`);
    }

    // ── Step 4: Hunter company name lookup ───────────────────────────────────
    try {
      console.log(`[domainResolver] Step 4 querying Hunter for "${companyName}"`);
      const domain = await findDomainByCompany(companyName);
      if (domain && looksReal(domain)) {
        console.log(`[domainResolver] Step 4 (Hunter) resolved "${companyName}" → ${domain}`);
        if (job.id) saveResolvedDomain(job.id, domain);
        return domain;
      } else {
        console.log(`[domainResolver] Step 4 (Hunter) no result for "${companyName}"`);
      }
    } catch (err) {
      console.warn(`[domainResolver] Step 4 (Hunter) failed for "${companyName}": ${err.message}`);
    }

    // ── Step 5: Slug-based HEAD checks ───────────────────────────────────────
    const slug = toSlug(companyName);
    if (slug) {
      const tlds = ['com', 'io', 'co', 'ai'];
      for (const tld of tlds) {
        const candidate = `${slug}.${tld}`;
        console.log(`[domainResolver] Step 5 HEAD check: ${candidate}`);
        const alive = await headCheck(candidate);
        if (alive) {
          console.log(`[domainResolver] Step 5 (slug HEAD) resolved "${companyName}" → ${candidate}`);
          if (job.id) saveResolvedDomain(job.id, candidate);
          return candidate;
        }
      }
      console.log(`[domainResolver] Step 5 (slug HEAD) no live domain found for "${companyName}"`);
    }

    // ── All methods exhausted ────────────────────────────────────────────────
    console.log(`[domainResolver] All methods failed for "${companyName}" — returning null`);
    return null;

  } catch (err) {
    console.error(`[domainResolver] Unexpected error for job "${job?.name}": ${err.message}`);
    return null;
  }
}
