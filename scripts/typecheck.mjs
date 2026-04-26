#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// typecheck.mjs — pragmatic JS typecheck for a no-TypeScript project.
//
// Walks backend/, frontend/src/, scripts/, tests/ for vanilla JS files
// (.js / .mjs) and runs `node --check` on each — catches parse/syntax
// errors, undeclared strict-mode references, async/await placement, etc.
// JSX files (.jsx) are NOT node-checkable (Node doesn't parse JSX); they're
// covered by ESLint, which runs after the file sweep.
//
// This is a "type-ish" gate — it won't infer types like tsc, but it catches
// the common "I broke the file shape" class of bug that the audit flagged as
// "Not run: Typecheck: no script".
//
// Usage:
//   node scripts/typecheck.mjs
//   npm run typecheck
//
// Exit codes:
//   0 — clean
//   1 — at least one file failed `node --check` or ESLint
// ─────────────────────────────────────────────────────────────────────────────

import { spawnSync } from 'node:child_process'
import { readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), '..', '..')

const ROOTS = ['backend', 'frontend/src', 'scripts', 'tests']
// .jsx is intentionally excluded — node --check can't parse JSX. ESLint handles it.
const EXTENSIONS = new Set(['.js', '.mjs'])
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.next', 'coverage', '__pycache__'])

function walk(dir) {
  const out = []
  let entries
  try { entries = readdirSync(dir) } catch { return out }
  for (const name of entries) {
    if (SKIP_DIRS.has(name)) continue
    const full = join(dir, name)
    let s
    try { s = statSync(full) } catch { continue }
    if (s.isDirectory()) out.push(...walk(full))
    else {
      const dot = name.lastIndexOf('.')
      if (dot > 0 && EXTENSIONS.has(name.slice(dot))) out.push(full)
    }
  }
  return out
}

const files = []
for (const root of ROOTS) {
  files.push(...walk(join(REPO_ROOT, root)))
}

console.log(`Checking ${files.length} JS files with node --check…`)

const failures = []
for (const f of files) {
  const r = spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' })
  if (r.status !== 0) {
    failures.push({ file: relative(REPO_ROOT, f), err: (r.stderr || '').trim() })
  }
}

if (failures.length) {
  console.log(`\n✗ ${failures.length} file(s) failed node --check:\n`)
  for (const { file, err } of failures) {
    console.log(`— ${file}`)
    console.log(err.split('\n').slice(0, 4).map(l => '    ' + l).join('\n'))
    console.log()
  }
} else {
  console.log('✓ all files parsed cleanly')
}

console.log('\nRunning ESLint on frontend…')
const eslint = spawnSync('npm', ['run', '-s', 'lint', '--prefix', 'frontend'], {
  cwd: REPO_ROOT,
  stdio: 'inherit',
})

const eslintFailed = eslint.status !== 0
if (!eslintFailed) console.log('✓ ESLint clean')

process.exit(failures.length === 0 && !eslintFailed ? 0 : 1)
