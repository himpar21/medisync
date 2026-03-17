const Stripe = require("stripe");

let stripeClient = null;

function getStripeClient() {
  const secretKey = String(process.env.STRIPE_SECRET_KEY || "").trim();
  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }

  if (!stripeClient) {
    stripeClient = new Stripe(secretKey);
  }

  return stripeClient;
}

function getPublishableKey() {
  return String(process.env.STRIPE_PUBLISHABLE_KEY || "").trim();
}

module.exports = {
  getStripeClient,
  getPublishableKey,
};
