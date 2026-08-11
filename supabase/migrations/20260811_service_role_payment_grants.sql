grant usage on schema public to service_role;

grant select, insert, update on table public.profiles to service_role;
grant select, insert, update on table public.payment_requests to service_role;
grant select on table public.app_settings to service_role;

grant execute on function public.activate_toyyibpay_premium(uuid, text, text, jsonb) to service_role;
