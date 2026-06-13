// Unit tests for the HarnMaster3 sheetworker calculations, run against the real
// worker block extracted from harnsheet.html. Rule references verified against
// HarnMaster v3.5.2 (see REVIEW.md). Run: `node --test` (or `npm test`).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadWorker } from '../testkit/harness.mjs';

test('endurance = round((STR + STA + WIL) / 3)  [Skills 3/9]', () => {
  let m = loadWorker({ initial: { str: 12, sta: 12, wil: 12 } });
  m.fire('change:str');
  assert.equal(m.get('combat_endurance'), '12');

  m = loadWorker({ initial: { str: 13, sta: 13, wil: 12 } }); // 38/3 = 12.67 -> 13
  m.fire('change:sta');
  assert.equal(m.get('combat_endurance'), '13');
});

test('encumbrance floors weight / capacity  [Skills 6: "rounds down"]', () => {
  // capacity = effective condition (houserule 2); 18 / 12 = 1.5 -> floor 1 (round would give 2)
  const m = loadWorker({ initial: {
    hrcondition4endurance: 2, combat_effectivecondition: 12,
    load_inventory_total: 18, is_mounted: 0,
  } });
  m.fire('change:load_inventory_total');
  assert.equal(m.get('encumbrance'), '1');
  assert.equal(m.get('load_total'), '18');
});

test('encumbrance guards divide-by-zero (no Infinity)', () => {
  const m = loadWorker({ initial: {
    hrcondition4endurance: 2, combat_effectivecondition: 0, combat_endurance: 0,
    load_inventory_total: 18, is_mounted: 0,
  } });
  m.fire('change:load_inventory_total');
  assert.equal(m.get('encumbrance'), '0');
});

test('penalties: UP = injury + fatigue, PP = UP + encumbrance, fumble = PP (unmounted)  [Skills 6]', () => {
  const m = loadWorker({ initial: {
    injury_total: 2, fatigue_total: 1, encumbrance: 2, is_mounted: 0, hrfumblestumblepenalty: 0,
  } });
  m.fire('change:injury_total');
  assert.equal(m.get('universal_penalty'), '3');
  assert.equal(m.get('physical_penalty'), '5');
  assert.equal(m.get('fumblestumblepenalty'), '5');
});

test('missile range: EML steps -0/-20/-40/-80, impact -1 per band floored at 50%  [Combat 16]', () => {
  const m = loadWorker({ initial: {
    repeating_missileweapon_missileweapon_ml: 50,
    repeating_missileweapon_missileweapon_p: 8,
  } });
  m.fire('change:repeating_missileweapon:missileweapon_p');
  assert.equal(m.get('repeating_missileweapon_missileweapon_short_aml'), '50');
  assert.equal(m.get('repeating_missileweapon_missileweapon_medium_aml'), '30');
  assert.equal(m.get('repeating_missileweapon_missileweapon_long_aml'), '10');
  assert.equal(m.get('repeating_missileweapon_missileweapon_extreme_aml'), '-30');
  assert.equal(m.get('repeating_missileweapon_missileweapon_short_dmg'), '8');
  assert.equal(m.get('repeating_missileweapon_missileweapon_medium_dmg'), '7');
  assert.equal(m.get('repeating_missileweapon_missileweapon_long_dmg'), '6');
  assert.equal(m.get('repeating_missileweapon_missileweapon_extreme_dmg'), '5');
});

test('missile impact never below 50% (floored)  [Combat 16]', () => {
  const m = loadWorker({ initial: {
    repeating_missileweapon_missileweapon_ml: 40,
    repeating_missileweapon_missileweapon_p: 5,
  } });
  m.fire('change:repeating_missileweapon:missileweapon_p');
  assert.equal(m.get('repeating_missileweapon_missileweapon_long_dmg'), '3');    // max(5-2, floor(2.5)=2) = 3
  assert.equal(m.get('repeating_missileweapon_missileweapon_extreme_dmg'), '2'); // max(5-3, floor(2.5)=2) = 2
});

test('skill index = floor(ML / 10)  [Skills 2]', () => {
  const m = loadWorker({ initial: { repeating_spells_spell_eml: 45 } });
  m.fire('change:repeating_spells:spell_eml');
  assert.equal(m.get('repeating_spells_spell_si'), '4');
});
