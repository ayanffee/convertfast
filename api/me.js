// api/me.js
// Returns the current user's plan. Called by the frontend on every page load.
// Response: { plan: 'free' | 'pro' | 'team' }

import { createClerkClient } from '@clerk/backend';
import { createClient } from '@supabase/supabase-js';

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── Auth ─────────────────────────────────────────────────────────────────
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!token) return res.status(401).json({ error: 'No token' });

  let userId;
  try {
    const payload = await clerk.verifyToken(token);
    userId = payload.sub;
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  // ── Lookup plan ───────────────────────────────────────────────────────────
  const { data, error } = await supabase
    .from('users')
    .select('plan')
    .eq('clerk_user_id', userId)
    .single();

  if (error && error.code !== 'PGRST116') {
    // PGRST116 = row not found (new user, default to free)
    console.error('Supabase error:', error.message);
    return res.status(500).json({ error: 'Database error' });
  }

  const plan = data?.plan || 'free';
  
  // Cache for 60s on the CDN edge — plan changes are near real-time
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=30');
  return res.status(200).json({ plan });
}
