create or replace function public.get_recent_premium_subscribers(p_limit integer default 12)
returns table (
  display_name text
)
language sql
stable
security definer
set search_path = public
as $$
  with recent_subscribers as (
    select
      coalesce(nullif(trim(p.display_name), ''), nullif(trim(p.full_name), '')) as display_name,
      coalesce(p.subscription_started_at, p.access_granted_at, p.updated_at, p.created_at) as subscribed_at,
      p.created_at
    from public.profiles p
    where p.subscription_status = 'premium'
      and coalesce(p.is_blocked, false) = false
      and (p.subscription_ends_at is null or p.subscription_ends_at > now())
      and coalesce(nullif(trim(p.display_name), ''), nullif(trim(p.full_name), '')) is not null
  )
  select recent_subscribers.display_name
  from recent_subscribers
  order by recent_subscribers.subscribed_at desc, recent_subscribers.created_at desc
  limit least(greatest(coalesce(p_limit, 12), 1), 20);
$$;

grant execute on function public.get_recent_premium_subscribers(integer) to anon, authenticated;
