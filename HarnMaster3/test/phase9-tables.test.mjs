// Phase 9 (v3.2.1) — embedded combat rule-data tables, tested through the real worker.
//   - Strike Location (Combat 13 / Combat Tables p.169): d100 + aim -> location, sided,
//     with a Face sub-roll. Owner-confirmed as rule data (not protected expression).
//   - Missile Data (Combat 16): exact per-weapon range hexes + impact, replacing the
//     -1/band approximation for recognised weapons.
// The mapping is the error-prone part, so it is exhaustively unit-tested here; the dice
// rolls (action button / startRoll) are in the in-VTT plan.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadWorker } from '../testkit/harness.mjs';

// helper: set roll + aim (+ optional face roll), fire, read the computed location
function locate(roll, aim, faceRoll) {
  const init = { strike_aim: aim, strike_roll: roll };
  if (faceRoll !== undefined) init.strike_face_roll = faceRoll;
  const m = loadWorker({ initial: init });
  m.fire('change:strike_roll');
  return m.get('strike_location_result');
}

// ---------- Strike Location: MID column (all 16 locations) ----------

test('mid: range boundaries map to the right location', () => {
  assert.equal(locate(5, 'mid'), 'Skull');
  assert.equal(locate(11, 'mid'), 'Neck');
  assert.equal(locate(44, 'mid'), 'Thorax');
  assert.equal(locate(70, 'mid'), 'Abdomen');
  assert.equal(locate(71, 'mid'), 'Groin');
});

test('mid: sided locations use odd=left / even=right', () => {
  assert.equal(locate(16, 'mid'), 'right Shoulder'); // 16 even
  assert.equal(locate(27, 'mid'), 'left Shoulder');  // 27 odd
  assert.equal(locate(35, 'mid'), 'left Elbow');     // 35 odd
  assert.equal(locate(36, 'mid'), 'right Forearm');  // 36 even
  assert.equal(locate(97, 'mid'), 'left Foot');      // 97 odd
  assert.equal(locate(100, 'mid'), 'right Foot');    // 100 even
});

test('mid: non-sided locations have no side', () => {
  assert.equal(locate(60, 'mid'), 'Thorax');
  assert.equal(locate(74, 'mid'), 'Groin');
});

// ---------- HIGH column (Skull..Abdomen) ----------

test('high: boundaries', () => {
  assert.equal(locate(15, 'high'), 'Skull');
  assert.equal(locate(16, 'high'), 'Face');
  assert.equal(locate(46, 'high'), 'right Shoulder'); // 46 even
  assert.equal(locate(96, 'high'), 'Abdomen');
  assert.equal(locate(100, 'high'), 'Abdomen');
});

// ---------- LOW column (Forearm..Foot) ----------

test('low: boundaries', () => {
  assert.equal(locate(1, 'low'), 'left Forearm');   // 1 odd
  assert.equal(locate(6, 'low'), 'right Forearm');  // 6 even
  assert.equal(locate(30, 'low'), 'Groin');
  assert.equal(locate(70, 'low'), 'right Thigh');   // 70 even
  assert.equal(locate(93, 'low'), 'left Foot');     // 93 odd
});

// ---------- Face sub-roll ----------

test('face: uses the face sub-roll and its parity for the side', () => {
  assert.equal(locate(6, 'mid', 1), 'Face: Jaw');         // mid 6 -> Face; face 1 -> Jaw
  assert.equal(locate(6, 'mid', 16), 'Face: right Eye');  // face 16 even -> right
  assert.equal(locate(6, 'mid', 31), 'Face: left Cheek'); // face 31 odd -> left
  assert.equal(locate(6, 'mid', 66), 'Face: Nose');
  assert.equal(locate(6, 'mid', 100), 'Face: Mouth');
});

test('face: with no sub-roll yet, returns plain Face', () => {
  assert.equal(locate(6, 'mid', 0), 'Face');
});

// ---------- robustness + coverage ----------

test('out-of-range roll yields empty', () => {
  assert.equal(locate(0, 'mid'), '');
  assert.equal(locate(101, 'mid'), '');
});

test('every column is a complete 1-100 partition (no gaps)', () => {
  for (const aim of ['mid', 'high', 'low']) {
    for (let r = 1; r <= 100; r++) {
      const loc = locate(r, aim, 1); // face sub-roll provided so Face resolves
      assert.ok(loc && loc.length, `aim ${aim} roll ${r} produced no location`);
    }
  }
});

// ---------- Missile Data table ----------

function missile(name, ml, p) {
  const init = { repeating_missileweapon_missileweapon_ml: ml };
  if (name !== undefined) init.repeating_missileweapon_missileweapon_name = name;
  if (p !== undefined) init.repeating_missileweapon_missileweapon_p = p;
  const m = loadWorker({ initial: init });
  m.fire('change:repeating_missileweapon:missileweapon_name');
  const g = (k) => Number(m.get('repeating_missileweapon_missileweapon_' + k));
  return {
    dmg: [g('short_dmg'), g('medium_dmg'), g('long_dmg'), g('extreme_dmg')],
    range: [g('short'), g('medium'), g('long'), g('extreme')],
    aml: [g('short_aml'), g('medium_aml'), g('long_aml'), g('extreme_aml')],
  };
}

test('missile: Staff-sling now matches the book (extreme 3, was 2 under the old approximation)', () => {
  const r = missile('Staff-sling', 50);
  assert.deepEqual(r.dmg, [5, 4, 3, 3]);   // the fixed deviation
  assert.deepEqual(r.range, [25, 50, 100, 200]);
});

test('missile: Shortbow exact range hexes + impact', () => {
  const r = missile('Shortbow', 60);
  assert.deepEqual(r.dmg, [6, 5, 4, 3]);
  assert.deepEqual(r.range, [20, 40, 80, 160]);
  assert.deepEqual(r.aml, [60, 40, 20, -20]); // ml, ml-20, ml-40, ml-80
});

test('missile: name lookup is case/spacing tolerant', () => {
  assert.deepEqual(missile('  LONGBOW  ', 50).dmg, [8, 7, 6, 5]);
});

test('missile: unknown/homebrew weapon still uses the -1/band approximation', () => {
  const r = missile('Chakram', 50, 8); // not in the table; base impact 8
  assert.deepEqual(r.dmg, [8, 7, 6, 5]); // 8, 8-1, max(6,4), max(5,4)
});

// ---------- per-weapon Damage + Strike Location (melee) ----------
// Fires the repeating action button with a realistic row sourceAttribute and inspects the
// captured startRoll template. chooseAspect is the tested logic; the location d100 is random
// (we only assert its shape), and the damage is a real inline roll.

function weaponDamageTemplate(b, e, p, preferred, name) {
  const pre = 'repeating_weapon_-r1_';
  const init = { combat_aspect: preferred, combat_aim: 'mid' };
  init[pre + 'weapon_b'] = b; init[pre + 'weapon_e'] = e; init[pre + 'weapon_p'] = p;
  if (name !== undefined) init[pre + 'weapon_name'] = name;
  const m = loadWorker({ initial: init });
  m.emit('clicked:repeating_weapon:weapondamage', { sourceAttribute: pre + 'weapondamage' });
  assert.equal(m.rolls.length, 1, 'exactly one startRoll');
  return m.rolls[0].template;
}

test('aspect: a single present aspect is used', () => {
  assert.match(weaponDamageTemplate(0, 0, 8, 'default'), /Aspect=Point \(8\)/);
});

test('aspect: multiple present -> highest impact by default', () => {
  assert.match(weaponDamageTemplate(5, 8, 3, 'default'), /Aspect=Edge \(8\)/);
});

test('aspect: preferred aspect is used when present', () => {
  assert.match(weaponDamageTemplate(5, 8, 3, 'b'), /Aspect=Blunt \(5\)/);
});

test('aspect: preferred absent -> falls back to highest present', () => {
  assert.match(weaponDamageTemplate(5, 0, 3, 'e'), /Aspect=Blunt \(5\)/); // Edge absent; B5 > P3
});

test('damage: rolls the chosen impact + Nd6 (N from a popup)', () => {
  assert.match(weaponDamageTemplate(5, 8, 3, 'default'), /\?\{Strike dice[^}]*\}d6 \+ 8/);
});

test('location: line shows aim, a d100, and a resolved location', () => {
  assert.match(weaponDamageTemplate(5, 0, 0, 'default', 'Mace'), /Location=mid \(d\d+\) -> \S/);
});

// ---------- Damage + Location replicated to Punch/Kick/Trample/Missile ----------

function fixedDamageTemplate(kind, b, e, p, preferred) {
  const init = { combat_aspect: preferred, combat_aim: 'mid' };
  init[kind + '_weapon_b'] = b; init[kind + '_weapon_e'] = e; init[kind + '_weapon_p'] = p;
  const m = loadWorker({ initial: init });
  m.emit('clicked:' + kind + 'damage', { sourceAttribute: kind + 'damage' });
  assert.equal(m.rolls.length, 1);
  return m.rolls[0].template;
}

test('punch: uses chooseAspect (single Blunt)', () => {
  assert.match(fixedDamageTemplate('punch', 3, 0, 0, 'default'), /Aspect=Blunt \(3\)/);
});

test('kick: multiple aspects -> highest by default', () => {
  assert.match(fixedDamageTemplate('kick', 4, 6, 0, 'default'), /Aspect=Edge \(6\)/);
});

test('trample: reads trample_weapon_b/e/p; preferred Point when present', () => {
  const m = loadWorker({ initial: { trample_weapon_b: 5, trample_weapon_e: 0, trample_weapon_p: 4, combat_aspect: 'p', combat_aim: 'mid', htrample_name: 'Trample' } });
  m.emit('clicked:trampledamage', { sourceAttribute: 'trampledamage' });
  assert.match(m.rolls[0].template, /Aspect=Point \(4\)/);
});

// Per-range missile dice: each range's die rolls that range's impact directly (no prompt).
function missileRangeTemplate(range, dmg) {
  const pre = 'repeating_missileweapon_-m1_';
  const init = { combat_aim: 'mid' };
  init[pre + 'missileweapon_name'] = 'Shortbow';
  init[pre + 'missileweapon_aspect'] = 'P';
  init[pre + 'missileweapon_' + range + '_dmg'] = dmg;
  const m = loadWorker({ initial: init });
  m.emit('clicked:repeating_missileweapon:missile' + range + 'dmg', { sourceAttribute: pre + 'missile' + range + 'dmg' });
  assert.equal(m.rolls.length, 1);
  return m.rolls[0].template;
}

test('missile: each range die uses that range impact directly (no Range prompt)', () => {
  const tShort = missileRangeTemplate('short', 6);
  assert.match(tShort, /Short strike/);
  assert.match(tShort, /Aspect=P \(6\)/);
  assert.match(tShort, /\?\{Strike dice[^}]*\}d6 \+ 6/);
  assert.ok(!/\?\{Range/.test(tShort), 'no range prompt');

  assert.match(missileRangeTemplate('extreme', 3), /Extreme strike[\s\S]*Aspect=P \(3\)/);
  assert.match(missileRangeTemplate('long', 4), /Long strike[\s\S]*\+ 4\]\]/);
});
