import axios from 'axios';

function getKey() {
  const key = process.env.HUNTER_API_KEY;
  if (!key || key === 'your_hunter_api_key_here' || key.length < 10) {
    throw new Error('Hunter.io key missing — add HUNTER_API_KEY to .env');
  }
  return key;
}

// ATS / job-board hostnames that are NOT the company's own domain
const ATS_DOMAINS = new Set([
  'greenhouse.io', 'boards.greenhouse.io', 'lever.co', 'jobs.lever.co',
  'ashbyhq.com', 'jobs.ashbyhq.com', 'workday.com', 'myworkdayjobs.com',
  'taleo.net', 'brassring.com', 'icims.com', 'jobvite.com', 'smartrecruiters.com',
  'paylocity.com', 'bamboohr.com', 'recruitee.com', 'workable.com',
  'linkedin.com', 'indeed.com', 'glassdoor.com', 'dice.com', 'wellfound.com',
  'simplify.jobs', 'ziprecruiter.com', 'monster.com', 'careerbuilder.com',
  'jobright.ai', 'ai-jobs.net', 'levelsfyi.com',
]);

// Well-known company → domain overrides (for companies whose domain != name)
const DOMAIN_OVERRIDES = {
  'goldman sachs':          'gs.com',
  'jp morgan':              'jpmorgan.com',
  'jpmorgan':               'jpmorgan.com',
  'jpmorgan chase':         'jpmorgan.com',
  'j.p. morgan':            'jpmorgan.com',
  'bank of america':        'bankofamerica.com',
  'merrill lynch':          'ml.com',
  'morgan stanley':         'morganstanley.com',
  'citibank':               'citi.com',
  'citigroup':              'citi.com',
  'wells fargo':            'wellsfargo.com',
  'hsbc':                   'hsbc.com',
  'barclays':               'barclays.com',
  'ubs':                    'ubs.com',
  'deutsche bank':          'db.com',
  'nomura':                 'nomura.com',
  'mckinsey':               'mckinsey.com',
  'deloitte':               'deloitte.com',
  'pwc':                    'pwc.com',
  'pricewaterhousecoopers': 'pwc.com',
  'ernst & young':          'ey.com',
  'ey':                     'ey.com',
  'kpmg':                   'kpmg.com',
  'two sigma':              'twosigma.com',
  'citadel':                'citadel.com',
  'citadel securities':     'citadelsecurities.com',
  'jane street':            'janestreet.com',
  'de shaw':                'deshaw.com',
  'd.e. shaw':              'deshaw.com',
  'jump trading':           'jumptrading.com',
  'virtu financial':        'virtu.com',
  'hudson river trading':   'hudsonrivertrading.com',
  'optiver':                'optiver.com',
  'akuna capital':          'akunacapital.com',
  'tower research capital': 'tower-research.com',
  'blackrock':              'blackrock.com',
  'vanguard':               'vanguard.com',
  'fidelity':               'fidelity.com',
  'pimco':                  'pimco.com',
  'lockheed martin':        'lmco.com',
  'northrop grumman':       'northropgrumman.com',
  'raytheon':               'rtx.com',
  'boeing':                 'boeing.com',
  'general dynamics':       'gd.com',
  'l3harris':               'l3harris.com',
  'spacex':                 'spacex.com',
  'at&t':                   'att.com',
  'w.w. grainger':          'grainger.com',
  'grainger':               'grainger.com',
  'general motors':         'gm.com',
  'general electric':       'ge.com',
  'procter & gamble':       'pg.com',
  'procter and gamble':     'pg.com',
  'johnson & johnson':      'jnj.com',
  'coca-cola':              'coca-cola.com',
  'coca cola':              'coca-cola.com',
  'ibm':                    'ibm.com',
  'meta':                   'meta.com',
  'netflix':                'netflix.com',
  'uber':                   'uber.com',
  'lyft':                   'lyft.com',
  'airbnb':                 'airbnb.com',
  'stripe':                 'stripe.com',
  'coinbase':               'coinbase.com',
  'palantir':               'palantir.com',
  'snowflake':              'snowflake.com',
  'databricks':             'databricks.com',
  'datadog':                'datadoghq.com',
};

/**
 * Extract the real company domain from a job record.
 * Priority: explicit override → stored non-ATS domain → careers URL (skipping ATS) →
 *           well-known override map → derived from company name.
 */
export function extractDomain(job, domainOverride = null) {
  // 0. Manual override from user/request
  if (domainOverride && domainOverride.length > 3) return domainOverride.toLowerCase().trim();

  // 1. Well-known override by company name
  const nameLower = (job.name || '').toLowerCase();
  for (const [key, domain] of Object.entries(DOMAIN_OVERRIDES)) {
    if (nameLower.includes(key)) return domain;
  }

  // 2. Stored domain — only if it's not an ATS domain; strip HR subdomains
  if (job.domain && job.domain.length > 3) {
    const rootDomain = job.domain.split('.').slice(-2).join('.');
    if (!ATS_DOMAINS.has(job.domain) && !ATS_DOMAINS.has(rootDomain)) {
      return job.domain
        .replace(/^careers\./, '')
        .replace(/^jobs\./, '')
        .replace(/^hire\./, '')
        .replace(/^apply\./, '')
        .replace(/^recruiting\./, '')
        .replace(/^work\./, '');
    }
  }

  // 3. Parse from careersUrl — skip ATS domains
  const careersUrl = job.url || job.careersUrl || '';
  if (careersUrl) {
    try {
      const parsed = new URL(careersUrl);
      const host = parsed.hostname.replace(/^www\./, '');
      const rootDomain = host.split('.').slice(-2).join('.');
      if (!ATS_DOMAINS.has(host) && !ATS_DOMAINS.has(rootDomain)) {
        // Strip common HR/careers subdomains
        return host
          .replace(/^careers\./, '')
          .replace(/^jobs\./, '')
          .replace(/^hire\./, '')
          .replace(/^apply\./, '')
          .replace(/^recruiting\./, '')
          .replace(/^work\./, '');
      }
    } catch {}
  }

  // 4. Derive from company name as last resort
  const slug = (job.name || '')
    .toLowerCase()
    .replace(/\b(inc\.?|llc\.?|ltd\.?|corp\.?|group|holdings|technologies|technology|solutions|services|systems|labs?|software)\b\.?/gi, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
  return slug ? `${slug}.com` : null;
}

// Search emails by domain (Hunter.io v2 domain-search)
export async function findEmailsByDomain(domain, limit = 10) {
  const key = getKey();
  const url  = `https://api.hunter.io/v2/domain-search`;

  console.log(`[Hunter] domain-search: ${domain} (limit=${limit})`);
  console.log(`[Hunter] API key present: ${key.length > 5}`);
  console.log(`[Hunter] Request: GET ${url}?domain=${domain}&limit=${limit}&api_key=<hidden>`);

  const res = await axios.get(url, { params: { domain, limit, api_key: key } });

  console.log(`[Hunter] HTTP status: ${res.status}`);
  const data = res.data?.data || {};
  console.log(`[Hunter] domain: ${data.domain}, emails: ${(data.emails || []).length}, webmail: ${data.webmail}`);

  const emails = Array.isArray(data.emails) ? data.emails : [];
  if (emails.length === 0) {
    console.log(`[Hunter] Zero emails for ${domain} — may need a different domain`);
  }

  return emails.map(e => ({
    email:        e.value,
    name:         `${e.first_name || ''} ${e.last_name || ''}`.trim() || 'Unknown',
    title:        e.position || '',
    linkedin_url: e.linkedin || '',
    confidence:   e.confidence || 0,
    type:         e.type || 'generic',
  }));
}

// Find a single person's email via Hunter.io email-finder (first_name + last_name + domain).
// Returns { email, confidence, verification_status } or null if not found.
export async function findEmailForPerson(domain, firstName, lastName) {
  try {
    const key = getKey();
    const res = await axios.get('https://api.hunter.io/v2/email-finder', {
      params: {
        domain,
        first_name: firstName,
        last_name:  lastName,
        api_key:    key,
      },
    });
    const d = res.data?.data || {};
    if (!d.email) return null;
    return {
      email:      d.email,
      confidence: d.score ?? d.confidence ?? 0,
      verification_status: d.verification?.status || null,
    };
  } catch (err) {
    console.error(`[Hunter] email-finder failed for ${firstName} ${lastName}@${domain}: ${err.message}`);
    return null;
  }
}

// Find domain for a company name via Hunter.io (company search)
export async function findDomainByCompany(companyName) {
  try {
    console.log(`[Hunter] company lookup: "${companyName}"`);
    const res = await axios.get('https://api.hunter.io/v2/domain-search', {
      params: { company: companyName, limit: 1, api_key: getKey() },
    });
    const domain = res.data?.data?.domain || null;
    console.log(`[Hunter] company lookup result: ${domain || 'not found'}`);
    return domain;
  } catch (err) {
    console.error(`[Hunter] company lookup failed: ${err.message}`);
    return null;
  }
}

/**
 * Lightweight domain check — returns true if Hunter knows about this domain
 * (has emails OR has an organization on record).  Uses limit=1 to be frugal.
 */
export async function verifyDomain(domain) {
  try {
    const key = getKey();
    const res = await axios.get('https://api.hunter.io/v2/domain-search', {
      params: { domain, limit: 1, api_key: key },
    });
    const data = res.data?.data || {};
    const known = (data.emails?.length > 0) || (data.organization != null);
    console.log(`[Hunter] verifyDomain(${domain}) → ${known ? 'known' : 'unknown'}`);
    return known;
  } catch {
    return false;
  }
}

/**
 * Given a company name and optional careersUrl, find the first Hunter-verified domain.
 * Tries: careersUrl hostname → name.com → name.io → name.co
 * Returns the working domain string, or null if none verified.
 */
export async function findWorkingDomain(companyName, careersUrl = '') {
  const slug = (companyName || '')
    .toLowerCase()
    .replace(/\b(inc\.?|llc\.?|ltd\.?|corp\.?|group|holdings|technologies|technology|solutions|services|systems|labs?|software)\b\.?/gi, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();

  const candidates = [];

  // From careers URL (skip ATS)
  if (careersUrl) {
    try {
      const parsed = new URL(careersUrl);
      const host = parsed.hostname.replace(/^www\./, '');
      const rootDomain = host.split('.').slice(-2).join('.');
      if (!ATS_DOMAINS.has(host) && !ATS_DOMAINS.has(rootDomain)) {
        candidates.push(host
          .replace(/^careers\./, '').replace(/^jobs\./, '').replace(/^hire\./, '')
          .replace(/^apply\./, '').replace(/^recruiting\./, '').replace(/^work\./, ''));
      }
    } catch {}
  }

  if (slug) {
    candidates.push(`${slug}.com`, `${slug}.io`, `${slug}.co`);
  }

  for (const domain of [...new Set(candidates)]) {
    if (!domain || domain.length < 4) continue;
    if (await verifyDomain(domain)) {
      console.log(`[Hunter] findWorkingDomain(${companyName}) → ${domain}`);
      return domain;
    }
  }

  console.log(`[Hunter] findWorkingDomain(${companyName}) → no verified domain found`);
  return null;
}

/**
 * Try a domain, then common fallback variations, return the one that yields results.
 * Returns { domain, emails } or { domain, emails: [] } if all fail.
 */
export async function findEmailsWithFallback(primaryDomain, limit = 10) {
  // Build list of domains to try
  const base = primaryDomain.replace(/\.[^.]+$/, ''); // strip TLD
  const tld  = primaryDomain.split('.').pop();
  const candidates = [primaryDomain];
  if (tld !== 'com')  candidates.push(`${base}.com`);
  if (tld !== 'io')   candidates.push(`${base}.io`);
  if (tld !== 'co')   candidates.push(`${base}.co`);

  for (const domain of candidates) {
    try {
      console.log(`[Hunter] trying domain: ${domain}`);
      const emails = await findEmailsByDomain(domain, limit);
      if (emails.length > 0) {
        console.log(`[Hunter] ✓ ${emails.length} results for ${domain}`);
        return { domain, emails };
      }
      console.log(`[Hunter] 0 results for ${domain} — trying next`);
    } catch (err) {
      console.warn(`[Hunter] ${domain} failed: ${err.message}`);
    }
  }

  return { domain: primaryDomain, emails: [] };
}
