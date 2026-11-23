// Supabase Edge Function, join-call
//
// Opens a booking's video call for one person and notes that they went in.
// Two ways to say who you are:
//
//   { bookingId, key }   the personal link from an email, text or
//                        notification (/join?b=...&k=...). No sign-in needed.
//   { bookingId }        signed in to the app (the Join button).
//
// Answers with a status:
//
//   ok             { url }  go to the call
//   early          the link was opened more than 15 minutes before the start
//   ended          the call's time has passed
//   cancelled      the booking was cancelled
//   not_confirmed  the expert has not accepted yet
//   invalid        not a real link for this booking
//
// When someone goes in after the start and the other person is not there,
// the other person is told at once ("X is waiting for you"). send-reminders
// covers the case where the first person went in early.
//
// Secrets: DAILY_API_KEY, RESEND_API_KEY (same values the other functions
// use). Optional: PALAM_SENDER, PALAM_TIMEZONE, TWILIO_*.
// Deploy with "Verify JWT" OFF.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { ensureRoom, peopleInRoom } from '../_shared/daily.ts';
import { CALL_GRACE_MS, JOIN_OPENS_MS, readJoinKey, type JoinRole } from '../_shared/join.ts';
import { sendWaitingAlert, type AlertEnv } from '../_shared/session-alerts.ts';

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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// The other person is told someone is waiting once the start is this far gone.
const WAITING_AFTER_MS = 2 * 60_000;

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const dailyKey = Deno.env.get('DAILY_API_KEY');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!dailyKey || !supabaseUrl || !serviceKey) return json({ error: 'Missing server config' }, 500);

  let body: { bookingId?: unknown; key?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }
  const bookingId = typeof body.bookingId === 'string' ? body.bookingId : '';
  const key = typeof body.key === 'string' ? body.key : '';
  if (!UUID.test(bookingId)) return json({ status: 'invalid' });

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: booking, error } = await admin
    .from('bookings')
    .select(
      'id, customer_id, expert_profile_id, start_at, end_at, medium, status, kind, call_room_url, daily_room_name, daily_room_expires_at, customer_joined_at, expert_joined_at',
    )
    .eq('id', bookingId)
    .maybeSingle();
  if (error) {
    console.error('booking lookup failed', error.message);
    return json({ error: 'Lookup failed' }, 500);
  }

  // Who is asking. A link's key is checked even when there is no such
  // booking, so a wrong link and a missing booking look the same.
  let role: JoinRole | null = null;
  const viaLink = key.length > 0;
  if (viaLink) {
    role = await readJoinKey(serviceKey, bookingId, key);
  } else {
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: userData } = await admin.auth.getUser(token);
    const userId = userData?.user?.id;
    if (!userId) return json({ error: 'Sign in first.' }, 401);
    if (booking && userId === booking.customer_id) role = 'customer';
    else if (booking && userId === booking.expert_profile_id) role = 'expert';
  }
  if (!booking || !role) return json({ status: 'invalid' });

  const otherId = role === 'customer' ? booking.expert_profile_id : booking.customer_id;
  const { data: other } = await admin
    .from('profiles')
    .select('display_name')
    .eq('id', otherId)
    .maybeSingle();
  const details = {
    bookingId: booking.id,
    otherName: (other?.display_name as string | null) ?? null,
    startAt: booking.start_at,
    endAt: booking.end_at,
    kind: booking.kind === 'intro' ? 'intro' : 'session',
  };

  if (booking.status === 'cancelled') return json({ status: 'cancelled', ...details });
  if (booking.status === 'requested') return json({ status: 'not_confirmed', ...details });
  if (booking.medium !== 'video') return json({ status: 'invalid' });

  const now = Date.now();
  const start = Date.parse(booking.start_at);
  const end = Date.parse(booking.end_at);
  if (now >= end + CALL_GRACE_MS) return json({ status: 'ended', ...details });

  // A link opened too soon waits; the Join button in the app has always let
  // people look at the room early, and still does.
  const early = now < start - JOIN_OPENS_MS;
  if (early && viaLink) {
    return json({
      status: 'early',
      joinFromAt: new Date(start - JOIN_OPENS_MS).toISOString(),
      ...details,
    });
  }

  const room = await ensureRoom(admin, dailyKey, booking);
  if ('error' in room) {
    return room.error === 'ended'
      ? json({ status: 'ended', ...details })
      : json({ error: 'The call could not be opened. Try again in a moment.' }, 502);
  }

  if (!early) {
    const mine = role === 'customer' ? 'customer_joined_at' : 'expert_joined_at';
    const theirs = role === 'customer' ? booking.expert_joined_at : booking.customer_joined_at;
    if (!booking[mine]) {
      const { error: markError } = await admin
        .from('bookings')
        .update({ [mine]: new Date(now).toISOString() })
        .eq('id', booking.id)
        .is(mine, null);
      if (markError) console.error('join mark failed', markError.message);
    }

    // Already running and the other person has not come: tell them now.
    if (!theirs && now >= start + WAITING_AFTER_MS && now < end) {
      try {
        // If someone is already in the room, they are there after all.
        const inRoom = await peopleInRoom(dailyKey, room.name);
        if (inRoom === null || inRoom === 0) {
          const twilioSid = Deno.env.get('TWILIO_ACCOUNT_SID');
          const twilioToken = Deno.env.get('TWILIO_AUTH_TOKEN');
          const twilioFrom = Deno.env.get('TWILIO_FROM_NUMBER');
          const env: AlertEnv = {
            resendKey: Deno.env.get('RESEND_API_KEY'),
            serviceKey,
            from: Deno.env.get('PALAM_SENDER') ?? undefined,
            defaultTz: Deno.env.get('PALAM_TIMEZONE') ?? undefined,
            twilio:
              twilioSid && twilioToken && twilioFrom
                ? { sid: twilioSid, token: twilioToken, from: twilioFrom }
                : null,
          };
          await sendWaitingAlert(admin, env, booking, role === 'customer' ? 'expert' : 'customer');
        }
      } catch (err) {
        console.error('waiting alert failed', err);
      }
    }
  }

  return json({ status: 'ok', url: room.url, ...details });
});
