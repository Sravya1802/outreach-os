-- Migration 005 — per-user resume storage buckets.
--
-- Creates three private Supabase Storage buckets used by the backend's
-- resumeStorage.js wrapper. Per-user isolation is enforced at the SQL level
-- via storage.objects RLS policies — every read/write must hit a path whose
-- first segment equals the caller's auth.uid().
--
-- The backend currently talks to storage with the service-role key, which
-- bypasses these RLS policies. The policies still matter for two reasons:
--   1. Defense in depth — if someone hits storage with the anon key, RLS
--      blocks cross-user reads.
--   2. Future direct-from-frontend uploads can use the user's JWT and rely
--      on RLS instead of round-tripping through the API.
--
-- Idempotent: re-running this migration is safe.

-- ── Buckets ──────────────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public)
VALUES
  ('resume-library', 'resume-library', false),
  ('resumes',        'resumes',        false),
  ('tailored-pdfs',  'tailored-pdfs',  false)
ON CONFLICT (id) DO NOTHING;

-- ── RLS policies on storage.objects ──────────────────────────────────────────
-- For each of the three buckets: allow CRUD only on rows whose first path
-- segment matches auth.uid()::text. The backend's service-role calls bypass
-- RLS so this only applies to direct frontend access.

-- resume-library
DROP POLICY IF EXISTS "user_can_read_own_library"   ON storage.objects;
DROP POLICY IF EXISTS "user_can_insert_own_library" ON storage.objects;
DROP POLICY IF EXISTS "user_can_update_own_library" ON storage.objects;
DROP POLICY IF EXISTS "user_can_delete_own_library" ON storage.objects;

CREATE POLICY "user_can_read_own_library"   ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'resume-library' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "user_can_insert_own_library" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'resume-library' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "user_can_update_own_library" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'resume-library' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "user_can_delete_own_library" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'resume-library' AND (storage.foldername(name))[1] = auth.uid()::text);

-- resumes
DROP POLICY IF EXISTS "user_can_read_own_resume"   ON storage.objects;
DROP POLICY IF EXISTS "user_can_insert_own_resume" ON storage.objects;
DROP POLICY IF EXISTS "user_can_update_own_resume" ON storage.objects;
DROP POLICY IF EXISTS "user_can_delete_own_resume" ON storage.objects;

CREATE POLICY "user_can_read_own_resume"   ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'resumes' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "user_can_insert_own_resume" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'resumes' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "user_can_update_own_resume" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'resumes' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "user_can_delete_own_resume" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'resumes' AND (storage.foldername(name))[1] = auth.uid()::text);

-- tailored-pdfs
DROP POLICY IF EXISTS "user_can_read_own_tailored"   ON storage.objects;
DROP POLICY IF EXISTS "user_can_insert_own_tailored" ON storage.objects;
DROP POLICY IF EXISTS "user_can_update_own_tailored" ON storage.objects;
DROP POLICY IF EXISTS "user_can_delete_own_tailored" ON storage.objects;

CREATE POLICY "user_can_read_own_tailored"   ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'tailored-pdfs' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "user_can_insert_own_tailored" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'tailored-pdfs' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "user_can_update_own_tailored" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'tailored-pdfs' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "user_can_delete_own_tailored" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'tailored-pdfs' AND (storage.foldername(name))[1] = auth.uid()::text);
