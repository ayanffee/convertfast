export default async function handler(req, res) {
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!token) return res.status(401).json({ error: 'No token' });

  let userId;
  try {
    const parts = token.split('.');
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    userId = payload.sub;
    if (!userId) throw new Error('No user ID');
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data } = await supabase
    .from('users')
    .select('plan')
    .eq('clerk_user_id', userId)
    .single();

  return res.status(200).json({ plan: data?.plan || 'free' });
}
