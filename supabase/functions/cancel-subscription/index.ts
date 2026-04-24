import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14?target=denonext";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const appSupabaseUrl = Deno.env.get("APP_SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const appSupabaseAnonKey = Deno.env.get("APP_SUPABASE_ANON_KEY");
  const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const appSupabaseServiceRoleKey = Deno.env.get("APP_SUPABASE_SERVICE_ROLE_KEY");
  const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
  const resolvedSupabaseUrl = supabaseUrl || appSupabaseUrl;
  const resolvedSupabaseAnonKey = supabaseAnonKey || appSupabaseAnonKey;
  const resolvedSupabaseServiceRoleKey = supabaseServiceRoleKey || appSupabaseServiceRoleKey;

  if (!resolvedSupabaseUrl || !resolvedSupabaseAnonKey || !resolvedSupabaseServiceRoleKey || !stripeSecretKey) {
    return new Response(JSON.stringify({ error: "Missing function secrets: SUPABASE_URL/APP_SUPABASE_URL, SUPABASE_ANON_KEY/APP_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY/APP_SUPABASE_SERVICE_ROLE_KEY, or STRIPE_SECRET_KEY." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const stripe = new Stripe(stripeSecretKey, {
    apiVersion: "2023-10-16",
  });

  const authHeader = request.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Missing authorization header." }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(resolvedSupabaseUrl, resolvedSupabaseAnonKey, {
    global: {
      headers: {
        Authorization: authHeader,
      },
    },
  });

  const adminSupabase = createClient(resolvedSupabaseUrl, resolvedSupabaseServiceRoleKey);

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: subscriptionRecord, error: subscriptionError } = await adminSupabase
    .from("user_subscriptions")
    .select("stripe_subscription_id, status, cancel_at_period_end, current_period_end")
    .eq("user_id", user.id)
    .maybeSingle();

  if (subscriptionError) {
    return new Response(JSON.stringify({ error: subscriptionError.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!subscriptionRecord?.stripe_subscription_id) {
    return new Response(JSON.stringify({ error: "No active Stripe subscription found for this account." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (subscriptionRecord.cancel_at_period_end) {
    return new Response(JSON.stringify({
      message: "Subscription is already scheduled to cancel at period end.",
      current_period_end: subscriptionRecord.current_period_end,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const updatedSubscription = await stripe.subscriptions.update(
    subscriptionRecord.stripe_subscription_id,
    {
      cancel_at_period_end: true,
    }
  );

  return new Response(JSON.stringify({
    message: "Subscription will cancel at the end of the current billing period.",
    cancel_at_period_end: updatedSubscription.cancel_at_period_end,
    current_period_end: updatedSubscription.current_period_end,
  }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
