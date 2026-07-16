begin;

create table if not exists public.season_driver_baselines (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  driver_id uuid not null references public.drivers(id) on delete cascade,
  base_points integer not null default 0 check (base_points >= 0),
  base_circuit_wins integer not null default 0 check (base_circuit_wins >= 0),
  base_dnf integer not null default 0 check (base_dnf >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (season_id, driver_id)
);

alter table public.season_driver_baselines enable row level security;

drop policy if exists "standings baseline public read" on public.season_driver_baselines;
create policy "standings baseline public read"
on public.season_driver_baselines
for select
to anon, authenticated
using (true);

drop policy if exists "standings baseline authenticated manage" on public.season_driver_baselines;
create policy "standings baseline authenticated manage"
on public.season_driver_baselines
for all
to authenticated
using (true)
with check (true);

with active_season as (
  select id
  from public.seasons
  where active = true
  order by year desc
  limit 1
),
historic(name, base_points, base_circuit_wins, base_dnf) as (
  values
    ('Martin', 254, 4, 10),
    ('Sergio', 235, 4, 7),
    ('Rodri', 213, 1, 14),
    ('Nico', 175, 0, 12),
    ('Gonzalo', 125, 0, 9),
    ('Alvaro', 84, 0, 6),
    ('Lorenzo', 98, 0, 11),
    ('EZE', 55, 0, 2),
    ('Pasti', 31, 0, 6),
    ('DODI', 43, 0, 4)
)
insert into public.season_driver_baselines (
  season_id,
  driver_id,
  base_points,
  base_circuit_wins,
  base_dnf,
  updated_at
)
select
  active_season.id,
  drivers.id,
  historic.base_points,
  historic.base_circuit_wins,
  historic.base_dnf,
  now()
from active_season
join historic on true
join public.drivers
  on lower(trim(drivers.name)) = lower(trim(historic.name))
on conflict (season_id, driver_id)
do update set
  base_points = excluded.base_points,
  base_circuit_wins = excluded.base_circuit_wins,
  base_dnf = excluded.base_dnf,
  updated_at = now();

commit;

select
  d.name,
  b.base_points,
  b.base_circuit_wins,
  b.base_dnf
from public.season_driver_baselines b
join public.drivers d on d.id = b.driver_id
join public.seasons s on s.id = b.season_id
where s.active = true
order by b.base_points desc;
