// Supabase Edge Function — create-daily-room
//
// Mints a Daily.co room for a booking. Auth user must be either the customer
// or the expert. Reuses an existing room if one is already attached to the
// booking. Persists the room name + URL + expires_at back onto the booking.
//
// Deploy via Supabase dashboard. Toggle "Verify JWT" OFF.
//
// Secrets required:
//   DAILY_API_KEY  — from your Daily dashboard (Developers → API keys)
//
// Daily docs: https://docs.daily.co/reference/rest-api/rooms/create-room

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

type RequestBody = { bookingId: string };
type DailyRoom = { name: string; url: string; config?: { exp?: number } };

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const dailyKey = Deno.env.get('DAILY_API_KEY');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!dailyKey || !supabaseUrl || !anonKey) {
    return json({ error: 'Missing server config' }, 500);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Missing Authorization' }, 401);

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }
  if (!body.bookingId) return json({ error: 'bookingId required' }, 400);

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser();
  if (userError || !user) return json({ error: 'Not signed in' }, 401);

  const { data: booking, error: bookingError } = await userClient
    .from('bookings')
    .select(
      'id, customer_id, expert_profile_id, end_at, medium, call_room_url, daily_room_name, daily_room_expires_at',
    )
    .eq('id', body.bookingId)
    .maybeSingle();
  if (bookingError) return json({ error: bookingError.message }, 500);
  if (!booking) return json({ error: 'Booking not found' }, 404);
  if (booking.customer_id !== user.id && booking.expert_profile_id !== user.id) {
    return json({ error: 'Forbidden' }, 403);
  }
  if (booking.medium !== 'video') {
    return json({ error: 'Booking is not a video call' }, 409);
  }

  const now = Math.floor(Date.now() / 1000);
  const existingValid =
    booking.daily_room_name &&
    booking.call_room_url &&
    booking.daily_room_expires_at &&
    Date.parse(booking.daily_room_expires_at) > Date.now();

  if (existingValid) {
    return json({ url: booking.call_room_url, name: booking.daily_room_name });
  }

  // Room expires an hour after the booking end so participants can finish even
  // if the call runs long.
  const expiresAt =
    Math.max(
      now + 60 * 30, // at least 30 minutes from now (in case booking is in the past)
      Math.floor(Date.parse(booking.end_at) / 1000) + 60 * 60,
    );

  const dailyRes = await fetch('https://api.daily.co/v1/rooms', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${dailyKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: `hi-${booking.id.replace(/-/g, '').slice(0, 24)}`,
      privacy: 'public',
      properties: {
        exp: expiresAt,
        enable_screenshare: true,
        enable_chat: true,
        start_video_off: false,
        start_audio_off: false,
      },
    }),
  });
  if (!dailyRes.ok) {
    const detail = await dailyRes.text();
    return json({ error: `Daily error ${dailyRes.status}: ${detail}` }, 502);
  }
  const room = (await dailyRes.json()) as DailyRoom;

  await userClient
    .from('bookings')
    .update({
      call_room_url: room.url,
      daily_room_name: room.name,
      daily_room_expires_at: new Date(expiresAt * 1000).toISOString(),
    })
    .eq('id', booking.id);

  return json({ url: room.url, name: room.name });
});
