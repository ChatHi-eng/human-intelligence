-- 0027: experts can list up to three fields, and say where they are based.
--
-- Until now an expert had one field (industry_id). Most people advise in more
-- than one area, so:
--
--   industry_ids  every field the expert picked, main one first, three at most
--   industry_id   stays as the main field, so everything that already reads it
--                 (suggested prices, old links, older copies of the app) works
--   location      free text, "Austin, TX" or "London, UK". Sessions are on
--                 video, but for law, licensed therapy and building work it
--                 matters where someone is.
--
-- A trigger keeps the two field columns in step, so a save that only sends
-- the main field (an older copy of the app) can never leave the list without it.

alter table public.expert_profiles
  add column if not exists industry_ids text[] not null default '{}',
  add column if not exists location text;

update public.expert_profiles
  set industry_ids = array[industry_id]
  where cardinality(industry_ids) = 0;

create or replace function public.sync_expert_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.industry_ids is null or cardinality(new.industry_ids) = 0 then
    new.industry_ids := array[new.industry_id];
  elsif not (new.industry_id = any (new.industry_ids)) then
    new.industry_ids := array_prepend(new.industry_id, new.industry_ids);
  end if;
  -- Main field first, no repeats, three at most.
  new.industry_ids := (
    select coalesce(array_agg(f order by first_seen), array[new.industry_id])
    from (
      select f, min(ord) as first_seen
      from unnest(new.industry_ids) with ordinality as t(f, ord)
      group by f
      order by (f = new.industry_id) desc, min(ord)
      limit 3
    ) picked
  );
  -- Keep the main field first whatever order the rest arrived in.
  new.industry_ids := array_prepend(
    new.industry_id,
    array_remove(new.industry_ids, new.industry_id)
  );
  if new.location is not null then
    new.location := nullif(left(btrim(new.location), 80), '');
  end if;
  return new;
end;
$$;

drop trigger if exists sync_expert_fields on public.expert_profiles;
create trigger sync_expert_fields
  before insert or update on public.expert_profiles
  for each row
  execute function public.sync_expert_fields();

comment on column public.expert_profiles.industry_ids is
  'Every field the expert works in, main field first, at most three. industry_id is always element 1.';
comment on column public.expert_profiles.location is
  'Where the expert is based, free text (city and state or country). Shown on their profile.';
