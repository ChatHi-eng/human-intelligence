-- 0021_session_price
-- Owner decision of 15 Nov 2026: the number an expert enters is the price of
-- one 30-minute session, and that is exactly what the customer is charged.
--
-- Until now the app called the same number an "hourly rate" and told experts
-- customers would pay half of it, while checkout charged it in full. Checkout
-- was always charging hourly_rate_cents, so the charging code does not change;
-- only the meaning and the wording do. To keep what experts intended, every
-- price entered under the old wording is halved once.
--
-- The column keeps its old name because the price trigger (0014) and the
-- checkout function read it; the comment below records what it now holds and
-- doubles as the marker that makes this file safe to re-run.

do $$
declare
  v_comment text;
begin
  select col_description(a.attrelid, a.attnum)
    into v_comment
  from pg_attribute a
  where a.attrelid = 'public.expert_profiles'::regclass
    and a.attname = 'hourly_rate_cents';

  if coalesce(v_comment, '') not like 'Price of one 30-minute session%' then
    update public.expert_profiles
      set hourly_rate_cents = round(hourly_rate_cents / 2.0)::integer
    where hourly_rate_cents is not null;

    comment on column public.expert_profiles.hourly_rate_cents is
      'Price of one 30-minute session, in cents. The name predates the Nov 2026 switch from hourly rates; values entered before it were halved once by migration 0021.';
  end if;
end $$;
