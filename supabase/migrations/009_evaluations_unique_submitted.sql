-- Prevent double-applying to the same job for the same user.
--
-- Without this, a user can re-trigger /auto-apply/run and submit a second
-- application to the same posting if the previous row was queued/retried.
-- The partial predicate scopes uniqueness to rows that actually went through
-- (apply_status='submitted'), so manual re-queues / failed attempts don't trip.

CREATE UNIQUE INDEX IF NOT EXISTS evaluations_submitted_unique
  ON public.evaluations (user_id, job_url)
  WHERE apply_status = 'submitted';
