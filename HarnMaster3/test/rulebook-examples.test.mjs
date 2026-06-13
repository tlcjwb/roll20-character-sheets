// Golden tests derived from worked examples in the HarnMaster rulebooks (v3.5.2 core,
// Religion). Each asserts the sheet reproduces the book's stated result for the book's
// inputs. See DESIGN.md "Validation workstream" for the three outcome buckets
// (pass / errata / intentional-deviation).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadWorker } from '../testkit/harness.mjs';
import { evalTarget } from '../testkit/roll-eval.mjs';

// ---------------------------------------------------------------------------
// Worker-side examples (derived attributes, via the live worker)
// ---------------------------------------------------------------------------

test('Skills 6 — Kalgyn: Encumbrance 33/Endurance 14 -> 2 (floor)', () => {
  const m = loadWorker({ initial: {
    hrcondition4endurance: 0, combat_endurance: 14, // use Endurance directly
    load_inventory_total: 33, is_mounted: 0,
  } });
  m.fire('change:load_inventory_total');
  assert.equal(m.get('encumbrance'), '2'); // 33/14 = 2.357 -> 2
});

test('Skills 6 — Kalgyn: UP = 2+1 = 3, PP = UP+Enc(2) = 5', () => {
  const m = loadWorker({ initial: {
    injury_total: 2, fatigue_total: 1, encumbrance: 2, is_mounted: 0, hrfumblestumblepenalty: 0,
  } });
  m.fire('change:injury_total');
  assert.equal(m.get('universal_penalty'), '3');
  assert.equal(m.get('physical_penalty'), '5');
});

test('Combat 21 — Steed: Load Limit = STR(40)x8 = 320; excess 40 / End 21 -> 2 (round)', () => {
  const m = loadWorker({ initial: {
    hstr: 40, hcombat_endurance: 21,
    weight: 200, load_total: 110, hload_armor_total: 50, hload_inventory_total: 0,
  } });
  m.fire('change:weight'); // total carried = 360
  assert.equal(m.get('hloadlimit'), '320');
  assert.equal(m.get('hadjusted_load'), '40');
  assert.equal(m.get('hencumbrance'), '2'); // 40/21 = 1.9 -> book rounds to 2 (errata note: chars floor)
});

test('Combat 20 — Steed move: (Move 36 - PP 2) x gait', () => {
  const trot = loadWorker({ initial: { hmove: 36, huniversal_penalty: 2, hencumbrance: 0, horse_speed: 1 } });
  trot.fire('change:horse_speed');
  assert.equal(trot.get('hcombat_move'), '34'); // (36-2)*1

  const gallop = loadWorker({ initial: { hmove: 36, huniversal_penalty: 2, hencumbrance: 0, horse_speed: 3 } });
  gallop.fire('change:horse_speed');
  assert.equal(gallop.get('hcombat_move'), '102'); // (36-2)*3
});

test('Combat 20 — Riding EML = avg(rider Riding EML 80, steed Init EML 43) = 62', () => {
  const m = loadWorker({ initial: {
    ridingpersonal_ml: 80, physical_penalty: 0,        // rider Riding EML 80
    hinitiative_ml: 58, hphysical_penalty: 3,          // steed Init EML: 58 - 5*3 = 43
  } });
  m.fire('change:ridingpersonal_ml');
  assert.equal(m.get('ridinghorse_ml'), '62'); // round((80+43)/2) = round(61.5) = 62
});

// Missile Data table (Combat 16): EML steps are universal; per-range impact is the sheet's
// "-1 per band, floored at 50%" approximation. Matches most weapons; deviates for a couple.
test('Combat 16 — Missile impact matches table for Shortbow / Longbow / Sling', () => {
  const cases = [
    { p: 6, book: [6, 5, 4, 3] }, // Shortbow 6/5/4/3
    { p: 8, book: [8, 7, 6, 5] }, // Longbow  8/7/6/5
    { p: 4, book: [4, 3, 2, 2] }, // Sling    4/3/2/2 (extreme floored at 50%)
  ];
  for (const { p, book } of cases) {
    const m = loadWorker({ initial: {
      repeating_missileweapon_missileweapon_ml: 50,
      repeating_missileweapon_missileweapon_p: p,
    } });
    m.fire('change:repeating_missileweapon:missileweapon_p');
    const got = [
      m.get('repeating_missileweapon_missileweapon_short_dmg'),
      m.get('repeating_missileweapon_missileweapon_medium_dmg'),
      m.get('repeating_missileweapon_missileweapon_long_dmg'),
      m.get('repeating_missileweapon_missileweapon_extreme_dmg'),
    ].map(Number);
    assert.deepEqual(got, book, `impact ${p}`);
  }
});

test('Combat 16 — DOCUMENTED DEVIATION: Staff Sling extreme = 2 (sheet) vs 3 (table) [item 13]', () => {
  // Staff Sling table: 5/4/3/3. Sheet formula: extreme = max(p-3, floor(p/2)) = max(2, 2) = 2.
  // Intentional/known deviation; mitigated because the per-range impact field is now editable.
  const m = loadWorker({ initial: {
    repeating_missileweapon_missileweapon_ml: 50,
    repeating_missileweapon_missileweapon_p: 5,
  } });
  m.fire('change:repeating_missileweapon:missileweapon_p');
  assert.equal(m.get('repeating_missileweapon_missileweapon_extreme_dmg'), '2'); // sheet; table says 3
});

// ---------------------------------------------------------------------------
// Macro-target examples (roll-button targets, via the inline-roll evaluator)
// ---------------------------------------------------------------------------

test('Physician 4 — Healing target = HR x Endurance (H4 x End 11 = 44)', () => {
  const target = evalTarget('healingcheck',
    { injury_healingroll: 4, healing_effectivecondition: 11, fatigue_total: 0 },
    { 'Target Modifier?': 0 });
  assert.equal(target, 44);
});

test('Physician 2 — Healing applies Fatigue penalty (5 x FL)', () => {
  const target = evalTarget('healingcheck',
    { injury_healingroll: 4, healing_effectivecondition: 11, fatigue_total: 2 },
    { 'Target Modifier?': 0 });
  assert.equal(target, 34); // 44 - 5*2
});

test('Skills 2 — EML clamped to [5, 95]', () => {
  // Post-Phase-2 the macro references the precomputed climbing_eml_eff.
  const hi = evalTarget('ClimbingSkillCheck', { climbing_eml_eff: 120 }, { 'Target Modifier?': 0 });
  assert.equal(hi, 95);
  const lo = evalTarget('ClimbingSkillCheck', { climbing_eml_eff: 2 }, { 'Target Modifier?': 0 });
  assert.equal(lo, 5);
});

test('Skills 6/21 — Attribute test target = attr x mult - 5*PP (Kalgyn PP 5)', () => {
  // STR 13, x5, Physical Penalty 5 -> 65 - 25 = 40
  const target = evalTarget('StrengthCheck',
    { str: 13, physical_penalty: 5 },
    { 'Target Modifier?': 0, 'Attribute multiplier?': 5 });
  assert.equal(target, 40);
});
