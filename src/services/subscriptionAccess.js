import { supabase } from "../lib/supabaseClient";

export const ACTIVE_SUBSCRIPTION_STATUSES = new Set(["active", "trialing"]);

export function normalizeSubscriptionRecord(record) {
  return {
    status: String(record?.status || "inactive").toLowerCase(),
    planName: record?.plan_name || "Free",
    billingInterval: record?.billing_interval || null,
    currentPeriodEnd: record?.current_period_end || null,
    cancelAtPeriodEnd: Boolean(record?.cancel_at_period_end),
    stripeCustomerId: record?.stripe_customer_id || null,
    stripeSubscriptionId: record?.stripe_subscription_id || null,
    updatedAt: record?.updated_at || null,
  };
}

export function hasActiveSubscription(subscription) {
  return ACTIVE_SUBSCRIPTION_STATUSES.has(String(subscription?.status || "").toLowerCase());
}

export function formatSubscriptionDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function getSubscriptionEndLabel(subscription) {
  if (!subscription?.cancelAtPeriodEnd) return null;
  return formatSubscriptionDate(subscription.currentPeriodEnd);
}

export async function fetchSubscriptionRecord(userId) {
  if (!userId) {
    return normalizeSubscriptionRecord(null);
  }

  const { data, error } = await supabase
    .from("user_subscriptions")
    .select("status, plan_name, billing_interval, current_period_end, cancel_at_period_end, stripe_customer_id, stripe_subscription_id, updated_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return normalizeSubscriptionRecord(data);
}
