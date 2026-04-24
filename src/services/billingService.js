import { supabase, supabaseUrl } from "../lib/supabaseClient";

function getFunctionsBaseUrl() {
  return `${supabaseUrl.replace(/\/$/, "")}/functions/v1`;
}

async function invokeEdgeFunction(functionName, body = {}) {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError) {
    throw sessionError;
  }

  if (!session?.access_token) {
    throw new Error("You need to be signed in to manage billing.");
  }

  const response = await fetch(`${getFunctionsBaseUrl()}/${functionName}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload?.error || "Billing request failed.");
  }

  return payload;
}

export async function createCheckoutSession() {
  return invokeEdgeFunction("create-checkout-session");
}

export async function createCustomerPortalSession() {
  return invokeEdgeFunction("create-customer-portal");
}

export async function cancelSubscriptionAtPeriodEnd() {
  return invokeEdgeFunction("cancel-subscription");
}
