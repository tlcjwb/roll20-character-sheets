// Tests for the chargen table engine (chargen/tables.mjs) + the real tables.json.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mergeTables, rollOnTable, lookupByValue, sunsignFor, dayOfYear, TABLE_LAYERS } from '../chargen/tables.mjs';

const TABLES = JSON.parse(readFileSync('chargen/tables.json', 'utf8'));
const at = (id) => mergeTables([TABLES]).tables.get(id);
const constRng = (v) => () => v; // roll = 1 + floor(v*sides)

test('TABLE_LAYERS order', () => assert.deepEqual(TABLE_LAYERS, ['public', 'private', 'homebrew']));

test('mergeTables deep-merges by id and tracks sources', () => {
  const homebrew = { _meta: { layer: 'homebrew' }, tables: { species: { note: 'house tweak' } } };
  const m = mergeTables([TABLES, homebrew]);
  const sp = m.tables.get('species');
  assert.equal(sp.entries.length, 4, 'entries inherited from public');
  assert.equal(sp.note, 'house tweak', 'homebrew field merged on top');
  assert.deepEqual(sp.sources.sort(), ['4001', 'homebrew']);
});

test('rollOnTable finds the range entry; mod shifts the roll (clamped)', () => {
  assert.equal(rollOnTable(at('species'), constRng(0.5)).entry.result, 'Human');   // roll 51
  assert.equal(rollOnTable(at('siblingRank'), constRng(0)).entry.result, 'Eldest'); // roll 1
  // estrangement: roll 8 (+5 eldest mod) = 13 → Unpopular
  const r = rollOnTable(at('estrangement'), constRng(0.07), 5);
  assert.equal(r.roll, 8); assert.equal(r.value, 13); assert.equal(r.entry.result, 'Unpopular');
});

test('lookupByValue', () => {
  assert.equal(lookupByValue(at('parent'), 65).result, 'Fostered');
  assert.equal(lookupByValue(at('parent'), 95).result, 'Orphan');
});

test('parent table wires sub-tables', () => {
  assert.equal(lookupByValue(at('parent'), 25).sub, 'parentOffspring');
  assert.equal(lookupByValue(at('parent'), 95).sub, 'parentOrphan');
  assert.equal(at('parentOffspring').entries[0].result, 'Both parents alive, living together');
});

test('sunsignFor derives sign from birthdate, incl. the book cusp example', () => {
  const signs = at('sunsign').signs;
  assert.equal(dayOfYear(1, 15), 15);
  assert.equal(sunsignFor(1, 15, signs).sign, 'Ulandus');     // 15 Nuzyael
  assert.equal(sunsignFor(6, 1, signs).sign, 'Angberelius');  // 1 Agrazhar (doy 151)
  // 1st of Ilvin (month 10, day 1 → doy 271) = Tai, on the Tai-Skorus cusp (book example)
  const ilvin1 = sunsignFor(10, 1, signs);
  assert.equal(ilvin1.sign, 'Tai');
  assert.equal(ilvin1.cusp, 'Skorus');
  // Lado wraps the year end (doy 332..360, 1..3)
  assert.equal(sunsignFor(12, 15, signs).sign, 'Lado');
  assert.equal(sunsignFor(1, 2, signs).sign, 'Lado');
});

test('occupationGen Feudal column tiles 1..100 within each class', () => {
  const g = at('occupationGen');
  for (const cls of ['Slave', 'Serf', 'Unguilded', 'Guilded', 'Noble']) {
    for (let v = 1; v <= 100; v++) assert.ok(g.byClass[cls].some((e) => e.r.Feudal && v >= e.r.Feudal[0] && v <= e.r.Feudal[1]), `${cls} Feudal gap at ${v}`);
  }
});

test('occupationGen non-Feudal culture columns transcribed', () => {
  const g = at('occupationGen');
  const find = (cls, cul, v) => g.byClass[cls].find((e) => e.r[cul] && v >= e.r[cul][0] && v <= e.r[cul][1]);
  assert.equal(find('Unguilded', 'Tribal', 50).id, 'hunter-trapper'); // Tribal 41-100
  assert.equal(find('Guilded', 'Sindarin', 64).id, 'mage-shek-pvar'); // Sindarin 64-68
  assert.equal(find('Slave', 'Imperial', 99).id, 'gladiator');        // Imperial 99-100
  assert.equal(find('Noble', 'Tribal', 50), undefined);               // chieftain DISABLED (no 4001 bundle — Tribal-noble hole)
  assert.equal(g.byClass.Guilded.filter((e) => e.r.Tribal).length, 0); // no guilded in tribal culture
  // Pattern C: the Unguilded laborer slot now offers BOTH laborer + longshoreman (player picks)
  assert.deepEqual(find('Unguilded', 'Feudal', 75).ids, ['laborer', 'longshoreman']);
});

test('familyWealth lookup by class × level', () => {
  const fw = at('familyWealth');
  assert.equal(fw.byClass.Serf.Average, 80);
  assert.equal(fw.byClass.Noble.Rich, 2400);
  assert.equal(fw.byClass.Guilded.Poor, 90);
});

test('medical table: male and female columns each tile 1..100', () => {
  const med = at('medical');
  for (let v = 1; v <= 100; v++) {
    assert.ok(med.entries.some((e) => v >= e.mlo && v <= e.mhi), `male gap at ${v}`);
    assert.ok(med.entries.some((e) => v >= e.flo && v <= e.fhi), `female gap at ${v}`);
  }
});

test('every range table tiles 1..100 with no gaps/overlaps', () => {
  for (const id of ['species', 'socialClass', 'siblingRank', 'parent', 'parentOffspring', 'parentOrphan', 'clanhead', 'estrangement', 'psyche', 'psycheSeverity', 'sexuality', 'complexion', 'hairColor', 'eyeColor']) {
    const t = at(id);
    for (let v = 1; v <= 100; v++) assert.ok(lookupByValue(t, v), `${id} has no entry for ${v}`);
  }
});
