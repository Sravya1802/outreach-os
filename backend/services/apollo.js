import axios from 'axios';

const BASE_URL = 'https://api.apollo.io/v1';

function getHeaders() {
  return {
    'Cache-Control': 'no-cache',
    'Content-Type': 'application/json',
    'X-Api-Key': process.env.APOLLO_API_KEY,
  };
}

async function apolloPost(endpoint, body) {
  const res = await axios.post(`${BASE_URL}${endpoint}`, body, { headers: getHeaders() });
  return res.data;
}

async function apolloGet(endpoint) {
  const res = await axios.get(`${BASE_URL}${endpoint}`, { headers: getHeaders() });
  return res.data;
}

export async function searchPeople(companyName, titles) {
  const data = await apolloPost('/mixed_people/search', {
    q_organization_name: companyName,
    person_titles: titles,
    per_page: 10,
  });

  return (data.people || []).map(p => ({
    name: p.name || `${p.first_name || ''} ${p.last_name || ''}`.trim(),
    title: p.title || '',
    linkedin_url: p.linkedin_url || '',
    email: p.email || '',
    email_status: p.email_status || 'unknown',
    organization: p.organization ? { name: p.organization.name, website_url: p.organization.website_url } : null,
  }));
}

export async function enrichPerson(linkedinUrl) {
  const data = await apolloPost('/people/match', {
    linkedin_url: linkedinUrl,
    reveal_personal_emails: false,
  });

  const p = data.person || data;
  return {
    name: p.name || `${p.first_name || ''} ${p.last_name || ''}`.trim(),
    title: p.title || '',
    linkedin_url: p.linkedin_url || linkedinUrl,
    email: p.email || '',
    email_status: p.email_status || 'unknown',
    phone: p.phone_numbers?.[0]?.sanitized_number || '',
  };
}

export async function verifyEmail(email) {
  const data = await apolloGet(`/email_verifications?email=${encodeURIComponent(email)}`);

  const status = data.status || data.deliverability || 'unknown';
  const statusMap = {
    deliverable: 'verified',
    accept_all: 'likely',
    undeliverable: 'invalid',
    unknown: 'unknown',
  };

  return {
    status: statusMap[status] || status,
    deliverability: data.deliverability || status,
  };
}

export async function getCompanyDomain(companyName) {
  const data = await apolloPost('/organizations/search', {
    q_organization_name: companyName,
    per_page: 1,
  });

  const org = data.organizations?.[0];
  return org?.primary_domain || '';
}

export function getTitlesForStage(stage) {
  if (stage === 'startup' || stage === 'YC') {
    return ['co-founder', 'founder', 'ceo', 'cto', 'head of engineering', 'vp of engineering'];
  }
  return [
    'vp of engineering',
    'director of engineering',
    'head of engineering',
    'engineering manager',
    'technical recruiter',
    'talent acquisition',
  ];
}
