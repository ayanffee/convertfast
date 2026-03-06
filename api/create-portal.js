// api/create-portal.js
// Creates a Stripe Customer Portal session so users can manage/cancel their plan.
// Frontend: <button onclick="openPortal()">Manage subscription</button>

import Stripe from 'stripe';
import { createClerkClient } from '@clerk/backend';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const clerk  = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const token = (req.headers.authorization || '').replace('Bearer ', '');
  let userId;
  try {
    const payload = await clerk.verifyToken(token);
    userId = payload.sub;
  } catch {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const user = await clerk.users.getUser(userId);
  const stripeCustomerId = user.publicMetadata?.stripeCustomerId;
  if (!stripeCustomerId) {
    return res.status(400).json({ error: 'No Stripe customer found' });
  }

  const appUrl = process.env.APP_URL || 'https://imgdrop.io';
  const portalSession = await stripe.billingPortal.sessions.create({
    customer:   stripeCustomerId,
    return_url: appUrl,
  });

  return res.status(200).json({ url: portalSession.url });
}
