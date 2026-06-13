// Phase 1 — de-duplicated derived state. Verifies the move/initiative/riding
// handlers now read the precomputed physical_penalty (behaviour-preserving), and
// locks in the mounted halving (encumbrance & fatigue) so the refactor can't drift it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadWorker } from '../testkit/harness.mjs';

test('combat move = AGL - Physical Penalty (reads physical_penalty)', () => {
  const m = loadWorker({ initial: { agl: 14, physical_penalty: 3, is_mounted: 0 } });
  m.fire('change:physical_penalty');
  assert.equal(m.get('combat_move'), '11'); // 14 - 3
});

test('combat move floored at 1', () => {
  const m = loadWorker({ initial: { agl: 4, physical_penalty: 9, is_mounted: 0 } });
  m.fire('change:physical_penalty');
  assert.equal(m.get('combat_move'), '1'); // max(4-9, 1)
});

test('combat initiative = ML - 5 x Physical Penalty (reads physical_penalty)', () => {
  const m = loadWorker({ initial: { initiative_ml: 50, physical_penalty: 2, is_mounted: 0 } });
  m.fire('change:physical_penalty');
  assert.equal(m.get('combat_initiative'), '40'); // 50 - 5*2
});

test('mounted halves rider encumbrance  [Combat 20]', () => {
  const base = { hrcondition4endurance: 2, combat_effectivecondition: 12, load_inventory_total: 36 };
  const foot = loadWorker({ initial: { ...base, is_mounted: 0 } });
  foot.fire('change:load_inventory_total');
  assert.equal(foot.get('encumbrance'), '3'); // floor(36/12)

  const horse = loadWorker({ initial: { ...base, is_mounted: 1 } });
  horse.fire('change:load_inventory_total');
  assert.equal(horse.get('encumbrance'), '2'); // round(3/2)
});

test('mounted halves rider fatigue in Universal Penalty  [Combat 20]', () => {
  const m = loadWorker({ initial: {
    injury_total: 0, fatigue_total: 2, encumbrance: 2, is_mounted: 1, hrfumblestumblepenalty: 0,
  } });
  m.fire('change:injury_total');
  assert.equal(m.get('universal_penalty'), '1'); // inj 0 + round(2/2)
  assert.equal(m.get('physical_penalty'), '3');  // enc 2 + UP 1
});
