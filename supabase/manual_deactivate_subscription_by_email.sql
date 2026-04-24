-- Replace the email before running.

update public.user_subscriptions
set
  status = 'inactive',
  plan_name = 'Free',
  billing_interval = null,
  cancel_at_period_end = false,
  updated_at = now()
where user_id = (
  select id
  from auth.users
  where email = 'customer@example.com'
  limit 1
);
