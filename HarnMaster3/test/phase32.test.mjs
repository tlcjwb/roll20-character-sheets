// Phase 3.2 — ML defaults to OML (SB × multiplier) for a recognised skill with no ML.
// Base canon, ungated; only fills ML 0; skips specialties (Phase 11 seeds those from the base).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadWorker } from '../testkit/harness.mjs';

// --- repeating skills ---
function rep(init) {
  const m = loadWorker({ initial: init });
  m.sections.combatskill = ['r1'];
  m.fire('change:repeating_combatskill:combatskill_sb');
  return m;
}

test('recognised skill with ML 0 seeds ML = SB × OML (Sword SB12 → 36)', () => {
  const m = rep({ repeating_combatskill_r1_combatskill_name: 'Sword',
    repeating_combatskill_r1_combatskill_sb: 12, repeating_combatskill_r1_combatskill_ml: 0 });
  assert.equal(m.get('repeating_combatskill_r1_combatskill_ml'), '36'); // Sword OML = SB×3
});

test('does not clobber an ML that is already set', () => {
  const m = rep({ repeating_combatskill_r1_combatskill_name: 'Sword',
    repeating_combatskill_r1_combatskill_sb: 12, repeating_combatskill_r1_combatskill_ml: 60 });
  assert.equal(m.get('repeating_combatskill_r1_combatskill_ml'), '60');
});

test('skips a specialty row (it opens at the base ML via Phase 11, not its own OML)', () => {
  const m = rep({ repeating_combatskill_r1_combatskill_name: 'Sword (Broadsword)',
    repeating_combatskill_r1_combatskill_sb: 12, repeating_combatskill_r1_combatskill_ml: 0 });
  assert.equal(m.get('repeating_combatskill_r1_combatskill_ml'), '0');
});

test('unrecognised skill is left alone', () => {
  const m = rep({ repeating_combatskill_r1_combatskill_name: 'Flummox',
    repeating_combatskill_r1_combatskill_sb: 12, repeating_combatskill_r1_combatskill_ml: 0 });
  assert.equal(m.get('repeating_combatskill_r1_combatskill_ml'), '0');
});

test('no SB yet → no seed', () => {
  const m = rep({ repeating_combatskill_r1_combatskill_name: 'Sword',
    repeating_combatskill_r1_combatskill_sb: 0, repeating_combatskill_r1_combatskill_ml: 0 });
  assert.equal(m.get('repeating_combatskill_r1_combatskill_ml'), '0');
});

// --- fixed skills ---
test('fixed skill seeds ML from OML (Climbing SB10 → 40)', () => {
  const m = loadWorker({ initial: { climbing_sb: 10, climbing_ml: 0 } });
  m.fire('change:climbing_sb');
  assert.equal(m.get('climbing_ml'), '40'); // Climbing OML = SB×4
});

test('fixed skill: Condition SB12 → 60 (SB×5)', () => {
  const m = loadWorker({ initial: { condition_sb: 12, condition_ml: 0 } });
  m.fire('change:condition_sb');
  assert.equal(m.get('condition_ml'), '60');
});
