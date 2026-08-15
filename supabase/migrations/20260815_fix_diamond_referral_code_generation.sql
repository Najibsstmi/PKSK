create or replace function public.generate_agent_referral_code(p_agent_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_attempt integer := 0;
begin
  loop
    v_attempt := v_attempt + 1;
    v_code := 'D' || upper(substr(md5(clock_timestamp()::text || random()::text || p_agent_id::text || v_attempt::text), 1, 6));

    exit when not exists (
      select 1
      from public.agents a
      where public.normalize_referral_code(a.referral_code) = v_code
        and a.id <> p_agent_id
    );

    if v_attempt >= 20 then
      raise exception 'REFERRAL_CODE_GENERATION_FAILED';
    end if;
  end loop;

  return v_code;
end;
$$;

revoke all on function public.generate_agent_referral_code(uuid) from public;
