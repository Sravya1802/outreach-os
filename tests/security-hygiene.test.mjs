import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

const ROOT = process.cwd()
const SCAN_DIRS = ['.github', 'frontend/src', 'tests', 'scripts']
const TEXT_EXTS = new Set(['.js', '.jsx', '.mjs', '.yml', '.yaml', '.json'])
const LEGACY_JWT_RE = /\beyJhbGciOiJ(?:HS256|RS256|ES256)/

async function listFiles(dir) {
  const abs = path.join(ROOT, dir)
  const entries = await readdir(abs, { withFileTypes: true }).catch(() => [])
  const files = []

  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'test-results') continue
    const rel = path.join(dir, entry.name)
    if (entry.isDirectory()) files.push(...await listFiles(rel))
    else if (TEXT_EXTS.has(path.extname(entry.name))) files.push(rel)
  }

  return files
}

test('source and test configs do not hardcode legacy JWT API keys', async () => {
  const files = (await Promise.all(SCAN_DIRS.map(listFiles))).flat()
  const offenders = []

  for (const file of files) {
    const text = await readFile(path.join(ROOT, file), 'utf8')
    if (LEGACY_JWT_RE.test(text)) offenders.push(file)
  }

  assert.deepEqual(offenders, [])
})
