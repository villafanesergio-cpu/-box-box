begin;

with active_season as (
  select id
  from public.seasons
  where active = true
  order by year desc
  limit 1
),
correct_totals(name, base_points, base_circuit_wins, base_dnf) as (
  values
    ('Martin', 254, 4, 10),
    ('Sergio', 235, 4, 7),
    ('Rodri', 213, 1, 14),
    ('Nico', 175, 0, 12),
    ('Gonzalo', 125, 0, 9),
    ('Lorenzo', 98, 0, 11),
    ('Alvaro', 84, 0, 6),
    ('EZE', 55, 0, 2),
    ('DODI', 43, 0, 4),
    ('Pasti', 31, 0, 6)
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
  correct_totals.base_points,
  correct_totals.base_circuit_wins,
  correct_totals.base_dnf,
  now()
from active_season
join correct_totals on true
join public.drivers
  on lower(trim(drivers.name)) = lower(trim(correct_totals.name))
on conflict (season_id, driver_id)
do update set
  base_points = excluded.base_points,
  base_circuit_wins = excluded.base_circuit_wins,
  base_dnf = excluded.base_dnf,
  updated_at = now();

delete from public.season_driver_baselines baseline
using public.drivers driver, active_season
where baseline.driver_id = driver.id
  and baseline.season_id = active_season.id
  and lower(trim(driver.name)) = 'paola';

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
