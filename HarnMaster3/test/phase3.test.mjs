// Phase 3 (increment 1) — auto-calculate Skill Base for the fixed standard skills.
// SB = round(mean of the skill's three attributes) + sunsign modifier (HarnMaster Skills 3).
// Gated by hr_autocalc_sb (default off): when off, SB is never touched.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadWorker } from '../testkit/harness.mjs';

test('Climbing SB = mean(STR,DEX,AGL) + sunsign  [Skills 3]', () => {
  // STR 12, DEX 10, AGL 14 -> mean 12; Ulandus +2 -> 14
  const m = loadWorker({ initial: { hr_autocalc_sb: 1, str: 12, dex: 10, agl: 14, sunsign: 'ulandus' } });
  m.fire('change:str');
  assert.equal(m.get('climbing_sb'), '14');
});

test('Condition SB = mean(STR,STA,WIL) + sunsign', () => {
  // 13/13/13 -> 13; Lado +1 -> 14
  const m = loadWorker({ initial: { hr_autocalc_sb: 1, str: 13, sta: 13, wil: 13, sunsign: 'lado' } });
  m.fire('change:wil');
  assert.equal(m.get('condition_sb'), '14');
});

test('Initiative SB has no sunsign modifier; rounds the mean', () => {
  // AGL 10, WIL 14, WIL 14 -> 38/3 = 12.67 -> 13
  const m = loadWorker({ initial: { hr_autocalc_sb: 1, agl: 10, wil: 14, sunsign: 'hirin' } });
  m.fire('change:agl');
  assert.equal(m.get('initiative_sb'), '13');
});

test('cusp sunsign applies the bonus if either half matches', () => {
  // Climbing wants Ulandus/Aralius +2; cusp "ulandus-aralius" -> +2
  const m = loadWorker({ initial: { hr_autocalc_sb: 1, str: 12, dex: 10, agl: 14, sunsign: 'ulandus-aralius' } });
  m.fire('change:str');
  assert.equal(m.get('climbing_sb'), '14');
});

test('non-matching sunsign gives no bonus', () => {
  // Condition wants Ulandus/Lado; Hirin -> +0
  const m = loadWorker({ initial: { hr_autocalc_sb: 1, str: 13, sta: 13, wil: 13, sunsign: 'hirin' } });
  m.fire('change:wil');
  assert.equal(m.get('condition_sb'), '13');
});

test('gated off: SB is not touched when the setting is disabled', () => {
  const m = loadWorker({ initial: { hr_autocalc_sb: 0, climbing_sb: 5, str: 12, dex: 10, agl: 14, sunsign: 'ulandus' } });
  m.fire('change:str');
  assert.equal(m.get('climbing_sb'), '5'); // unchanged — manual entry preserved
});

// --- Repeating-row name lookup (Phase 3.3) ---

test("Juryn's Dancing SB = 14  [Skills 1 example: (10+14+14)/3 + Hirin]", () => {
  // Dancing (DEX AGL AGL), DEX 10 AGL 14, sunsign Hirin (+1 for Dancing) -> 13 + 1 = 14
  const m = loadWorker({ initial: { hr_autocalc_sb: 1, dex: 10, agl: 14, sunsign: 'hirin' } });
  m.set('repeating_physicalskill_physicalskill_name', 'Dancing');
  m.fire('change:repeating_physicalskill:physicalskill_name');
  assert.equal(m.get('repeating_physicalskill_physicalskill_sb'), '14');
});

test('repeating combat skill "Sword" gets SB on attribute change (full rescan)', () => {
  const m = loadWorker({ initial: { hr_autocalc_sb: 1, str: 13, dex: 11 } });
  m.sections.combatskill = ['r1'];
  m.set('repeating_combatskill_r1_combatskill_name', 'Sword');
  m.fire('change:str');
  // Sword (STR DEX DEX) = (13+11+11)/3 = 11.67 -> 12; no sunsign match -> 12
  assert.equal(m.get('repeating_combatskill_r1_combatskill_sb'), '12');
});

test('specialty in parentheses matches the base skill', () => {
  const m = loadWorker({ initial: { hr_autocalc_sb: 1, str: 13, dex: 11 } });
  m.set('repeating_combatskill_combatskill_name', 'Sword (Broadsword)');
  m.fire('change:repeating_combatskill:combatskill_name');
  assert.equal(m.get('repeating_combatskill_combatskill_sb'), '12'); // -> sword
});

test('ritual skill by deity name (Larani) computes SB', () => {
  // Larani (VOI INT WIL); VOI 12 INT 12 WIL 12 -> 12; sunsign none matching here
  const m = loadWorker({ initial: { hr_autocalc_sb: 1, voi: 12, int: 12, wil: 12 } });
  m.set('repeating_ritualskill_ritualskill_name', 'Larani');
  m.fire('change:repeating_ritualskill:ritualskill_name');
  assert.equal(m.get('repeating_ritualskill_ritualskill_sb'), '12');
});

test('unrecognised skill name leaves SB untouched', () => {
  const m = loadWorker({ initial: { hr_autocalc_sb: 1, str: 13, dex: 11, repeating_combatskill_combatskill_sb: 7 } });
  m.set('repeating_combatskill_combatskill_name', 'Flibbertigibbet');
  m.fire('change:repeating_combatskill:combatskill_name');
  assert.equal(m.get('repeating_combatskill_combatskill_sb'), '7'); // unchanged
});
