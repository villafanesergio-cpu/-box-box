import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { makeRaceControl, pointsFor } from '../lib/race-format.mjs';
const event = '00000000-0000-0000-0000-000000000001';
const a = '00000000-0000-0000-0000-000000000002';
const b = '00000000-0000-0000-0000-000000000003';
const old = '00000000-0000-0000-0000-000000000004';
const migration = await readFile(new URL('../supabase/migrations/20261021164634_race_control_format.sql',import.meta.url),'utf8');
const permissionsMigration = await readFile(new URL('../supabase/migrations/20261023105704_race_control_restrict_anonymous_execution.sql',import.meta.url),'utf8');
const entries = [{driverId:a,pitStop:'yes'}, {driverId:b,pitStop:'no',status:'dnf'}];
const control = type => makeRaceControl({type,gridMode:type === 'short' ? 'inverted':'manual',previousRaceId:old,qualifyingOrder:[a,b],entries});
const results = entries.map((entry,index) => {
  const points = pointsFor(index+1,2,entry.status ?? 'finished',0);
  return {driver_id:entry.driverId,status:entry.status ?? 'finished',base_points:points.base,penalty_points:0,final_points:points.final};
});

test('migration and atomic save round trip: seven races, legacy preservation, rollback and RLS', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role authenticated;
      create role anon;
      alter default privileges grant execute on functions to anon;
      create schema auth;
      create function auth.uid() returns uuid language sql as $$ select '${a}'::uuid $$;
      create table circuit_events(id uuid primary key);
      create table races(id uuid primary key default gen_random_uuid(),event_id uuid references circuit_events, race_number int,status text,started_at timestamptz,finished_at timestamptz,created_by uuid,unique(event_id,race_number));
      create table race_starters(race_id uuid references races,driver_id uuid,grid_position int,primary key(race_id,driver_id));
      create table race_results(race_id uuid references races,driver_id uuid,finish_position int,status text,base_points int,penalty_points int,final_points int check(final_points >= 0),primary key(race_id,driver_id));
      insert into circuit_events values ('${event}');
      insert into races(id,event_id,race_number,status) values ('${old}','${event}',3,'finished');
      insert into race_results values ('${old}','${a}',1,'finished',99,0,99);
      insert into race_starters values ('${old}','${a}',1);
    `);
    await db.exec(migration);
    await db.exec(migration); // idempotent schema rollout
    assert.equal((await db.query("select has_function_privilege('anon','public.save_race_control(uuid,uuid,jsonb,jsonb,jsonb)','execute') as allowed")).rows[0].allowed,true);
    await db.exec(permissionsMigration);
    assert.equal((await db.query("select has_function_privilege('anon','public.save_race_control(uuid,uuid,jsonb,jsonb,jsonb)','execute') as allowed")).rows[0].allowed,false);
    assert.equal((await db.query("select has_function_privilege('authenticated','public.save_race_control(uuid,uuid,jsonb,jsonb,jsonb)','execute') as allowed")).rows[0].allowed,true);
    const before = (await db.query('select * from race_results where race_id=$1',[old])).rows;
    const save = async (type, id=null, rows=results) => (await db.query(
      'select save_race_control($1,$2,$3::jsonb,$4::jsonb,$5::jsonb) as id',
      [event,id,type ? JSON.stringify(control(type)):null,JSON.stringify([{driver_id:a},{driver_id:b}]),JSON.stringify(rows)]
    )).rows[0].id;
    const types = ['sprint','short','short','short','short','short','final'];
    let final;
    for (const type of types) final = await save(type);
    const rows = (await db.query('select * from races order by race_number')).rows;
    assert.deepEqual(rows.slice(1).map(r => r.race_control.type),types);
    assert.deepEqual(rows.map(r => r.race_number),[3,4,5,6,7,8,9,10]);
    assert.equal(rows[0].race_control,null);
    assert.deepEqual((await db.query('select * from race_results where race_id=$1',[old])).rows,before);
    assert.deepEqual(rows.at(-1).race_control.pit_stops,{[a]:'yes',[b]:'no'});
    assert.deepEqual(rows.at(-1).race_control.qualifying_order,[a,b]);
    const snapshot = (await db.query('select * from race_results where race_id=$1 order by finish_position',[final])).rows;
    await assert.rejects(save('final',final,[...results.slice(0,1),{...results[1],final_points:-1}]),/check constraint/);
    assert.deepEqual((await db.query('select * from race_results where race_id=$1 order by finish_position',[final])).rows,snapshot);
    await assert.rejects(save('final',null,[...results.slice(0,1),{...results[1],final_points:-1}]),/check constraint/);
    assert.equal((await db.query('select count(*)::int as n from races')).rows[0].n,8);
    await save(null,old);
    assert.equal((await db.query('select race_control from races where id=$1',[old])).rows[0].race_control,null);
    assert.equal((await db.query('select count(*)::int as n from race_starters where race_id=$1',[old])).rows[0].n,1);
    await db.exec(`
      create schema private;
      create function private.is_admin() returns boolean language sql as $$
        select coalesce(current_setting('boxbox.test_admin',true),'false')::boolean
      $$;
      grant usage on schema public,auth,private to authenticated;
      grant select,insert,update,delete on all tables in schema public to authenticated;
    `);
    for (const table of ['circuit_events','races','race_results','race_starters']) {
      await db.exec(`alter table ${table} enable row level security;
        create policy public_read on ${table} for select to authenticated using (true);
        create policy admin_manage on ${table} for all to authenticated
          using ((select private.is_admin())) with check ((select private.is_admin()));`);
    }
    await db.exec('set role authenticated');
    await assert.rejects(save('final'),/Event unavailable|row-level security/);
    await db.exec('reset role');
    assert.equal((await db.query('select count(*)::int as n from races')).rows[0].n,8);
    await db.exec("set boxbox.test_admin = 'true'; set role authenticated");
    await save('final');
    await db.exec('reset role');
    assert.equal((await db.query('select count(*)::int as n from races')).rows[0].n,9);
  } finally { await db.close(); }
});
