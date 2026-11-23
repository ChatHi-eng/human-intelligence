// Supabase Edge Function, request-expert
//
// A customer could not find the right expert and says what they need. The
// request is stored (expert_requests) and emailed to the owner, who finds or
// recruits someone and replies personally.
//
// Deploy with "Verify JWT" OFF; the caller is checked here.
// Secrets: RESEND_API_KEY. Optional: APPLICATION_ALERT_EMAIL, PALAM_SENDER.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Enough for a real person, too few to flood the owner's inbox.
const MAX_REQUESTS_PER_DAY = 5;

type RequestBody = { need?: string; searched?: string };

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const resendKey = Deno.env.get('RESEND_API_KEY');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!resendKey || !supabaseUrl || !anonKey) return json({ error: 'Missing server config' }, 500);
  const alertEmail = Deno.env.get('APPLICATION_ALERT_EMAIL') ?? 'info@palamapp.com';
  const from = Deno.env.get('PALAM_SENDER') ?? 'Palam <onboarding@resend.dev>';

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Missing Authorization' }, 401);

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }
  const need = (body.need ?? '').trim();
  const searched = (body.searched ?? '').trim().slice(0, 200) || null;
  if (need.length < 10) return json({ error: 'Tell us a little more about what you need.' }, 400);
  if (need.length > 600) return json({ error: 'Please keep it under 600 characters.' }, 400);

  // Everything below runs with the caller's own rights (row-level security).
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser();
  if (userError || !user) return json({ error: 'Not signed in' }, 401);

  const since = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
  const { count } = await userClient
    .from('expert_requests')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', since);
  if ((count ?? 0) >= MAX_REQUESTS_PER_DAY) {
    return json({ error: 'You have sent several requests today. We will reply to those first.' }, 429);
  }

  const { error: insertError } = await userClient
    .from('expert_requests')
    .insert({ user_id: user.id, need, searched });
  if (insertError) return json({ error: insertError.message }, 500);

  const { data: profile } = await userClient
    .from('profiles')
    .select('display_name')
    .eq('id', user.id)
    .maybeSingle();

  // The request is saved either way; a failed email is logged, not fatal.
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: alertEmail,
        reply_to: user.email ?? undefined,
        subject: 'Someone could not find an expert on Palam',
        html: [
          '<h2>Expert request</h2>',
          `<p><strong>From:</strong> ${escapeHtml(profile?.display_name ?? 'A customer')} (${escapeHtml(user.email ?? 'no email')})</p>`,
          `<p><strong>What they need:</strong><br>${escapeHtml(need)}</p>`,
          searched ? `<p><strong>What they searched:</strong> ${escapeHtml(searched)}</p>` : '',
          '<p>Reply to this email to answer them directly. All requests are also in Supabase, Table Editor, expert_requests.</p>',
        ].join('\n'),
      }),
    });
    if (!res.ok) console.error('Resend error', res.status, await res.text());
  } catch (err) {
    console.error('Resend request failed', err);
  }

  return json({ ok: true });
});
