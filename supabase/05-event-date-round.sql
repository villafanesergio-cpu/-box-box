begin;

alter table public.circuit_events
  add column if not exists round_number integer;

alter table public.circuit_events
  add column if not exists event_date date;

update public.circuit_events
set event_date = started_at::date
where event_date is null
  and started_at is not null;

create index if not exists circuit_events_season_round_idx
  on public.circuit_events (season_id, round_number);

create index if not exists circuit_events_event_date_idx
  on public.circuit_events (event_date desc);

commit;

select
  id,
  name,
  round_number,
  event_date,
  status
from public.circuit_events
order by event_date desc nulls last, started_at desc;
