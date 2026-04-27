const GRADE_ORDER = ['A', 'B', 'C', 'D', 'F'];

const JOB_TYPE_NEEDLES = {
  intern: ['intern', 'internship', 'co-op', 'coop'],
  new_grad: ['new grad', 'new graduate', 'entry level', 'early career', 'university grad'],
  full_time: ['full time', 'full-time', 'software engineer', 'engineer'],
};

const WORK_LOCATION_NEEDLES = {
  remote: ['remote'],
  hybrid: ['hybrid'],
  onsite: ['on-site', 'onsite', 'on site'],
};

function nextParam(state, value) {
  const placeholder = `$${state.index++}`;
  state.params.push(value);
  return placeholder;
}

function addIlikeAny(parts, state, expression, needles) {
  if (!needles.length) return;
  const clauses = needles.map((needle) => `${expression} ILIKE ${nextParam(state, `%${needle}%`)}`);
  parts.push(`(${clauses.join(' OR ')})`);
}

// Build the shared WHERE fragment for bulk-queue preview + apply.
// Excludes rows that are already queued or past "not_started" (don't clobber
// in-flight applications). Scoped to the caller's user_id.
export function buildBulkQueueFilter({
  minGrade,
  minScore,
  userId,
  profile = {},
  jobType,
  location,
  country,
  workLocation,
  supportedOnly,
}) {
  const state = { params: [], index: 1 };
  const parts = [`user_id = ${nextParam(state, userId)}`];
  parts.push("(apply_status IS NULL OR apply_status = 'not_started')");

  const normalizedGrade = String(minGrade || '').toUpperCase();
  if (normalizedGrade && GRADE_ORDER.includes(normalizedGrade)) {
    const allowed = GRADE_ORDER.slice(0, GRADE_ORDER.indexOf(normalizedGrade) + 1);
    parts.push(`grade = ANY(${nextParam(state, allowed)})`);
  }

  if (minScore !== undefined && minScore !== null && minScore !== '') {
    const n = Number(minScore);
    if (!Number.isNaN(n)) {
      parts.push(`score >= ${nextParam(state, n)}`);
    }
  }

  const normalizedJobType = String(jobType || profile.target_job_type || '').toLowerCase();
  addIlikeAny(
    parts,
    state,
    "COALESCE(job_title,'') || ' ' || COALESCE(job_description,'')",
    JOB_TYPE_NEEDLES[normalizedJobType] || []
  );

  const targetLocation = String(location || profile.preferred_locations || profile.location || '').trim();
  if (targetLocation) {
    const firstLocation = targetLocation.split(/[,;\n]/).map(s => s.trim()).find(Boolean);
    if (firstLocation) {
      parts.push(`(COALESCE(job_description,'') ILIKE ${nextParam(state, `%${firstLocation}%`)} OR COALESCE(company_name,'') ILIKE ${nextParam(state, `%${firstLocation}%`)})`);
    }
  }

  const targetCountry = String(country || profile.country || '').trim();
  if (targetCountry && !/^any$/i.test(targetCountry)) {
    const countryNeedle = /^(us|usa|united states)$/i.test(targetCountry) ? 'United States' : targetCountry;
    parts.push(`(COALESCE(job_description,'') ILIKE ${nextParam(state, `%${countryNeedle}%`)} OR COALESCE(job_description,'') = '')`);
  }

  const remotePref = String(workLocation || profile.work_location_preference || 'any').toLowerCase();
  if (remotePref && remotePref !== 'any') {
    addIlikeAny(parts, state, "COALESCE(job_description,'')", WORK_LOCATION_NEEDLES[remotePref] || [remotePref]);
  }

  if (profile.needs_sponsorship) {
    parts.push(`COALESCE(job_description,'') !~* ${nextParam(state, 'no (visa|sponsorship)|cannot sponsor|will not sponsor|unable to sponsor|us citizens? only|us citizenship required|must be (a )?us citizen|do(es)? not (offer|provide)( visa)? sponsorship')}`);
  }

  const onlySupported = supportedOnly === undefined || supportedOnly === null || supportedOnly === '' || String(supportedOnly) === 'true';
  if (onlySupported) {
    parts.push(`job_url ~* ${nextParam(state, 'greenhouse|lever|ashby')}`);
  }

  return { sql: parts.join(' AND '), params: state.params, consentRequired: !profile.auto_apply_consent };
}
