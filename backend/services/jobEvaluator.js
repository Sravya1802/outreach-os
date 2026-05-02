/**
 * jobEvaluator.js
 * Evaluates a job description against a resume using the santifer/career-ops
 * `oferta` mode (A-G blocks, archetype detection, 1-5 score).
 *
 * Prompts are loaded verbatim from backend/career-ops-src/modes/ at runtime.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenerativeAI } from '@google/generative-ai';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MODES_DIR = path.join(__dirname, '..', 'career-ops-src', 'modes');

const CANDIDATE = {
  name: 'Sravya Rachakonda',
  role: 'CS student / New Grad — Summer 2026 internships',
};

// Load santifer's canonical mode files once at module load.
// Prefer the English-translated versions (*.en.md); fall back to the original
// Spanish files if the English ones haven't been generated yet.
function loadMode(name) {
  const en = path.join(MODES_DIR, `${name}.en.md`);
  if (fs.existsSync(en)) return fs.readFileSync(en, 'utf8');
  return fs.readFileSync(path.join(MODES_DIR, `${name}.md`), 'utf8');
}
const OFERTA_MD = loadMode('oferta');
const SHARED_MD = loadMode('_shared');

// ── AI call ───────────────────────────────────────────────────────────────────
//
// Claude Sonnet 4.6 with prompt caching is preferred — the SYSTEM CONTEXT and
// OFERTA MODE markdown together are ~12K tokens of static rubric that gets
// reused on every evaluation. Caching them as a system message drops cost ~90%
// after the first call and keeps quality on par with what users get from
// pasting the same JD/resume into Claude.ai.
//
// Falls back to Gemini, then OpenAI if Anthropic is unavailable.

async function callAI({ system, user }) {
  const errors = [];

  // Anthropic — primary path (best quality + caching)
  if (process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY !== 'optional_fallback') {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    for (let i = 0; i < 2; i++) {
      try {
        const msg = await Promise.race([
          client.messages.create({
            model: 'claude-sonnet-4-6',
            max_tokens: 8192,
            temperature: 0.3,
            system: [
              {
                type: 'text',
                text: system,
                cache_control: { type: 'ephemeral' },
              },
            ],
            messages: [{ role: 'user', content: user }],
          }),
          new Promise((_, rej) => setTimeout(() => rej(new Error('Claude timeout')), 90000)),
        ]);
        return msg.content[0].text;
      } catch (err) {
        errors.push(`Claude: ${err.message?.slice(0, 80)}`);
        if (i === 0 && /timeout|ECONNRESET|ETIMEDOUT|fetch failed|529|overloaded/i.test(err.message)) continue;
        break;
      }
    }
  }

  // Gemini fallback — concatenate system + user (Gemini's free tier is
  // best-effort, so accept lower quality here).
  if (process.env.GEMINI_API_KEY) {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
    const combined = `${system}\n\n${user}`;
    for (let i = 0; i < 2; i++) {
      try {
        const result = await Promise.race([
          model.generateContent(combined),
          new Promise((_, rej) => setTimeout(() => rej(new Error('Gemini timeout')), 25000)),
        ]);
        return result.response.text();
      } catch (err) {
        errors.push(`Gemini: ${err.message?.slice(0, 80)}`);
        const wait = parseInt(err.message?.match(/retry.*?(\d+)s/)?.[1] || '99');
        if (i === 0 && wait < 15) {
          await new Promise(r => setTimeout(r, wait * 1000));
        } else {
          break;
        }
      }
    }
  }

  // OpenAI fallback — uses system role natively
  if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'optional_fallback') {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    for (let i = 0; i < 2; i++) {
      try {
        const msg = await Promise.race([
          client.chat.completions.create({
            model: 'gpt-4o-mini',
            max_tokens: 4096,
            temperature: 0.3,
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: user },
            ],
          }),
          new Promise((_, rej) => setTimeout(() => rej(new Error('OpenAI timeout')), 60000)),
        ]);
        return msg.choices[0].message.content;
      } catch (err) {
        errors.push(`OpenAI: ${err.message?.slice(0, 80)}`);
        if (i === 0 && /timeout|ECONNRESET|ETIMEDOUT|fetch failed/i.test(err.message)) continue;
        break;
      }
    }
  }

  throw new Error(`All AI providers failed: ${errors.join(' | ')}`);
}

// ── Fetch job page content from URL ──────────────────────────────────────────

// Workday job pages are JavaScript-rendered SPAs — plain fetch() returns an
// empty HTML shell. Workday exposes a public JSON API for every posting
// though, so we can detour through that and skip the SPA entirely.
//
// URL pattern  → API endpoint:
//   https://<tenant>.<wd>.myworkdayjobs.com/[en-US/]<site>/job/<loc>/<slug>_<jobReqId>
//   →  https://<tenant>.<wd>.myworkdayjobs.com/wday/cxs/<tenant>/<site>/job/<loc>/<slug>_<jobReqId>
//
// The CXS API echoes the entire public path after /job/, not just the
// jobReqId. Strip the optional /en-US/ locale prefix and inject /wday/cxs/.
function workdayApiUrl(jobUrl) {
  try {
    const u = new URL(jobUrl);
    if (!/myworkdayjobs\.com$/i.test(u.hostname)) return null;
    const tenant = u.hostname.split('.')[0];
    const parts = u.pathname.split('/').filter(Boolean);
    // Drop a leading /en-US (or any /xx-XX) locale prefix.
    const startIdx = /^[a-z]{2}-[a-z]{2}$/i.test(parts[0]) ? 1 : 0;
    const tail = parts.slice(startIdx);
    if (tail.length < 3) return null;
    const site = tail[0];
    if (tail[1] !== 'job') return null;
    // Re-stitch /job/<everything-after> verbatim.
    const jobPath = '/' + tail.slice(1).join('/');
    if (!tenant || !site) return null;
    return `${u.protocol}//${u.hostname}/wday/cxs/${tenant}/${site}${jobPath}`;
  } catch { return null; }
}

async function fetchWorkdayJD(jobUrl) {
  const api = workdayApiUrl(jobUrl);
  if (!api) return null;
  try {
    const res = await fetch(api, {
      headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 OutreachOS/1.0' },
      signal:  AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const info = data?.jobPostingInfo || data;
    const parts = [
      info?.title,
      info?.jobDescription,
      info?.jobRequisitionLocation?.descriptor,
      info?.timeType,
    ].filter(Boolean);
    if (!parts.length) return null;
    // jobDescription is HTML; strip tags inline.
    const { load } = await import('cheerio');
    const html = parts.join('\n\n');
    const $ = load(`<div>${html}</div>`);
    const text = $('div').text().replace(/\s{3,}/g, '\n\n').trim().slice(0, 8000);
    return text.length > 200 ? text : null;
  } catch { return null; }
}

export async function fetchJobFromUrl(url) {
  // Try Workday's JSON API first if the URL pattern matches — saves us from
  // a wasted plain-HTML fetch that would only return an empty SPA shell.
  if (/myworkdayjobs\.com/i.test(url)) {
    const wdText = await fetchWorkdayJD(url);
    if (wdText) return { text: wdText, url, source: 'workday-api' };
  }

  try {
    // cheerio v1.x ESM exports `load` as a named export, not default.
    // `{ default: cheerio }` resolves to undefined → `cheerio.load(...)` throws
    // "Cannot read properties of undefined (reading 'load')".
    const { load } = await import('cheerio');
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      return { text: null, url, error: `HTTP ${res.status} ${res.statusText} — site blocked the fetch (try Paste JD instead)` };
    }
    const html = await res.text();
    const $ = load(html);

    $('script, style, nav, footer, header, iframe, .cookie-banner').remove();

    const selectors = [
      '[class*="job-description"]', '[class*="JobDescription"]',
      '[class*="posting-content"]', '[class*="description"]',
      'article', 'main', '.content', '#content',
    ];
    let text = '';
    for (const sel of selectors) {
      const el = $(sel).first();
      if (el.length && el.text().trim().length > 200) {
        text = el.text().trim();
        break;
      }
    }
    if (!text) text = $('body').text().trim();

    text = text.replace(/\s{3,}/g, '\n\n').slice(0, 8000);

    // Pages that are JS-rendered (Workday, Greenhouse-iframe, some Lever
    // boards) return an HTML shell with ~empty body — call that out instead
    // of bubbling `undefined` through to the UI.
    if (text.length < 200) {
      return {
        text: null,
        url,
        error: `Page returned only ${text.length} chars of text — likely a JavaScript-rendered SPA. Use the Paste JD tab instead.`,
      };
    }
    return { text, url };
  } catch (err) {
    console.error('[jobEvaluator] fetchJobFromUrl failed:', err.message);
    return { text: null, url, error: err.message || 'fetch failed' };
  }
}

// ── Main evaluation ───────────────────────────────────────────────────────────
//
// Implements santifer/career-ops `oferta` mode: Paso 0 archetype + blocks A-G.
// The AI is instructed to follow oferta.md / _shared.md verbatim, but to return
// the result as structured JSON so the web UI can render it.

export async function evaluateJob({ jobDescription, resumeText, jobUrl = null }) {
  if (!resumeText) throw new Error('No resume uploaded. Please upload your resume first.');
  if (!jobDescription || jobDescription.trim().length < 50) throw new Error('Job description is too short to evaluate.');

  // System message — static rubric, gets prompt-cached on Anthropic for ~90%
  // cost reduction across evaluations. Don't interpolate per-call data here.
  const system = `You are a senior career strategist running an evaluation. Your job is to be the brutally honest, calibrated friend who has read both the JD and CV closely and tells the candidate exactly where they stand and what to fix.

# Output style — match this voice exactly

The output is rendered in a web UI but read like a Slack DM from a strategist friend. The candidate has used Claude.ai before by pasting JD + CV into a chat — your output must feel at least as sharp as that.

✅ DO:
- Lead with a verdict: "No, not for X" / "Strong fit, apply now" / "Marginal — only if you tailor". Be decisive.
- Identify the buried match. If the CV has a bullet that mirrors the JD perfectly but is underleveraged, call that out specifically. ("Your X role is a near-perfect Y mirror, but your resume buries it as just 'general ML candidate'.")
- Top-3 gaps: surgical, JD-quoting, with concrete fixes. ("JD explicitly names X, Y, Z — none in your skills section. ATS will dock you.")
- Calibrated probability: give numerical interview odds as-is and properly-tailored. ("As-is: ~35-45%. Properly tailored: ~65-75%.")
- Tactical specifics: "swap FinPath for an LLM-based medical record entity extractor" beats "consider stronger projects."
- Quote JD phrases verbatim. Quote CV lines verbatim. Never paraphrase what they said.

❌ DO NOT:
- Hedge with "shows strong potential", "demonstrates passion", "could benefit from".
- Rate everything 4/5 to be polite — calibrate honestly. C and D grades exist.
- Generalize ("technical skills look good"). Always cite specifics.
- Invent CV content. If a JD requirement isn't in the CV, status = "gap".
- Use corporate language ("synergy", "leverage", "passionate", "rockstar").

# Quality bar

Every score, every assessment, every flag must be JUSTIFIABLE by quoting evidence. The UI exposes a "Why?" expander on every verdict — what you write in reasoning/finding/why fields is what users see when they click it. Generic prose there fails the bar. If you can't explain WHY in one specific sentence, lower your confidence and say "unknown".

# Output format

Return ONLY a single valid JSON object matching the schema in the user message. No markdown wrapper, no code fences, no preamble. Inside string fields you may use inline markdown (bold, lists). Every numeric score is a float to one decimal.

================ SYSTEM CONTEXT (_shared.md) ================
${SHARED_MD}

================ OFERTA MODE (oferta.md) ================
${OFERTA_MD}`;

  // User message — per-call payload (CV + JD + schema). Not cached.
  const user = `CANDIDATE
Name: ${CANDIDATE.name}
Target: ${CANDIDATE.role}

CV (verbatim — cite exact lines, do NOT invent content not present here):
"""
${resumeText.slice(0, 8000)}
"""

JOB${jobUrl ? `\nURL: ${jobUrl}` : ''}
JD (verbatim):
"""
${jobDescription.slice(0, 6000)}
"""

OUTPUT SCHEMA (return ONLY this JSON object, populated from the CV+JD above):
{
  "jobTitle": "string — exact role title from JD",
  "companyName": "string — company name from JD",
  "verdict": {
    "headline": "ONE sentence, decisive. Examples: 'No, not for Tempus.' / 'Strong fit, apply this week.' / 'Marginal — only if you rewrite the summary first.'",
    "oneLineWhy": "ONE sentence explaining the verdict in plain language. No hedge. Quote 1-2 JD/CV phrases that drive it.",
    "buriedMatch": "string or null — if the CV has experience that perfectly mirrors the JD but is currently underleveraged or hidden in generic phrasing, name it specifically and quote how the CV currently frames it. null if no such buried match.",
    "interviewOdds": {
      "asIs": "string — calibrated probability range, e.g. '~35-45%'",
      "properlyTailored": "string — calibrated probability after taking the cvChanges below, e.g. '~65-75%'",
      "reasoning": "1-2 sentences justifying both numbers"
    }
  },
  "topGaps": [
    {"gap": "ONE specific gap, JD-quoting", "fix": "concrete tactical fix — what to add/rewrite/swap, quoting the exact CV section affected", "severity": "blocker | high | medium"}
  ],
  "archetype": {
    "primary": "AI Platform / LLMOps | Agentic / Automation | Technical AI PM | AI Solutions Architect | AI Forward Deployed | AI Transformation | Other",
    "secondary": "string or null — only if hybrid",
    "reasoning": "2-3 sentences. Quote 2-3 specific JD phrases that signal this archetype."
  },
  "globalScore": <float 1.0-5.0, one decimal>,
  "scoreBreakdown": {
    "cvMatch": <float 1-5>,
    "northStar": <float 1-5>,
    "comp": <float 1-5>,
    "culture": <float 1-5>,
    "redFlags": <float 1-5, lower = more red flags>
  },
  "recommendation": "Strong match — apply immediately | Good match — worth applying | Decent but not ideal | Recommend against applying",
  "blockA_roleSummary": {
    "archetypeDetected": "echoes archetype.primary",
    "domain": "platform | agentic | LLMOps | ML | enterprise | other",
    "function": "build | consult | manage | deploy | other",
    "seniority": "intern | new-grad | junior | mid | senior | staff | unknown",
    "remote": "full | hybrid | onsite | unknown",
    "teamSize": "string or 'not mentioned'",
    "tldr": "1 sentence — what this role actually does day-to-day"
  },
  "blockB_cvMatch": {
    "requirements": [
      {"requirement": "exact JD phrase", "cvEvidence": "exact CV line OR 'none'", "status": "match | partial | gap", "reasoning": "1 sentence — why this status, what's the gap if any"}
    ],
    "gaps": [
      {"gap": "missing skill/experience", "severity": "hard blocker | nice-to-have", "adjacentExperience": "closest CV experience or null", "mitigation": "concrete plan — cover-letter phrasing, quick project, story to tell"}
    ]
  },
  "blockC_levelAndStrategy": {
    "jdLevel": "level detected in JD with the phrase that signaled it",
    "candidateNaturalLevel": "candidate's natural level for this archetype, with reasoning",
    "sellSeniorPlan": ["concrete tactic 1 — quote a CV line", "tactic 2", "tactic 3"],
    "ifDownleveledPlan": ["accept-if condition 1", "negotiation lever 2"]
  },
  "blockD_compAndDemand": {
    "salaryRange": "e.g. $X–$Y based on Levels.fia/Glassdoor for this role+location, OR 'unknown — no public data'",
    "companyCompReputation": "1-2 sentences — known comp positioning vs market",
    "roleDemandTrend": "rising | steady | declining | unknown",
    "reasoning": "2-3 sentences — what signals informed the trend",
    "sources": ["source 1", "source 2"]
  },
  "blockE_personalization": {
    "cvChanges": [
      {"section": "Summary | Experience | Skills | Projects", "currentState": "quote current CV text", "proposedChange": "exact rewrite", "why": "which JD requirement this serves"}
    ],
    "linkedinChanges": ["specific change 1 with rationale", "change 2"]
  },
  "blockF_interviewPrep": {
    "starStories": [
      {"jdRequirement": "exact JD requirement", "situation": "S — quote CV", "task": "T", "action": "A", "result": "R with metrics if available", "reflection": "what was learned / would do differently"}
    ],
    "caseStudyRecommendation": "which CV project to present, in what framing, and which JD bullets it answers",
    "redFlagQuestions": [
      {"question": "likely tough interview question this CV invites", "answer": "how to respond, with specific framing"}
    ]
  },
  "blockG_legitimacy": {
    "assessment": "High Confidence | Proceed with Caution | Suspicious",
    "signals": [
      {"signal": "Posting freshness | Description quality | Company hiring signals | Reposting | Role market context", "finding": "specific observation with detail — what made you draw this conclusion", "weight": "Positive | Neutral | Concerning"}
    ],
    "contextNotes": "1-2 sentences — caveats, niche role, evergreen posting, ghost-job indicators"
  },
  "atsKeywords": ["15-20 exact keywords pulled from the JD that the candidate's CV should mirror — prioritize multi-word technical phrases over single common words"]
}

Hard rules:
- verdict.headline: ONE decisive sentence. No "could be a fit if conditions are met" — pick a side.
- topGaps: EXACTLY the 3 most important gaps, ranked by impact on interview odds. Not 2, not 5. Three.
- interviewOdds: numerical ranges (e.g. "30-40%"), not vague words. Be calibrated — if the CV has a near-perfect match, properlyTailored should be 65%+; if it's a stretch, asIs should be <25%.
- buriedMatch: if you find one, this is THE single highest-leverage observation. Be specific and quote both the JD requirement AND how the CV currently buries it.
- globalScore: 4.5+ Strong / 4.0-4.4 Good / 3.5-3.9 Decent / <3.5 Against. Use one decimal.
- Never invent CV content. Quote only what appears in the CV above. If a JD requirement has no CV match, status = "gap" — don't stretch.
- Never invent salary numbers. If the JD doesn't list comp and you don't have public data, say "unknown — no public data".
- Block G "Suspicious" requires ≥2 concerning signals with concrete findings. With thin data default to "Proceed with Caution".
- Every "reasoning" / "finding" / "why" field must be specific and cite source phrases. Generic answers fail review.
- Return ONLY the JSON object — no preamble, no code fences, no trailing prose.`;

  const raw = await callAI({ system, user });

  let evaluation;
  try {
    const cleaned = raw.replace(/^```json?\s*/m, '').replace(/^```\s*/m, '').replace(/```\s*$/m, '').trim();
    evaluation = JSON.parse(cleaned);
  } catch (err) {
    console.error('[jobEvaluator] JSON parse failed, raw:', raw.slice(0, 500));
    throw new Error('AI returned malformed evaluation. Please try again.');
  }

  // Back-compat fields expected by existing callers (careerOps.js, resumeGenerator.js).
  const globalScore = Number(evaluation.globalScore) || 0;
  evaluation.overallScore = Math.round(globalScore * 20); // 1-5 → 1-100
  evaluation.grade =
    globalScore >= 4.5 ? 'A' :
    globalScore >= 4.0 ? 'B' :
    globalScore >= 3.5 ? 'C' :
    globalScore >= 2.5 ? 'D' : 'F';

  return evaluation;
}
