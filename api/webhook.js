// api/webhook.js
// Listens for Stripe events and updates the user's plan in Supabase.
// IMPORTANT: In Vercel dashboard, set this route to use raw body parsing.
// Add to vercel.json: see root vercel.json in this repo.

import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe    = new Stripe(process.env.STRIPE_SECRET_KEY);
const supabase  = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY  // service role — bypasses RLS
);

export const config = {
  api: { bodyParser: false }, // Stripe needs the raw body to verify signature
};

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end',  ()    => resolve(data));
    req.on('error', reject);
  });
}

// Maps Stripe product IDs to plan names
// Fill these in after creating products in your Stripe dashboard
const PRODUCT_TO_PLAN = {
  [process.env.STRIPE_PRODUCT_PRO]:  'pro',
  [process.env.STRIPE_PRODUCT_TEAM]: 'team',
};

async function setPlan(clerkUserId, plan, stripeCustomerId, subscriptionId) {
  const { error } = await supabase
    .from('users')
    .upsert({
      clerk_user_id:        clerkUserId,
      plan:                 plan,
      stripe_customer_id:   stripeCustomerId,
      stripe_subscription_id: subscriptionId,
      updated_at:           new Date().toISOString(),
    }, { onConflict: 'clerk_user_id' });

  if (error) throw new Error('Supabase upsert failed: ' + error.message);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const rawBody = await getRawBody(req);
  const sig     = req.headers['stripe-signature'];

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (e) {
    console.error('Webhook signature failed:', e.message);
    return res.status(400).json({ error: 'Webhook signature failed' });
  }

  try {
    switch (event.type) {

      // ── Payment succeeded → activate plan ──────────────────────────────
      case 'checkout.session.completed': {
        const session  = event.data.object;
        if (session.mode !== 'subscription') break;

        const sub      = await stripe.subscriptions.retrieve(session.subscription);
        const productId = sub.items.data[0]?.price?.product;
        const plan      = PRODUCT_TO_PLAN[productId] || 'pro';
        const clerkId   = sub.metadata?.clerkUserId || session.metadata?.clerkUserId;

        if (clerkId) await setPlan(clerkId, plan, session.customer, session.subscription);
        break;
      }

      // ── Renewal succeeded → keep plan active ───────────────────────────
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object;
        if (!invoice.subscription) break;

        const sub      = await stripe.subscriptions.retrieve(invoice.subscription);
        const productId = sub.items.data[0]?.price?.product;
        const plan      = PRODUCT_TO_PLAN[productId] || 'pro';
        const clerkId   = sub.metadata?.clerkUserId;

        if (clerkId) await setPlan(clerkId, plan, invoice.customer, invoice.subscription);
        break;
      }

      // ── Subscription cancelled or payment failed → downgrade ───────────
      case 'customer.subscription.deleted':
      case 'invoice.payment_failed': {
        const obj     = event.data.object;
        const subId   = obj.subscription || obj.id;
        if (!subId) break;

        const sub     = await stripe.subscriptions.retrieve(subId).catch(() => null);
        const clerkId = sub?.metadata?.clerkUserId;

        if (clerkId) await setPlan(clerkId, 'free', obj.customer, null);
        break;
      }
    }
  } catch (e) {
    console.error('Webhook handler error:', e.message);
    return res.status(500).json({ error: e.message });
  }

  return res.status(200).json({ received: true });
}
