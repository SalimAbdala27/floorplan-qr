-- Manual test unlock for salimabdala27@hotmail.com
-- Run this in Supabase SQL Editor to enable PDF exports for your account.

with target_user as (
  select id
  from auth.users
  where email = 'salimabdala27@hotmail.com'
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
