// api/create-checkout.js
// Creates a Stripe Checkout session and returns the redirect URL.
// Called by the frontend when user clicks "Get Pro" or "Get Team".

import Stripe from 'stripe';
import { createClerkClient } from '@clerk/backend';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const clerk = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY,
});

// Price IDs — create these in your Stripe dashboard and paste them here
// Dashboard → Products → Add product → Add price → copy the price_XXXX id
const PRICES = {
  pro_monthly:    process.env.STRIPE_PRICE_PRO_MONTHLY,
  pro_annual:     process.env.STRIPE_PRICE_PRO_ANNUAL,
  team_monthly:   process.env.STRIPE_PRICE_TEAM_MONTHLY,
  team_annual:    process.env.STRIPE_PRICE_TEAM_ANNUAL,
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── Verify Clerk session token ────────────────────────────────────────────
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '').trim();
  if (!token) return res.status(401).json({ error: 'No auth token' });

  let userId, userEmail;
  try {
    const payload = await clerk.verifyToken(token, { authorizedParties: ['https://convertfast.vercel.app', 'https://dear-rattler-30.clerk.accounts.dev'] });
    userId = payload.sub;
    // Fetch full user to get email
    const user = await clerk.users.getUser(userId);
    userEmail = user.emailAddresses?.[0]?.emailAddress || '';
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token: ' + e.message });
  }

  // ── Resolve price ─────────────────────────────────────────────────────────
  const { plan, annual } = req.body;
  const priceKey = `${plan}_${annual ? 'annual' : 'monthly'}`;
  const priceId  = PRICES[priceKey];

  if (!priceId) {
    return res.status(400).json({ error: `Unknown plan: ${priceKey}` });
  }

  // ── Find or create Stripe customer ───────────────────────────────────────
  // Store stripeCustomerId in Clerk's publicMetadata so we reuse the same customer
  let stripeCustomerId;
  try {
    const user = await clerk.users.getUser(userId);
    stripeCustomerId = user.publicMetadata?.stripeCustomerId;
  } catch (e) {}

  if (!stripeCustomerId) {
    const customer = await stripe.customers.create({
      email: userEmail,
      metadata: { clerkUserId: userId },
    });
    stripeCustomerId = customer.id;
    // Persist back to Clerk
    await clerk.users.updateUserMetadata(userId, {
      publicMetadata: { stripeCustomerId },
    });
  }

  // ── Create Checkout Session ───────────────────────────────────────────────
  const appUrl = process.env.APP_URL || 'https://imgdrop.io';

  const session = await stripe.checkout.sessions.create({
    customer:             stripeCustomerId,
    mode:                 'subscription',
    line_items:           [{ price: priceId, quantity: 1 }],
    success_url:          `${appUrl}/?checkout=success`,
    cancel_url:           `${appUrl}/?checkout=cancelled`,
    allow_promotion_codes: true,
    subscription_data: {
      metadata: { clerkUserId: userId },
    },
    // Pre-fill email so user doesn't have to type it
    customer_email: stripeCustomerId ? undefined : userEmail,
  });

  return res.status(200).json({ url: session.url });
}
