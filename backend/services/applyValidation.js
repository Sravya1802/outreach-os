/**
 * applyValidation.js — pure helpers used by autoApplier.js.
 *
 * Kept dependency-free so the validation rules can be unit-tested without
 * loading the Playwright + Postgres stack from autoApplier.js itself.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /[\d().+\- ]{7,}/;     // forgiving — international + US

const SPONSORSHIP_DENIAL_RE = /no (visa|sponsorship)|cannot sponsor|will not sponsor|unable to sponsor|us citizens? only|us citizenship required|must be (a )?us citizen|do(es)? not (offer|provide)( visa)? sponsorship/i;

/**
 * Returns { ok: true } when a profile is safe to auto-apply for the given JD,
 * or { ok: false, reason: <human-readable string> } when the application
 * should be skipped + flagged needs_review.
 */
export function validateProfileForApply(profile, jobDescription) {
  const missing = [];
  if (!profile.first_name) missing.push('first name');
  if (!profile.last_name)  missing.push('last name');
  if (!profile.email)      missing.push('email');
  if (!profile.phone)      missing.push('phone');
  if (missing.length > 0) {
    return { ok: false, reason: `Profile incomplete — missing ${missing.join(', ')}` };
  }
  if (!EMAIL_RE.test(profile.email)) {
    return { ok: false, reason: `Email "${profile.email}" looks invalid — fix it in Auto-Apply Setup` };
  }
  if (!PHONE_RE.test(profile.phone)) {
    return { ok: false, reason: `Phone "${profile.phone}" looks invalid — fix it in Auto-Apply Setup` };
  }
  if (profile.needs_sponsorship && jobDescription && SPONSORSHIP_DENIAL_RE.test(jobDescription)) {
    return { ok: false, reason: 'Role does not offer visa sponsorship — your profile says you need it' };
  }
  return { ok: true };
}
