-- Manually activate PDF export access for a paid user without building Stripe webhooks yet.
-- Run in the Supabase SQL Editor after confirming payment in Stripe.
--
-- 1. Replace the email below.
-- 2. Run the script.
-- 3. Ask the user to sign out/in again or press "Refresh access" in the app.

with target_user as (
  select id
  from auth.users
  where email = 'customer@example.com'
  limit 1
)
insert into public.user_subscriptions (
  user_id,
  status,
  plan_name,
  billing_interval,
  current_period_end,
  cancel_at_period_end,
  updated_at
)
select
  id,
  'active',
  'Pro',
  'monthly',
  now() + interval '1 month',
  false,
  now()
from target_user
on conflict (user_id)
do update set
  status = excluded.status,
  plan_name = excluded.plan_name,
  billing_interval = excluded.billing_interval,
  current_period_end = excluded.current_period_end,
  cancel_at_period_end = excluded.cancel_at_period_end,
  updated_at = now();
