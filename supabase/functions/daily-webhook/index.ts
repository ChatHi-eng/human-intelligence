// Supabase Edge Function, daily-webhook
//
// Where the video room (Daily.co) reports that someone came into, or left, a
// booking's call. Each report is written to call_sessions, one row per
// visit. That record is what settles a no-show (../_shared/attendance.ts).
//
// Every report is signed with a secret only Daily and Palam hold
// (daily_webhook.hmac, made by ensureWebhook in ../_shared/daily.ts). A
// report that is not signed with it is refused.
//
// Reports can arrive twice, late, or out of order, so nothing here depends
// on order: a visit is keyed by Daily's own id for it, and its times come
// from inside the report.
//
// Deploy with "Verify JWT" OFF. Daily does not sign in to Supabase.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { roleOfPass } from '../_shared/attendance.ts';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const fromBase64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
const toBase64 = (bytes: ArrayBuffer) => {
  let text = '';
  for (const b of new Uint8Array(bytes)) text += String.fromCharCode(b);
  return btoa(text);
};

const sameText = (a: string, b: string) => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};

const sign = async (secret: string, text: string) => {
  const key = await crypto.subtle.importKey(
    'raw',
    fromBase64(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return toBase64(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text)));
};

serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return json({ error: 'Missing server config' }, 500);

  const raw = await req.text();
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: line } = await admin.from('daily_webhook').select('hmac').maybeSingle();
  const secret = line?.hmac as string | undefined;
  if (!secret) return json({ error: 'Not set up' }, 503);

  const signature = req.headers.get('x-webhook-signature') ?? '';
  const timestamp = req.headers.get('x-webhook-timestamp') ?? '';
  let event: Record<string, unknown>;
  try {
    event = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }
  // Daily signs "<timestamp>.<body>". Its own example builds the body by
  // re-writing the parsed JSON, so both spellings are accepted.
  const signed =
    signature.length > 0 &&
    timestamp.length > 0 &&
    (sameText(await sign(secret, `${timestamp}.${raw}`), signature) ||
      sameText(await sign(secret, `${timestamp}.${JSON.stringify(event)}`), signature));
  if (!signed) return json({ error: 'Bad signature' }, 401);

  // The check Daily makes when the line is first set up.
  if (event.test === 'test') return json({ ok: true });

  const type = typeof event.type === 'string' ? event.type : '';
  const payload = (event.payload ?? {}) as Record<string, unknown>;
  if (type !== 'participant.joined' && type !== 'participant.left') return json({ ok: true, ignored: type });

  const sessionId = typeof payload.session_id === 'string' ? payload.session_id : '';
  const room = typeof payload.room === 'string' ? payload.room : '';
  const joinedAt = typeof payload.joined_at === 'number' ? payload.joined_at : null;
  if (!sessionId || !room || joinedAt === null) return json({ ok: true, ignored: 'incomplete' });

  const pass = typeof payload.user_id === 'string' ? payload.user_id : null;
  const { data: booking } = await admin
    .from('bookings')
    .select('id')
    .eq('daily_room_name', room)
    .maybeSingle();

  const row: Record<string, unknown> = {
    session_id: sessionId,
    booking_id: booking?.id ?? null,
    room,
    role: roleOfPass(pass),
    user_ref: pass,
    joined_at: new Date(joinedAt * 1000).toISOString(),
    source: 'webhook',
    updated_at: new Date().toISOString(),
  };
  if (type === 'participant.left') {
    const duration = typeof payload.duration === 'number' ? payload.duration : 0;
    row.duration_seconds = duration;
    row.left_at = new Date((joinedAt + duration) * 1000).toISOString();
  }

  // "Joined" never wipes out a "left" that got here first: it only fills in
  // a row that is not there yet.
  const { error } =
    type === 'participant.left'
      ? await admin.from('call_sessions').upsert(row, { onConflict: 'session_id' })
      : await admin.from('call_sessions').upsert(row, { onConflict: 'session_id', ignoreDuplicates: true });
  if (error) {
    console.error('visit save failed', error.message);
    // A failure here is worth Daily trying again.
    return json({ error: 'Save failed' }, 500);
  }

  await admin
    .from('daily_webhook')
    .update({ last_event_at: new Date().toISOString() })
    .eq('id', true);

  return json({ ok: true });
});
