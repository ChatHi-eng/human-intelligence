-- 0026: approving an expert marks them vetted.
--
-- "Vetted by Palam" means a person at Palam read the application and checked
-- the LinkedIn profile or resume. That is exactly what approving an
-- application is, so the two no longer need setting separately:
--
--   status changes to 'approved'       -> verified = true
--   status changes away from 'approved' -> verified = false
--
-- It only reacts to a change of status. Setting `verified` by hand on a row
-- whose status is not changing still works, so the owner can take the mark
-- off one approved expert if they ever need to.
--
-- Signed-in app users can never trigger this: protect_expert_profiles_columns
-- (migration 0014) already puts `status` and `verified` back to their old
-- values for them, and this function also steps aside for those roles. Only
-- the owner (dashboard / SQL) and the service role can approve.

create or replace function public.vetted_follows_approval()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('anon', 'authenticated') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.status = 'approved' then
      new.verified := true;
    end if;
  elsif new.status is distinct from old.status then
    new.verified := (new.status = 'approved');
  end if;
  return new;
end;
$$;

-- Named to sort after protect_expert_profiles_columns, so the guard runs first.
drop trigger if exists zz_vetted_follows_approval on public.expert_profiles;
create trigger zz_vetted_follows_approval
  before insert or update on public.expert_profiles
  for each row
  execute function public.vetted_follows_approval();

-- Anyone already approved is vetted.
update public.expert_profiles set verified = true where status = 'approved' and verified = false;
