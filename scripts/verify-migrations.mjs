#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// verify-migrations.mjs — assert the per-user-isolation schema invariants.
//
// The audit flagged "Migration dry-run: no configured migration runner".
// This script doesn't run migrations (Supabase is the source of truth and
// we don't want to mutate it from CI). Instead it ASSERTS the post-migration
// invariants — i.e. confirms whatever migrations have actually run on the
// target DB left the schema in the expected state.
//
// Invariants checked (per the per-user isolation rollout, migrations 003–007):
//   1. user_id is NOT NULL on every per-user table
//   2. user_id has no DEFAULT (so a forgotten INSERT fails loudly, not
//      silently attributes to the founder)
//   3. RLS is enabled on every per-user table
//   4. The expected per-user UNIQUE indexes exist
//
// Modes:
//   * No DATABASE_URL — prints the SQL for you to paste into Supabase SQL
//     editor; you eyeball the output. Useful when you want zero risk.
//   * DATABASE_URL set — runs the queries via psql and reports pass/fail.
//     psql must be on PATH. No npm dependencies added.
//
// Usage:
//   node scripts/verify-migrations.mjs                # print queries
//   DATABASE_URL=postgres://... node scripts/verify-migrations.mjs   # run
//   npm run verify-migrations
// ─────────────────────────────────────────────────────────────────────────────

import { spawnSync } from 'node:child_process'

const PER_USER_TABLES = [
  'jobs', 'companies', 'contacts', 'outreach', 'job_contacts', 'prospects',
  'evaluations', 'activity_log', 'roles', 'company_applications', 'documents',
  'meta', 'user_profile',
]

// 11 tables that 003 added the founder DEFAULT to (meta + user_profile got
// user_id without a DEFAULT, so they're excluded from the DEFAULT-drop check).
const TABLES_WITH_USER_ID_DEFAULT = [
  'jobs', 'companies', 'contacts', 'outreach', 'job_contacts', 'prospects',
  'evaluations', 'activity_log', 'roles', 'company_applications', 'documents',
]

const EXPECTED_UNIQUE_INDEXES = [
  'idx_jobs_user_name_unique',
  'idx_prospects_user_name_company_unique',
  'idx_roles_user_company_title_url_unique',
  'idx_job_contacts_user_job_name_unique',
  'idx_company_applications_user_company_unique',
  'idx_companies_user_name_role_unique',
  'evaluations_submitted_unique',
]

const checks = [
  {
    label: 'user_id IS NOT NULL on per-user tables',
    sql: `
      SELECT table_name
      FROM   information_schema.columns
      WHERE  table_schema = 'public'
        AND  column_name  = 'user_id'
        AND  is_nullable  = 'YES'
        AND  table_name   = ANY (ARRAY[${PER_USER_TABLES.map(t => `'${t}'`).join(', ')}])
      ORDER  BY table_name;
    `.trim(),
    expect: 'zero rows',
    pass: rows => rows.length === 0,
  },
  {
    label: 'user_id has no DEFAULT (migration 007 applied)',
    sql: `
      SELECT table_name, column_default
      FROM   information_schema.columns
      WHERE  table_schema    = 'public'
        AND  column_name     = 'user_id'
        AND  column_default IS NOT NULL
        AND  table_name      = ANY (ARRAY[${TABLES_WITH_USER_ID_DEFAULT.map(t => `'${t}'`).join(', ')}])
      ORDER  BY table_name;
    `.trim(),
    expect: 'zero rows',
    pass: rows => rows.length === 0,
  },
  {
    label: 'RLS enabled on per-user tables',
    sql: `
      SELECT  c.relname AS table_name, c.relrowsecurity AS rls_enabled
      FROM    pg_class c
      JOIN    pg_namespace n ON n.oid = c.relnamespace
      WHERE   n.nspname = 'public'
        AND   c.relname = ANY (ARRAY[${PER_USER_TABLES.map(t => `'${t}'`).join(', ')}])
        AND   c.relrowsecurity = false
      ORDER   BY c.relname;
    `.trim(),
    expect: 'zero rows',
    pass: rows => rows.length === 0,
  },
  {
    label: 'expected per-user UNIQUE indexes exist',
    sql: `
      SELECT indexname
      FROM   pg_indexes
      WHERE  schemaname = 'public'
        AND  indexname  = ANY (ARRAY[${EXPECTED_UNIQUE_INDEXES.map(i => `'${i}'`).join(', ')}])
      ORDER  BY indexname;
    `.trim(),
    expect: `all ${EXPECTED_UNIQUE_INDEXES.length} indexes present`,
    pass: rows => rows.length === EXPECTED_UNIQUE_INDEXES.length,
  },
]

function runPsql(sql) {
  const r = spawnSync('psql', [process.env.DATABASE_URL, '-A', '-t', '-c', sql], {
    encoding: 'utf8',
  })
  if (r.error || r.status !== 0) {
    throw new Error('psql failed: ' + (r.stderr || r.error?.message || `exit ${r.status}`))
  }
  return (r.stdout || '').trim().split('\n').filter(Boolean)
}

if (!process.env.DATABASE_URL) {
  console.log('No DATABASE_URL set — printing checks for manual run in Supabase dashboard.\n')
  for (const c of checks) {
    console.log(`-- ${c.label}  (expect ${c.expect})`)
    console.log(c.sql)
    console.log()
  }
  console.log('\nWhen you set DATABASE_URL, this script will run the queries and report pass/fail automatically.')
  process.exit(0)
}

console.log(`Running ${checks.length} schema-invariant checks…\n`)
let failed = 0
for (const c of checks) {
  try {
    const rows = runPsql(c.sql)
    const ok = c.pass(rows)
    console.log(ok ? '✓' : '✗', c.label, ok ? '' : `(got ${rows.length} rows: ${rows.slice(0, 3).join(' | ')}${rows.length > 3 ? ' …' : ''})`)
    if (!ok) failed++
  } catch (err) {
    console.log('✗', c.label, '— error:', err.message)
    failed++
  }
}

console.log(`\n${failed === 0 ? 'All checks passed.' : `${failed} check(s) failed.`}`)
process.exit(failed === 0 ? 0 : 1)
