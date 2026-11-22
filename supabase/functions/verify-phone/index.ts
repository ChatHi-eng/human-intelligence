// Supabase Edge Function — verify-phone
//
// Proves a customer's mobile number with a code sent by text, then stores the
// number. Called by the signed-in app in two steps:
//
//   { action: 'send',  phone }         -> texts a code to that number
//   { action: 'check', phone, code }   -> if the code is right, saves the
//                                         number as verified
//
// The codes are created, sent and checked by Twilio Verify, so no code is
// ever stored here and Twilio's own limits apply (five wrong tries, a code
// that expires after ten minutes, a cap on sends per number).
//
// The verified number is written to notification_prefs with the service
// role. Signed-in users cannot set phone_verified_at themselves (migration
// 0028 guards it), so this function is the only way a number becomes verified.
//
// Deploy with Verify JWT OFF (auth is checked inside, from the Authorization
// header, like the other functions).
//
// Secrets required:
//   TWILIO_ACCOUNT_SID
//   TWILIO_AUTH_TOKEN
//   TWILIO_VERIFY_SERVICE_SID   (starts with "VA")
// Until all three are set the function answers 503 and the app says texts
// are not set up yet.

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

type RequestBody = { action?: string; phone?: string; code?: string };

// The same shape the database insists on: + then 8 to 15 digits.
const E164 = /^\+[1-9][0-9]{7,14}$/;

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceKey) return json({ error: 'Missing server config' }, 500);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Missing Authorization' }, 401);
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser();
  if (userError || !user) return json({ error: 'Not signed in' }, 401);

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }
  const phone = (body.phone ?? '').trim();
  if (!E164.test(phone)) {
    return json({ error: 'Enter a mobile number with its country code, like +1 415 555 0123.' }, 400);
  }

  const sid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const token = Deno.env.get('TWILIO_AUTH_TOKEN');
  const service = Deno.env.get('TWILIO_VERIFY_SERVICE_SID');
  if (!sid || !token || !service) {
    return json({ error: 'Text messages are not set up yet.', code: 'not_configured' }, 503);
  }
  const twilio = (path: string, form: Record<string, string>) =>
    fetch(`https://verify.twilio.com/v2/Services/${service}/${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(`${sid}:${token}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(form).toString(),
    });

  if (body.action === 'send') {
    const res = await twilio('Verifications', { To: phone, Channel: 'sms' });
    if (res.ok) return json({ sent: true });
    const detail = (await res.json().catch(() => ({}))) as { code?: number; message?: string };
    console.error('verify send failed', res.status, detail.code, detail.message);
    // 60200 invalid number, 60203 too many sends, 60205 landline / cannot text.
    const message =
      detail.code === 60203
        ? 'Too many codes sent to this number. Wait ten minutes and try again.'
        : detail.code === 60200 || detail.code === 60205
          ? 'That number cannot receive texts. Check it and try again.'
          : 'Could not send the code. Check the number and try again.';
    return json({ error: message }, res.status === 429 ? 429 : 400);
  }

  if (body.action === 'check') {
    const code = (body.code ?? '').trim();
    if (!/^[0-9]{4,10}$/.test(code)) return json({ error: 'Enter the code from the text.' }, 400);
    const res = await twilio('VerificationCheck', { To: phone, Code: code });
    const detail = (await res.json().catch(() => ({}))) as { status?: string; code?: number };
    if (!res.ok || detail.status !== 'approved') {
      // 20404 = no code waiting (expired, or already used); 60202 = too many tries.
      const message =
        detail.code === 60202
          ? 'Too many wrong tries. Send a new code.'
          : detail.code === 20404
            ? 'That code has expired. Send a new one.'
            : 'That code is not right. Check the text and try again.';
      return json({ error: message }, 400);
    }
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const now = new Date().toISOString();
    const { error } = await admin
      .from('notification_prefs')
      .upsert(
        { user_id: user.id, phone, phone_verified_at: now, updated_at: now },
        { onConflict: 'user_id' },
      );
    if (error) {
      console.error('saving verified phone failed', error.message);
      return json({ error: 'The code was right, but the number could not be saved. Try again.' }, 500);
    }
    return json({ verified: true });
  }

  return json({ error: 'Unknown action' }, 400);
});
