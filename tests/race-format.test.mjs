import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pointsFor, buildGrid, defaultGridMode, suggestedType, makeRaceControl, nextRaceNumber } from '../lib/race-format.mjs';
const active = ['a','b','c','new'].map(id => ({ driver: { id } }));
const results = [{driver_id:'b',finish_position:2},{driver_id:'a',finish_position:1},{driver_id:'inactive',finish_position:3},{driver_id:'c',finish_position:4,status:'dnf'}];
const ids = grid => grid.map(item => item.driver.id);

test('manual grid never inverts previous results; inverted includes DNF, excludes inactive, appends newcomers', () => {
  assert.deepEqual(ids(buildGrid(active, results, 'manual')), ['a','b','c','new']);
  assert.deepEqual(ids(buildGrid(active, results, 'inverted')), ['c','b','a','new']);
  assert.equal(results[0].driver_id, 'b');
  assert.throws(() => buildGrid(active, [], 'inverted'));
});
test('final defaults to manual after five short races; old races are never relabelled', () => {
  const races = [{race_control:{type:'sprint'}}, ...Array.from({length:5}, () => ({race_control:{type:'short'}}))];
  assert.equal(suggestedType(races), 'final');
  assert.equal(defaultGridMode('final', true), 'manual');
  assert.equal(defaultGridMode('short', true), 'inverted');
  assert.equal(defaultGridMode('short', false), 'manual');
  assert.equal(suggestedType([{race_number:1}]), 'standard');
  assert.equal(nextRaceNumber([{race_number:1},{race_number:4}]), 5);
});
test('final requires full unique qualifying order and a manual pit review even for DNF', () => {
  const options = {type:'final',gridMode:'manual',qualifyingOrder:['a','b'],entries:[{driverId:'a',pitStop:'yes'},{driverId:'b',status:'dnf',pitStop:''}]};
  assert.throws(() => makeRaceControl(options), /parada/);
  options.entries[1].pitStop = 'no';
  const control = makeRaceControl(options);
  assert.deepEqual(control.pit_stops, {a:'yes',b:'no'});
  assert.deepEqual(control.qualifying_order,['a','b']);
  assert.throws(() => makeRaceControl({...options,qualifyingOrder:['a','a']}), /clasificación/);
  assert.throws(() => makeRaceControl({...options,gridMode:'inverted'}), /origen/);
});
test('existing points remain unchanged for all GP phases, DNF and penalties', () => {
  assert.deepEqual(pointsFor(1,14,'finished',0),{base:14,final:14});
  assert.deepEqual(pointsFor(14,14,'finished',-5),{base:1,final:0});
  assert.deepEqual(pointsFor(2,14,'finished',2),{base:13,final:15});
  assert.deepEqual(pointsFor(1,14,'dnf',9),{base:0,final:0});
});
