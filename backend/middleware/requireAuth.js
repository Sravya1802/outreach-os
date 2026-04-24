// ─────────────────────────────────────────────────────────────────────────────
// Supabase JWT verification middleware (ES256 via remote JWKS).
//
// The Supabase project uses asymmetric ES256 signing — JWTs are verified
// against the public JWKS at <SUPABASE_URL>/auth/v1/.well-known/jwks.json.
// No shared secret lives on this server; Supabase rotates keys transparently
// and `jose` caches + refetches as needed.
//
// Staged rollout via AUTH_MODE env var:
//   off       — middleware is a no-op (pass-through)
//   log-only  — parse + verify token if present, log the outcome, ALWAYS call
//               next() regardless. Used during Stage 1 to confirm legit traffic
//               carries Authorization headers before we start rejecting anything.
//   enforce   — (default once rollout is done) 401 on missing/invalid token.
//
// Token source priority:
//   1. Authorization: Bearer <jwt>          (normal fetch calls)
//   2. ?access_token=<jwt> query param      (EventSource / window.open / <a href>
//                                            — they can't set headers)
// ─────────────────────────────────────────────────────────────────────────────

import { createRemoteJWKSet, jwtVerify } from 'jose'

const SUPABASE_URL = process.env.SUPABASE_URL
const AUTH_MODE = (process.env.AUTH_MODE || 'enforce').toLowerCase()

let JWKS = null
if (SUPABASE_URL) {
  JWKS = createRemoteJWKSet(new URL(`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`))
  console.log(`[auth] middleware ready — mode=${AUTH_MODE}, jwks=${SUPABASE_URL}/auth/v1/.well-known/jwks.json`)
} else {
  console.error('[auth] SUPABASE_URL not set — middleware will either pass-through (log-only/off) or 500 (enforce)')
}

function extractToken(req) {
  const hdr = req.headers.authorization || ''
  if (hdr.startsWith('Bearer ')) return hdr.slice(7).trim()
  const q = req.query && req.query.access_token
  if (typeof q === 'string' && q.length > 0) return q
  return null
}

export async function requireAuth(req, res, next) {
  if (AUTH_MODE === 'off') return next()

  if (!JWKS) {
    if (AUTH_MODE === 'enforce') return res.status(500).json({ error: 'auth misconfigured: SUPABASE_URL missing' })
    return next()
  }

  const token = extractToken(req)
  if (!token) {
    console.warn(`[auth] NO_TOKEN ${req.method} ${req.path} ip=${req.ip} mode=${AUTH_MODE}`)
    if (AUTH_MODE === 'enforce') return res.status(401).json({ error: 'Unauthorized: missing token' })
    return next()
  }

  try {
    const { payload } = await jwtVerify(token, JWKS, {
      algorithms: ['ES256'],
      clockTolerance: 30,
    })
    req.user = {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
    }
    // Keep success logs terse to avoid noise; turn off once enforcing stable.
    if (AUTH_MODE === 'log-only') {
      console.log(`[auth] OK ${req.method} ${req.path} user=${payload.sub} email=${payload.email}`)
    }
    return next()
  } catch (err) {
    console.warn(`[auth] VERIFY_FAIL ${req.method} ${req.path} reason="${err.message}" mode=${AUTH_MODE}`)
    if (AUTH_MODE === 'enforce') return res.status(401).json({ error: 'Unauthorized: invalid token' })
    return next()
  }
}
