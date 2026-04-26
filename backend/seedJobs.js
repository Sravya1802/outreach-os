// All 225 curated US companies for CS internship outreach
// [name, category, pay, roles, location, url, tag]
export const COMPANIES = [
  // ── Quant / HFT ──────────────────────────────────────────────────────────
  ["Radix Trading","Quant",182,"Quant Research, SWE, FPGA","Chicago","https://www.radixtrading.com/careers/","HFT"],
  ["Optiver","Quant",175,"SWE, Quant Trading, Quant Research","Chicago, Austin","https://optiver.com/working-at-optiver/career-opportunities/","Prop"],
  ["Five Rings","Quant",143,"Quant Trading, SWE, Quant Research","New York","https://fiverings.com/positions","Prop"],
  ["Jane Street","Quant",140,"SWE, Quant Trading, Quant Research","New York","https://www.janestreet.com/join-jane-street/internships/","Prop"],
  ["Citadel","Quant",120,"SWE, Launch, Quant Research, Trading","Chicago, Miami, NYC","https://www.citadel.com/careers/open-opportunities/internships/","Prop"],
  ["Jump Trading","Quant",120,"SWE, Quant Researcher, Quant Trader","Chicago, NYC","https://www.jumptrading.com/careers/","HFT"],
  ["Hudson River Trading","Quant",110,"Algo Dev, SWE","New York","https://www.hudsonrivertrading.com/careers/","HFT"],
  ["D.E. Shaw","Quant",100,"SWE, Quant Analyst, Systems Tech","New York","https://www.deshaw.com/careers","Centralized"],
  ["Tower Research","Quant",100,"Quant Trading, SWE","New York","https://www.tower-research.com/open-positions","HFT"],
  ["Two Sigma","Quant",90,"Quant Research, SWE","New York","https://www.twosigma.com/careers/","Centralized"],
  ["IMC Trading","Quant",90,"SWE, Quant Research, Trading","Chicago, NYC","https://careers.imc.com/","Prop"],
  ["DRW","Quant",80,"SWE, Quant Research, Trading","Chicago, NYC","https://drw.com/work-at-drw/","Prop"],
  ["SIG","Quant",75,"SWE, Quant Trading, Quant Research","Bala Cynwyd PA","https://careers.sig.com/","Prop"],
  ["Akuna Capital","Quant",63,"SWE, Quant Dev, FPGA","Chicago","https://akunacapital.com/careers","Prop"],
  ["Chicago Trading Co","Quant",87,"SWE, Quant Trading","Chicago","https://www.chicagotrading.com/careers/","Prop"],
  ["Virtu Financial","Quant",60,"SWE, Quant Research","NYC, Austin","https://www.virtu.com/careers/","HFT"],
  ["Wolverine","Quant",63,"SWE, Quant Research","Chicago","https://www.wolve.com/careers","Prop"],
  ["Belvedere","Quant",60,"SWE, Quant Trading","Chicago","https://www.belvederetrading.com/careers/","Prop"],
  ["AQR Capital","Quant",55,"Quant Research, SWE, Data Analyst","Greenwich CT","https://www.aqr.com/About-Us/Careers","Centralized"],
  ["Bridgewater","Quant",55,"SWE, Investment Eng, Research","Westport CT","https://www.bridgewater.com/careers","Centralized"],
  ["Balyasny","Quant",65,"Quant Research, SWE","Chicago, NYC","https://www.bamfunds.com/careers/","Pod Shop"],
  ["Millennium","Quant",70,"Quant Research, SWE, Data Science","New York","https://www.mlp.com/careers/","Pod Shop"],
  ["Point72 / Cubist","Quant",70,"Quant Research, SWE, Data Analyst","NYC, Stamford CT","https://careers.point72.com/","Pod Shop"],
  ["XTX Markets","Quant",80,"Quant Research, SWE","New York","https://www.xtxmarkets.com/careers/","HFT"],
  ["Voleon Group","Quant",55,"ML Research, SWE","Berkeley CA","https://voleon.com/careers/","Centralized"],
  ["WorldQuant","Quant",55,"Quant Research, SWE, Alpha Research","NYC","https://www.worldquant.com/career-listing/","Pod Shop"],
  // ── Big Tech ─────────────────────────────────────────────────────────────
  ["Google","Big Tech",72,"SWE, Student Researcher, STEP, APM","Mountain View, NYC, Seattle","https://careers.google.com/",""],
  ["Microsoft","Big Tech",52,"SWE, Explore, PM, Research","Redmond, NYC, Chicago","https://careers.microsoft.com/",""],
  ["Amazon","Big Tech",50,"SDE, Applied Science, Data Eng","Seattle, NYC, Chicago","https://www.amazon.jobs/",""],
  ["Apple","Big Tech",56,"SWE, ML, HW","Cupertino, NYC, Austin","https://jobs.apple.com/",""],
  ["Meta","Big Tech",55,"SWE, ML, Data Scientist","Menlo Park, NYC, Seattle","https://www.metacareers.com/",""],
  ["Netflix","Big Tech",65,"SWE, Data Science, ML","Los Gatos, LA","https://jobs.netflix.com/",""],
  ["Uber","Big Tech",67,"SWE, ML, Data Science","SF, NYC, Seattle","https://www.uber.com/us/en/careers/",""],
  ["NVIDIA","Big Tech",52,"SWE, Deep Learning, GPU Arch","Santa Clara, NYC, Austin","https://www.nvidia.com/en-us/about-nvidia/careers/",""],
  ["Databricks","Big Tech",56,"SWE, ML, Data Science, PM","SF, NYC, Bellevue","https://www.databricks.com/company/careers",""],
  ["Salesforce","Big Tech",59,"SWE, AI/ML, Data Science","SF, Chicago, NYC, Seattle","https://careers.salesforce.com/",""],
  ["Snowflake","Big Tech",58,"SWE, Data Engineer","San Mateo, Bellevue","https://careers.snowflake.com/",""],
  ["Stripe","Big Tech",60,"SWE, ML","SF, NYC, Seattle","https://stripe.com/jobs",""],
  ["Cloudflare","Big Tech",50,"SWE","SF, NYC, Austin","https://www.cloudflare.com/careers/",""],
  ["Palantir","Big Tech",61,"SWE, FDSE","NYC, Palo Alto, DC","https://www.palantir.com/careers/",""],
  ["Scale AI","Big Tech",60,"SWE, ML","SF","https://scale.com/careers",""],
  ["Coinbase","Big Tech",60,"SWE, Data","Remote, SF, NYC","https://www.coinbase.com/careers",""],
  ["DoorDash","Big Tech",55,"SWE, ML, Data Science","SF, NYC, Seattle","https://careers.doordash.com/",""],
  ["Pinterest","Big Tech",54,"SWE, ML","SF, NYC","https://www.pinterestcareers.com/",""],
  ["Figma","Big Tech",53,"SWE, Product Design, Data Science","SF, NYC","https://www.figma.com/careers/",""],
  ["Robinhood","Big Tech",53,"SWE, Backend, Data Scientist","Menlo Park, NYC","https://robinhood.com/us/en/careers/",""],
  ["Roblox","Big Tech",62,"SWE, Data Science, Product Design","San Mateo CA","https://careers.roblox.com/",""],
  ["LinkedIn","Big Tech",55,"SWE, ML, Data Analyst","Sunnyvale, SF, NYC","https://careers.linkedin.com/",""],
  ["Workday","Big Tech",74,"SWE, App Dev","Pleasanton CA, Atlanta","https://www.workday.com/en-us/company/careers/early-career.html",""],
  // ── AI Labs ───────────────────────────────────────────────────────────────
  ["OpenAI","AI Labs",70,"SWE, Research, Applied AI","SF","https://openai.com/careers/",""],
  ["Anthropic","AI Labs",65,"SWE, Research","SF, NYC","https://www.anthropic.com/careers",""],
  ["Perplexity AI","AI Labs",58,"SWE, ML","SF","https://www.perplexity.ai/hub/careers",""],
  ["Cursor (Anysphere)","AI Labs",65,"SWE, ML","SF","https://anysphere.inc/",""],
  ["xAI","AI Labs",60,"SWE, ML Engineer","Bay Area","https://x.ai/careers",""],
  ["Cognition AI","AI Labs",60,"SWE, ML Research","SF, NYC","https://www.cognition.ai/careers",""],
  ["Harvey AI","AI Labs",58,"SWE, ML","SF, NYC","https://www.harvey.ai/careers",""],
  ["Waymo","AI Labs",55,"SWE, ML, Planner","Mountain View, SF","https://careers.withwaymo.com/",""],
  ["Glean","AI Labs",55,"SWE, ML","Palo Alto","https://www.glean.com/careers",""],
  ["Anduril","AI Labs",53,"SWE, Mission Software, Robotics","Costa Mesa CA, DC","https://www.anduril.com/careers/",""],
  ["Nuro","AI Labs",60,"SWE, ML, Robotics","Mountain View","https://www.nuro.ai/careerspage",""],
  ["DeepMind","AI Labs",72,"Research Scientist, Research Engineer","Mountain View, NYC","https://deepmind.google/careers/",""],
  ["Sierra AI","AI Labs",60,"SWE","SF","https://sierra.ai/careers",""],
  ["Zoox","AI Labs",53,"SWE, Robotics","Foster City CA","https://zoox.com/careers/",""],
  ["Character AI","AI Labs",60,"SWE, ML","Menlo Park","https://character.ai/careers",""],
  // ── Growth / SaaS ─────────────────────────────────────────────────────────
  ["Snap","Growth",60,"SWE, ML, Data Eng","LA, SF, NYC, Seattle","https://careers.snap.com/",""],
  ["Airbnb","Growth",58,"SWE, Data Science, ML","SF","https://careers.airbnb.com/",""],
  ["Adobe","Growth",55,"AI/ML SWE, SWE","San Jose, SF, NYC, Seattle","https://careers.adobe.com/",""],
  ["Wiz","Growth",55,"SWE, Security Research","NYC","https://www.wiz.io/careers",""],
  ["Plaid","Growth",55,"SWE","SF, NYC","https://plaid.com/careers/",""],
  ["Ramp","Growth",55,"SWE, Data Eng","NYC","https://ramp.com/careers",""],
  ["TikTok","Growth",53,"SWE, Data Scientist, ML","San Jose, NYC, Seattle","https://careers.tiktok.com/",""],
  ["Rippling","Growth",53,"SWE","SF, NYC","https://www.rippling.com/careers",""],
  ["Duolingo","Growth",50,"SWE, Data Science","Pittsburgh, NYC","https://careers.duolingo.com/",""],
  ["Reddit","Growth",50,"SWE, Data Science, ML","SF, NYC","https://www.redditinc.com/careers",""],
  ["SpaceX","Growth",50,"SWE, Embedded, Starlink","Hawthorne CA","https://www.spacex.com/careers/",""],
  ["Tesla","Growth",50,"SWE, Autopilot, Firmware","Palo Alto, Austin","https://www.tesla.com/careers/",""],
  ["Datadog","Growth",50,"SWE, PM","NYC, Boston","https://careers.datadoghq.com/",""],
  ["Notion","Growth",50,"SWE","SF, NYC","https://www.notion.so/careers",""],
  ["MongoDB","Growth",50,"SWE","NYC","https://www.mongodb.com/careers",""],
  ["Affirm","Growth",50,"SWE, ML","SF, NYC","https://www.affirm.com/careers",""],
  ["Dropbox","Growth",50,"SWE, Data Science","SF, NYC","https://www.dropbox.com/jobs",""],
  ["AppLovin","Growth",50,"SWE","Palo Alto","https://www.applovin.com/careers/",""],
  ["Vercel","Growth",50,"SWE","SF, Remote","https://vercel.com/careers",""],
  ["Lyft","Growth",50,"SWE, Data Science","SF, NYC","https://www.lyft.com/careers",""],
  ["Instacart","Growth",50,"SWE, ML","SF, Remote","https://instacart.careers/",""],
  ["CrowdStrike","Growth",48,"SWE, Cybersecurity","Austin, Sunnyvale","https://www.crowdstrike.com/careers/",""],
  ["Asana","Growth",48,"SWE","SF, NYC","https://asana.com/jobs",""],
  ["Atlassian","Growth",48,"SWE, Data Science","SF, NYC, Austin","https://www.atlassian.com/company/careers",""],
  ["HubSpot","Growth",47,"SWE, Product Engineer","Cambridge MA, NYC","https://www.hubspot.com/careers/",""],
  ["Discord","Growth",47,"SWE, Data Science","SF","https://discord.com/careers",""],
  ["Spotify","Growth",47,"Backend Eng, Data Analyst, ML","NYC, Boston","https://www.lifeatspotify.com/",""],
  ["Riot Games","Growth",47,"SWE, Data Analyst","Los Angeles","https://www.riotgames.com/en/work-with-us",""],
  ["Epic Games","Growth",46,"SWE, Engine Programmer","Cary NC","https://www.epicgames.com/site/en-US/careers",""],
  ["Grammarly","Growth",45,"SWE, ML, NLP","SF, NYC","https://www.grammarly.com/jobs",""],
  ["Samsara","Growth",48,"SWE, Full Stack, IoT","SF, Atlanta","https://www.samsara.com/company/careers",""],
  ["Gusto","Growth",48,"SWE, Full Stack","SF, NYC, Denver","https://gusto.com/about/careers",""],
  ["Braze","Growth",60,"SWE, Data Science","NYC, Chicago","https://www.braze.com/company/careers",""],
  ["Verkada","Growth",50,"Frontend SWE, Backend SWE","San Mateo","https://www.verkada.com/careers/",""],
  ["Block (Square)","Growth",53,"SWE, Data Science, ML","SF, NYC","https://block.xyz/careers",""],
  ["Flexport","Growth",48,"SWE, Data Eng, ML","SF, Chicago, NYC","https://www.flexport.com/careers",""],
  ["Motorola Solutions","Growth",45,"SWE, Embedded, AI","Chicago, Schaumburg IL","https://www.motorolasolutions.com/company/careers.html",""],
  ["Tempus AI","Growth",45,"SWE, ML, Data Science","Chicago","https://www.tempus.com/careers/",""],
  ["Circle","Growth",38,"SWE, Blockchain Eng","NYC, Chicago, Remote","https://www.circle.com/en/careers",""],
  ["Boeing","Growth",37,"SWE, Data Science, Cybersecurity","Chicago, Arlington VA","https://jobs.boeing.com/",""],
  ["Qualtrics","Growth",68,"SWE","Seattle, Provo UT","https://www.qualtrics.com/careers/",""],
  ["Intuit","Growth",48,"SWE, Data Science, PM","Mountain View, NYC","https://jobs.intuit.com/",""],
  ["DocuSign","Growth",48,"SWE, Product Eng","SF, NYC, Chicago","https://careers.docusign.com/",""],
  ["Okta","Growth",48,"SWE, Security Eng","SF, NYC, Remote","https://www.okta.com/company/careers/",""],
  ["Twitch","Growth",48,"SDE","SF, NYC, Seattle","https://www.twitch.tv/jobs",""],
  // ── Finance / Banks ───────────────────────────────────────────────────────
  ["Capital One","Finance",71,"SWE, Data Science, ML, Cybersecurity","NYC, McLean VA, Plano TX","https://www.capitalone.com/tech/software-engineering/","Bank"],
  ["JPMorgan","Finance",48,"SWE, Data, AI/ML, Quant","NYC, Chicago","https://careers.jpmorgan.com/","Bank"],
  ["Goldman Sachs","Finance",48,"Eng Summer Analyst, Quant","NYC, Dallas","https://www.goldmansachs.com/careers/","Bank"],
  ["Bloomberg","Finance",48,"SWE, Data Analyst","NYC","https://www.bloomberg.com/careers/",""],
  ["BlackRock","Finance",48,"SWE, Quant, Aladdin Eng","NYC, SF, Atlanta","https://careers.blackrock.com/","Asset Mgr"],
  ["Morgan Stanley","Finance",47,"Technology Summer Analyst","NYC","https://www.morganstanley.com/careers/","Bank"],
  ["Bank of America","Finance",46,"Global Tech Analyst, SWE","Charlotte, NYC, Chicago","https://campus.bankofamerica.com/","Bank"],
  ["Citi","Finance",46,"Tech Analyst, SWE, Quant","NYC","https://jobs.citi.com/","Bank"],
  ["Fidelity","Finance",46,"SWE, Data Science, Quant","Boston, NYC","https://jobs.fidelity.com/","Asset Mgr"],
  ["Interactive Brokers","Finance",50,"Software Developer Intern","NYC, Greenwich CT","https://www.interactivebrokers.com/en/index.php?f=563",""],
  ["CME Group","Finance",47,"SWE, Data Engineering","Chicago","https://www.cmegroup.com/careers.html","Exchange"],
  ["Cboe Global Markets","Finance",45,"SWE, Data Eng, Quant","Chicago","https://careers.cboe.com/","Exchange"],
  ["Discover Financial","Finance",35,"SWE, Data Science, ML","Chicago suburbs","https://www.discover.com/company/careers/",""],
  ["Gemini","Finance",50,"SWE Frontend, Backend","NYC","https://www.gemini.com/careers","Crypto"],
  ["PIMCO","Finance",50,"Technology Analyst","Austin, Newport Beach, NYC","https://pimco.wd1.myworkdayjobs.com/","Asset Mgr"],
  // ── Startups (Series A–D) ─────────────────────────────────────────────────
  ["Retool","Startup",75,"SWE, Full Stack","SF","https://retool.com/careers",""],
  ["Linear","Startup",55,"SWE, Full Stack","SF, NYC, Remote","https://linear.app/careers",""],
  ["Brex","Startup",55,"SWE, Backend, AI/ML","SF","https://www.brex.com/careers",""],
  ["Vanta","Startup",55,"SWE, Security","SF, NYC","https://www.vanta.com/careers",""],
  ["Mercury","Startup",55,"SWE, Full Stack, Fintech","SF, NYC","https://mercury.com/jobs",""],
  ["Airtable","Startup",50,"SWE, Full Stack, AI","SF, NYC","https://airtable.com/careers",""],
  ["Whatnot","Startup",50,"SWE, Backend, ML","LA, NYC","https://www.whatnot.com/careers",""],
  ["Watershed","Startup",50,"SWE, Full Stack","SF","https://watershed.com/careers",""],
  ["dbt Labs","Startup",50,"SWE, Data Eng","Remote","https://www.getdbt.com/dbt-labs/open-roles",""],
  ["Temporal","Startup",50,"SWE, Distributed Systems","Remote, Seattle","https://temporal.io/careers",""],
  ["Mux","Startup",48,"SWE, Video Infra","SF, Remote","https://www.mux.com/jobs",""],
  ["Supabase","Startup",48,"SWE, Backend, Postgres","SF, Remote","https://supabase.com/careers",""],
  ["Webflow","Startup",48,"SWE, Frontend, Backend","SF, NYC","https://webflow.com/careers",""],
  ["Lattice","Startup",45,"SWE, Full Stack","SF, NYC","https://lattice.com/careers",""],
  ["Codeium (Windsurf)","Startup",50,"SWE, ML, AI Code","SF","https://codeium.com/careers",""],
  ["Modal","Startup",50,"SWE, Infra, Cloud Compute","NYC","https://modal.com/careers",""],
  ["PostHog","Startup",45,"SWE, Full Stack, Analytics","SF, Remote","https://posthog.com/careers",""],
  ["Clerk","Startup",45,"SWE, Auth, React/Node","SF, Remote","https://clerk.com/careers",""],
  ["Neon","Startup",45,"SWE, Postgres, Rust","SF, Remote","https://neon.tech/careers",""],
  ["Stytch","Startup",48,"SWE, Auth/Identity","SF","https://stytch.com/careers",""],
  ["Baseten","Startup",45,"SWE, ML Infra, Python","SF","https://www.baseten.co/careers",""],
  ["Browserbase","Startup",45,"SWE, Infra","SF","https://www.browserbase.com/careers",""],
  ["Orb","Startup",45,"SWE, Full Stack, Billing","SF, NYC","https://www.withorb.com/careers",""],
  ["Resend","Startup",42,"SWE, Full Stack, Email Infra","SF, Remote","https://resend.com/careers",""],
  ["PostHog","Startup",45,"SWE, Full Stack, Analytics","SF, Remote","https://posthog.com/careers",""],
  ["Faire","Startup",55,"SWE, ML, Data","SF","https://www.faire.com/careers",""],
  ["Astranis","Startup",45,"SWE, Embedded, Satellite","SF","https://www.astranis.com/careers",""],
  ["Grubhub","Growth",45,"SWE, Backend Eng, Data Science","Chicago, NYC","https://careers-grubhub.icims.com/",""],
  ["Sprout Social","Growth",38,"SWE, Data Eng, ML","Chicago","https://sproutsocial.com/careers/",""],
  ["Morningstar","Growth",40,"SWE, Data Analyst, Quant Research","Chicago","https://www.morningstar.com/careers",""],
  ["ActiveCampaign","Growth",33,"SWE, Data Eng","Chicago","https://www.activecampaign.com/about/careers",""],
  ["Enova International","Growth",33,"SWE, Data Science, ML","Chicago","https://www.enova.com/careers/",""],
  ["Keeper Security","Growth",32,"SWE, Cybersecurity, Mobile","Chicago","https://www.keepersecurity.com/careers.html",""],
  ["Relativity","Growth",32,"SWE, Data Science, ML","Chicago","https://www.relativity.com/company/careers/",""],
  ["Deloitte","Finance",42,"Tech Consulting, SWE, Data","NYC, Chicago","https://apply.deloitte.com/",""],
  ["Accenture","Growth",40,"SWE, Cloud, AI/ML","NYC, Chicago","https://www.accenture.com/careers",""],
  ["TransUnion","Growth",33,"SWE, Data Science, ML","Chicago","https://www.transunion.com/about-us/careers",""],
  ["Postman","Growth",42,"SWE, Backend, API","SF, NYC, Remote","https://www.postman.com/company/careers/",""],
  ["Canva","Growth",45,"SWE, Full Stack, AI","SF, Austin","https://www.canva.com/careers/",""],
  ["1Password","Startup",42,"SWE, Security, Go/Rust","Remote","https://1password.com/careers",""],
  ["Rubrik","Growth",50,"SWE","Palo Alto","https://www.rubrik.com/company/careers/",""],
  ["LaunchDarkly","Growth",50,"SWE, Backend","SF, NYC, Remote","https://launchdarkly.com/careers/",""],
  ["Netlify","Growth",50,"SWE, Full Stack","SF, Remote","https://www.netlify.com/careers/",""],
  ["HashiCorp","Growth",50,"SWE, DevOps, Go","SF, NYC, Remote","https://www.hashicorp.com/careers",""],
  ["Amplitude","Growth",50,"SWE, Data","SF, NYC","https://amplitude.com/careers",""],
  ["Mixpanel","Growth",50,"SWE, Data","SF, NYC","https://mixpanel.com/careers/",""],
];

function getDomain(url) {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, '');
  } catch { return ''; }
}

import { one, tx } from './db.js';

export async function seedJobs(userId) {
  if (!userId) throw new Error('seedJobs requires a userId (pass USER_ID env var or first CLI arg)');
  const row = await one(
    'SELECT COUNT(*)::int AS n FROM jobs WHERE user_id = $1',
    [userId]
  );
  if (row && row.n > 0) return; // already seeded for this user

  const INSERT_SQL = `
    INSERT INTO jobs (name, category, pay, roles, location, url, tag, domain, user_id)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    ON CONFLICT (user_id, name) DO NOTHING
  `;

  await tx(async (client) => {
    for (const [name, category, pay, roles, location, url, tag] of COMPANIES) {
      await client.query(INSERT_SQL, [name, category, pay, roles, location, url, tag || '', getDomain(url), userId]);
    }
  });

  console.log(`Seeded ${COMPANIES.length} companies into jobs table for user ${userId}`);
}

// Standalone invocation: `node seedJobs.js <USER_ID>` or `USER_ID=... node seedJobs.js`
if (import.meta.url === `file://${process.argv[1]}`) {
  (async () => {
    try {
      const userId = process.argv[2] || process.env.USER_ID;
      if (!userId) {
        console.error('[seedJobs] ERROR: USER_ID is required. Usage:');
        console.error('  node seedJobs.js <USER_ID>');
        console.error('  USER_ID=<uuid> node seedJobs.js');
        process.exit(2);
      }
      await seedJobs(userId);
      process.exit(0);
    } catch (err) {
      console.error('[seedJobs] Failed:', err);
      process.exit(1);
    }
  })();
}
