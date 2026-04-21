/**
 * Checks remaining credits/quota for each API service.
 * Results are cached for 30 minutes to avoid hammering APIs on every request.
 */

// Cache: { result, fetchedAt }
let cache = null;
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

// Track Gemini rate limit state (set by ai.js on 429)
let geminiRateLimited = false;
let geminiRateLimitedAt = null;

export function setGeminiRateLimited(limited) {
  geminiRateLimited = limited;
  geminiRateLimitedAt = limited ? new Date().toISOString() : null;
}

export function isGeminiRateLimited() { return geminiRateLimited; }

async function checkHunter() {
  const key = (process.env.HUNTER_API_KEY || '').trim();
  if (!key || key.length < 10) return { configured: false };
  try {
    const res = await fetch(`https://api.hunter.io/v2/account?api_key=${key}`, { signal: AbortSignal.timeout(8000) });
    const data = await res.json();
    const searches = data?.data?.requests?.searches;
    if (!searches) return { configured: true, error: 'Could not read quota' };
    const used = searches.used || 0;
    const available = searches.available || 0;
    const total = used + available;
    return {
      configured: true,
      used, available, total,
      warning: available < 5,
      critical: available === 0,
      resetDate: data?.data?.reset_date || null,
    };
  } catch (err) {
    return { configured: true, error: err.message };
  }
}

async function checkApify() {
  const token = (process.env.APIFY_API_TOKEN || '').trim();
  if (!token || token.length < 10) return { configured: false };
  try {
    const res = await fetch(`https://api.apify.com/v2/users/me?token=${token}`, { signal: AbortSignal.timeout(8000) });
    const data = await res.json();
    const plan = data?.data?.plan;
    const usageUsd = (plan?.usageUsdCents || 0) / 100;
    // Apify free plan has $5/month limit — show warning under $0.50
    const balanceUsd = Math.max(0, 5 - usageUsd); // approximate remaining
    return {
      configured: true,
      usedUsd: usageUsd,
      balanceUsd,
      warning: balanceUsd < 0.50,
      critical: balanceUsd < 0.05,
    };
  } catch (err) {
    return { configured: true, error: err.message };
  }
}

async function checkApollo() {
  const key = (process.env.APOLLO_API_KEY || '').trim();
  if (!key || key === 'your_apollo_key_here' || key.length < 5) return { configured: false };
  try {
    // Apollo doesn't have a simple credits endpoint on free tier
    // Just verify the key works
    const res = await fetch('https://api.apollo.io/v1/auth/health', {
      headers: { 'X-Api-Key': key },
      signal: AbortSignal.timeout(8000),
    });
    return {
      configured: true,
      working: res.ok,
      warning: !res.ok,
      critical: !res.ok,
    };
  } catch (err) {
    return { configured: true, error: err.message };
  }
}

async function checkProspeo() {
  const key = (process.env.PROSPEO_API_KEY || '').trim();
  if (!key || key === 'your_prospeo_api_key' || key.length < 5) return { configured: false };
  // Prospeo doesn't have a public quota endpoint — just mark as configured
  return { configured: true, working: true };
}

export async function checkAllCredits(forceRefresh = false) {
  if (!forceRefresh && cache && Date.now() - cache.fetchedAt < CACHE_TTL) {
    return cache.result;
  }

  const [hunter, apify, apollo, prospeo] = await Promise.allSettled([
    checkHunter(),
    checkApify(),
    checkApollo(),
    checkProspeo(),
  ]);

  const gemini = {
    configured: !!(process.env.GEMINI_API_KEY),
    rateLimited: geminiRateLimited,
    rateLimitedAt: geminiRateLimitedAt,
    warning: geminiRateLimited,
    critical: false,
  };

  const result = {
    hunter:  hunter.value  || { configured: false, error: hunter.reason?.message },
    apify:   apify.value   || { configured: false, error: apify.reason?.message },
    apollo:  apollo.value  || { configured: false, error: apollo.reason?.message },
    prospeo: prospeo.value || { configured: false, error: prospeo.reason?.message },
    gemini,
    checkedAt: new Date().toISOString(),
    hasWarnings: [hunter.value, apify.value, apollo.value, gemini].some(s => s?.warning || s?.critical),
  };

  cache = { result, fetchedAt: Date.now() };
  return result;
}

export function invalidateCache() { cache = null; }
