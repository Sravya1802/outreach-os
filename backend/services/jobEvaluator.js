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

async function callAI(prompt) {
  const errors = [];

  if (process.env.GEMINI_API_KEY) {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
    for (let i = 0; i < 2; i++) {
      try {
        const result = await Promise.race([
          model.generateContent(prompt),
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

  if (process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY !== 'optional_fallback') {
    try {
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const msg = await Promise.race([
        client.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 4096,
          messages: [{ role: 'user', content: prompt }],
        }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('Claude timeout')), 30000)),
      ]);
      return msg.content[0].text;
    } catch (err) {
      errors.push(`Claude: ${err.message?.slice(0, 80)}`);
    }
  }

  if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'optional_fallback') {
    try {
      const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const msg = await Promise.race([
        client.chat.completions.create({
          model: 'gpt-4o-mini',
          max_tokens: 4096,
          messages: [{ role: 'user', content: prompt }],
        }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('OpenAI timeout')), 30000)),
      ]);
      return msg.choices[0].message.content;
    } catch (err) {
      errors.push(`OpenAI: ${err.message?.slice(0, 80)}`);
    }
  }

  throw new Error(`All AI providers failed: ${errors.join(' | ')}`);
}

// ── Fetch job page content from URL ──────────────────────────────────────────

export async function fetchJobFromUrl(url) {
  try {
    // cheerio v1.x ESM exports `load` as a named export, not default.
    // `{ default: cheerio }` resolves to undefined → `cheerio.load(...)` throws
    // "Cannot read properties of undefined (reading 'load')".
    const { load } = await import('cheerio');
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
      signal: AbortSignal.timeout(10000),
    });
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
    return { text, url };
  } catch (err) {
    console.error('[jobEvaluator] fetchJobFromUrl failed:', err.message);
    return { text: null, url, error: err.message };
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

  const prompt = `You are running the santifer/career-ops \`oferta\` mode. Follow the rules in SYSTEM CONTEXT and OFERTA MODE exactly. The candidate's CV stands in for cv.md.

Because the output is consumed by a web UI, return ONLY valid JSON (no markdown, no code fences) matching the SCHEMA below. Inside string fields you may use markdown. Keep prose in native tech English, short sentences, no corporate-speak.

================ SYSTEM CONTEXT (_shared.md) ================
${SHARED_MD}

================ OFERTA MODE (oferta.md) ================
${OFERTA_MD}

================ CANDIDATE ================
Name: ${CANDIDATE.name}
Target: ${CANDIDATE.role}

CV (cv.md stand-in):
${resumeText.slice(0, 4500)}

================ JOB ================
${jobUrl ? `URL: ${jobUrl}\n` : ''}JD:
${jobDescription.slice(0, 3500)}

================ OUTPUT SCHEMA ================
{
  "jobTitle": "string — role title extracted from JD",
  "companyName": "string — company name",
  "archetype": {
    "primary": "AI Platform / LLMOps | Agentic / Automation | Technical AI PM | AI Solutions Architect | AI Forward Deployed | AI Transformation | Other",
    "secondary": "string or null — only if hybrid",
    "reasoning": "1-2 sentences citing JD signals"
  },
  "globalScore": <float 1.0-5.0>,
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
    "tldr": "1 sentence"
  },
  "blockB_cvMatch": {
    "requirements": [
      {"requirement": "from JD", "cvEvidence": "exact line/section from CV or 'none'", "status": "match | partial | gap"}
    ],
    "gaps": [
      {"gap": "missing skill/experience", "severity": "hard blocker | nice-to-have", "adjacentExperience": "string or null", "mitigation": "concrete plan — cover-letter phrasing, quick project, etc."}
    ]
  },
  "blockC_levelAndStrategy": {
    "jdLevel": "detected level in JD",
    "candidateNaturalLevel": "candidate's natural level for this archetype",
    "sellSeniorPlan": ["phrase or tactic 1", "phrase 2", "phrase 3"],
    "ifDownleveledPlan": ["accept-if condition 1", "negotiation lever 2"]
  },
  "blockD_compAndDemand": {
    "salaryRange": "e.g. $X–$Y (source-cited or 'unknown — no public data')",
    "companyCompReputation": "string",
    "roleDemandTrend": "rising | steady | declining | unknown",
    "sources": ["source name 1", "source name 2"]
  },
  "blockE_personalization": {
    "cvChanges": [
      {"section": "Summary | Experience | Skills | ...", "currentState": "string", "proposedChange": "string", "why": "string"}
    ],
    "linkedinChanges": ["change 1", "change 2"]
  },
  "blockF_interviewPrep": {
    "starStories": [
      {"jdRequirement": "requirement", "situation": "S", "task": "T", "action": "A", "result": "R", "reflection": "what was learned / would do differently"}
    ],
    "caseStudyRecommendation": "which portfolio project to present and how",
    "redFlagQuestions": [
      {"question": "likely tough question", "answer": "how to respond"}
    ]
  },
  "blockG_legitimacy": {
    "assessment": "High Confidence | Proceed with Caution | Suspicious",
    "signals": [
      {"signal": "Posting freshness | Description quality | Company hiring signals | Reposting | Role market context", "finding": "string", "weight": "Positive | Neutral | Concerning"}
    ],
    "contextNotes": "string — caveats, niche role, evergreen posting, etc."
  },
  "atsKeywords": ["keyword1", "keyword2", "... 15-20 total"]
}

Rules:
- globalScore interpretation: 4.5+ Strong / 4.0-4.4 Good / 3.5-3.9 Decent / <3.5 Against.
- Never invent CV content; cite what is actually in the CV text above.
- If data is missing (e.g. salary not listed, no date on JD), say "unknown" rather than guessing.
- Block G never defaults to "Suspicious" without evidence; when data is thin use "Proceed with Caution".
- Return ONLY the JSON object.`;

  const raw = await callAI(prompt);

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
