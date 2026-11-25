// Supabase Edge Function — create-daily-room
//
// Makes sure a booking has its (private) Daily.co room. Auth user must be
// either the customer or the expert. Reuses the room if there is one. The
// room itself is set up in ../_shared/daily.ts; getting INTO it is join-call.
//
// Deploy via Supabase dashboard. Toggle "Verify JWT" OFF.
//
// Secrets required:
//   DAILY_API_KEY  — from your Daily dashboard (Developers → API keys)
//
// Daily docs: https://docs.daily.co/reference/rest-api/rooms/create-room

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { appJoinUrl, ensureRoom } from '../_shared/daily.ts';

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

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const dailyKey = Deno.env.get('DAILY_API_KEY');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!dailyKey || !supabaseUrl || !anonKey || !serviceKey) {
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
      'id, customer_id, expert_profile_id, end_at, medium, daily_room_url, daily_room_private, daily_room_name, daily_room_expires_at',
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

  // The room is private: nobody gets in with its address alone. So what goes
  // back to the app is Palam's own join page, where a signed-in person is
  // handed their pass (join-call). An older copy of the app, which opens
  // whatever address it is given, lands there too.
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const room = await ensureRoom(admin, dailyKey, booking);
  if ('error' in room) {
    return room.error === 'ended'
      ? json({ error: 'This session has ended' }, 410)
      : json({ error: 'The call could not be opened. Try again in a moment.' }, 502);
  }
  return json({ url: appJoinUrl(booking.id), name: room.name });
});
