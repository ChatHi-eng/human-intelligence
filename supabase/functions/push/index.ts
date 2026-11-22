// Supabase Edge Function, push
//
// The small public face of notifications. Three actions:
//
//   { action: 'key' }   anyone. Returns the public key a browser needs to
//                       subscribe. Creates the server's key pair on first use.
//   { action: 'test' }  a signed-in person. Sends a test notification to their
//                       own devices and says how many took it.
//   { action: 'send', userIds, title, body, path? }
//                       Palam's own servers only (x-webhook-secret header).
//
// Booking notifications themselves are sent by lifecycle-emails and
// send-reminders, which share the same sending code (../_shared/notify.ts).
//
// Secrets: WEBHOOK_SECRET (same value the other functions use);
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are auto-provided.
// Deploy with "Verify JWT" OFF.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { loadVapidKeys, pushToUsers } from '../_shared/notify.ts';

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

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return json({ error: 'Missing server config' }, 500);

  let body: {
    action?: string;
    userIds?: unknown;
    title?: unknown;
    body?: unknown;
    path?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  if (body.action === 'key') {
    const keys = await loadVapidKeys(admin);
    if (!keys) return json({ error: 'Notifications are not set up yet.' }, 503);
    return json({ publicKey: keys.publicKey });
  }

  if (body.action === 'test') {
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: userData } = await admin.auth.getUser(token);
    const user = userData?.user;
    if (!user) return json({ error: 'Sign in first.' }, 401);
    const delivered = await pushToUsers(admin, [
      {
        userId: user.id,
        message: {
          title: 'Notifications are on',
          body: 'This is how Palam will tell you about bookings and remind you before a session.',
          path: '/',
          tag: 'palam-test',
          ttlSeconds: 120,
        },
      },
    ]);
    return json({ delivered });
  }

  if (body.action === 'send') {
    const webhookSecret = Deno.env.get('WEBHOOK_SECRET');
    if (!webhookSecret || req.headers.get('x-webhook-secret') !== webhookSecret) {
      return json({ error: 'Forbidden' }, 401);
    }
    const userIds = Array.isArray(body.userIds)
      ? body.userIds.filter((id): id is string => typeof id === 'string').slice(0, 500)
      : [];
    if (userIds.length === 0 || typeof body.title !== 'string' || typeof body.body !== 'string') {
      return json({ error: 'userIds, title and body are required' }, 400);
    }
    const message = {
      title: body.title.slice(0, 80),
      body: body.body.slice(0, 240),
      path: typeof body.path === 'string' && body.path.startsWith('/') ? body.path : '/',
    };
    const delivered = await pushToUsers(
      admin,
      userIds.map((userId) => ({ userId, message })),
    );
    return json({ delivered });
  }

  return json({ error: 'Unknown action' }, 400);
});
