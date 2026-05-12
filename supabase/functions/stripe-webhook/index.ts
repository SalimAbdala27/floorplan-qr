import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14?target=denonext";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const stripeWebhookSigningSecret = Deno.env.get("STRIPE_WEBHOOK_SIGNING_SECRET");
const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");

if (!supabaseUrl || !supabaseServiceRoleKey || !stripeWebhookSigningSecret || !stripeSecretKey) {
  throw new Error("Missing webhook environment variables.");
}

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);
const stripe = new Stripe(stripeSecretKey, {
  apiVersion: "2023-10-16",
});
const cryptoProvider = Stripe.createSubtleCryptoProvider();

async function findUserIdForSubscription(subscription: any) {
  const metadataUserId = subscription?.metadata?.app_user_id;
  if (metadataUserId) return metadataUserId;

  const stripeSubscriptionId = subscription?.id || null;
  const stripeCustomerId = typeof subscription?.customer === "string"
    ? subscription.customer
    : subscription?.customer?.id || null;

  if (stripeSubscriptionId) {
    const { data } = await supabaseAdmin
      .from("user_subscriptions")
      .select("user_id")
      .eq("stripe_subscription_id", stripeSubscriptionId)
      .maybeSingle();

    if (data?.user_id) return data.user_id;
  }

  if (stripeCustomerId) {
    const { data } = await supabaseAdmin
      .from("user_subscriptions")
      .select("user_id")
      .eq("stripe_customer_id", stripeCustomerId)
      .maybeSingle();

    if (data?.user_id) return data.user_id;
  }

  return null;
}

async function getPlanName(price: any) {
  if (!price) return "Free";
  if (price.nickname) return price.nickname;

  if (price.product && typeof price.product === "object" && price.product.name) {
    return price.product.name;
  }

  if (typeof price.product === "string") {
    try {
      const product = await stripe.products.retrieve(price.product);
      if (product?.name) return product.name;
    } catch {
      // no-op
    }
  }

  return "Pro";
}

async function upsertSubscriptionFromStripe(subscription: any) {
  const userId = await findUserIdForSubscription(subscription);
  if (!userId) {
    throw new Error("Could not match Stripe subscription to a Supabase user.");
  }

  const firstItem = subscription?.items?.data?.[0] || null;
  const price = firstItem?.price || null;
  const planName = await getPlanName(price);
  const billingInterval = price?.recurring?.interval || null;
  const stripeCustomerId = typeof subscription.customer === "string"
    ? subscription.customer
    : subscription.customer?.id || null;
  const currentPeriodEnd =
    subscription.current_period_end ||
    firstItem?.current_period_end ||
    subscription.cancel_at ||
    null;

  const payload = {
    user_id: userId,
    status: String(subscription.status || "inactive").toLowerCase(),
    plan_name: planName,
    billing_interval: billingInterval,
    stripe_customer_id: stripeCustomerId,
    stripe_subscription_id: subscription.id || null,
    current_period_end: currentPeriodEnd
      ? new Date(currentPeriodEnd * 1000).toISOString()
      : null,
    cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabaseAdmin
    .from("user_subscriptions")
    .upsert(payload, { onConflict: "user_id" });

  if (error) {
    throw error;
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const signature = request.headers.get("Stripe-Signature");
  if (!signature) {
    return new Response("Missing Stripe signature", { status: 400 });
  }

  const body = await request.text();

  let event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      stripeWebhookSigningSecret,
      undefined,
      cryptoProvider
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid webhook signature";
    return new Response(message, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as any;
        if (session.mode === "subscription" && session.subscription) {
          const subscription = await stripe.subscriptions.retrieve(session.subscription, {
            expand: ["items.data.price.product"],
          });
          await upsertSubscriptionFromStripe(subscription);
        }
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object as any;
        await upsertSubscriptionFromStripe(subscription);
        break;
      }

      case "invoice.paid":
      case "invoice.payment_failed": {
        const invoice = event.data.object as any;
        if (invoice.subscription) {
          const subscription = await stripe.subscriptions.retrieve(invoice.subscription, {
            expand: ["items.data.price.product"],
          });
          await upsertSubscriptionFromStripe(subscription);
        }
        break;
      }

      default:
        break;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook processing failed";
    return new Response(message, { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
