import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'outreach.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS companies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    role TEXT,
    location TEXT,
    stage TEXT,
    source TEXT,
    apply_url TEXT,
    posted_at TEXT,
    status TEXT DEFAULT 'new',
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(name, role)
  );

  CREATE TABLE IF NOT EXISTS contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
    name TEXT,
    title TEXT,
    linkedin_url TEXT,
    email TEXT,
    email_status TEXT,
    phone TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS outreach (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contact_id INTEGER REFERENCES contacts(id) ON DELETE CASCADE,
    type TEXT,
    subject TEXT,
    body TEXT,
    status TEXT DEFAULT 'draft',
    sent_at TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  -- Main prospects table: the people we want to cold email/DM
  CREATE TABLE IF NOT EXISTS prospects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    title TEXT,
    linkedin_url TEXT,
    email TEXT,
    email_status TEXT DEFAULT 'unknown',
    phone TEXT,
    company_name TEXT NOT NULL,
    company_type TEXT DEFAULT 'startup',
    company_website TEXT,
    email_subject TEXT,
    email_body TEXT,
    linkedin_dm TEXT,
    status TEXT DEFAULT 'pending',
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(name, company_name)
  );

  -- Job board companies
  CREATE TABLE IF NOT EXISTS jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    category TEXT,
    pay INTEGER DEFAULT 0,
    roles TEXT,
    location TEXT,
    url TEXT,
    tag TEXT,
    domain TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  -- Contacts found per company (LinkedIn profiles + Hunter.io emails)
  CREATE TABLE IF NOT EXISTS job_contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id INTEGER REFERENCES jobs(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    title TEXT,
    linkedin_url TEXT,
    email TEXT,
    email_status TEXT DEFAULT 'unknown',
    source TEXT DEFAULT 'unknown',
    generated_dm TEXT,
    generated_subject TEXT,
    generated_body TEXT,
    status TEXT DEFAULT 'pending',
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(job_id, name)
  );

  -- App-level key/value state (last refresh time, etc.)
  CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  -- Career Ops job evaluations
  CREATE TABLE IF NOT EXISTS evaluations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_url TEXT,
    job_title TEXT,
    company_name TEXT,
    job_description TEXT,
    grade TEXT,
    score REAL,
    report_json TEXT,
    report_path TEXT,
    pdf_path TEXT,
    source TEXT DEFAULT 'career_ops',
    created_at TEXT DEFAULT (datetime('now'))
  );

  -- Activity log for dashboard feed
  CREATE TABLE IF NOT EXISTS activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action TEXT NOT NULL,
    details TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  -- Scraped roles per company
  CREATE TABLE IF NOT EXISTS roles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER REFERENCES jobs(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    location TEXT,
    posted_at TEXT,
    source TEXT,
    apply_url TEXT,
    description TEXT,
    status TEXT DEFAULT 'open',
    role_type TEXT DEFAULT 'intern',
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(company_id, title, apply_url)
  );
`);

// Auto-migrations — safe to run multiple times
// Per-company application tracking
try {
  db.exec(`CREATE TABLE IF NOT EXISTS company_applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER REFERENCES jobs(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'interested',
    applied_date TEXT,
    follow_up_date TEXT,
    notes TEXT,
    fit_score REAL,
    salary TEXT,
    location_type TEXT DEFAULT 'onsite',
    start_date TEXT,
    end_date TEXT,
    fit_assessment TEXT,
    resume_path TEXT,
    resume_original_name TEXT,
    resume_size INTEGER,
    job_title TEXT,
    job_url TEXT,
    job_source TEXT,
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(company_id)
  )`);
} catch (_) {}
// Safe migrations in case table already existed without new columns
try { db.exec('ALTER TABLE company_applications ADD COLUMN fit_score REAL'); } catch (_) {}
try { db.exec('ALTER TABLE company_applications ADD COLUMN salary TEXT'); } catch (_) {}
try { db.exec("ALTER TABLE company_applications ADD COLUMN location_type TEXT DEFAULT 'onsite'"); } catch (_) {}
try { db.exec('ALTER TABLE company_applications ADD COLUMN start_date TEXT'); } catch (_) {}
try { db.exec('ALTER TABLE company_applications ADD COLUMN end_date TEXT'); } catch (_) {}
try { db.exec('ALTER TABLE company_applications ADD COLUMN fit_assessment TEXT'); } catch (_) {}
try { db.exec('ALTER TABLE company_applications ADD COLUMN resume_path TEXT'); } catch (_) {}
try { db.exec('ALTER TABLE company_applications ADD COLUMN resume_original_name TEXT'); } catch (_) {}
try { db.exec('ALTER TABLE company_applications ADD COLUMN resume_size INTEGER'); } catch (_) {}
try { db.exec('ALTER TABLE company_applications ADD COLUMN job_title TEXT'); } catch (_) {}
try { db.exec('ALTER TABLE company_applications ADD COLUMN job_url TEXT'); } catch (_) {}
try { db.exec('ALTER TABLE company_applications ADD COLUMN job_source TEXT'); } catch (_) {}

// Career Ops: per-evaluation apply mode (user choice per job).
//   manual  — open the page and let the user submit (human-in-the-loop, default)
//   auto    — Playwright worker submits on user's behalf once triggered
try { db.exec("ALTER TABLE evaluations ADD COLUMN apply_mode TEXT DEFAULT 'manual'"); } catch (_) {}
try { db.exec("ALTER TABLE evaluations ADD COLUMN apply_status TEXT DEFAULT 'not_started'"); } catch (_) {}
try { db.exec('ALTER TABLE evaluations ADD COLUMN applied_at TEXT'); } catch (_) {}
// Auto-apply worker fields
try { db.exec('ALTER TABLE evaluations ADD COLUMN apply_platform TEXT'); } catch (_) {}  // greenhouse | lever | ashby | workday | linkedin | unknown
try { db.exec('ALTER TABLE evaluations ADD COLUMN apply_error TEXT'); } catch (_) {}     // last-error message for failed auto-applies
try { db.exec('ALTER TABLE evaluations ADD COLUMN apply_resume_used TEXT'); } catch (_) {} // filename of the resume that was submitted
try { db.exec('ALTER TABLE evaluations ADD COLUMN apply_attempts INTEGER DEFAULT 0'); } catch (_) {}

// User profile (singleton row — used for auto-fill)
db.exec(`CREATE TABLE IF NOT EXISTS user_profile (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  first_name TEXT, last_name TEXT, email TEXT, phone TEXT,
  linkedin_url TEXT, github_url TEXT, portfolio_url TEXT,
  location TEXT, work_authorization TEXT DEFAULT 'US Citizen',
  needs_sponsorship INTEGER DEFAULT 0,
  gender TEXT, race TEXT, veteran_status TEXT, disability_status TEXT,
  resume_dir TEXT DEFAULT '/Users/lakshmisravyarachakonda/Documents/Common resumes',
  updated_at TEXT DEFAULT (datetime('now'))
)`);
db.prepare('INSERT OR IGNORE INTO user_profile (id) VALUES (1)').run();

// Documents table for file uploads
try {
  db.exec(`CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER,
    filename TEXT NOT NULL,
    original_name TEXT NOT NULL,
    mime_type TEXT,
    size INTEGER,
    created_at TEXT DEFAULT (datetime('now'))
  )`);
} catch (_) {}

try { db.exec('ALTER TABLE jobs ADD COLUMN linkedin_company_url TEXT'); } catch (_) {}
try { db.exec('ALTER TABLE jobs ADD COLUMN is_hiring INTEGER DEFAULT 0'); } catch (_) {}
try { db.exec('ALTER TABLE jobs ADD COLUMN source TEXT'); } catch (_) {}
try { db.exec('ALTER TABLE jobs ADD COLUMN subcategory TEXT'); } catch (_) {}
try { db.exec('ALTER TABLE jobs ADD COLUMN confidence REAL DEFAULT 0'); } catch (_) {}
try { db.exec('ALTER TABLE jobs ADD COLUMN classified_at TEXT'); } catch (_) {}
try { db.exec('ALTER TABLE jobs ADD COLUMN wikipedia_summary TEXT'); } catch (_) {}
try { db.exec('ALTER TABLE jobs ADD COLUMN intern_roles_json TEXT'); } catch (_) {}
try { db.exec('ALTER TABLE jobs ADD COLUMN intern_roles_checked_at TEXT'); } catch (_) {}
try { db.exec('ALTER TABLE jobs ADD COLUMN intern_roles_source TEXT'); } catch (_) {}
try { db.exec('ALTER TABLE jobs ADD COLUMN intern_roles_count INTEGER DEFAULT NULL'); } catch (_) {}
try { db.exec('ALTER TABLE jobs ADD COLUMN city TEXT'); } catch (_) {}
try { db.exec('ALTER TABLE jobs ADD COLUMN state TEXT'); } catch (_) {}
try { db.exec("ALTER TABLE jobs ADD COLUMN country TEXT DEFAULT 'US'"); } catch (_) {}
try { db.exec('ALTER TABLE jobs ADD COLUMN is_remote INTEGER DEFAULT 0'); } catch (_) {}
try { db.exec('ALTER TABLE job_contacts ADD COLUMN seniority_score INTEGER DEFAULT 0'); } catch (_) {}
try { db.exec('ALTER TABLE jobs ADD COLUMN resolved_domain TEXT'); } catch (_) {}
try { db.exec('ALTER TABLE jobs ADD COLUMN website TEXT'); } catch (_) {}
try { db.exec('ALTER TABLE jobs ADD COLUMN description TEXT'); } catch (_) {}
try { db.exec('ALTER TABLE jobs ADD COLUMN team_size INTEGER'); } catch (_) {}
try { db.exec('ALTER TABLE jobs ADD COLUMN yc_batch TEXT'); } catch (_) {}
try { db.exec('ALTER TABLE jobs ADD COLUMN tags TEXT'); } catch (_) {}
try { db.exec("ALTER TABLE jobs ADD COLUMN status TEXT DEFAULT 'new'"); } catch (_) {}

// Dual-role-type system — roles can now be 'intern', 'fulltime', or 'newgrad'
try { db.exec("ALTER TABLE roles ADD COLUMN role_type TEXT DEFAULT 'intern'"); } catch (_) {}

// ── Location backfill — run once to parse location strings into city/state/is_remote ──
function parseLocation(raw) {
  if (!raw) return null;
  const lower = raw.toLowerCase();

  // Remote
  if (/\bremote\b/.test(lower)) return { city: 'Remote', state: null, is_remote: 1 };

  // "City, ST" — take first pair
  const match = raw.match(/([A-Za-z\s\.]+),\s*([A-Z]{2})\b/);
  if (match) return { city: match[1].trim(), state: match[2], is_remote: 0 };

  // International or unparseable — just grab first segment
  const first = raw.split(',')[0].trim();
  if (first && first.length > 1) return { city: first, state: null, is_remote: 0 };
  return null;
}

try {
  const needsBackfill = db.prepare(
    "SELECT COUNT(*) as n FROM jobs WHERE location IS NOT NULL AND location != '' AND city IS NULL"
  ).get().n;

  if (needsBackfill > 0) {
    console.log(`[db] Backfilling location for ${needsBackfill} companies...`);
    const rows = db.prepare(
      "SELECT id, location FROM jobs WHERE location IS NOT NULL AND location != '' AND city IS NULL"
    ).all();
    const upd = db.prepare('UPDATE jobs SET city=?, state=?, is_remote=? WHERE id=?');
    db.transaction(() => {
      for (const row of rows) {
        const parsed = parseLocation(row.location);
        if (parsed) upd.run(parsed.city, parsed.state || null, parsed.is_remote, row.id);
      }
    })();
    console.log(`[db] Location backfill complete`);
  }
} catch (err) {
  console.error('[db] Location backfill failed:', err.message);
}

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_jobs_category ON jobs(category);
  CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
  CREATE INDEX IF NOT EXISTS idx_job_contacts_job_id ON job_contacts(job_id);
  CREATE INDEX IF NOT EXISTS idx_job_contacts_status ON job_contacts(status);
  CREATE INDEX IF NOT EXISTS idx_evaluations_grade ON evaluations(grade);
  CREATE INDEX IF NOT EXISTS idx_evaluations_apply_status ON evaluations(apply_status);
  CREATE INDEX IF NOT EXISTS idx_evaluations_created_at ON evaluations(created_at);
  CREATE INDEX IF NOT EXISTS idx_activity_log_created_at ON activity_log(created_at);
`);

export default db;
