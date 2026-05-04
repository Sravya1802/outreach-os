/**
 * Multi-provider email finder — tries sources in order until results are found.
 *
 * Sources (in order):
 *   1. Hunter.io        — domain-search API (25 free/mo)  [handled in jobs.js]
 *   2. Prospeo.io       — domain-search (75 free/mo, no phone required)
 *   3. Serper email     — Google search for @domain.com mentions (free, in quota)
 *   4. Website scraper  — fetches /team /about /contact pages, regex-extracts emails
 */

// ── Prospeo.io ────────────────────────────────────────────────────────────────
// Sign up at prospeo.io — just email + password, no phone required.
// API key: prospeo.io/app → API → copy key → set PROSPEO_API_KEY in .env
// Free tier: 75 credits/month. Each domain-search costs 1 credit.

export async function findEmailsByProspeo(domain, limit = 20) {
  const key = (process.env.PROSPEO_API_KEY || '').trim();
  if (!key || key === 'your_prospeo_api_key') {
    throw new Error('PROSPEO_API_KEY not configured');
  }

  console.log(`[Prospeo] domain-search: ${domain}`);
  const res = await fetch(`https://api.prospeo.io/domain-search?domain=${encodeURIComponent(domain)}&limit=${limit}`, {
    method:  'GET',
    headers: { 'X-KEY': key, 'Content-Type': 'application/json' },
    signal:  AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Prospeo HTTP ${res.status}: ${txt.slice(0, 200)}`);
  }

  const data = await res.json();
  // Response shape: { response: [ { email, first_name, last_name, position, linkedin, confidence } ] }
  const emails = Array.isArray(data.response) ? data.response : [];
  console.log(`[Prospeo] ${emails.length} results for ${domain}`);

  return emails.map(e => ({
    email:        e.email,
    name:         `${e.first_name || ''} ${e.last_name || ''}`.trim() || 'Unknown',
    title:        e.position || '',
    linkedin_url: e.linkedin  || '',
    confidence:   e.confidence ?? 80,
    source:       'prospeo',
  }));
}

// ── Prospeo email-finder (per person) ────────────────────────────────────────
// Different from domain-search above — this endpoint takes first/last/domain
// and returns the single most-likely email for that person. 1 Prospeo credit.
//   POST https://api.prospeo.io/email-finder
//   Body { first_name, last_name, company: <domain> }
//   Response { response: { email, email_status } }
export async function findEmailByProspeo({ firstName, lastName, domain }) {
  const key = (process.env.PROSPEO_API_KEY || '').trim();
  if (!key || key === 'your_prospeo_api_key') throw new Error('PROSPEO_API_KEY not configured');
  if (!firstName || !lastName || !domain) throw new Error('Need firstName, lastName, domain');

  const res = await fetch('https://api.prospeo.io/email-finder', {
    method:  'POST',
    headers: { 'X-KEY': key, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ first_name: firstName, last_name: lastName, company: domain }),
    signal:  AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Prospeo HTTP ${res.status}: ${txt.slice(0, 200)}`);
  }

  const data = await res.json();
  const r = data?.response;
  if (!r?.email) return null;
  return {
    email: r.email,
    email_status: r.email_status || 'unknown',
    confidence: r.confidence ?? 80,
    source: 'prospeo',
  };
}

// ── Serper email search ───────────────────────────────────────────────────────
// Uses Google to find publicly listed email addresses for a domain.

export async function findEmailsBySerper(domain, companyName = '') {
  const key = (process.env.SERPER_API_KEY || '').trim();
  if (!key || key.length < 10) {
    throw new Error('SERPER_API_KEY not configured');
  }

  console.log(`[Serper-email] searching for @${domain} emails`);

  const queries = [
    `"@${domain}" engineer OR developer OR CTO OR director OR founder`,
    `site:${domain} email contact`,
  ];

  const found = new Map(); // email → contact object

  for (const q of queries) {
    try {
      const res = await fetch('https://google.serper.dev/search', {
        method:  'POST',
        headers: { 'X-API-KEY': key, 'Content-Type': 'application/json' },
        body:    JSON.stringify({ q, num: 10 }),
        signal:  AbortSignal.timeout(10000),
      });
      const data = await res.json();
      const results = [...(data.organic || []), ...(data.knowledgeGraph ? [data.knowledgeGraph] : [])];

      for (const item of results) {
        const text = `${item.title || ''} ${item.snippet || ''} ${item.description || ''}`;
        const emailRegex = /[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi;
        for (const email of (text.match(emailRegex) || [])) {
          if (email.toLowerCase().endsWith(`@${domain}`) && !found.has(email.toLowerCase())) {
            const nameMatch  = item.title?.match(/^([A-Z][a-z]+ [A-Z][a-z]+)/);
            const titleMatch = item.snippet?.match(/(engineer|developer|cto|ceo|founder|director|manager|vp|president|researcher|scientist)[^,.\n]*/i);
            found.set(email.toLowerCase(), {
              email:        email.toLowerCase(),
              name:         nameMatch?.[1] || 'Unknown',
              title:        titleMatch?.[0]?.trim() || '',
              linkedin_url: '',
              confidence:   60,
              source:       'serper',
            });
          }
        }
      }
    } catch (err) {
      console.warn(`[Serper-email] query failed: ${err.message}`);
    }
  }

  const results = [...found.values()];
  console.log(`[Serper-email] found ${results.length} emails for ${domain}`);
  return results;
}

// ── Website team/about page scraper ──────────────────────────────────────────
// Fetches common staff pages and regex-extracts email addresses.

const STAFF_PATHS = ['/team', '/about', '/about-us', '/people', '/our-team', '/contact', '/contact-us', '/leadership', '/staff'];

export async function findEmailsByWebsiteScrape(domain) {
  console.log(`[WebScrape] scraping ${domain} for emails`);
  const domainEscaped = domain.replace(/\./g, '\\.');
  const emailRegex = new RegExp(`[\\w.+-]+@${domainEscaped}`, 'gi');
  const found = new Map();

  for (const path of STAFF_PATHS) {
    const url = `https://${domain}${path}`;
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept':     'text/html,application/xhtml+xml',
        },
        signal:   AbortSignal.timeout(8000),
        redirect: 'follow',
      });
      if (!res.ok) continue;
      const html = await res.text();

      for (const email of (html.match(emailRegex) || [])) {
        const lc = email.toLowerCase();
        // Skip generic/noreply addresses
        if (/^(info|hello|hi|contact|support|noreply|no-reply|admin|help|team|press|media|jobs|careers|sales|privacy|legal|security|abuse|billing)@/.test(lc)) continue;
        if (!found.has(lc)) {
          const ctxIdx    = html.toLowerCase().indexOf(lc);
          const ctxBefore = html.slice(Math.max(0, ctxIdx - 200), ctxIdx);
          const nameMatch  = ctxBefore.match(/([A-Z][a-z]+ [A-Z][a-z]+)\s*<?$/);
          const titleMatch = ctxBefore.match(/(engineer|developer|cto|ceo|founder|director|manager|vp|president|researcher|scientist|architect)[^<\n]*/i);
          found.set(lc, {
            email:        lc,
            name:         nameMatch?.[1] || 'Unknown',
            title:        titleMatch?.[0]?.trim() || '',
            linkedin_url: '',
            confidence:   70,
            source:       'website',
          });
        }
      }

      if (found.size >= 10) break;
    } catch {
      // Page not found or timeout — try next path
    }
  }

  const results = [...found.values()];
  console.log(`[WebScrape] found ${results.length} emails on ${domain}`);
  return results;
}

// ── Multi-source waterfall ────────────────────────────────────────────────────
/**
 * Try all email sources in order until we have results.
 * Returns { emails, usedSource } — usedSource is which provider succeeded.
 *
 * @param {string}   domain       - company email domain
 * @param {string}   companyName
 * @param {string[]} skipSources  - sources already tried (e.g. ['hunter'])
 */
export async function findEmailsMultiSource(domain, companyName = '', skipSources = []) {
  // Source 2: Prospeo.io
  if (!skipSources.includes('prospeo')) {
    try {
      const emails = await findEmailsByProspeo(domain);
      if (emails.length > 0) return { emails, usedSource: 'prospeo' };
    } catch (err) {
      console.log(`[emailfinders] Prospeo skipped: ${err.message}`);
    }
  }

  // Source 3: Serper email search
  if (!skipSources.includes('serper')) {
    try {
      const emails = await findEmailsBySerper(domain, companyName);
      if (emails.length > 0) return { emails, usedSource: 'serper' };
    } catch (err) {
      console.log(`[emailfinders] Serper-email skipped: ${err.message}`);
    }
  }

  // Source 4: Website scraper
  if (!skipSources.includes('website')) {
    try {
      const emails = await findEmailsByWebsiteScrape(domain);
      if (emails.length > 0) return { emails, usedSource: 'website' };
    } catch (err) {
      console.log(`[emailfinders] WebScrape skipped: ${err.message}`);
    }
  }

  return { emails: [], usedSource: null };
}
