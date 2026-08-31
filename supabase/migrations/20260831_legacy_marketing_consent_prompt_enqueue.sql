create or replace function public.record_marketing_consent_decision(
  p_consent boolean,
  p_source text default 'legacy_login_prompt'
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_source text := coalesce(nullif(btrim(p_source), ''), 'legacy_login_prompt');
  v_consent boolean := coalesce(p_consent, false);
  v_profile public.profiles%rowtype;
begin
  if v_user_id is null then
    raise exception 'LOGIN_REQUIRED';
  end if;

  select *
  into v_profile
  from public.profiles
  where id = v_user_id
  for update;

  if v_profile.id is null then
    raise exception 'PROFILE_NOT_FOUND';
  end if;

  perform set_config('app.skip_zoho_enqueue', 'true', true);

  update public.profiles
  set
    marketing_consent = v_consent,
    marketing_consent_decided_at = now(),
    marketing_consent_decision_source = v_source,
    marketing_consent_at = case when v_consent then now() else null end,
    marketing_consent_source = v_source,
    marketing_consent_revoked_at = case when v_consent then null else now() end
  where id = v_user_id
  returning * into v_profile;

  if v_consent then
    perform public.enqueue_zoho_contact_sync(v_user_id, 'marketing_consent_changed', v_source);
  end if;

  return v_profile;
end;
$$;

grant execute on function public.record_marketing_consent_decision(boolean, text) to authenticated;
