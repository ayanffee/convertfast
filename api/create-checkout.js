import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const PRICES = {
  pro_monthly:  process.env.STRIPE_PRICE_PRO_MONTHLY,
  pro_annual:   process.env.STRIPE_PRICE_PRO_ANNUAL,
  team_monthly: process.env.STRIPE_PRICE_TEAM_MONTHLY,
  team_annual:  process.env.STRIPE_PRICE_TEAM_ANNUAL,
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!token) return res.status(401).json({ error: 'No auth token' });

  let userId, userEmail;
  try {
    const parts = token.split('.');
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    userId = payload.sub;
    const userRes = await fetch(`https://api.clerk.com/v1/users/${userId}`, {
      headers: { Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}` }
    });
    const user = await userRes.json();
    userEmail = user.email_addresses?.[0]?.email_address || '';
  } catch (e) {
    return res.status(401).json({ error: 'Auth failed: ' + e.message });
  }

  const { plan, annual } = req.body;
  const priceId = PRICES[`${plan}_${annual ? 'annual' : 'monthly'}`];
  if (!priceId) return res.status(400).json({ error: 'Unknown plan' });

  const existing = await stripe.customers.list({ email: userEmail, limit: 1 });
  const customerId = existing.data.length > 0 ? existing.data[0].id :
    (await stripe.customers.create({ email: userEmail, metadata: { clerkUserId: userId } })).id;

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${process.env.APP_URL}/?checkout=success`,
    cancel_url: `${process.env.APP_URL}/?checkout=cancelled`,
    allow_promotion_codes: true,
  });

  return res.status(200).json({ url: session.url });
}
