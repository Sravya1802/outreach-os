# Phase 4 Migration Status — sqlite → Postgres (pg)

Working branch: `phase-4-pg` (pushed to GitHub)
Target: convert every `db.prepare/.exec/.transaction` call to `pg`-based async equivalents so the backend can point at Supabase Postgres.

## ✅ DONE (11 files, ~210 db calls migrated)

| File | db calls | Commit |
|---|---|---|
| backend/db.js (rewritten as pg adapter) | — | `f1a39cb` |
| backend/server.js | ~30 | `f1a39cb` |
| backend/package.json (drop better-sqlite3, add pg) | — | `f1a39cb` |
| backend/routes/unified.js | 9 | `6f5a414` |
| backend/routes/yc.js | 10 | `6f5a414` |
| backend/routes/contacts.js | 10 | `56e66ed` |
| backend/routes/emails.js | 5 | `56e66ed` |
| backend/routes/generate.js | 7 | `56e66ed` |
| backend/routes/internRoles.js | 2 | `ce6cf4c` |
| backend/routes/prospects.js | 22 | `fd45c3d` |
| backend/routes/automations.js | 10 | `fd45c3d` |
| backend/routes/companies.js | 21 | `8648e5d` |

## 🔄 REMAINING (~150 db calls across 5 files)

| File | Lines | db calls | Status |
|---|---|---|---|
| backend/routes/jobs.js | 1484 | 61 | Not started |
| backend/routes/careerOps.js | 1350 | 60 | Not started |
| backend/services/autoApplier.js | ? | ? | Not started |
| backend/services/domainResolver.js | ? | ? | Not started |
| backend/services/startupSheet.js | ? | ? | Not started |
| backend/seedJobs.js | ? | ? | Not started |

## Migration patterns being applied

| sqlite | postgres |
|---|---|
| `db.prepare(sql).get(x)` | `await one(sql, [x])` |
| `db.prepare(sql).all(x)` | `await all(sql, [x])` |
| `db.prepare(sql).run(x)` | `await run(sql, [x])` |
| `db.transaction(() => {...})()` | `await tx(async (client) => {...})` |
| `?` positional | `$1, $2, ...` |
| `INSERT OR IGNORE` | `INSERT ... ON CONFLICT DO NOTHING` |
| `INSERT OR REPLACE` | `INSERT ... ON CONFLICT (pk) DO UPDATE SET ...` |
| `datetime('now')` | `NOW()` |
| `LAST_INSERT_ROWID()` | `RETURNING id` |
| `result.changes` | `result.rowCount` |

## Deployment ordering

**The `local-backup` branch still has the old sqlite code.** Phase 2 (Oracle VM deploy) runs from `local-backup` and will work with the local sqlite on the VM's disk. Phase 4 merge happens AFTER Phase 2 is up, to avoid coupling.

Order:
1. Oracle VM capacity hits → deploy from `local-backup` (sqlite on VM)
2. Backend runs, 40 features work
3. Dedicated Phase 4 session: finish jobs.js + careerOps.js + services, merge phase-4-pg → local-backup
4. Run `002_backend_schema.sql` in Supabase
5. On VM: git pull, pm2 restart → backend now on Supabase

## Time estimate for remaining work

- jobs.js: 2-3 hrs
- careerOps.js: 2-3 hrs
- services (3 files): 1-2 hrs
- Integration testing: 1-2 hrs

**Total: 6-10 hrs remaining** (original estimate in PLAN.txt).
