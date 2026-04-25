import { ApifyClient } from 'apify-client';

// Token is read lazily so dotenv has time to load before first use
function getToken() { return process.env.APIFY_API_TOKEN || ''; }
function getClient() { return new ApifyClient({ token: getToken() }); }

// Log token presence once the event loop starts (after dotenv config runs)
setTimeout(() => {
  console.log(`[apify] token present: ${getToken().length > 10}`);
  console.log(`[serper] key present: ${(process.env.SERPER_API_KEY || '').length > 10}`);
}, 0);

// ── Quota-burn sentinel ─────────────────────────────────────────────────────
// Apify's /v2/users/me endpoint reports the *account's* platform credit balance,
// which is reliably 0/0 on FREE accounts even when the actor-side monthly limit
// has been blown. So creditChecker can't detect a burn from the Apify API
// alone. We track it here: every actor-failure path that throws with a
// quota-shaped message bumps a module-level timestamp + last error. The
// /api/credits/status route reads this via getApifyQuotaBurn() and flags
// `critical: true` when the burn was recent (last 6h). The sidebar Apify dot
// turns red within seconds of the next failed scrape — no polling needed.
const apifyQuotaBurn = { lastFailureAt: 0, lastError: null, lastActor: null };
const QUOTA_RE = /hard limit|monthly usage|quota|exhausted|insufficient.*credit|402|payment required/i;
export function noteApifyError(actor, err) {
  const msg = err?.message || String(err);
  if (QUOTA_RE.test(msg)) {
    apifyQuotaBurn.lastFailureAt = Date.now();
    apifyQuotaBurn.lastError     = msg.slice(0, 200);
    apifyQuotaBurn.lastActor     = actor || null;
  }
}
export function getApifyQuotaBurn() {
  if (!apifyQuotaBurn.lastFailureAt) return null;
  const ageMs = Date.now() - apifyQuotaBurn.lastFailureAt;
  return { ...apifyQuotaBurn, ageMs, recent: ageMs < 6 * 60 * 60 * 1000 };
}

// ── Serper.dev Google search (replaces Apify google-search-scraper) ──────────
// Returns { organic: [{ title, link, snippet }] }
async function serperSearch(query, num = 10) {
  const key = (process.env.SERPER_API_KEY || '').trim();
  if (!key || key === 'your_serper_key_here' || key.length < 10) {
    throw new Error('SERPER_API_KEY not configured');
  }
  const res = await fetch('https://google.serper.dev/search', {
    method:  'POST',
    headers: { 'X-API-KEY': key, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ q: query, num }),
    signal:  AbortSignal.timeout(12000),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Serper HTTP ${res.status}: ${txt.slice(0, 200)}`);
  }
  return res.json();
}

// Run an Apify actor and await completion with full status logging
async function runActor(actorId, input, waitSecs = 120) {
  const client = getClient();
  console.log(`[apify] starting actor ${actorId}...`);
  try {
    const run = await client.actor(actorId).call(input, { waitSecs });
    console.log(`[apify] run ID: ${run.id} — status: ${run.status}`);
    if (run.status !== 'SUCCEEDED') {
      throw new Error(`Actor ${actorId} finished with status ${run.status}`);
    }
    const { items } = await client.dataset(run.defaultDatasetId).listItems();
    console.log(`[apify] dataset items: ${items.length}`);
    return items;
  } catch (err) {
    // Defense in depth: even if the caller forgets to call noteApifyError,
    // central runActor catches any quota-shaped error before re-throwing.
    noteApifyError(actorId, err);
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Category label mappings — DB stores exact CATEGORY LABEL strings
// These must match the `label` field in OutreachHub's CATEGORIES constant
// ─────────────────────────────────────────────────────────────────────────────

const SIMPLIFY_CAT_MAP = {
  'Quant':                               'Quant / HFT',
  'Quantitative Finance':                'Quant / HFT',
  'AI/ML/Data':                          'AI Labs',
  'Data Science, AI & Machine Learning': 'AI Labs',
  'Hardware':                            'Startups',
  'Hardware Engineering':                'Startups',
  'Software':                            'Growth Tech',
  'Software Engineering':                'Growth Tech',
  'Product':                             'Growth Tech',
  'Product Management':                  'Growth Tech',
  'Other':                               'Growth Tech',
};

// ─────────────────────────────────────────────────────────────────────────────
// Source 1: SimplifyJobs GitHub (free, no Apify credits)
// ─────────────────────────────────────────────────────────────────────────────

export async function scrapeGitHubInternships() {
  try {
    const url = 'https://raw.githubusercontent.com/SimplifyJobs/Summer2026-Internships/dev/.github/scripts/listings.json';
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const listings = await res.json();
    const active = listings.filter(item => item.active === true && item.company_name);
    console.log(`[simplify] ${active.length} active listings`);

    return active.map(item => ({
      name:       item.company_name,
      role:       item.title || 'Software Engineering Intern',
      location:   Array.isArray(item.locations) ? item.locations.slice(0, 3).join(', ') : (item.location || ''),
      pay:        0,
      careersUrl: item.url || '',
      // category set to our label — subcategory stays null (generic scrape)
      category:   SIMPLIFY_CAT_MAP[item.category] || 'Growth Tech',
      subcategory: null,
      source:     'simplify',
    }));
  } catch (err) {
    console.error(`[simplify] failed: ${err.message}`);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Source 2: SpeedyApply GitHub (free, markdown parse)
// ─────────────────────────────────────────────────────────────────────────────

export async function scrapeSpeedyApply() {
  try {
    const url = 'https://raw.githubusercontent.com/speedyapply/2026-SWE-College-Jobs/main/README.md';
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();

    const results = [];
    let currentCategory = 'Growth Tech';

    for (const line of text.split('\n')) {
      if (/###\s*FAANG/i.test(line))  { currentCategory = 'Big Tech';    continue; }
      if (/###\s*Quant/i.test(line))  { currentCategory = 'Quant / HFT'; continue; }
      if (/###\s*Other/i.test(line))  { currentCategory = 'Growth Tech';  continue; }

      if (!line.startsWith('|') || !line.includes('<strong>')) continue;
      const cols = line.split('|').map(c => c.trim());
      const companyMatch = cols[1]?.match(/<strong>(.*?)<\/strong>/);
      if (!companyMatch) continue;

      const applyMatch  = cols[5]?.match(/href="(https?:\/\/[^"]+)"/);
      const salaryMatch = cols[4]?.match(/\$(\d+)/);

      results.push({
        name:       companyMatch[1].trim(),
        role:       cols[2]?.replace(/<[^>]+>/g, '').trim() || 'Software Engineering Intern',
        location:   cols[3]?.replace(/<[^>]+>/g, '').trim() || 'USA',
        pay:        salaryMatch ? parseInt(salaryMatch[1]) : 0,
        careersUrl: applyMatch?.[1] || '',
        category:   currentCategory,
        subcategory: null,
        source:     'speedyapply',
      });
    }

    console.log(`[speedyapply] parsed ${results.length} listings`);
    return results;
  } catch (err) {
    console.error(`[speedyapply] failed: ${err.message}`);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Source 3: LinkedIn Jobs — Apify (verbose logging + actor fallback)
// ─────────────────────────────────────────────────────────────────────────────

// LinkedIn Jobs actor configs — tried in order until one succeeds
// Each entry has { actorId, buildInput } so we can adapt to each actor's schema
const LINKEDIN_ACTOR_CONFIGS = [
  {
    // valig/linkedin-jobs-scraper — keyword search, no cookie needed
    actorId: 'valig/linkedin-jobs-scraper',
    buildInput: (query) => ({
      keyword:  query,
      location: 'United States',
      limit:    100,
    }),
  },
  {
    // bebity/linkedin-jobs-scraper — keyword + location
    actorId: 'bebity/linkedin-jobs-scraper',
    buildInput: (query) => ({
      keyword:  query,
      location: 'United States',
      limit:    100,
    }),
  },
  {
    // curious_coder — requires URLs, build a LinkedIn jobs search URL
    actorId: 'curious_coder/linkedin-jobs-scraper',
    buildInput: (query, cookie) => ({
      urls:      [`https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(query)}&location=United%20States`],
      maxJobs:   100,
      ...(cookie ? { cookie } : {}),
    }),
  },
];

export async function scrapeLinkedInJobs(subcategory = '', category = '') {
  const query = [subcategory, 'Software Engineer Intern 2026'].filter(Boolean).join(' ');
  const cookie = process.env.LINKEDIN_SESSION_COOKIE || '';
  console.log(`[linkedin] starting — query: "${query}"`);

  let lastError = null;
  for (const { actorId, buildInput } of LINKEDIN_ACTOR_CONFIGS) {
    try {
      console.log(`[linkedin] trying actor: ${actorId}`);
      const client = getClient();
      const input  = buildInput(query, cookie.length > 20 ? cookie : null);
      const run    = await client.actor(actorId).call(input, { waitSecs: 120 });

      console.log(`[linkedin] run ID: ${run.id} — status: ${run.status}`);
      if (run.status !== 'SUCCEEDED') throw new Error(`Status: ${run.status}`);

      const { items } = await client.dataset(run.defaultDatasetId).listItems();
      console.log(`[linkedin] items: ${items.length} (actor: ${actorId})`);

      const results = items
        .filter(i => i.companyName || i.company || i.title)
        .map(i => ({
          name:        (i.companyName || i.company || i.title?.split(' at ')?.[1] || '').trim(),
          role:        i.jobTitle || i.title || 'SWE Intern',
          location:    i.location || i.jobLocation || 'USA',
          pay:         0,
          careersUrl:  i.url || i.applyUrl || i.link || '',
          category:    category || 'Growth Tech',
          subcategory: subcategory || null,
          source:      'linkedin',
        }))
        .filter(i => i.name && i.name.length > 1);

      console.log(`[linkedin] returning ${results.length} companies`);
      return results;

    } catch (err) {
      lastError = err;
      noteApifyError(actorId, err);
      console.error(`[linkedin] actor ${actorId} failed: ${err.message}`);
    }
  }

  console.error(`[linkedin] all actors failed — last: ${lastError?.message}. Falling back to Greenhouse direct scan.`);

  // Fallback: scan top tech companies directly on Greenhouse for intern roles
  const GREENHOUSE_FALLBACK = [
    'stripe','airbnb','coinbase','plaid','brex','ramp','notion','anthropic','openai',
    'scale','databricks','cloudflare','datadog','palantir','anduril','gusto','rippling',
    'lattice','figma','robinhood','airtable','asana','hubspot','intercom','segment',
    'retool','vercel','linear','resend','supabase','posthog','clerk','mercury',
  ];
  const INTERN_RE = /\binterns?\b|\binternships?\b|\bco-op\b|\bnew.?grad\b|\bentry.?level\b/i;
  const results = [];
  await Promise.allSettled(GREENHOUSE_FALLBACK.map(async (slug) => {
    try {
      const r = await fetch(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=false`, { signal: AbortSignal.timeout(5000) });
      if (!r.ok) return;
      const d = await r.json();
      for (const j of (d.jobs || [])) {
        if (!INTERN_RE.test(j.title || '')) continue;
        const loc = j.location?.name || '';
        if (/canada|uk|united kingdom|hong kong|warsaw|toronto|london|berlin|paris|amsterdam|sydney/i.test(loc)) continue;
        results.push({
          name:        slug.charAt(0).toUpperCase() + slug.slice(1),
          role:        j.title,
          location:    loc || 'USA',
          pay:         0,
          careersUrl:  j.absolute_url || `https://boards.greenhouse.io/${slug}`,
          category:    category || 'Tech & Software',
          subcategory: subcategory || null,
          source:      'linkedin',
        });
      }
    } catch (_) {}
  }));
  console.log(`[linkedin] Greenhouse fallback returned ${results.length} roles`);
  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// Source 4: Google Jobs — Apify
// ─────────────────────────────────────────────────────────────────────────────

export async function scrapeGoogleJobs(subcategory = '', category = '') {
  const query = subcategory
    ? `${subcategory} Software Engineer Internship 2026 United States`
    : 'Software Engineer Internship 2026 site:jobs.lever.co OR site:greenhouse.io OR site:myworkdayjobs.com';

  try {
    console.log(`[google_jobs] Serper search: "${query}"`);
    const data = await serperSearch(query, 10);
    const organic = data.organic || [];
    console.log(`[google_jobs] ${organic.length} results`);

    return organic
      .filter(i => i.title && i.link)
      .map(i => {
        const domain = i.link.replace(/^https?:\/\/(www\.)?/, '').split('/')[0];
        const company = domain.split('.')[0] || i.title.split(/[-–|]/)[0].trim();
        return {
          name:        company.trim(),
          role:        i.title || 'SWE Intern',
          location:    'USA',
          pay:         0,
          careersUrl:  i.link || '',
          category:    category || 'Growth Tech',
          subcategory: subcategory || null,
          source:      'google_jobs',
        };
      })
      .filter(i => i.name && i.name.length > 1);
  } catch (err) {
    console.error(`[google_jobs] failed: ${err.message}`);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Source 5: Wellfound — Apify with multiple actor fallbacks + Serper
// ─────────────────────────────────────────────────────────────────────────────

export async function scrapeWellfound(roleQuery = 'software engineer intern', subcategory = '', category = '') {
  const role = subcategory ? `${subcategory} software engineer intern` : roleQuery;

  // Try multiple known actors in order
  const ACTORS = [
    { id: 'curious_coder/wellfound-scraper',  input: { role, location: 'United States', maxJobs: 100 } },
    { id: 'clearpath/wellfound-api-ppe',       input: { role: 'Software Engineer Intern', location: 'United States', maxJobs: 50 } },
    { id: 'apify/rag-web-browser',             input: { startUrls: [{ url: 'https://wellfound.com/role/r/software-engineer-intern' }], maxCrawlDepth: 0, maxCrawlPages: 1, outputFormats: ['text'] } },
  ];

  for (const { id, input } of ACTORS) {
    try {
      const items = await runActor(id, input, 90);
      if (!items || items.length === 0) continue;
      console.log(`[wellfound] ${items.length} items from ${id}`);

      // rag-web-browser returns { text, markdown } — parse company names from text
      if (id.includes('rag-web-browser')) {
        const text = items[0]?.text || items[0]?.markdown || '';
        const seen = new Set();
        const results = [];
        // Extract company names from "Company Name - Role" patterns
        const lines = text.split('\n').filter(l => l.length > 3);
        for (const line of lines) {
          const m = line.match(/^([A-Z][A-Za-z0-9& ,.]+?)\s+[-–]\s+(Software|Engineer|Intern|Developer|Frontend|Backend|Full)/);
          if (m) {
            const name = m[1].trim();
            if (!seen.has(name.toLowerCase())) {
              seen.add(name.toLowerCase());
              results.push({ name, role: 'Software Engineering Intern', location: 'USA', pay: 0, careersUrl: 'https://wellfound.com/role/r/software-engineer-intern', category: category || 'Startups', subcategory: subcategory || null, source: 'wellfound' });
            }
          }
        }
        if (results.length > 0) return results;
        continue;
      }

      return items
        .filter(i => i.companyName || i.company)
        .map(i => ({
          name:        (i.companyName || i.company || '').trim(),
          role:        i.title || i.role || 'SWE Intern',
          location:    i.location || 'USA',
          pay:         0,
          careersUrl:  i.url || i.applyUrl || '',
          category:    category || 'Startups',
          subcategory: subcategory || null,
          source:      'wellfound',
        }));
    } catch (err) {
      noteApifyError(id, err);
      console.error(`[wellfound] ${id} failed: ${err.message}`);
    }
  }

  // Final fallback: Serper search for Wellfound intern jobs
  try {
    console.log('[wellfound] trying Serper fallback');
    const q = subcategory
      ? `site:wellfound.com ${subcategory} software engineer intern`
      : 'site:wellfound.com/companies software engineer intern 2026';
    const data = await serperSearch(q, 10);
    const organic = data.organic || [];
    return organic
      .filter(i => i.link && i.title)
      .map(i => ({
        name:        (i.title || '').split(/[-–|]/)[0].trim(),
        role:        i.title || 'SWE Intern',
        location:    'USA',
        pay:         0,
        careersUrl:  i.link,
        category:    category || 'Startups',
        subcategory: subcategory || null,
        source:      'wellfound',
      }))
      .filter(i => i.name && i.name.length > 2);
  } catch (err) {
    console.error(`[wellfound] Serper fallback failed: ${err.message}`);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Source 7: YC Work at a Startup — Serper + direct fetch fallback
// ─────────────────────────────────────────────────────────────────────────────

export async function scrapeYCStartups(subcategory = '', category = '') {
  const results = [];
  const seen    = new Set();

  function add(name, role, location, url) {
    const key = name.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!key || key.length < 2 || seen.has(key)) return;
    seen.add(key);
    results.push({
      name,
      role:        role || 'Software Engineering Intern',
      location:    location || 'USA',
      pay:         0,
      careersUrl:  url || '',
      category:    category || 'Startups',
      subcategory: subcategory || null,
      source:      'yc',
    });
  }

  // Layer 1: Serper search on WorkAtAStartup
  try {
    const q = subcategory
      ? `site:workatastartup.com "${subcategory}" intern`
      : 'site:workatastartup.com software engineer intern 2026';
    console.log(`[yc] Serper: "${q}"`);
    const data = await serperSearch(q, 10);
    for (const item of (data.organic || [])) {
      const link = item.link || '';
      const match = link.match(/workatastartup\.com\/companies\/([^/?#]+)/);
      if (match) {
        const slug = match[1];
        const name = slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        add(name, item.title?.split(/[-–|]/)[0].trim(), 'San Francisco, CA', link);
      }
    }
    console.log(`[yc] Serper returned ${results.length} companies`);
  } catch (err) {
    console.error(`[yc] Serper failed: ${err.message}`);
  }

  // Layer 2: Direct fetch of WorkAtAStartup JSON endpoint
  if (results.length < 5) {
    try {
      const url = 'https://www.workatastartup.com/companies?companySize=1-10&companySize=11-50&demographic=Intern&role=eng&jobType=intern';
      const res = await fetch(url, {
        headers: {
          'User-Agent':  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          'Accept':      'application/json, text/html',
          'X-Requested-With': 'XMLHttpRequest',
        },
        signal: AbortSignal.timeout(12000),
      });
      if (res.ok) {
        const data = await res.json().catch(() => null);
        if (data?.companies && Array.isArray(data.companies)) {
          console.log(`[yc] direct fetch returned ${data.companies.length} companies`);
          for (const c of data.companies.slice(0, 100)) {
            add(c.name || c.slug?.replace(/-/g, ' '), 'Software Engineering Intern', c.locations?.[0] || 'San Francisco, CA', `https://www.workatastartup.com/companies/${c.slug || ''}`);
          }
        }
      }
    } catch (err) {
      console.log(`[yc] direct fetch failed (expected for SPA): ${err.message}`);
    }
  }

  // Layer 3: Serper search on YC company directory
  if (results.length < 5) {
    try {
      const q2 = subcategory
        ? `YC startup "${subcategory}" hiring software intern 2026 site:ycombinator.com`
        : 'YC startup hiring software engineer intern 2026 site:ycombinator.com/companies';
      const data2 = await serperSearch(q2, 10);
      for (const item of (data2.organic || [])) {
        const link = item.link || '';
        const match = link.match(/ycombinator\.com\/companies\/([^/?#]+)/);
        if (match) {
          const slug = match[1];
          const name = slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
          add(name, 'Software Engineering Intern', 'San Francisco, CA', link);
        }
      }
      console.log(`[yc] after YC directory search: ${results.length} total`);
    } catch (err) {
      console.error(`[yc] YC directory Serper failed: ${err.message}`);
    }
  }

  console.log(`[yc] final: ${results.length} companies`);
  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// Source 6: Jobright.ai — direct fetch (no Apify actor available)
// ─────────────────────────────────────────────────────────────────────────────

export async function scrapeJobright(subcategory = '', category = '') {
  try {
    const res = await fetch('https://jobright.ai/jobs/internships', {
      headers: {
        'User-Agent':      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();

    const seen = new Set();
    const results = [];
    const patterns = [
      /"company_name"\s*:\s*"([^"]+)"/g,
      /"companyName"\s*:\s*"([^"]+)"/g,
      /"company"\s*:\s*"([^"]+)"/g,
    ];
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(html)) !== null) {
        const name = match[1].trim();
        if (name && name.length > 1 && !seen.has(name.toLowerCase())) {
          seen.add(name.toLowerCase());
          results.push({
            name,
            role:       'Software Engineering Intern',
            location:   'USA',
            pay:        0,
            careersUrl: 'https://jobright.ai/jobs/internships',
            category:   category || 'Growth Tech',
            subcategory: subcategory || null,
            source:     'jobright',
          });
        }
      }
    }

    if (results.length === 0) {
      console.log('[jobright] no structured data found (SPA) — skipping');
      return [];
    }
    console.log(`[jobright] ${results.length} companies from page`);
    return results;
  } catch (err) {
    console.log(`[jobright] unavailable — skipping: ${err.message}`);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// People finders — used by contact panel (unchanged logic)
// ─────────────────────────────────────────────────────────────────────────────

export async function findLinkedInDecisionMakers(companyName, companyStage) {
  try {
    const isStartup = companyStage === 'startup' || companyStage === 'YC';
    const titleQuery = isStartup
      ? '"founder" OR "co-founder" OR "CTO" OR "CEO" OR "Head of Engineering"'
      : '"VP Engineering" OR "Director of Engineering" OR "Head of Engineering" OR "Engineering Manager"';

    const searchQuery = `site:linkedin.com/in "${companyName}" (${titleQuery})`;
    console.log(`[people] findLinkedInDecisionMakers Serper: "${searchQuery}"`);

    const data = await serperSearch(searchQuery, 10);
    const organic = data.organic || [];
    const NON_US = /\b(germany|deutschland|uk|united kingdom|france|india|canada|australia|netherlands|sweden|norway|denmark|finland|switzerland|austria|belgium|spain|italy|portugal|brazil|singapore|japan|china|korea|israel|poland|czech|romania|ukraine|russia|mexico)\b/i;

    return organic
      .filter(item => (item.link || '').includes('linkedin.com/in'))
      .filter(item => !NON_US.test((item.snippet || '').toLowerCase()))
      .map(item => {
        const titleText = item.title || '';
        const name = titleText.split(/[-–|·]/)[0].trim().replace(/\s*linkedin\s*/i, '').trim();
        const titleMatch = titleText.match(/(founder|co-founder|cto|ceo|vp|director|head of|manager)[^-|·]*/i);
        return { name, title: titleMatch?.[0]?.trim() || '', linkedin_url: item.link, company: companyName };
      })
      .filter(p => p.name && p.name.length > 2 && p.name.toLowerCase() !== 'linkedin');
  } catch (err) {
    console.error('[people] findLinkedInDecisionMakers failed:', err.message);
    return [];
  }
}

// Seniority score for ranking (higher = more senior/relevant)
function seniorityScore(title = '') {
  const t = title.toLowerCase();
  if (/\b(founder|co-founder|ceo|chief executive)\b/.test(t))          return 10;
  if (/\b(cto|chief technology|cpo|chief product)\b/.test(t))           return 9;
  if (/\bvp\b|\bvice president\b/.test(t))                              return 8;
  if (/\bdirector\b/.test(t))                                           return 7;
  if (/\bhead of\b/.test(t))                                            return 6;
  if (/\bprincipal\b|\bstaff\b/.test(t))                               return 5;
  if (/\bmanager\b|\blead\b/.test(t))                                   return 4;
  if (/\bsenior\b|\bsr\.?\b/.test(t))                                   return 3;
  if (/\bengineer\b/.test(t))                                           return 2;
  return 1;
}

// Returns true if the title looks like a decision maker / senior engineer
function isSeniorTitle(title = '') {
  const t = title.toLowerCase();
  // Skip non-targets
  if (/\b(intern|coordinator|recruiter|recruiting|admin|assistant|receptionist|hr|office manager|marketing|sales|account manager|product marketing)\b/.test(t)) return false;
  // Keep decision makers & engineers
  return /\b(engineer|director|vp|vice president|head of|manager|cto|ceo|founder|co-founder|principal|staff|lead|president)\b/.test(t);
}

/**
 * Find decision makers at a company using 3 layers:
 *   L1 Apollo  — organizations/enrich → get org ID → mixed_people/search
 *   L2 Apify   — LinkedIn company people scraper (requires li_at cookie)
 *   L3 Google  — guaranteed fallback, always runs if < 3 results
 *
 * @param {string}   companyName
 * @param {string}   linkedinCompanyUrl  optional; improves Apify slug resolution
 * @param {string}   domain              optional company domain for Apollo lookup
 * @param {Function} onProgress          optional callback({ source, status, count, message })
 */
export async function findPeopleAtLinkedInCompany(
  companyName,
  linkedinCompanyUrl = null,
  domain = null,
  onProgress = null
) {
  const NON_US = /\b(germany|deutschland|uk|united kingdom|france|india|canada|australia|netherlands|sweden|norway|denmark|finland|switzerland|austria|belgium|spain|italy|portugal|brazil|singapore|japan|china|korea|israel|poland|czech|romania|ukraine|russia|mexico)\b/i;

  const allPeople = [];
  const seen      = new Set();

  function notify(source, status, count = 0, message = null) {
    console.log(`[people/${source}] ${status}${count > 0 ? ` count=${count}` : ''}${message ? ` — ${message}` : ''}`);
    if (onProgress) onProgress({ source, status, count, message });
  }

  function addPeople(list, sourceName) {
    let added = 0;
    for (const p of list) {
      if (!p.name || p.name.length < 3) continue;
      const key = p.name.toLowerCase().replace(/\s+/g, '');
      if (seen.has(key)) continue;
      seen.add(key);
      allPeople.push({ ...p, source: sourceName });
      added++;
    }
    return added;
  }

  // ── Layer 1: Apollo — organizations/enrich → org ID → mixed_people/search ─
  const apolloKey = (process.env.APOLLO_API_KEY || '').trim();
  if (!apolloKey || apolloKey === 'your_apollo_key_here' || apolloKey.length < 10) {
    notify('apollo', 'skip', 0, 'APOLLO_API_KEY not configured');
  } else {
    notify('apollo', 'running');
    try {
      // Step 1: Get Apollo org ID via domain enrichment
      const enrichDomain = domain ||
        companyName.toLowerCase()
          .replace(/\b(inc|llc|ltd|corp|group|technologies|solutions|services)\b\.?/gi, '')
          .replace(/[^a-z0-9]/g, '').trim() + '.com';

      console.log(`[people/apollo] organizations/enrich domain="${enrichDomain}"`);
      const enrichRes = await fetch(`https://api.apollo.io/v1/organizations/enrich?domain=${encodeURIComponent(enrichDomain)}`, {
        method:  'GET',
        headers: { 'Content-Type': 'application/json', 'X-Api-Key': apolloKey },
        signal:  AbortSignal.timeout(12000),
      });
      const enrichText = await enrichRes.text();
      console.log(`[people/apollo] enrich status=${enrichRes.status} body=${enrichText.slice(0, 600)}`);

      let orgId = null;
      try { orgId = JSON.parse(enrichText).organization?.id; } catch {}

      if (!orgId) {
        notify('apollo', 'done', 0, `Org not found in Apollo for domain ${enrichDomain}`);
      } else {
        // Step 2: Search people at that org
        console.log(`[people/apollo] mixed_people/search org_id=${orgId}`);
        // Fetch up to 3 pages (75 contacts) from Apollo
        const allApolloRaw = [];
        for (let pg = 1; pg <= 3; pg++) {
          try {
            const pgRes = await fetch('https://api.apollo.io/v1/mixed_people/search', {
              method:  'POST',
              headers: { 'Content-Type': 'application/json', 'X-Api-Key': apolloKey },
              body:    JSON.stringify({
                organization_ids:   [orgId],
                person_seniorities: ['director', 'vp', 'c_suite', 'founder', 'senior', 'manager', 'entry'],
                page:               pg,
                per_page:           25,
              }),
              signal: AbortSignal.timeout(15000),
            });
            const pgData = await pgRes.json().catch(() => ({}));
            if (!pgRes.ok || !Array.isArray(pgData.people)) break;
            allApolloRaw.push(...pgData.people);
            if (pgData.people.length < 25) break; // no more pages
          } catch { break; }
        }
        const peopleRes = { ok: allApolloRaw.length >= 0 };
        const peopleText = '';
        console.log(`[people/apollo] fetched ${allApolloRaw.length} total across pages`);

        let peopleData = { people: allApolloRaw };

        if (!peopleRes.ok || !Array.isArray(peopleData.people)) {
          notify('apollo', 'done', 0,
            `Status error: no people array`);
        } else {
          const mapped = peopleData.people
            .map(p => ({
              name:         (p.name || `${p.first_name || ''} ${p.last_name || ''}`.trim()).trim(),
              title:        p.title || '',
              linkedin_url: p.linkedin_url || '',
              email:        p.email || null,
            }))
            .filter(p => p.name && p.name.length > 2);
          const n = addPeople(mapped, 'apollo');
          notify('apollo', 'done', n, n === 0 ? 'People found but none added (duplicates or filtered)' : null);
        }
      }
    } catch (err) {
      console.error(`[people/apollo] exception: ${err.message}`);
      notify('apollo', 'error', 0, err.message);
    }
  }

  // ── Layer 2: Apify LinkedIn people scraper ──────────────────────────────────
  if (allPeople.length < 3) {
    const cookie = (process.env.LINKEDIN_SESSION_COOKIE || '').trim();
    const slugMatch = (linkedinCompanyUrl || '').match(/linkedin\.com\/company\/([^/?#]+)/);
    const slug = slugMatch
      ? slugMatch[1]
      : companyName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    notify('linkedin', 'running', 0, `slug=${slug}`);

    // Try actors that actually exist on Apify store (verified)
    const ACTOR_CONFIGS = [
      {
        actorId: 'powerai/linkedin-company-people-scraper',
        input: {
          url:           `https://www.linkedin.com/company/${slug}/people/`,
          maxResults:    25,
          ...(cookie.length > 20 ? { cookie, sessionCookie: cookie, li_at: cookie } : {}),
        },
      },
      {
        actorId: 'george.the.developer/linkedin-company-employees-scraper',
        input: {
          companyUrl:    `https://www.linkedin.com/company/${slug}`,
          maxResults:    25,
          ...(cookie.length > 20 ? { cookie, sessionCookie: cookie, li_at: cookie } : {}),
        },
      },
    ];

    const client    = getClient();
    let linkedinRaw = [];

    for (const { actorId, input } of ACTOR_CONFIGS) {
      if (linkedinRaw.length > 0) break;
      try {
        console.log(`[people/linkedin] trying ${actorId}`);
        const run = await client.actor(actorId).call(input, { waitSecs: 90 });
        console.log(`[people/linkedin] ${actorId} → ${run.status}`);
        if (run.status === 'SUCCEEDED') {
          const { items } = await client.dataset(run.defaultDatasetId).listItems();
          console.log(`[people/linkedin] ${actorId} returned ${items.length} items`);
          linkedinRaw = items
            .map(p => ({
              name:         (p.fullName || p.name || '').trim(),
              title:        (p.headline || p.title || p.jobTitle || '').trim(),
              linkedin_url: p.profileUrl || p.url || p.linkedin_url || '',
              email:        null,
            }))
            .filter(p => p.name && p.name.length > 2);
        }
      } catch (err) {
        noteApifyError(actorId, err);
        console.warn(`[people/linkedin] ${actorId} failed: ${err.message}`);
      }
    }

    const seniorFiltered = linkedinRaw.filter(p => isSeniorTitle(p.title));
    const n = addPeople(seniorFiltered, 'linkedin');
    console.log(`[people/linkedin] added ${n} (${linkedinRaw.length} raw → ${seniorFiltered.length} senior)`);
    notify('linkedin', 'done', n,
      n === 0 && linkedinRaw.length === 0
        ? (cookie.length < 20 ? 'No li_at cookie — actors may need auth' : 'No results from LinkedIn actors')
        : null);
  } else {
    notify('linkedin', 'skip', 0, 'Apollo returned enough results');
  }

  // ── Layer 3: Google via Serper.dev — guaranteed fallback, no Apify credits ──
  if (allPeople.length < 3) {
    notify('google', 'running');
    try {
      const queries = [
        `site:linkedin.com/in "${companyName}" software engineer`,
        `site:linkedin.com/in "${companyName}" CTO OR "VP Engineering" OR "Director of Engineering" OR Founder`,
        `site:linkedin.com/in "${companyName}" engineering manager OR principal engineer OR staff engineer`,
        `site:linkedin.com/in "${companyName}" machine learning OR data engineer OR AI researcher`,
        `"${companyName}" engineer OR developer OR scientist LinkedIn profile`,
      ];

      const googlePeople = [];
      for (const query of queries) {
        if (googlePeople.length >= 15) break;
        console.log(`[people/google] Serper: "${query}"`);
        const data = await serperSearch(query, 10);
        const organic = data.organic || [];

        for (const item of organic) {
          const link = item.link || '';
          if (!link.includes('linkedin.com/in')) continue;
          if (NON_US.test((item.snippet || '').toLowerCase())) continue;

          const titleText = item.title || '';
          // Google formats: "First Last - Title at Company | LinkedIn"
          const name = titleText.split(/[-–|·]/)[0].trim().replace(/\s*linkedin\s*/i, '').trim();
          const titleMatch = titleText.match(/(founder|co-founder|cto|ceo|vp|vice president|director|head of|manager|principal|staff|engineer|researcher|scientist|quant|analyst)[^-|·|]*/i);
          const title = titleMatch?.[0]?.trim().replace(/\s*at\s+.*/i, '').trim() || '';

          if (!name || name.length < 3 || name.toLowerCase() === 'linkedin') continue;
          googlePeople.push({ name, title, linkedin_url: link, email: null });
        }
      }

      const n = addPeople(googlePeople, 'google');
      console.log(`[people/google] added ${n}`);
      notify('google', 'done', n,
        n === 0
          ? `No profiles found — try manually: site:linkedin.com/in "${companyName}" engineer`
          : null);
    } catch (err) {
      console.error(`[people/google] exception: ${err.message}`);
      notify('google', 'error', 0, err.message.includes('SERPER_API_KEY') ? 'Add SERPER_API_KEY to .env (serper.dev — 2,500 free searches/mo)' : err.message);
    }
  } else {
    notify('google', 'skip', 0, 'Enough results from prior layers');
  }

  // ── Filter, sort, return ──────────────────────────────────────────────────
  const SKIP = [
    'recruiter', 'talent acquisition', 'human resources', 'hr manager',
    'marketing', 'sales rep', 'sales manager', 'account executive',
    'legal counsel', 'accountant', 'executive assistant', 'office manager',
  ];
  const filtered = allPeople
    .filter(p => {
      const t = (p.title || '').toLowerCase();
      if (SKIP.some(s => t.includes(s))) return false;
      return isSeniorTitle(p.title) || p.source === 'google';
    })
    .sort((a, b) => seniorityScore(b.title) - seniorityScore(a.title));

  const sources = [...new Set(allPeople.map(p => p.source))].join(', ');
  console.log(`[people] final: ${filtered.length} contacts (sources: ${sources || 'none'})`);
  return filtered;
}

export async function scrapeLinkedInProfile(linkedinUrl) {
  try {
    const cookie = process.env.LINKEDIN_SESSION_COOKIE;
    if (!cookie || cookie.length < 20) return null;
    const items = await runActor('curious_coder/linkedin-profile-scraper', { profileUrls: [linkedinUrl], cookie });
    if (!items.length) return null;
    const p = items[0];
    return { name: p.fullName || p.name || '', title: p.headline || p.title || '', linkedin_url: linkedinUrl, summary: p.summary || '', company: p.currentCompany || p.company || '' };
  } catch (err) {
    noteApifyError('curious_coder/linkedin-profile-scraper', err);
    console.error('[profile] scrape failed:', err.message);
    return null;
  }
}
