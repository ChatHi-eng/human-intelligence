-- 0025: send "Welcome to Palam" after the first sign-in, not with the code.
--
-- Before: the welcome email fired when the profiles row was created. That row
-- is created the moment someone asks for a sign-in code, so the welcome and
-- the code landed in the inbox together, and people who never finished
-- signing in were welcomed anyway.
--
-- Now: the welcome fires the first time an account's email is confirmed, which
-- is the first time a sign-in code is entered correctly. It happens once per
-- account, because the confirmation date is only ever set once.
--
-- The lifecycle-emails function is unchanged. It still receives a
-- "profiles INSERT" payload; only the moment it is sent has moved.
--
-- The webhook secret is read from Supabase Vault (palam_webhook_secret, the
-- same entry the reminder jobs use), so no secret appears in this file.

create or replace function public.send_welcome_on_first_sign_in()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
begin
  select * into v_profile from public.profiles where id = new.id;
  if not found then
    return new;
  end if;

  perform net.http_post(
    url := 'https://dthpwxpxjhbsgzcjnept.supabase.co/functions/v1/lifecycle-emails',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret',
      (select decrypted_secret from vault.decrypted_secrets where name = 'palam_webhook_secret')
    ),
    body := jsonb_build_object(
      'type', 'INSERT',
      'table', 'profiles',
      'schema', 'public',
      'record', to_jsonb(v_profile),
      'old_record', null
    )
  );
  return new;
exception when others then
  -- A welcome email must never stand between a person and signing in.
  raise warning 'welcome email not queued for %: %', new.id, sqlerrm;
  return new;
end;
$$;

revoke all on function public.send_welcome_on_first_sign_in() from public, anon, authenticated;

drop trigger if exists on_auth_user_first_sign_in on auth.users;
create trigger on_auth_user_first_sign_in
  after update on auth.users
  for each row
  when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
  execute function public.send_welcome_on_first_sign_in();

-- The old trigger sent the welcome as the profile row was created.
drop trigger if exists profiles_lifecycle_emails on public.profiles;
