// Phase 9 — attacker-side combat helpers.
// A/1 (hybrid): attack/defense rolls read the Combat Modifiers panel (combat_aim_mod /
// combat_prone / combat_close — pure HM3 mechanics: aim -10, opponent prone +20, close -10)
// and keep a single "Other modifier?" popup for one-offs (incl. outnumbering). Target is
// clamp(eml_eff + panel sum + Other) to [5,95]. These tests drive the macro evaluator with
// store values (the panel attrs); live UX is in the in-VTT plan (TESTPLAN-phase9.md).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evalTarget, getRollMacro } from '../testkit/roll-eval.mjs';
import { loadWorker } from '../testkit/harness.mjs';

// --- the panel's Aim worker derives the attack EML modifier from the zone ---

test('aim worker: High/Low -> combat_aim_mod -10, Mid -> 0', () => {
  for (const [zone, mod] of [['high', '-10'], ['low', '-10'], ['mid', '0']]) {
    const m = loadWorker({ initial: { combat_aim: zone } });
    m.fire('change:combat_aim');
    assert.equal(m.get('combat_aim_mod'), mod, `aim ${zone}`);
  }
});

// --- defaults preserve old behavior (empty panel = no modifier) ---

test('attack: empty panel leaves target = eml_eff (regression)', () => {
  assert.equal(evalTarget('WeaponAMLSkillCheck', { weapon_aml_eff: 60 }, {}), 60);
});

test('defense: empty panel leaves target = eml_eff (regression)', () => {
  assert.equal(evalTarget('WeaponDMLSkillCheck', { weapon_dml_eff: 50 }, {}), 50);
});

test('missile: empty panel leaves target = eml_eff (regression)', () => {
  assert.equal(evalTarget('MissileWeaponShortSkillCheck', { missileweapon_short_aml_eff: 30 }, {}), 30);
});

// --- attack reads the panel ---

test('attack: Aim High (combat_aim_mod -10)', () => {
  assert.equal(evalTarget('WeaponAMLSkillCheck', { weapon_aml_eff: 60, combat_aim_mod: -10 }), 50);
});

test('attack: Opponent Prone (combat_prone +20)', () => {
  assert.equal(evalTarget('WeaponAMLSkillCheck', { weapon_aml_eff: 60, combat_prone: 20 }), 80);
});

test('attack: Close Mode (combat_close -10)', () => {
  assert.equal(evalTarget('WeaponAMLSkillCheck', { weapon_aml_eff: 60, combat_close: -10 }), 50);
});

test('attack: aim High (-10) + prone (+20) net +10', () => {
  assert.equal(evalTarget('WeaponAMLSkillCheck', { weapon_aml_eff: 60, combat_aim_mod: -10, combat_prone: 20 }), 70);
});

test('attack: Other-modifier popup still works (e.g. one-off -7)', () => {
  assert.equal(evalTarget('WeaponAMLSkillCheck', { weapon_aml_eff: 60 }, { 'Other modifier?': -7 }), 53);
});

test('attack: the Modifier display field shows the same net sum', () => {
  assert.equal(evalTarget('WeaponAMLSkillCheck', { weapon_aml_eff: 60, combat_aim_mod: -10, combat_prone: 20 },
    {}, 'Modifier'), 10);
});

// --- defense reads Prone + Close (no Aim); outnumbering goes through Other ---

test('defense: outnumbering handled via the Other popup (e.g. -20)', () => {
  assert.equal(evalTarget('WeaponDMLSkillCheck', { weapon_dml_eff: 50 }, { 'Other modifier?': -20 }), 30);
});

test('defense: prone +20 from the panel', () => {
  assert.equal(evalTarget('WeaponDMLSkillCheck', { weapon_dml_eff: 50, combat_prone: 20 }), 70);
});

test('defense: panel close (-10) + Other (-30 outnumber) clamps at 5', () => {
  assert.equal(evalTarget('CombatDodgeCheck', { dodge_eml_eff: 20, combat_close: -10 },
    { 'Other modifier?': -30 }), 5); // 20 -10 -30 = -20 -> 5
});

test('defense: does NOT read Aim (combat_aim_mod ignored)', () => {
  assert.equal(evalTarget('WeaponDMLSkillCheck', { weapon_dml_eff: 50, combat_aim_mod: -10 }), 50);
});

// --- missile reads Aim + Prone (no Close) ---

test('missile: Aim Low (-10)', () => {
  assert.equal(evalTarget('MissileWeaponShortSkillCheck', { missileweapon_short_aml_eff: 30, combat_aim_mod: -10 }), 20);
});

test('missile: prone +20; ignores Close', () => {
  assert.equal(evalTarget('MissileWeaponShortSkillCheck',
    { missileweapon_short_aml_eff: 30, combat_prone: 20, combat_close: -10 }), 50);
});

// --- clamp still applies on the high end ---

test('attack: prone (+20) on a high EML clamps at 95', () => {
  assert.equal(evalTarget('WeaponAMLSkillCheck', { weapon_aml_eff: 90, combat_prone: 20 }), 95);
});

// Note: Damage + Strike Location now live on the per-weapon "Dmg" action button (and the
// Combat Modifiers panel), not a standalone button. The aspect/location logic is unit-tested
// in phase9-tables.test.mjs; the standalone Strike-Location/Damage buttons were removed.
