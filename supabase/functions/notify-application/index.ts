// Supabase Edge Function — notify-application
//
// Receives a Supabase Database Webhook POST whenever a row in expert_profiles
// is inserted or updated (trigger created by migration 0010). Two jobs:
//   1. INSERT → email the owner that a new expert application arrived.
//   2. UPDATE where status changed to 'approved' → email the applicant a
//      short welcome.
// Emails go out through the Resend API. The request is authenticated by a
// shared secret header (x-webhook-secret) that the migration-0010 trigger
// sends — not by a JWT.
//
// Secrets required (Supabase → Edge Functions → Secrets):
//   RESEND_API_KEY          — re_... (Resend → API Keys)
//   WEBHOOK_SECRET          — any long random string; must be the exact same
//                             value pasted into migration 0010
//   APPLICATION_ALERT_EMAIL — optional; where new-application alerts go
//                             (default vkinatukara@gmail.com)
//   SUPABASE_SERVICE_ROLE_KEY (auto-provided by Supabase)
//
// Deploy via the Supabase dashboard: Edge Functions → New Function → paste this.
// IMPORTANT: when creating the function in the dashboard, toggle OFF "Verify JWT".
// The database trigger doesn't send a Supabase auth header; the request is
// authenticated by x-webhook-secret instead.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

type ExpertProfileRow = {
  profile_id: string;
  industry_id: string;
  headline: string;
  hourly_rate_cents: number;
  years_experience: number;
  status: string;
  linkedin_url: string | null;
  how_i_can_help: string | null;
};

// Shape of the payload supabase_functions.http_request POSTs for row events.
type WebhookPayload = {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  schema: string;
  record: ExpertProfileRow | null;
  old_record: ExpertProfileRow | null;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

// Applicant-written fields (headline, how_i_can_help, …) go into email HTML.
const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

// Resend failures are non-fatal by design: log and move on, so the response is
// always a quick 200 and the webhook never retries forever over a bad send.
const sendEmail = async (
  resendKey: string,
  payload: { from: string; to: string; subject: string; html: string },
) => {
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.error('Resend error', res.status, await res.text());
    }
  } catch (err) {
    console.error('Resend request failed', err);
  }
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const resendKey = Deno.env.get('RESEND_API_KEY');
  const webhookSecret = Deno.env.get('WEBHOOK_SECRET');
  const alertEmail = Deno.env.get('APPLICATION_ALERT_EMAIL') ?? 'vkinatukara@gmail.com';
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!resendKey || !webhookSecret || !supabaseUrl || !serviceKey) {
    return json({ error: 'Missing server config' }, 500);
  }

  // The migration-0010 trigger sends this header; nothing else knows the value.
  if (req.headers.get('x-webhook-secret') !== webhookSecret) {
    return json({ error: 'Forbidden' }, 401);
  }

  let payload: WebhookPayload;
  try {
    payload = (await req.json()) as WebhookPayload;
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const record = payload.record;
  if (payload.table !== 'expert_profiles' || !record) {
    return json({ ok: true, skipped: true });
  }

  const newApplication = payload.type === 'INSERT';
  const justApproved =
    payload.type === 'UPDATE' &&
    record.status === 'approved' &&
    payload.old_record?.status !== 'approved';
  if (!newApplication && !justApproved) {
    return json({ ok: true, skipped: true });
  }

  // Service-role client: auth.users isn't readable any other way, and no user
  // is signed in for webhook traffic.
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: userData, error: userError } = await admin.auth.admin.getUserById(
    record.profile_id,
  );
  if (userError) console.error('auth.users lookup failed', userError.message);
  const applicantEmail = userData?.user?.email ?? null;

  if (newApplication) {
    const rows: [string, string][] = [
      ['Headline', escapeHtml(record.headline)],
      ['Industry', escapeHtml(record.industry_id)],
      ['Rate', `$${(record.hourly_rate_cents / 100).toFixed(2)}/hr`],
      ['Experience', `${record.years_experience} years`],
      ['LinkedIn', record.linkedin_url ? escapeHtml(record.linkedin_url) : '—'],
    ];
    if (record.how_i_can_help) {
      rows.push(['How they can help', escapeHtml(record.how_i_can_help)]);
    }
    rows.push(['Applicant email', applicantEmail ? escapeHtml(applicantEmail) : 'unknown']);

    await sendEmail(resendKey, {
      from: 'Palam <onboarding@resend.dev>',
      to: alertEmail,
      subject: `New expert application: ${record.headline}`,
      html: [
        '<h2>New expert application</h2>',
        ...rows.map(([label, value]) => `<p><strong>${label}:</strong> ${value}</p>`),
        '<p>Review: Supabase → Table Editor → expert_profiles → status</p>',
      ].join('\n'),
    });
  }

  if (justApproved && applicantEmail) {
    // NOTE: Resend's test sender (onboarding@resend.dev) can only deliver to
    // the Resend account owner's own address. This welcome reaches real
    // applicants only after the owner verifies a domain in Resend and the
    // `from` below moves to that domain. Until then, sends to anyone else fail
    // — which is fine: sendEmail logs the error and we still return 200.
    await sendEmail(resendKey, {
      from: 'Palam <onboarding@resend.dev>',
      to: applicantEmail,
      subject: "You're on Palam",
      html: [
        '<p>Hi,</p>',
        "<p>Good news — your application was approved. You're on Palam.</p>",
        '<p>Open the app and head to <strong>Studio</strong> to set your weekly availability and connect payouts. Once that’s done, you’re live.</p>',
        '<p>Welcome aboard,<br>Palam</p>',
      ].join('\n'),
    });
  }

  return json({ ok: true });
});
