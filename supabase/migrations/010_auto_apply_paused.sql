-- Soft pause for auto-apply, separate from consent.
--
-- Withdrawing auto_apply_consent is destructive — it should mean "stop and
-- treat my data accordingly." Users who just want to take a week off should
-- not have to flip consent back and forth. auto_apply_paused gates the worker
-- without touching consent state.

ALTER TABLE public.user_profile
  ADD COLUMN IF NOT EXISTS auto_apply_paused INT DEFAULT 0;
