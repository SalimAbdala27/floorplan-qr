-- Shows every subscription row, including inactive users, with the full subscription record.

select
  s.user_id,
  u.email,
  s.plan_name,
  s.billing_interval,
  s.status,
  s.stripe_customer_id,
  s.stripe_subscription_id,
  s.current_period_end,
  s.cancel_at_period_end,
  s.updated_at
from public.user_subscriptions s
join auth.users u
  on u.id = s.user_id
order by s.updated_at desc;
