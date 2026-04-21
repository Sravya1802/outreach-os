/**
 * reportManager.js
 * Implements santifer/career-ops report + tracker persistence:
 *
 *  1. saveEvaluationReport(evaluation, companyName, jobTitle, jobUrl)
 *     → writes reports/NNN-company-YYYY-MM-DD.md in santifer's exact format
 *     → appends a TSV row to batch/tracker-additions/YYYY-MM-DD.tsv
 *       (never edits applications.md directly — santifer rule §9)
 *
 *  2. syncTracker()
 *     → drains all pending TSV files into data/applications.md
 *
 *  3. getTrackerRows() → parsed rows from applications.md
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR   = path.join(__dirname, '..', 'data');
const REPORTS_DIR = path.join(DATA_DIR, 'reports');
const BATCH_DIR   = path.join(DATA_DIR, 'batch', 'tracker-additions');
const TRACKER_PATH = path.join(DATA_DIR, 'applications.md');

fs.mkdirSync(REPORTS_DIR, { recursive: true });
fs.mkdirSync(BATCH_DIR,   { recursive: true });

// ── helpers ───────────────────────────────────────────────────────────────────

function nextReportNum() {
  const files = fs.readdirSync(REPORTS_DIR).filter(f => /^\d+/.test(f));
  if (!files.length) return 1;
  const max = Math.max(...files.map(f => parseInt(f)));
  return max + 1;
}

function slug(str) {
  return (str || 'unknown')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

// ── 1. Save evaluation report ─────────────────────────────────────────────────

export function saveEvaluationReport(evaluation, companyName, jobTitle, jobUrl) {
  const num     = String(nextReportNum()).padStart(3, '0');
  const company = slug(companyName);
  const date    = today();
  const filename = `${num}-${company}-${date}.md`;
  const filepath = path.join(REPORTS_DIR, filename);

  const score    = evaluation.globalScore?.toFixed(1) ?? '?';
  const grade    = evaluation.grade ?? '?';
  const legit    = evaluation.blockG_legitimacy?.assessment ?? 'unknown';
  const archetype = evaluation.archetype?.primary ?? 'unknown';

  const b = evaluation;

  const md = `# Evaluation: ${companyName} — ${jobTitle}

**Date:** ${date}
**URL:** ${jobUrl || 'not provided'}
**Archetype:** ${archetype}
**Score:** ${score}/5 (${grade})
**Legitimacy:** ${legit}

---

## A) Role Summary

**TL;DR:** ${b.blockA_roleSummary?.tldr ?? ''}

| Field | Value |
|-------|-------|
| Domain | ${b.blockA_roleSummary?.domain ?? ''} |
| Function | ${b.blockA_roleSummary?.function ?? ''} |
| Seniority | ${b.blockA_roleSummary?.seniority ?? ''} |
| Remote | ${b.blockA_roleSummary?.remote ?? ''} |
| Team Size | ${b.blockA_roleSummary?.teamSize ?? ''} |

---

## B) CV Match

### Requirements

| Requirement | CV Evidence | Status |
|------------|-------------|--------|
${(b.blockB_cvMatch?.requirements ?? []).map(r =>
  `| ${r.requirement} | ${r.cvEvidence} | ${r.status} |`
).join('\n')}

### Gaps

${(b.blockB_cvMatch?.gaps ?? []).map(g =>
  `- **${g.gap}** (${g.severity})\n  - Adjacent: ${g.adjacentExperience ?? 'none'}\n  - Plan: ${g.mitigation ?? ''}`
).join('\n\n')}

---

## C) Level & Strategy

- **JD Level:** ${b.blockC_levelAndStrategy?.jdLevel ?? ''}
- **Your Natural Level:** ${b.blockC_levelAndStrategy?.candidateNaturalLevel ?? ''}

**Sell Senior Plan:**
${(b.blockC_levelAndStrategy?.sellSeniorPlan ?? []).map(p => `- ${p}`).join('\n')}

**If Downleveled:**
${(b.blockC_levelAndStrategy?.ifDownleveledPlan ?? []).map(p => `- ${p}`).join('\n')}

---

## D) Comp & Demand

- **Range:** ${b.blockD_compAndDemand?.salaryRange ?? 'unknown'}
- **Company Rep:** ${b.blockD_compAndDemand?.companyCompReputation ?? ''}
- **Demand Trend:** ${b.blockD_compAndDemand?.roleDemandTrend ?? ''}
- **Sources:** ${(b.blockD_compAndDemand?.sources ?? []).join(', ')}

---

## E) Personalization

### CV Changes
${(b.blockE_personalization?.cvChanges ?? []).map((c, i) =>
  `${i + 1}. **${c.section}** — ${c.proposedChange}\n   *Why:* ${c.why}`
).join('\n\n')}

### LinkedIn Changes
${(b.blockE_personalization?.linkedinChanges ?? []).map(c => `- ${c}`).join('\n')}

---

## F) Interview Prep

### STAR+R Stories
${(b.blockF_interviewPrep?.starStories ?? []).map((s, i) => `
**Story ${i + 1}** — ${s.jdRequirement ?? ''}
- **S:** ${s.situation ?? ''}
- **T:** ${s.task ?? ''}
- **A:** ${s.action ?? ''}
- **R:** ${s.result ?? ''}
- **Reflection:** ${s.reflection ?? ''}
`).join('')}

**Case Study:** ${b.blockF_interviewPrep?.caseStudyRecommendation ?? ''}

### Red-Flag Questions
${(b.blockF_interviewPrep?.redFlagQuestions ?? []).map(q =>
  `- **Q:** ${q.question}\n  **A:** ${q.answer}`
).join('\n\n')}

---

## G) Posting Legitimacy

**Assessment:** ${legit}

| Signal | Finding | Weight |
|--------|---------|--------|
${(b.blockG_legitimacy?.signals ?? []).map(s =>
  `| ${s.signal} | ${s.finding} | ${s.weight} |`
).join('\n')}

**Context:** ${b.blockG_legitimacy?.contextNotes ?? ''}

---

## ATS Keywords

${(b.atsKeywords ?? []).join(', ')}
`;

  fs.writeFileSync(filepath, md, 'utf8');
  console.log(`[reportManager] Saved report: ${filename}`);

  // Also write a styled HTML version — this is what the UI serves now.
  const htmlFilename = filename.replace(/\.md$/, '.html');
  const htmlPath = path.join(REPORTS_DIR, htmlFilename);
  try {
    fs.writeFileSync(htmlPath, renderReportHtml(evaluation, companyName, jobTitle, jobUrl, date, num), 'utf8');
    console.log(`[reportManager] Saved HTML report: ${htmlFilename}`);
  } catch (err) {
    console.error('[reportManager] HTML render failed:', err.message);
  }

  // Write TSV addition (santifer rule: never edit applications.md directly)
  const tsvPath = path.join(BATCH_DIR, `${date}.tsv`);
  const reportLink = `[${num}](reports/${htmlFilename})`;
  const tsvLine = [num, date, companyName, jobTitle, score, 'Evaluated', '❌', reportLink].join('\t') + '\n';
  fs.appendFileSync(tsvPath, tsvLine, 'utf8');
  console.log(`[reportManager] TSV addition written: ${date}.tsv`);

  return { filepath, filename, htmlPath, htmlFilename, mdPath: filepath, reportNum: num };
}

// ── Styled HTML renderer — self-contained, print-friendly ─────────────────────

function escHtml(s) {
  if (s == null) return '';
  return String(s).replace(/[<>&"]/g, c => ({ '<':'&lt;', '>':'&gt;', '&':'&amp;', '"':'&quot;' }[c]));
}

function renderReportHtml(e, companyName, jobTitle, jobUrl, date, num) {
  const grade      = e.grade || 'F';
  const gradeColor = { A:'#16a34a', B:'#0d9488', C:'#d97706', D:'#ea580c', F:'#dc2626' }[grade] || '#64748b';
  const gradeBg    = { A:'#dcfce7', B:'#ccfbf1', C:'#fef3c7', D:'#ffedd5', F:'#fee2e2' }[grade] || '#f8fafc';
  const score      = typeof e.globalScore === 'number' ? e.globalScore.toFixed(1)
                   : typeof e.overallScore === 'number' ? (e.overallScore / 20).toFixed(1)
                   : '?';
  const legit      = e.blockG_legitimacy?.assessment || 'Proceed with Caution';
  const legitColor = legit === 'High Confidence' ? '#16a34a' : legit === 'Suspicious' ? '#dc2626' : '#d97706';
  const legitBg    = legit === 'High Confidence' ? '#dcfce7' : legit === 'Suspicious' ? '#fee2e2' : '#fef3c7';
  const legitHint  = legit === 'High Confidence'
    ? 'Multiple positive signals — this role looks real and active. Safe to invest effort.'
    : legit === 'Suspicious'
    ? 'Multiple ghost-job indicators. Investigate before investing time in an application.'
    : 'Mixed signals — the role may be open, but verify before over-investing in a tailored application.';

  const requirementsRows = (e.blockB_cvMatch?.requirements || []).map(r => {
    const statusColor = r.status === 'match' ? '#16a34a' : r.status === 'partial' ? '#d97706' : '#dc2626';
    const statusBg    = r.status === 'match' ? '#dcfce7' : r.status === 'partial' ? '#fef3c7' : '#fee2e2';
    return `<tr>
      <td><span class="pill" style="background:${statusBg};color:${statusColor}">${escHtml(r.status)}</span></td>
      <td><strong>${escHtml(r.requirement)}</strong></td>
      <td>${escHtml(r.cvEvidence)}</td>
    </tr>`;
  }).join('');

  const gapsHtml = (e.blockB_cvMatch?.gaps || []).map(g => `
    <div class="gap">
      <div class="gap-head">
        <span class="pill" style="background:${g.severity === 'hard blocker' ? '#fee2e2' : '#fef3c7'};color:${g.severity === 'hard blocker' ? '#991b1b' : '#92400e'}">${escHtml(g.severity)}</span>
        <strong>${escHtml(g.gap)}</strong>
      </div>
      ${g.adjacentExperience ? `<div class="muted">Adjacent: ${escHtml(g.adjacentExperience)}</div>` : ''}
      <div class="italic">→ ${escHtml(g.mitigation)}</div>
    </div>`).join('');

  const starHtml = (e.blockF_interviewPrep?.starStories || []).map(s => `
    <div class="star">
      <div class="star-req">Maps to: ${escHtml(s.jdRequirement)}</div>
      <div><strong>S</strong>: ${escHtml(s.situation)}</div>
      <div><strong>T</strong>: ${escHtml(s.task)}</div>
      <div><strong>A</strong>: ${escHtml(s.action)}</div>
      <div><strong>R</strong>: ${escHtml(s.result)}</div>
      ${s.reflection ? `<div class="muted italic">Reflection: ${escHtml(s.reflection)}</div>` : ''}
    </div>`).join('');

  const redFlagHtml = (e.blockF_interviewPrep?.redFlagQuestions || []).map(q => `
    <div class="redflag">
      <div><strong>Q:</strong> ${escHtml(q.question)}</div>
      <div><strong>A:</strong> ${escHtml(q.answer)}</div>
    </div>`).join('');

  const signalRows = (e.blockG_legitimacy?.signals || []).map(s => {
    const wColor = s.weight === 'Positive' ? '#16a34a' : s.weight === 'Concerning' ? '#dc2626' : '#64748b';
    const wBg    = s.weight === 'Positive' ? '#dcfce7' : s.weight === 'Concerning' ? '#fee2e2' : '#f1f5f9';
    return `<tr>
      <td><strong>${escHtml(s.signal)}</strong></td>
      <td>${escHtml(s.finding)}</td>
      <td><span class="pill" style="background:${wBg};color:${wColor}">${escHtml(s.weight)}</span></td>
    </tr>`;
  }).join('');

  const cvChangesHtml = (e.blockE_personalization?.cvChanges || []).map(c => `
    <div class="change">
      <div class="change-head">${escHtml(c.section)}</div>
      ${c.currentState ? `<div><strong>Before:</strong> ${escHtml(c.currentState)}</div>` : ''}
      <div style="color:#16a34a"><strong>After:</strong> ${escHtml(c.proposedChange)}</div>
      <div class="muted italic">Why: ${escHtml(c.why)}</div>
    </div>`).join('');

  const atsKeywords = (e.atsKeywords || []).map(k => `<span class="chip">${escHtml(k)}</span>`).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${escHtml(jobTitle)} — ${escHtml(companyName)}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    * { box-sizing: border-box }
    body { margin:0; padding:40px 24px; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,sans-serif; background:#f8fafc; color:#0f172a; line-height:1.55 }
    .page { max-width:880px; margin:0 auto; background:#fff; border:1px solid #e2e8f0; border-radius:16px; padding:40px; box-shadow:0 2px 16px rgba(0,0,0,0.04) }
    .hdr { display:flex; align-items:center; gap:20px; padding:20px 24px; background:${gradeBg}; border-radius:14px; margin-bottom:24px }
    .grade-circle { width:74px; height:74px; border-radius:50%; background:${gradeColor}20; border:3px solid ${gradeColor}; display:flex; align-items:center; justify-content:center; flex-shrink:0; color:${gradeColor}; font-size:32px; font-weight:900 }
    .hdr h1 { margin:0 0 4px; font-size:22px; font-weight:800 }
    .hdr .sub { color:${gradeColor}; font-weight:700; font-size:13px }
    .hdr .meta { font-size:12px; color:#64748b; margin-top:4px }
    h2 { font-size:16px; border-bottom:1px solid #e2e8f0; padding-bottom:8px; margin-top:32px }
    h2 .tag { font-size:11px; color:#94a3b8; font-weight:600; margin-left:8px }
    h3 { font-size:12px; color:#94a3b8; text-transform:uppercase; letter-spacing:.07em; margin-top:20px }
    .stats-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(140px,1fr)); gap:10px; margin:14px 0 }
    .stat { padding:10px 12px; background:#f8fafc; border-radius:8px; border:1px solid #f1f5f9 }
    .stat-label { font-size:10px; font-weight:700; color:#94a3b8; text-transform:uppercase; letter-spacing:.07em; margin-bottom:3px }
    .stat-val { font-size:13px; font-weight:600 }
    table { width:100%; border-collapse:collapse; font-size:13px; margin:12px 0 }
    th,td { text-align:left; padding:8px 10px; border-bottom:1px solid #f1f5f9; vertical-align:top }
    th { font-size:10px; color:#94a3b8; font-weight:700; text-transform:uppercase; letter-spacing:.06em }
    .pill { display:inline-block; padding:2px 8px; border-radius:12px; font-size:10px; font-weight:700; text-transform:capitalize }
    .gap,.change,.star,.redflag { padding:10px 12px; margin:6px 0; border-radius:8px; background:#f8fafc; border-left:3px solid #6366f1; font-size:12px }
    .gap { background:#fef2f2; border-left-color:#dc2626 }
    .star { border-left-color:#7c3aed }
    .redflag { background:#fef2f2; border-left-color:#dc2626 }
    .change-head,.star-req { font-size:11px; font-weight:700; color:#4f46e5; margin-bottom:4px }
    .muted { color:#64748b; font-size:11px }
    .italic { font-style:italic }
    .legit { padding:14px 16px; border-radius:10px; border:1px solid ${legitColor}40; background:${legitBg}; margin:12px 0 }
    .legit-label { font-weight:800; color:${legitColor}; font-size:14px; margin-bottom:4px }
    .chip { display:inline-block; padding:4px 10px; margin:3px 3px 0 0; background:#eef2ff; color:#4f46e5; border-radius:12px; font-size:11px; font-weight:600 }
    .tldr { padding:12px 14px; background:#f8fafc; border-radius:8px; margin:12px 0; font-size:13px }
    .footer { margin-top:36px; padding-top:16px; border-top:1px solid #e2e8f0; font-size:11px; color:#94a3b8; text-align:center }
    @media print { body { background:#fff; padding:0 } .page { border:none; box-shadow:none; padding:24px } }
  </style>
</head>
<body>
  <div class="page">
    <div class="hdr">
      <div class="grade-circle">${escHtml(grade)}</div>
      <div style="flex:1">
        <h1>${escHtml(jobTitle)} <span style="font-weight:400;color:#64748b;font-size:16px">at</span> ${escHtml(companyName)}</h1>
        <div class="sub">${escHtml(e.recommendation || '')}</div>
        <div class="meta">Report #${escHtml(num)} · ${escHtml(date)} · Score: <strong>${escHtml(score)}/5.0</strong>${jobUrl ? ` · <a href="${escHtml(jobUrl)}" style="color:#4f46e5;text-decoration:none">Job listing ↗</a>` : ''}</div>
      </div>
    </div>

    <h2>A · Role Summary</h2>
    ${e.blockA_roleSummary?.tldr ? `<div class="tldr">${escHtml(e.blockA_roleSummary.tldr)}</div>` : ''}
    <div class="stats-grid">
      ${[['Domain','domain'],['Function','function'],['Seniority','seniority'],['Remote','remote'],['Team','teamSize']]
        .filter(([, k]) => e.blockA_roleSummary?.[k])
        .map(([lbl, k]) => `<div class="stat"><div class="stat-label">${lbl}</div><div class="stat-val">${escHtml(e.blockA_roleSummary[k])}</div></div>`)
        .join('')}
    </div>

    <h2>B · CV Match <span class="tag">${(e.blockB_cvMatch?.requirements || []).length} requirements · ${(e.blockB_cvMatch?.gaps || []).length} gaps</span></h2>
    ${requirementsRows ? `<table><thead><tr><th style="width:90px">Status</th><th>Requirement</th><th>CV evidence</th></tr></thead><tbody>${requirementsRows}</tbody></table>` : '<div class="muted">No requirements analyzed.</div>'}
    ${gapsHtml ? `<h3>Gap mitigation</h3>${gapsHtml}` : ''}

    <h2>C · Level & Strategy</h2>
    <div class="stats-grid">
      <div class="stat"><div class="stat-label">JD Level</div><div class="stat-val">${escHtml(e.blockC_levelAndStrategy?.jdLevel || 'unknown')}</div></div>
      <div class="stat"><div class="stat-label">Your Natural Level</div><div class="stat-val">${escHtml(e.blockC_levelAndStrategy?.candidateNaturalLevel || 'unknown')}</div></div>
    </div>
    ${(e.blockC_levelAndStrategy?.sellSeniorPlan || []).length ? `<h3>Sell-senior tactics</h3><ul>${e.blockC_levelAndStrategy.sellSeniorPlan.map(p => `<li>${escHtml(p)}</li>`).join('')}</ul>` : ''}
    ${(e.blockC_levelAndStrategy?.ifDownleveledPlan || []).length ? `<h3>If they downlevel you</h3><ul>${e.blockC_levelAndStrategy.ifDownleveledPlan.map(p => `<li>${escHtml(p)}</li>`).join('')}</ul>` : ''}

    <h2>D · Comp & Demand</h2>
    <div class="stats-grid">
      <div class="stat"><div class="stat-label">Salary Range</div><div class="stat-val">${escHtml(e.blockD_compAndDemand?.salaryRange || 'unknown')}</div></div>
      <div class="stat"><div class="stat-label">Demand</div><div class="stat-val">${escHtml(e.blockD_compAndDemand?.roleDemandTrend || 'unknown')}</div></div>
    </div>
    ${e.blockD_compAndDemand?.companyCompReputation ? `<p>${escHtml(e.blockD_compAndDemand.companyCompReputation)}</p>` : ''}
    ${(e.blockD_compAndDemand?.sources || []).length ? `<div class="muted">Sources: ${e.blockD_compAndDemand.sources.map(s => escHtml(s)).join(' · ')}</div>` : ''}

    <h2>E · CV & LinkedIn Edits</h2>
    ${cvChangesHtml || '<div class="muted">No edits suggested.</div>'}
    ${(e.blockE_personalization?.linkedinChanges || []).length ? `<h3>LinkedIn</h3><ul>${e.blockE_personalization.linkedinChanges.map(c => `<li>${escHtml(c)}</li>`).join('')}</ul>` : ''}

    <h2>F · Interview Prep</h2>
    ${starHtml || '<div class="muted">No stories generated.</div>'}
    ${e.blockF_interviewPrep?.caseStudyRecommendation ? `<div class="tldr" style="background:#fef3c7"><strong>Case study:</strong> ${escHtml(e.blockF_interviewPrep.caseStudyRecommendation)}</div>` : ''}
    ${redFlagHtml ? `<h3 style="color:#dc2626">⚠ Red-flag questions</h3>${redFlagHtml}` : ''}

    <h2>G · Posting Legitimacy</h2>
    <div class="legit">
      <div class="legit-label">${escHtml(legit)}</div>
      <div>${escHtml(legitHint)}</div>
    </div>
    ${signalRows ? `<table><thead><tr><th>Signal</th><th>Finding</th><th style="width:110px">Weight</th></tr></thead><tbody>${signalRows}</tbody></table>` : ''}
    ${e.blockG_legitimacy?.contextNotes ? `<div class="muted italic" style="margin-top:12px">${escHtml(e.blockG_legitimacy.contextNotes)}</div>` : ''}

    ${atsKeywords ? `<h2>ATS Keywords</h2><div>${atsKeywords}</div>` : ''}

    <div class="footer">Career Ops · santifer methodology · Generated ${escHtml(date)}</div>
  </div>
</body>
</html>`;
}

// ── 2. Sync TSV additions → applications.md ───────────────────────────────────

export function syncTracker() {
  const header = '| # | Date | Company | Role | Score | Status | PDF | Report |\n|---|------|---------|------|-------|--------|-----|--------|\n';

  // Read existing rows (skip header lines)
  let existingRows = [];
  if (fs.existsSync(TRACKER_PATH)) {
    existingRows = fs.readFileSync(TRACKER_PATH, 'utf8')
      .split('\n')
      .filter(l => l.startsWith('|') && !l.startsWith('| #') && !l.startsWith('|---'));
  }

  // Drain all pending TSV files
  const tsvFiles = fs.readdirSync(BATCH_DIR).filter(f => f.endsWith('.tsv'));
  const newRows = [];
  for (const file of tsvFiles) {
    const tsvPath = path.join(BATCH_DIR, file);
    const lines = fs.readFileSync(tsvPath, 'utf8').split('\n').filter(Boolean);
    for (const line of lines) {
      const cols = line.split('\t');
      if (cols.length >= 8) {
        newRows.push(`| ${cols.join(' | ')} |`);
      }
    }
    fs.unlinkSync(tsvPath); // drain
  }

  if (!newRows.length) return { synced: 0 };

  const allRows = [...existingRows, ...newRows];
  fs.writeFileSync(TRACKER_PATH, header + allRows.join('\n') + '\n', 'utf8');
  console.log(`[reportManager] Synced ${newRows.length} rows into applications.md`);
  return { synced: newRows.length };
}

// ── 3. Get tracker rows ────────────────────────────────────────────────────────

export function getTrackerRows() {
  if (!fs.existsSync(TRACKER_PATH)) return [];
  const lines = fs.readFileSync(TRACKER_PATH, 'utf8')
    .split('\n')
    .filter(l => l.startsWith('|') && !l.startsWith('| #') && !l.startsWith('|---'));

  return lines.map(line => {
    const cols = line.split('|').map(c => c.trim()).filter(Boolean);
    return {
      num:     cols[0],
      date:    cols[1],
      company: cols[2],
      role:    cols[3],
      score:   cols[4],
      status:  cols[5],
      pdf:     cols[6],
      report:  cols[7],
    };
  });
}
