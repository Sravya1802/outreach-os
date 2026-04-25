import { GoogleGenerativeAI } from '@google/generative-ai';
import { cleanOutreachTemplate } from './outreachTemplates.js';

const CANDIDATE = {
  name:    'Sravya Rachakonda',
  degree:  "Master's student in Computer Science",
  website: 'https://sravyarachakonda.com',
  seeking: 'Summer 2026 Software Engineering / AI/ML internship',
  background: `Master's CS student with software engineering and CS research background.
Focused on systems, ML infrastructure, and applied AI.
Looking for Summer 2026 internships at top tech, quant, and AI companies.`,
};

// ─── Seniority-aware prompt builders ─────────────────────────────────────────

function buildEmailPrompt({ recipientName, recipientTitle, companyName, companyCategory, extraContext }) {
  const hasTitle = recipientTitle && recipientTitle !== 'No title' && recipientTitle.trim();
  const roleContext = hasTitle
    ? `${recipientName} is a ${recipientTitle} at ${companyName} (${companyCategory || 'tech company'}).`
    : `${recipientName} works at ${companyName} (${companyCategory || 'tech company'}) — exact role unknown.`;

  const system = `You are writing cold outreach for Sravya Rachakonda, a Master's CS student.
You write sharp, specific, non-generic cold emails that get replies.

About Sravya:
- ${CANDIDATE.degree}
- Background in software engineering and CS research
- Targeting internships for Summer 2026
- Website: ${CANDIDATE.website}

Rules — FOLLOW EXACTLY:
1. NEVER open with "I'm a CS student interested in opportunities" — instant delete
2. NEVER say "I'd love to chat for 15 minutes" — overused and weak
3. NEVER write subject line "Internship inquiry — Sravya Rachakonda"
4. Subject must be specific and curiosity-inducing. Use formats like:
   - "Master's student → your [team/area]?"
   - "[Specific skill] background — open to a quick chat at [Company]?"
   - "Built [X] — interested in [specific team] at [Company]"
5. Open with a SPECIFIC hook about the company, their product, or the recipient's work/team
6. Be direct about the ask: a referral, intro to their team, or advice on breaking in
7. 4–6 sentences max including sign-off. No fluff.
8. Sound like a real, confident person — not a template

Return ONLY valid JSON: { "subject": "...", "body": "..." }`;

  const user = `Recipient: ${roleContext}
${extraContext ? `Extra context: ${extraContext}` : ''}

Write the cold email from Sravya Rachakonda. Make it specific to their role and company.
If their role/company is quant/finance: reference quantitative work or trading systems.
If ML/AI company: reference ML infra, model training, or applied AI research.
If startup/growth: reference product velocity, technical challenges, or their stack.
Never write something that would work for a different company with a find-and-replace.`;

  return { system, user };
}

function buildLinkedInPrompt({ recipientName, recipientTitle, companyName, companyCategory, extraContext }) {
  const hasTitle = recipientTitle && recipientTitle !== 'No title' && recipientTitle.trim();
  const roleContext = hasTitle
    ? `${recipientName} is a ${recipientTitle} at ${companyName} (${companyCategory || 'tech company'})`
    : `${recipientName} works at ${companyName} (${companyCategory || 'tech company'})`;

  const system = `You write LinkedIn connection notes for Sravya Rachakonda, a Master's CS student targeting Summer 2026 internships.

Rules — FOLLOW EXACTLY:
1. Under 280 characters (hard limit)
2. NEVER say "I'm a CS student interested in opportunities"
3. NEVER say "I'd love to connect" or "I'd love to chat for 15 minutes"
4. One punchy hook referencing something specific about their team or company
5. One clear ask (referral, intro, advice)
6. No emojis. Sound like a confident engineer, not a fan.

Use formats like:
- "Working on [relevant area] — saw your team at [Company] is doing [specific thing]. Any chance you'd share how you approach [specific problem]?"
- "Your work on [specific team/area] at [Company] stood out. I'm a CS Master's student focused on [relevant]. Open to connecting?"

Return ONLY valid JSON: { "message": "..." }`;

  const user = `Write a LinkedIn DM from Sravya to: ${roleContext}.
${extraContext ? `Context: ${extraContext}` : ''}
Make it specific to their role. Under 280 chars. No generic openers.`;

  return { system, user };
}

// ─── JSON parser ──────────────────────────────────────────────────────────────

function parseJSON(text) {
  const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  try { return JSON.parse(cleaned); } catch (_) {}
  // Gemini sometimes adds surrounding text — extract the first JSON object
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (match) return JSON.parse(match[0]);
  throw new SyntaxError(`No JSON object found in AI response: ${cleaned.slice(0, 120)}`);
}

// ─── Provider implementations ─────────────────────────────────────────────────

let genAI = null;
function getGemini() {
  if (!genAI && process.env.GEMINI_API_KEY) {
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }
  return genAI;
}

let lastGeminiCall = 0;

async function generateWithGemini(system, user) {
  const ai = getGemini();
  if (!ai) throw new Error('Gemini API key not configured');
  const now = Date.now();
  const elapsed = now - lastGeminiCall;
  if (elapsed < 4000) await new Promise(r => setTimeout(r, 4000 - elapsed));
  lastGeminiCall = Date.now();
  const model = ai.getGenerativeModel({ model: 'gemini-2.0-flash' });
  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: `${system}\n\n${user}` }] }],
  });
  return parseJSON(result.response.text());
}

async function generateWithAnthropic(system, user) {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const msg = await client.messages.create({
    model:      'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system,
    messages:   [{ role: 'user', content: user }],
  });
  return parseJSON(msg.content[0].text);
}

async function generateWithOpenAI(system, user) {
  const { default: OpenAI } = await import('openai');
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const res = await client.chat.completions.create({
    model:    'gpt-4o-mini',
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
  });
  return parseJSON(res.choices[0].message.content);
}

// ─── WaaS message prompt ──────────────────────────────────────────────────────

function buildWaaSPrompt({ companyName, companyDescription, industry, ycBatch, contactName, extraContext }) {
  const system = `You write short "reach out" messages for Work at a Startup (YC) company pages. The message goes directly to the founder/hiring manager. These must be casual, specific, and human — NOT corporate email templates.

Rules:
1. 80-200 words max. These are short messages, not essays.
2. Lowercase throughout — use "i" not "I". No capitals except proper nouns.
3. NEVER start with "hi", "hey", "dear", or "hope this message finds you well"
4. Open with ONE specific observation about THIS company (not generic praise)
5. Connect one piece of Sravya's background to their work
6. End with a soft ask: "would love to chat about interning this summer" or similar
7. NO portfolio URL — too formal for this format
8. Sound like a real engineer typing a quick note, not a recruiter

About Sravya Rachakonda (the person writing this):
- Master's CS student at UIC (University of Illinois Chicago)
- 2 years at Mercedes-Benz R&D: distributed data pipelines processing 500GB+ daily, vehicle telemetry systems
- Current: LLM/RAG research at UIC Cancer Center — building retrieval-augmented generation for clinical data
- Skills: Python, Java, TypeScript, React, Node.js, AWS, Kafka, Spark
- Seeking Summer 2026 SWE intern

Return ONLY valid JSON: { "message": "..." }`;

  const user = `Company: ${companyName}
Description: ${companyDescription || 'YC startup'}
Industry: ${industry || 'Tech'}
YC Batch: ${ycBatch || 'Unknown'}
Contact: ${contactName || 'the team'}
${extraContext ? `Extra context: ${extraContext}` : ''}

Write the WaaS reach-out message. Be specific about ${companyName}. Connect to Sravya's most relevant background. Keep it under 200 words.`;

  return { system, user };
}

// ─── High-response-rate templates ─────────────────────────────────────────────

const TEMPLATES = {
  // HIGHEST response rate: when you've already applied
  alreadyApplied: (name, position, company) => ({
    subject: `Just applied for the ${position} internship`,
    body: `Hi ${name},\n\nI came across your profile and noticed you're a recruiter@${company}. I actually just applied for the ${position} internship and was wondering if you'd be open to a call sometime this week or next.\n\nI'd love to learn about your career growth and ${company}!\n\nBest,\nSravya Rachakonda\nsravyarachakonda.com`,
  }),

  // HIGH response rate: when FT positions exist but no internship listed
  ftsAvailableNoInterns: (name, position, company) => ({
    subject: `Internship inquiry for ${company}`,
    body: `Hi ${name},\n\nI came across your profile and noticed you're a recruiter@${company}. I saw a lot of openings for ${position} roles and was wondering if you guys were looking for any interns?\n\nWould you be open to a call sometime this week or next? I'd love to learn about your career growth and ${company}!\n\nBest,\nSravya Rachakonda\nsravyarachakonda.com`,
  }),

  // GOOD response: when no open role, asking decision maker directly
  noRoleAvailable: (name, company) => ({
    subject: `Quick question about ${company}`,
    body: `Hi ${name},\n\nI came across your profile and noticed you're at ${company}. I'm actually looking for Summer 2026 internships and was wondering if you'd know about any opportunities?\n\nWould you be open to a call sometime? I'd love to learn about your career growth and ${company}!\n\nBest,\nSravya Rachakonda\nsravyarachakonda.com`,
  }),

  // Seek advice + ask for introduction to hiring team
  seekingAdvice: (name, position, company) => ({
    subject: `Advice on ${position} at ${company}`,
    body: `Hi ${name},\n\nI came across the ${position} role at ${company} and it aligns perfectly with my background in AI/ML and software engineering. I'm genuinely interested in this opportunity.\n\nWould you have a few minutes to share your perspective on the role and team? If it seems like a good fit, I'd also appreciate if you could connect me with the right person on the hiring team.\n\nThank you for your time.\n\nBest regards,\nSravya Rachakonda\nsravyarachakonda.com`,
  }),

  // Short ask for advice (builds momentum)
  quickQuestion: (name, question, company) => ({
    subject: `${name}, 1-minute question`,
    body: `Hi ${name},\n\nI saw you were at ${company} and wanted to ask:\n\n${question || 'If you were breaking into this space today, what skills would you focus on?'}\n\nYour input means a lot — even a one-line response would be great!\n\nThanks,\nSravya Rachakonda`,
  }),
};

// ─── LinkedIn-specific templates (280 char limit) ─────────────────────────────

const LINKEDIN_TEMPLATES = {
  // HIGHEST response: direct about applied role
  alreadyApplied: (name, position, company) => ({
    message: `Hi ${name}, just applied for the ${position} internship at ${company}. Would you be open to a quick chat this week? Would love to learn about the team.`,
  }),

  // HIGH response: asking about internships when FT roles visible
  ftsAvailableNoInterns: (name, position, company) => ({
    message: `Hi ${name}, saw ${company} is hiring for ${position} roles. Any chance you're looking for interns? I'm a Master's student and would love to chat.`,
  }),

  // Direct ask: no open role
  noRoleAvailable: (name, company) => ({
    message: `Hi ${name}, I came across your profile at ${company}. I'm looking for Summer 2026 internships — any opportunities I should know about?`,
  }),

  // Referral request: ask for introduction to right contact
  seekingAdvice: (name, position, company) => ({
    message: `Hi ${name}, I'm interested in the ${position} role at ${company} and your work there caught my attention. Would you be open to connecting me with the right person on your team?`,
  }),

  // Quick question: builds momentum
  quickQuestion: (name, question, company) => ({
    message: `Hi ${name}, quick question: ${question || 'what skills matter most for breaking into your space?'} Even a one-line response would help!`,
  }),
};

function templateGuidance(type, customTemplates) {
  if (!customTemplates) return ''
  const key = type === 'linkedin' ? 'linkedin' : 'email'
  const template = cleanOutreachTemplate(customTemplates[key])
  if (!template) return ''
  return `\n\nUser's preferred ${key} template/style anchor. Mirror its tone, structure, length, and directness while still personalizing to the recipient and company. Do not copy placeholders literally:\n${template}`
}

// Detect scenario and return best template
function detectScenarioAndTemplate(params) {
  const { recipientName, recipientTitle, companyName, hasApplied, rolesAvailable, specificAchievement, isRecruiter } = params;

  // Scenario 1: Already applied for this role — HIGHEST conversion
  if (hasApplied) {
    const position = params.position || 'Software Engineering';
    return { template: 'alreadyApplied', data: [recipientName, position, companyName] };
  }

  // Scenario 2: FT roles available but asking about internships — HIGH conversion
  if (rolesAvailable && !rolesAvailable.includes('intern') && isRecruiter) {
    const position = params.position || 'Software Engineering';
    return { template: 'ftsAvailableNoInterns', data: [recipientName, position, companyName] };
  }

  // Scenario 3: Has role but want referral/advice approach
  if (rolesAvailable) {
    const position = params.position || 'Software Engineering';
    return { template: 'seekingAdvice', data: [recipientName, position, companyName] };
  }

  // Scenario 4: No role, ask quick question
  if (!rolesAvailable) {
    const question = params.extraContext || `If you were looking to break into ${companyName}'s team today, what would be the most valuable skill?`;
    return { template: 'quickQuestion', data: [recipientName, question, companyName] };
  }

  // Scenario 4: Default fallback
  return { template: 'noRoleAvailable', data: [recipientName, companyName] };
}

export function generateOutreachTemplate({ recipientName, recipientTitle, companyName, hasApplied, rolesAvailable, specificAchievement, position, isRecruiter, extraContext, type }) {
  const scenario = detectScenarioAndTemplate({
    recipientName,
    recipientTitle,
    companyName,
    hasApplied,
    rolesAvailable,
    specificAchievement,
    position,
    isRecruiter,
    extraContext,
  });

  const templateMap = type === 'linkedin' ? LINKEDIN_TEMPLATES : TEMPLATES;
  const templateFunc = templateMap[scenario.template];
  if (templateFunc) {
    return templateFunc(...scenario.data);
  }

  return null;
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function generateCoverLetter({ companyName, companyDescription, roleTitle, extraContext }) {
  const system = `You write internship cover letters for Sravya Rachakonda. Format: 3 paragraphs, 300-500 words total. Professional but direct — not stiff.

About Sravya:
- Master's CS student at UIC (University of Illinois Chicago)
- 2 years at Mercedes-Benz R&D: distributed data pipelines processing 500GB+ daily, vehicle telemetry, Kafka, Spark
- Current: LLM/RAG research at UIC Cancer Center — building retrieval-augmented generation for clinical data
- Skills: Python, Java, TypeScript, React, Node.js, AWS, Kafka, Spark
- Website: sravyarachakonda.com
- Seeking: Summer 2026 software engineering / AI/ML internship

Paragraph 1: Specific opening — reference something real about this company. NOT "I am writing to express interest..."
Paragraph 2: Lead with most relevant experience. Data/infra companies → Mercedes-Benz pipeline work. AI/health → Cancer Center LLM research. Connect to what this company actually does.
Paragraph 3: Brief skills mention + clear ask for internship opportunity.

Sign off as: Sravya Rachakonda

Return ONLY valid JSON: { "subject": "...", "body": "..." }`;

  const user = `Write a cover letter for a Summer 2026 internship at ${companyName}.
${roleTitle ? `Role: ${roleTitle}` : ''}
${companyDescription ? `About the company: ${companyDescription.slice(0, 500)}` : ''}
${extraContext ? `Extra context: ${extraContext}` : ''}

Address: "Dear Hiring Manager,"
Make paragraph 1 specific to ${companyName}. Choose background based on company type.`;

  const provider  = process.env.AI_PROVIDER || 'gemini';
  const providers = [provider, 'gemini', 'anthropic', 'openai'].filter((v, i, a) => a.indexOf(v) === i);

  for (const p of providers) {
    try {
      if (p === 'gemini')                                    return await generateWithGemini(system, user);
      if (p === 'anthropic' && process.env.ANTHROPIC_API_KEY) return await generateWithAnthropic(system, user);
      if (p === 'openai'    && process.env.OPENAI_API_KEY)    return await generateWithOpenAI(system, user);
    } catch (err) {
      console.error(`[ai/cover-letter] ${p} failed: ${err.message}`);
    }
  }

  return {
    subject: `Summer 2026 Internship Application — Sravya Rachakonda`,
    body: `Dear Hiring Manager,\n\nI'm a Master's CS student at UIC with two years of industry experience at Mercedes-Benz R&D and current LLM/RAG research at UIC Cancer Center. I'm interested in joining ${companyName} as a Summer 2026 software engineering intern.\n\nAt Mercedes-Benz, I built distributed data pipelines processing 500GB+ daily using Kafka and Spark. I'm currently developing retrieval-augmented generation systems for clinical data. I believe this background aligns well with ${companyName}'s technical challenges.\n\nI'd welcome the opportunity to discuss how I can contribute to your team.\n\nSravya Rachakonda\nsravyarachakonda.com`,
  };
}

export async function generateWaaSMessage({ companyName, companyDescription, industry, ycBatch, contactName, extraContext }) {
  const { system, user } = buildWaaSPrompt({ companyName, companyDescription, industry, ycBatch, contactName, extraContext });
  const provider  = process.env.AI_PROVIDER || 'gemini';
  const providers = [provider, 'gemini', 'anthropic', 'openai'].filter((v, i, a) => a.indexOf(v) === i);

  for (const p of providers) {
    try {
      if (p === 'gemini')                                    return await generateWithGemini(system, user);
      if (p === 'anthropic' && process.env.ANTHROPIC_API_KEY) return await generateWithAnthropic(system, user);
      if (p === 'openai'    && process.env.OPENAI_API_KEY)    return await generateWithOpenAI(system, user);
    } catch (err) {
      console.error(`[ai/waas] ${p} failed: ${err.message}`);
    }
  }
  // Fallback
  return {
    message: `noticed ${companyName} is building something interesting — i've spent two years at mercedes-benz r&d working on distributed data pipelines and i'm currently doing llm/rag research at uic. would love to chat about interning this summer if you're looking for eng interns.`,
  };
}

export async function generateOutreach({ type, recipientName, recipientTitle, companyName, companyCategory, companyStage, hasApplied, rolesAvailable, specificAchievement, position, isRecruiter, extraContext, customTemplates }) {
  // Try high-response-rate templates FIRST for email unless the user has saved
  // a custom style anchor. Saved templates should shape the AI output instead
  // of being bypassed by the static scenario templates.
  if (type !== 'linkedin' && !customTemplates?.email) {
    const templateResult = generateOutreachTemplate({
      recipientName,
      recipientTitle,
      companyName,
      hasApplied,
      rolesAvailable,
      specificAchievement,
      position,
      isRecruiter,
      extraContext,
      type,
    });
    if (templateResult) {
      console.log('[ai] Using high-response template for', companyName);
      return templateResult;
    }
  }

  // Fall back to AI generation
  const category = companyCategory || companyStage || '';
  const params = { recipientName, recipientTitle, companyName, companyCategory: category, extraContext };
  const built = type === 'linkedin'
    ? buildLinkedInPrompt(params)
    : buildEmailPrompt(params);
  const guidance = templateGuidance(type, customTemplates);
  const system = built.system + guidance;
  const user = built.user;

  const provider  = process.env.AI_PROVIDER || 'gemini';
  const providers = [provider, 'gemini', 'anthropic', 'openai'].filter((v, i, a) => a.indexOf(v) === i);

  for (const p of providers) {
    try {
      if (p === 'gemini')                                    return await generateWithGemini(system, user);
      if (p === 'anthropic' && process.env.ANTHROPIC_API_KEY) return await generateWithAnthropic(system, user);
      if (p === 'openai'    && process.env.OPENAI_API_KEY)    return await generateWithOpenAI(system, user);
    } catch (err) {
      console.error(`[ai] ${p} failed: ${err.message}`);
    }
  }

  // Last-resort fallback (should never be reached with valid API keys)
  return {
    subject: `${CANDIDATE.degree.split("'")[0]}'s student → ${companyName}?`,
    body: `Hi ${recipientName},\n\nI came across ${companyName}'s work and wanted to reach out directly. I'm a Master's CS student with a background in software engineering and research, targeting Summer 2026.\n\nWould you be open to a quick intro, or point me to the right person on your team?\n\n— Sravya\n${CANDIDATE.website}`,
    message: `Came across your work at ${companyName} — I'm a CS Master's student focused on [relevant area]. Any chance you'd share how your team approaches [specific challenge]?`,
  };
}
