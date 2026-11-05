import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const { username: rawUsername, password } = await request.json()
    if (typeof rawUsername !== 'string' || typeof password !== 'string' || !rawUsername.trim() || !password) {
      return json({ error: 'Invalid username/email or password.' }, 400)
    }

    const username = rawUsername.trim().toLowerCase()
    if (username.length > 64 || password.length > 256) {
      return json({ error: 'Invalid username/email or password.' }, 400)
    }

    const url = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
    const authClient = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })

    // Keep account lookup on the server so usernames cannot be used to enumerate email addresses.
    const { data: profile } = await admin
      .from('profiles')
      .select('email')
      .eq('username', username)
      .maybeSingle()

    if (!profile?.email) return json({ error: 'Invalid username/email or password.' })

    const { data, error } = await authClient.auth.signInWithPassword({ email: profile.email, password })
    if (error || !data.session) return json({ error: 'Invalid username/email or password.' })

    return json({ session: data.session })
  } catch {
    return json({ error: 'Invalid username/email or password.' }, 400)
  }
})
