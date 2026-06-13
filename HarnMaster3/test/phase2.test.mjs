// Phase 2 — EML centralized out of the roll macros. Each check macro references a
// precomputed penalty-adjusted EML (X_eml_eff = ML - 5*penalty); the macro keeps only
// the runtime Target Modifier query + the 5/95 clamp. Two surfaces:
//   - the worker computes X_eml_eff (harness)
//   - the macro target = clamp(X_eml_eff + modifier) (evaluator)
// Together these prove end-to-end equivalence with the old inline form.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadWorker } from '../testkit/harness.mjs';
import { evalTarget } from '../testkit/roll-eval.mjs';

test('worker: physical-skill EML = ML - 5*PhysicalPenalty', () => {
  const m = loadWorker({ initial: { climbing_ml: 50, physical_penalty: 2 } });
  m.fire('change:physical_penalty');
  assert.equal(m.get('climbing_eml_eff'), '40'); // 50 - 10
});

test('worker: non-physical-skill EML = ML - 5*UniversalPenalty', () => {
  const m = loadWorker({ initial: { awareness_ml: 60, universal_penalty: 1 } });
  m.fire('change:universal_penalty');
  assert.equal(m.get('awareness_eml_eff'), '55'); // 60 - 5
});

test('worker: dodge EML shared by both dodge buttons', () => {
  const m = loadWorker({ initial: { dodge_ml: 44, physical_penalty: 3 } });
  m.fire('change:physical_penalty');
  assert.equal(m.get('dodge_eml_eff'), '29'); // 44 - 15
});

test('macro: skill-check target = clamp(eml_eff + modifier) to [5,95]', () => {
  assert.equal(evalTarget('ClimbingSkillCheck', { climbing_eml_eff: 40 }, { 'Target Modifier?': 0 }), 40);
  assert.equal(evalTarget('ClimbingSkillCheck', { climbing_eml_eff: 40 }, { 'Target Modifier?': 10 }), 50);
  assert.equal(evalTarget('ClimbingSkillCheck', { climbing_eml_eff: 120 }, { 'Target Modifier?': 0 }), 95);
  assert.equal(evalTarget('ClimbingSkillCheck', { climbing_eml_eff: 2 }, { 'Target Modifier?': 0 }), 5);
});

test('end-to-end: ML 50, PP 2 -> macro target 40 (matches old inline form)', () => {
  const m = loadWorker({ initial: { climbing_ml: 50, physical_penalty: 2 } });
  m.fire('change:physical_penalty');
  const eff = Number(m.get('climbing_eml_eff'));
  assert.equal(evalTarget('ClimbingSkillCheck', { climbing_eml_eff: eff }, { 'Target Modifier?': 0 }), 40);
});

test('the combat-stats Dodge button uses the same centralized EML', () => {
  // both roll_DodgeCheck and roll_CombatDodgeCheck reference dodge_eml_eff now
  assert.equal(evalTarget('CombatDodgeCheck', { dodge_eml_eff: 29 }, { 'Target Modifier?': 0 }), 29);
});

// --- 2.2 repeating skills ---

test('repeating skill: per-row EML on ML change (combat = physical penalty)', () => {
  const m = loadWorker({ initial: { physical_penalty: 2 } });
  m.set('repeating_combatskill_combatskill_ml', 60);
  m.fire('change:repeating_combatskill:combatskill_ml');
  assert.equal(m.get('repeating_combatskill_combatskill_eml_eff'), '50'); // 60 - 10
});

test('repeating skill: fan-out on penalty change (lore = universal penalty)', () => {
  const m = loadWorker({ initial: { universal_penalty: 1 } });
  m.sections.loreskill = ['r1'];
  m.set('repeating_loreskill_r1_loreskill_ml', 40);
  m.fire('change:universal_penalty');
  assert.equal(m.get('repeating_loreskill_r1_loreskill_eml_eff'), '35'); // 40 - 5
});

test('repeating skill macro references the centralized EML', () => {
  assert.equal(evalTarget('CombatSkillCheck', { combatskill_eml_eff: 50 }, { 'Target Modifier?': 0 }), 50);
});

// --- 2.3 weapons ---

test('weapon EML: aml/dml/hm-attack from physical penalty (fan-out)', () => {
  const m = loadWorker({ initial: { physical_penalty: 2 } });
  m.sections.weapon = ['r1'];
  m.set('repeating_weapon_r1_weapon_aml', 70);
  m.set('repeating_weapon_r1_weapon_dml', 60);
  m.set('repeating_weapon_r1_weapon_hm', -5);
  m.fire('change:physical_penalty');
  assert.equal(m.get('repeating_weapon_r1_weapon_aml_eff'), '60');   // 70 - 10
  assert.equal(m.get('repeating_weapon_r1_weapon_dml_eff'), '50');   // 60 - 10
  assert.equal(m.get('repeating_weapon_r1_weapon_hmaml_eff'), '55'); // 70 + (-5) - 10
});

test('punch/kick EML from physical penalty', () => {
  const m = loadWorker({ initial: { punch_weapon_aml: 10, kick_weapon_aml: 12, physical_penalty: 2 } });
  m.fire('change:physical_penalty');
  assert.equal(m.get('punch_weapon_aml_eff'), '0');  // 10 - 10
  assert.equal(m.get('kick_weapon_aml_eff'), '2');   // 12 - 10
});

test('weapon attack/HM macros reference centralized EML', () => {
  assert.equal(evalTarget('WeaponAMLSkillCheck', { weapon_aml_eff: 60 }, { 'Target Modifier?': 0 }), 60);
  assert.equal(evalTarget('WeaponHMAMLSkillCheck', { weapon_hmaml_eff: 55 }, { 'Target Modifier?': 0 }), 55);
});

// --- 2.4 missiles (mounted -10 folded in) ---

test('missile EML = range AML - 5*PP - 10*mounted', () => {
  const m = loadWorker({ initial: { physical_penalty: 2, is_mounted: 1 } });
  m.sections.missileweapon = ['r1'];
  m.set('repeating_missileweapon_r1_missileweapon_short_aml', 50);
  m.fire('change:physical_penalty');
  assert.equal(m.get('repeating_missileweapon_r1_missileweapon_short_aml_eff'), '30'); // 50 - 10 - 10
});

test('missile macro references centralized EML', () => {
  assert.equal(evalTarget('MissileWeaponShortSkillCheck', { missileweapon_short_aml_eff: 30 }, { 'Target Modifier?': 0 }), 30);
});
