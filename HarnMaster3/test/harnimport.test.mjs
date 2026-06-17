// Tests for the !harnimport Mod's PURE mapping (mod/harnimport.js planFromHarnchar).
// Feeds it the REAL generator output (buildHarncharPC / buildHarncharCreature) so the importer
// is verified against what the generator actually emits, not just the prose contract.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import harnimport from '../mod/harnimport.js';
import { buildHarncharPC, buildHarncharCreature } from '../chargen/chargen.mjs';

const { planFromHarnchar, decodeNotes } = harnimport;
const attr = (plan, name) => plan.attrs.find((a) => a.name === name);
const rowsOf = (plan, section) => plan.rows.filter((r) => r.section === section);
const noteMatch = (plan, re) => plan.notes.some((n) => re.test(n));

test('version gating', () => {
  assert.equal(planFromHarnchar(null).ok, false);
  assert.equal(planFromHarnchar({}).ok, false);
  assert.equal(planFromHarnchar({ harnchar: 2 }).ok, false);
  assert.equal(planFromHarnchar({ harnchar: 1, character: {} }).ok, true);
});

test('PC: identity + attributes map to real sheet attrs; descriptors stay out of numeric fields', () => {
  const pc = buildHarncharPC({
    build: 'dist',
    houserules: { showPsyche: true, showMedical: true },
    identity: {
      name: 'Test PC', species: 'Human', culture: 'Feudal', socialClass: 'Serf', sunsign: 'Ulandus',
      gender: 'Male', occupation: 'Ostler', comeliness: 'Attractive', morality: 'Law-Abiding',
      frame: 'Medium', height: 70, weight: 160,
    },
    attributes: { str: 13, sta: 12, dex: 14, agl: 11, eye: 10, hrg: 10, sml: 10, voi: 10, int: 12, aur: 9, wil: 13, cml: 14, moral: 11 },
    skills: [
      { name: 'Sword', ml: 45, section: 'combatskill' },
      { name: 'Awareness', ml: 60, section: 'communicationskill' },
      { name: 'Hidework', ml: 40, section: 'loreskill' },
    ],
    psyche: [{ trait: 'phobia', severity: 3 }],
    medical: [{ trait: 'Scars' }],
    religion: { deity: 'Larani', piety: 5 },
    honor: { value: 12 },
    gear: { wealthLevel: 'Average', funds: 120, equipment: 'a worn sword' },
  });

  const plan = planFromHarnchar(pc);
  assert.equal(plan.ok, true);
  assert.equal(plan.kind, 'pc');
  assert.equal(plan.name, 'Test PC');

  // identity → bio attrs
  assert.equal(attr(plan, 'species').current, 'Human');
  assert.equal(attr(plan, 'social_class').current, 'Serf');
  assert.equal(attr(plan, 'sunsign').current, 'Ulandus');
  assert.equal(attr(plan, 'frame').current, 'Medium');
  assert.equal(attr(plan, 'weight').current, 160);

  // attribute scores (incl. the numeric cml/moral)
  assert.equal(attr(plan, 'str').current, 13);
  assert.equal(attr(plan, 'cml').current, 14);
  assert.equal(attr(plan, 'moral').current, 11);

  // the descriptor strings must NOT have been written into any attribute
  assert.ok(!plan.attrs.some((a) => a.current === 'Attractive'), 'comeliness descriptor not written as an attr');
  assert.ok(!plan.attrs.some((a) => a.current === 'Law-Abiding'), 'morality descriptor not written as an attr');
  // …they land in notes instead
  assert.ok(noteMatch(plan, /Comeliness: Attractive \(CML 14\)/));
  assert.ok(noteMatch(plan, /Morality: Law-Abiding \(MOR 11\)/));

  // occupation has no sheet attr → notes
  assert.ok(!attr(plan, 'occupation'), 'no occupation attr (gap)');
  assert.ok(noteMatch(plan, /Occupation: Ostler/));
});

test('PC: skills become the right repeating sections; SB omitted for sheet auto-calc', () => {
  const pc = buildHarncharPC({
    identity: { name: 'S' },
    attributes: { str: 12 },
    skills: [
      { name: 'Sword', ml: 45, section: 'combatskill' },
      { name: 'Awareness', ml: 60, section: 'communicationskill' },
      { name: 'Hidework', ml: 40, section: 'loreskill' },
    ],
  });
  const plan = planFromHarnchar(pc);

  const combat = rowsOf(plan, 'repeating_combatskill');
  assert.equal(combat.length, 1);
  assert.equal(combat[0].fields.combatskill_name, 'Sword');
  assert.equal(combat[0].fields.combatskill_ml, 45);
  assert.ok(!('combatskill_sb' in combat[0].fields), 'SB omitted → sheet computes it');

  assert.equal(rowsOf(plan, 'repeating_communicationskill')[0].fields.communicationskill_name, 'Awareness');
  assert.equal(rowsOf(plan, 'repeating_loreskill')[0].fields.loreskill_ml, 40);
});

test('PC: religion seeds a piety row + ritual_religion', () => {
  const pc = buildHarncharPC({ identity: { name: 'R' }, religion: { deity: 'Peoni', piety: 3 } });
  const plan = planFromHarnchar(pc);
  assert.equal(attr(plan, 'ritual_religion').current, 'Peoni');
  const piety = rowsOf(plan, 'repeating_piety');
  assert.equal(piety[0].fields.piety_name, 'Peoni');
  assert.equal(piety[0].fields.piety_points, 3);
});

test('PC: psyche/medical/honor parked in notes (no sheet home yet)', () => {
  const pc = buildHarncharPC({
    identity: { name: 'N' }, houserules: { showPsyche: true, showMedical: true },
    psyche: [{ trait: 'phobia', severity: 4, subject: 'fire' }], medical: [{ trait: 'Limp' }], honor: { value: 9 },
  });
  const plan = planFromHarnchar(pc);
  assert.ok(noteMatch(plan, /Psyche: phobia.*severity 4.*fire/));
  assert.ok(noteMatch(plan, /Medical: Limp/));
  assert.ok(noteMatch(plan, /Honor: 9/));
});

test('creature: attributes set; stat block parked in notes with a Phase-7 warning', () => {
  const cr = buildHarncharCreature({
    name: 'Lion', archetype: 'quadruped', attributes: { str: 20, sta: 16, agl: 16 },
    derived: { move: 36 }, attacks: [{ name: 'Bite', ml: 85, impact: 6, aspect: 'p' }],
    armorNatural: 'Hide', hitLocations: [], skills: [{ name: 'Awareness', ml: 70 }], specialQualities: ['Pounce'],
  });
  const plan = planFromHarnchar(cr);
  assert.equal(plan.kind, 'creature');
  assert.equal(plan.name, 'Lion');
  assert.equal(attr(plan, 'str').current, 20);
  assert.ok(noteMatch(plan, /Archetype: quadruped/));
  assert.ok(noteMatch(plan, /Attack: Bite.*ML 85.*impact 6.*aspect p/));
  assert.ok(noteMatch(plan, /Move: 36/));
  assert.ok(noteMatch(plan, /Natural armor: Hide/));
  assert.ok(noteMatch(plan, /Special: Pounce/));
  assert.ok(plan.warnings.length >= 1, 'creature import carries a Phase-7 limitation warning');
});

test('decodeNotes strips Roll20 handout HTML + entities back to raw JSON', () => {
  const html = '<p>{&quot;harnchar&quot;:1,&quot;kind&quot;:&quot;pc&quot;}</p>';
  assert.equal(decodeNotes(html), '{"harnchar":1,"kind":"pc"}');
  assert.deepEqual(JSON.parse(decodeNotes(html)), { harnchar: 1, kind: 'pc' });
});
