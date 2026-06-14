// Phase 11 — skill specialties (parenthetical "Base (Specialty)" naming), gated by hr_specialties.
// A specialty row inherits the base sibling's SB (when SB isn't auto-calculated) and seeds its ML
// from the base while its own ML is still 0.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadWorker } from '../testkit/harness.mjs';

function run(init) {
  const m = loadWorker({ initial: init });
  m.sections.combatskill = ['b1', 's1'];
  m.fire('change:repeating_combatskill:combatskill_name');
  return m;
}
const base = {
  repeating_combatskill_b1_combatskill_name: 'Sword',
  repeating_combatskill_b1_combatskill_sb: 12,
  repeating_combatskill_b1_combatskill_ml: 50,
};

test('specialty inherits base SB and seeds ML from base (specialties on, autocalc off)', () => {
  const m = run({ hr_specialties: 1, hr_autocalc_sb: 0, ...base,
    repeating_combatskill_s1_combatskill_name: 'Sword (Broadsword)',
    repeating_combatskill_s1_combatskill_sb: 0,
    repeating_combatskill_s1_combatskill_ml: 0 });
  assert.equal(m.get('repeating_combatskill_s1_combatskill_sb'), '12');
  assert.equal(m.get('repeating_combatskill_s1_combatskill_ml'), '50');
});

test('does nothing when hr_specialties is off', () => {
  const m = run({ hr_specialties: 0, hr_autocalc_sb: 0, ...base,
    repeating_combatskill_s1_combatskill_name: 'Sword (Broadsword)',
    repeating_combatskill_s1_combatskill_sb: 0,
    repeating_combatskill_s1_combatskill_ml: 0 });
  assert.equal(m.get('repeating_combatskill_s1_combatskill_sb'), '0');
  assert.equal(m.get('repeating_combatskill_s1_combatskill_ml'), '0');
});

test('does not overwrite a specialty ML that is already set', () => {
  const m = run({ hr_specialties: 1, hr_autocalc_sb: 0, ...base,
    repeating_combatskill_s1_combatskill_name: 'Sword (Broadsword)',
    repeating_combatskill_s1_combatskill_sb: 0,
    repeating_combatskill_s1_combatskill_ml: 55 });
  assert.equal(m.get('repeating_combatskill_s1_combatskill_ml'), '55'); // independent now
  assert.equal(m.get('repeating_combatskill_s1_combatskill_sb'), '12'); // SB still inherited
});

test('SB is left to Phase 3 when auto-calc is on (Stage A only seeds ML)', () => {
  const m = run({ hr_specialties: 1, hr_autocalc_sb: 1, ...base,
    repeating_combatskill_s1_combatskill_name: 'Sword (Broadsword)',
    repeating_combatskill_s1_combatskill_sb: 9,
    repeating_combatskill_s1_combatskill_ml: 0 });
  // Stage A must not clobber SB when autocalc owns it; ML still seeded from base
  assert.equal(m.get('repeating_combatskill_s1_combatskill_ml'), '50');
});

test('a non-parenthetical skill is not treated as a specialty', () => {
  const m = run({ hr_specialties: 1, hr_autocalc_sb: 0, ...base,
    repeating_combatskill_s1_combatskill_name: 'Axe',
    repeating_combatskill_s1_combatskill_sb: 0,
    repeating_combatskill_s1_combatskill_ml: 0 });
  assert.equal(m.get('repeating_combatskill_s1_combatskill_sb'), '0'); // unchanged (no base 'Axe')
});

test('specialty with the base INSIDE the parens — "Broadsword (Sword)" — links to Sword', () => {
  const m = run({ hr_specialties: 1, hr_autocalc_sb: 0, ...base,
    repeating_combatskill_s1_combatskill_name: 'Broadsword (Sword)',
    repeating_combatskill_s1_combatskill_sb: 0,
    repeating_combatskill_s1_combatskill_ml: 0 });
  assert.equal(m.get('repeating_combatskill_s1_combatskill_sb'), '12'); // base SB
  assert.equal(m.get('repeating_combatskill_s1_combatskill_ml'), '50'); // seeded from base
});

test('auto-calc resolves a "Broadsword (Sword)" specialty SB to the Sword skill', () => {
  // Phase 3's per-row SB handler reads the un-indexed "current row" attribute name
  const m = loadWorker({ initial: { hr_autocalc_sb: 1, str: 13, dex: 11,
    repeating_combatskill_combatskill_name: 'Broadsword (Sword)' } });
  m.fire('change:repeating_combatskill:combatskill_name');
  assert.equal(m.get('repeating_combatskill_combatskill_sb'), '12'); // Sword = (13+11+11)/3 = 12
});

test('specialty ML seeds when the base ML is set AFTER the specialty is added', () => {
  const m = loadWorker({ initial: { hr_specialties: 1, hr_autocalc_sb: 0,
    repeating_combatskill_b1_combatskill_name: 'Sword',
    repeating_combatskill_b1_combatskill_sb: 12,
    repeating_combatskill_b1_combatskill_ml: 0, // base ML not set yet
    repeating_combatskill_s1_combatskill_name: 'Sword (Shortsword)',
    repeating_combatskill_s1_combatskill_sb: 0,
    repeating_combatskill_s1_combatskill_ml: 0 } });
  m.sections.combatskill = ['b1', 's1'];
  m.fire('change:repeating_combatskill:combatskill_name');
  assert.equal(m.get('repeating_combatskill_s1_combatskill_ml'), '0'); // nothing to seed from yet
  m.set('repeating_combatskill_b1_combatskill_ml', 50);
  m.fire('change:repeating_combatskill:combatskill_ml');
  assert.equal(m.get('repeating_combatskill_s1_combatskill_ml'), '50'); // now seeded
});

// --- Stage B: auto-increment ML on a successful development roll ---
// The harness startRoll stub returns m.nextRoll as the rollresult (1d100+SB total), so we can
// drive success/failure deterministically. Rule: rollresult > ML -> +1 (specialty +2), cap 100+SB.

function develop(event, init, nextRoll, eventInfo) {
  const m = loadWorker({ initial: init });
  m.nextRoll = nextRoll;
  if (eventInfo) m.emit(event, eventInfo); else m.fire(event);
  return m;
}
const FX = { climbing_ml: 50, climbing_sb: 12, climbing_name: 'Climbing' };

test('develop: success (rollresult > ML) increments a fixed skill by 1', () => {
  assert.equal(develop('clicked:climbingdevelop', FX, 60).get('climbing_ml'), '51');
});

test('develop: failure (rollresult <= ML) leaves ML unchanged', () => {
  assert.equal(develop('clicked:climbingdevelop', FX, 40).get('climbing_ml'), '50');
});

test('develop: increment is capped at 100 + SB', () => {
  assert.equal(develop('clicked:climbingdevelop', { climbing_ml: 111, climbing_sb: 12, climbing_name: 'C' }, 130).get('climbing_ml'), '112');
});

test('develop: no increase once already at max ML', () => {
  assert.equal(develop('clicked:climbingdevelop', { climbing_ml: 112, climbing_sb: 12, climbing_name: 'C' }, 130).get('climbing_ml'), '112');
});

const RP = 'repeating_combatskill_-r1_';
function repInit(name, special) {
  const o = { hr_specialties: special ? 1 : 0 };
  o[RP + 'combatskill_name'] = name; o[RP + 'combatskill_ml'] = 50; o[RP + 'combatskill_sb'] = 12;
  return o;
}
const devEvt = 'clicked:repeating_combatskill:combatskilldevelop';
const devSrc = { sourceAttribute: RP + 'combatskilldevelop' };

test('develop: a specialty (parenthetical) increments by 2 when specialties are on', () => {
  assert.equal(develop(devEvt, repInit('Sword (Broadsword)', true), 60, devSrc).get(RP + 'combatskill_ml'), '52');
});

test('develop: a parenthetical row is only +1 when specialties are OFF', () => {
  assert.equal(develop(devEvt, repInit('Sword (Broadsword)', false), 60, devSrc).get(RP + 'combatskill_ml'), '51');
});

test('develop: a plain repeating skill is +1', () => {
  assert.equal(develop(devEvt, repInit('Sword', true), 60, devSrc).get(RP + 'combatskill_ml'), '51');
});
