#!/usr/bin/env node
/**
 * migrate-resumes-to-storage.mjs
 *
 * One-shot migration: walk a local resume-library folder and upload each PDF
 * to Supabase Storage at resume-library/<userId>/<archetype>/<filename>.pdf.
 *
 * Usage (on the VM):
 *   USER_ID=70df2946-a46e-4b63-832c-2822cda4cf4b \
 *   LOCAL_DIR=/home/ubuntu/outreach/resumes \
 *   node /home/ubuntu/outreach/backend/../scripts/migrate-resumes-to-storage.mjs
 *
 * Idempotent: re-runs are safe because storage upload uses upsert.
 *
 * Pre-reqs:
 *   1. supabase/migrations/005_storage_buckets.sql has been applied.
 *   2. SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are present in the env that
 *      runs this script (the VM .env is fine — `set -a; source /home/ubuntu/outreach/.env; set +a`).
 *
 * What it does:
 *   - Walks LOCAL_DIR for `<archetype>/<filename>.pdf`
 *   - For each PDF, uploads to resume-library/<USER_ID>/<archetype>/<filename>.pdf
 *   - Prints a summary table
 *   - Does NOT delete the local files — verify the upload first, then sweep manually
 */

import fs from 'node:fs/promises';
import path from 'node:path';

const USER_ID   = process.env.USER_ID;
const LOCAL_DIR = process.env.LOCAL_DIR || '/home/ubuntu/outreach/resumes';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
const BUCKET = 'resume-library';

if (!USER_ID || !/^[0-9a-f-]{36}$/i.test(USER_ID)) {
  console.error('ERROR: set USER_ID=<uuid>');
  process.exit(1);
}
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('ERROR: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

function safeFilename(s) {
  return String(s).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
}
function safeArchetype(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9_-]/g, '_').slice(0, 32) || 'misc';
}

async function uploadOne(archetype, filename, buffer) {
  const objectPath = `${USER_ID}/${safeArchetype(archetype)}/${safeFilename(filename)}`;
  const url = `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${encodeURI(objectPath)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SERVICE_KEY}`,
      apikey: SERVICE_KEY,
      'Content-Type': 'application/pdf',
      'x-upsert': 'true',
    },
    body: buffer,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`upload failed (${res.status}): ${text || res.statusText}`);
  }
  return objectPath;
}

async function walk() {
  const entries = await fs.readdir(LOCAL_DIR, { withFileTypes: true }).catch(() => []);
  const summary = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const archetype = entry.name;
    const archDir = path.join(LOCAL_DIR, archetype);
    const files = await fs.readdir(archDir).catch(() => []);
    for (const f of files) {
      if (!/\.pdf$/i.test(f)) continue;
      const buf = await fs.readFile(path.join(archDir, f));
      try {
        const objectPath = await uploadOne(archetype, f, buf);
        summary.push({ archetype, filename: f, sizeKB: Math.round(buf.length / 1024), status: 'ok', objectPath });
        console.log(`  ✓ ${archetype}/${f} (${Math.round(buf.length / 1024)} KB) → ${objectPath}`);
      } catch (err) {
        summary.push({ archetype, filename: f, sizeKB: Math.round(buf.length / 1024), status: 'fail', error: err.message });
        console.log(`  ✗ ${archetype}/${f}: ${err.message}`);
      }
    }
  }
  return summary;
}

console.log(`Migrating PDFs from ${LOCAL_DIR} → storage://${BUCKET}/${USER_ID}/`);
const summary = await walk();
console.log('---');
console.log(`Total: ${summary.length} files (${summary.filter(x => x.status === 'ok').length} ok, ${summary.filter(x => x.status === 'fail').length} failed)`);
if (summary.some(x => x.status === 'fail')) process.exit(1);
