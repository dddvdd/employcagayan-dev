-- Jobseeker profile daily-save throttle removal.
--
-- Why
-- ---
-- `enforce_jobseeker_profile_daily_limit()` is an AFTER INSERT OR UPDATE trigger
-- on `jobseeker_profiles`. It upserts into `jobseeker_profile_save_limits`
-- (keyed by auth_user_id + current_date) and raises
--   'You can save your profile only twice per day. Please try again tomorrow.'
-- as soon as `save_count` reaches 2.
--
-- A jobseeker correcting a typo on their own address or birthdate was locked
-- out until the next calendar day, with no way to appeal. PESO staff were
-- also blocked from correcting participant data on a jobseeker's behalf,
-- because the trigger keys on `auth.uid()` for *any* authenticated writer.
--
-- This is an arbitrary product throttle, not a security control. Nothing about
-- it protects data: authorization is enforced by row-level security, which is
-- untouched here.
--
-- What this migration does
-- -----------------------
--   1. Drops the trigger (the actual enforcement point).
--   2. Drops the trigger function.
--   3. Drops the now-unreferenced counter table.
--
-- What it deliberately does NOT do
-- -------------------------------
--   * Does not relax, widen, or re-scope any RLS policy.
--   * Does not grant any new privilege to anon/authenticated.
--   * Does not remove unrelated rate limits. `employer_signup_allowed()` and
--     the AI extraction rate limit are separate protections and are untouched.
--
-- Ownership remains governed by the existing policies:
--   "Users manage own profile"            (jobseeker_profiles)
--   "Admins manage profiles"              (jobseeker_profiles)
--   "Jobseekers manage own <section>"     (education / languages / skills / …)
-- so a jobseeker still can only ever modify their own participant record.

-- 1. Stop enforcing the limit.
DROP TRIGGER IF EXISTS jobseeker_profile_daily_limit ON public.jobseeker_profiles;

-- 2. Remove the enforcement function.
DROP FUNCTION IF EXISTS public.enforce_jobseeker_profile_daily_limit();

-- 3. Remove the counter table. Nothing else reads or writes it.
DROP TABLE IF EXISTS public.jobseeker_profile_save_limits;
