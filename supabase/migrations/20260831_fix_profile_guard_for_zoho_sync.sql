create or replace function public.protect_profile_commercial_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_actor_role text;
  v_protected_fields_changed boolean;
begin
  if coalesce(current_setting('app.allow_server_payment_update', true), '') = 'true' then
    return new;
  end if;

  v_protected_fields_changed :=
    new.role is distinct from old.role
    or new.subscription_status is distinct from old.subscription_status
    or new.subscription_plan is distinct from old.subscription_plan
    or new.subscription_started_at is distinct from old.subscription_started_at
    or new.subscription_ends_at is distinct from old.subscription_ends_at
    or new.access_granted_at is distinct from old.access_granted_at
    or new.access_granted_by is distinct from old.access_granted_by
    or new.is_blocked is distinct from old.is_blocked
    or (
      new.last_login_at is distinct from old.last_login_at
      and coalesce(current_setting('app.allow_last_login_update', true), '') <> 'true'
    );

  if not v_protected_fields_changed then
    return new;
  end if;

  if v_actor is null then
    raise exception 'LOGIN_REQUIRED';
  end if;

  select role into v_actor_role
  from public.profiles
  where id = v_actor;

  if coalesce(v_actor_role, 'user') not in ('admin', 'super_admin') then
    raise exception 'PROTECTED_PROFILE_FIELDS';
  end if;

  if v_actor_role = 'admin' and new.role is distinct from old.role then
    raise exception 'SUPER_ADMIN_REQUIRED';
  end if;

  return new;
end;
$$;
