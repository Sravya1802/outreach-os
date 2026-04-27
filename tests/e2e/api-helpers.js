import { expect } from '@playwright/test'

export const BACKEND_URL = process.env.E2E_BACKEND_URL || 'https://outreach-jt.duckdns.org'
export const SUPABASE_URL =
  process.env.E2E_SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  'https://dkifhfqgoremdjhkcojc.supabase.co'
export const SUPABASE_PUBLISHABLE_KEY = (
  process.env.E2E_SUPABASE_PUBLISHABLE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  ''
).trim()

export async function getAccessToken(page) {
  const token = await page.evaluate(() => {
    for (const key of Object.keys(localStorage)) {
      if (!key.includes('supabase') && !key.startsWith('sb-')) continue
      try {
        const value = JSON.parse(localStorage.getItem(key) || 'null')
        if (value?.access_token) return value.access_token
        if (value?.currentSession?.access_token) return value.currentSession.access_token
        if (value?.session?.access_token) return value.session.access_token
      } catch {
        // Ignore unrelated localStorage values.
      }
    }
    return null
  })
  expect(token, 'authenticated e2e storageState should contain a Supabase access token').toBeTruthy()
  return token
}

export async function apiFetchWithToken(request, path, token, options = {}) {
  return request.fetch(`${BACKEND_URL}${path}`, {
    method: options.method || 'GET',
    data: options.data,
    failOnStatusCode: false,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  })
}

export async function apiFetch(page, request, path, options = {}) {
  const token = await getAccessToken(page)
  return apiFetchWithToken(request, path, token, options)
}

export async function passwordGrant(email, password) {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SUPABASE_PUBLISHABLE_KEY },
    body: JSON.stringify({ email, password }),
  })
  if (!r.ok) {
    throw new Error(`Second-user Supabase auth failed (${r.status}): ${(await r.text()).slice(0, 200)}`)
  }
  return r.json()
}
