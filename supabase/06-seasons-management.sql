begin;

alter table public.seasons enable row level security;

drop policy if exists "Public read seasons" on public.seasons;
create policy "Public read seasons"
on public.seasons
for select
to anon, authenticated
using (true);

drop policy if exists "Authenticated manage seasons" on public.seasons;
create policy "Authenticated manage seasons"
on public.seasons
for all
to authenticated
using (true)
with check (true);

grant select on public.seasons to anon, authenticated;
grant insert, update, delete on public.seasons to authenticated;

create or replace function public.activate_boxbox_season(p_season_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1 from public.seasons where id = p_season_id
  ) then
    raise exception 'Season not found';
  end if;

  update public.seasons
  set active = false
  where active = true
    and id <> p_season_id;

  update public.seasons
  set active = true
  where id = p_season_id;
end;
$$;

create or replace function public.create_boxbox_season(
  p_name text,
  p_year integer,
  p_copy_from uuid default null,
  p_activate boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_season_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if nullif(trim(p_name), '') is null then
    raise exception 'Season name is required';
  end if;

  if p_year < 2000 or p_year > 2200 then
    raise exception 'Invalid season year';
  end if;

  insert into public.seasons (name, year, active)
  values (trim(p_name), p_year, false)
  returning id into new_season_id;

  if p_copy_from is not null then
    insert into public.season_driver_teams (
      season_id,
      driver_id,
      team_id,
      racing_number,
      active
    )
    select
      new_season_id,
      driver_id,
      team_id,
      racing_number,
      active
    from public.season_driver_teams
    where season_id = p_copy_from
      and active = true
    on conflict do nothing;
  end if;

  if p_activate then
    perform public.activate_boxbox_season(new_season_id);
  end if;

  return new_season_id;
end;
$$;

create or replace function public.delete_empty_boxbox_season(p_season_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if exists (
    select 1
    from public.seasons
    where id = p_season_id
      and active = true
  ) then
    raise exception 'The active season cannot be deleted';
  end if;

  if exists (
    select 1
    from public.circuit_events
    where season_id = p_season_id
  ) then
    raise exception 'A season with events cannot be deleted';
  end if;

  delete from public.season_driver_baselines
  where season_id = p_season_id;

  delete from public.season_driver_teams
  where season_id = p_season_id;

  delete from public.seasons
  where id = p_season_id;
end;
$$;

revoke all on function public.activate_boxbox_season(uuid) from public;
revoke all on function public.create_boxbox_season(text, integer, uuid, boolean) from public;
revoke all on function public.delete_empty_boxbox_season(uuid) from public;

grant execute on function public.activate_boxbox_season(uuid) to authenticated;
grant execute on function public.create_boxbox_season(text, integer, uuid, boolean) to authenticated;
grant execute on function public.delete_empty_boxbox_season(uuid) to authenticated;

commit;

select
  id,
  name,
  year,
  active
from public.seasons
order by year desc, created_at desc;
