begin;

-- Additive only: old races stay NULL; no backfill, scores or standings changes.
alter table public.races add column if not exists race_control jsonb;

-- One transaction prevents a failed write from deleting a historical result or
-- leaving a new race half saved. SECURITY INVOKER preserves existing RLS.
create or replace function public.save_race_control(
  p_event_id uuid,
  p_race_id uuid,
  p_control jsonb,
  p_starters jsonb,
  p_results jsonb
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  saved_id uuid;
  result_count integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if jsonb_typeof(p_results) is distinct from 'array' then
    raise exception 'Results must be an array';
  end if;
  result_count := jsonb_array_length(p_results);
  if result_count < 2 or (
    select count(distinct r->>'driver_id') from jsonb_array_elements(p_results) r
  ) <> result_count then raise exception 'At least two distinct drivers required'; end if;

  if p_control is not null then
    if p_control->>'type' is null or p_control->>'type' not in ('sprint','short','final','standard')
       or p_control->>'grid_mode' is null or p_control->>'grid_mode' not in ('manual','inverted') then
      raise exception 'Invalid race format';
    end if;
    if p_control->>'type' in ('sprint','final') then
      if jsonb_typeof(p_control->'qualifying_order') is distinct from 'array' then
        raise exception 'Qualifying order required';
      end if;
      if jsonb_array_length(p_control->'qualifying_order') <> result_count or (
        select count(distinct q) from jsonb_array_elements_text(p_control->'qualifying_order') q
      ) <> result_count or exists (
        select 1 from jsonb_array_elements(p_results) r
        where not (p_control->'qualifying_order' ? (r->>'driver_id'))
      ) then raise exception 'Complete qualifying order required'; end if;
    end if;
    if p_control->>'type' = 'final' and exists (
      select 1 from jsonb_array_elements(p_results) r
      where coalesce(p_control->'pit_stops'->>(r->>'driver_id'), '') not in ('yes','no')
    ) then raise exception 'Manual pit stop review required for every driver'; end if;
  end if;

  -- Serialize new race numbering inside this event, without renumbering history.
  perform 1 from public.circuit_events where id = p_event_id for update;
  if not found then raise exception 'Event unavailable'; end if;

  if p_race_id is null then
    if p_control is null then raise exception 'Race format required for new races'; end if;
    if jsonb_typeof(p_starters) is distinct from 'array' then raise exception 'Grid required'; end if;
    if jsonb_array_length(p_starters) <> result_count or (
      select count(distinct s->>'driver_id') from jsonb_array_elements(p_starters) s
    ) <> result_count or exists (
      select 1 from jsonb_array_elements(p_results) r where not exists (
        select 1 from jsonb_array_elements(p_starters) s where s->>'driver_id' = r->>'driver_id'
      )
    ) then raise exception 'Grid must match results'; end if;
    insert into public.races(event_id,race_number,status,started_at,finished_at,created_by,race_control)
    select p_event_id,coalesce(max(race_number),0)+1,'finished',now(),now(),auth.uid(),p_control
    from public.races where event_id = p_event_id
    returning id into saved_id;
    insert into public.race_starters(race_id,driver_id,grid_position)
    select saved_id,(s->>'driver_id')::uuid,n::integer
    from jsonb_array_elements(p_starters) with ordinality as starter(s,n);
  else
    update public.races set status = 'finished', finished_at = now(),
      race_control = coalesce(p_control, race_control)
    where id = p_race_id and event_id = p_event_id
    returning id into saved_id;
    if saved_id is null then raise exception 'Race unavailable'; end if;
    -- Starters and qualifying order are not inferred again during a correction.
    delete from public.race_results where race_id = saved_id;
  end if;

  insert into public.race_results(
    race_id,driver_id,finish_position,status,base_points,penalty_points,final_points
  )
  select saved_id,(r->>'driver_id')::uuid,n::integer,r->>'status',
    (r->>'base_points')::integer,(r->>'penalty_points')::integer,(r->>'final_points')::integer
  from jsonb_array_elements(p_results) with ordinality as result(r,n);
  return saved_id;
end;
$$;

revoke all on function public.save_race_control(uuid,uuid,jsonb,jsonb,jsonb) from public;
grant execute on function public.save_race_control(uuid,uuid,jsonb,jsonb,jsonb) to authenticated;
commit;
