import Stripe from "https://esm.sh/stripe@14?target=denonext";

const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");

if (!stripeSecretKey) {
  throw new Error("Missing STRIPE_SECRET_KEY");
}

export const stripe = new Stripe(stripeSecretKey, {
  apiVersion: "2024-11-20",
});

export const cryptoProvider = Stripe.createSubtleCryptoProvider();
