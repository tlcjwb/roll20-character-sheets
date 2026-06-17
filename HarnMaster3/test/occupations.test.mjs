// Tests for the chargen occupation engine (chargen/occupations.mjs). Inline, self-contained fixtures.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mergeOccupations, resolveOccupation, lintOccupations, LAYERS } from '../chargen/occupations.mjs';

const publicFile = {
  _meta: { layer: 'public' },
  occupations: [
    { id: 'ostler', name: 'Ostler', category: 'guilded', years: 5, source: '4001', selectable: true,
      skills: [{ name: 'Horsecraft', oml: 4 }, { name: 'Riding', oml: 4 }, { name: 'Hidework', oml: 4 }] },
    { id: 'farmer', name: 'Farmer', category: 'unguilded', years: 4, source: '4001', selectable: true,
      skills: [{ name: 'Agriculture', oml: 4 }] },
  ],
  specializations: [],
};
const privateFile = {
  _meta: { layer: 'private' },
  occupations: [
    // augments the 4001 ostler WITHOUT restating skills
    { id: 'ostler', source: '4823', guilded: 'Mangai', optionPointOptions: ['Physician (Veterinary)'] },
  ],
  specializations: [
    { id: 'farrier', of: 'ostler', source: '4823', name: 'Farrier',
      skills: [{ name: 'Metalcraft', oml: 3 }], skillEmphasis: ['Horsecraft', 'Physician'] },
  ],
};

test('mergeOccupations deep-merges by id (augment, not replace) and inherits omitted fields', () => {
  const m = mergeOccupations([publicFile, privateFile]);
  const o = m.occupations.get('ostler');
  assert.equal(o.skills.length, 3, 'skill bundle inherited from 4001 (private omitted it)');
  assert.equal(o.guilded, 'Mangai', 'guild added by 4823');
  assert.deepEqual(o.optionPointOptions, ['Physician (Veterinary)']);
});

test('mergeOccupations accumulates sources across layers', () => {
  const m = mergeOccupations([publicFile, privateFile]);
  assert.deepEqual(m.occupations.get('ostler').sources.sort(), ['4001', '4823']);
  assert.deepEqual(m.occupations.get('farmer').sources, ['4001']);
});

test('homebrew precedence: same id overrides a field; distinct id is a separate entry', () => {
  const homebrew = { _meta: { layer: 'homebrew' }, occupations: [
    { id: 'ostler', source: 'homebrew', years: 6 },                          // override one field
    { id: 'ostler-hr', name: 'Ostler (HR)', source: 'homebrew', selectable: true, skills: [{ name: 'Horsecraft', oml: 5 }] },
  ] };
  const m = mergeOccupations([publicFile, privateFile, homebrew]);
  assert.equal(m.occupations.get('ostler').years, 6, 'homebrew wins last');
  assert.equal(m.occupations.get('ostler').skills.length, 3, 'still inherits base skills');
  assert.ok(m.occupations.has('ostler-hr'), 'distinct id = separate selectable option');
  assert.deepEqual(m.occupations.get('ostler').sources.sort(), ['4001', '4823', 'homebrew']);
});

test('resolveOccupation lists specializations and folds a chosen one into the bundle', () => {
  const m = mergeOccupations([publicFile, privateFile]);
  const base = resolveOccupation(m, 'ostler');
  assert.deepEqual(base.availableSpecializations, ['farrier']);
  const farrier = resolveOccupation(m, 'ostler', { specialization: 'farrier' });
  assert.ok(farrier.skills.some((s) => s.name === 'Metalcraft' && s.oml === 3), 'specialization skill folded in');
  assert.ok(farrier.skills.some((s) => s.name === 'Horsecraft'), 'base skills retained');
  assert.equal(farrier.appliedSpecialization, 'farrier');
});

test('resolveOccupation throws on unknown id / wrong-parent specialization', () => {
  const m = mergeOccupations([publicFile, privateFile]);
  assert.throws(() => resolveOccupation(m, 'nope'), /unknown occupation/);
  assert.throws(() => resolveOccupation(m, 'farmer', { specialization: 'farrier' }), /not of "farmer"/);
});

test('lintOccupations passes clean files and flags bad oml / dangling specialization / dup id', () => {
  assert.deepEqual(lintOccupations([publicFile, privateFile]).errors, []);
  const bad = { _meta: { layer: 'homebrew' }, occupations: [
    { id: 'x', skills: [{ name: 'Y', oml: 'four' }] }, { id: 'x' },
  ], specializations: [{ id: 's', of: 'ghost' }] };
  const { errors } = lintOccupations([bad]);
  assert.ok(errors.some((e) => e.includes('non-numeric oml')));
  assert.ok(errors.some((e) => e.includes('duplicate occupation id "x"')));
  assert.ok(errors.some((e) => e.includes('missing occupation "ghost"')));
});

test('LAYERS is the documented precedence order', () => {
  assert.deepEqual(LAYERS, ['public', 'private', 'homebrew']);
});

test('extends: child inherits parent skills + adds its own (knight-bailiff → knight-bachelor)', () => {
  const files = [{ _meta: { layer: 'public' }, occupations: [
    { id: 'knight-bachelor', name: 'Knight Bachelor', source: '4001', skills: [{ name: 'Riding', oml: 6 }, { name: 'Sword', oml: 5 }] },
    { id: 'knight-bailiff', name: 'Knight/Bailiff', extends: 'knight-bachelor', source: '4001', skills: [{ name: 'Law', oml: 2 }, { name: 'Agriculture', oml: 2 }] },
  ] }];
  const m = mergeOccupations(files);
  const kb = resolveOccupation(m, 'knight-bailiff');
  assert.deepEqual(kb.skills.map((s) => s.name).sort(), ['Agriculture', 'Law', 'Riding', 'Sword']);
  assert.equal(kb.name, 'Knight/Bailiff', 'child fields win');
  assert.ok(!('extends' in kb), 'extends flattened away');
});

test('real occupations.json: knight-bailiff extends knight-bachelor + culture-name (F4/G)', () => {
  const pub = JSON.parse(readFileSync('chargen/occupations.json', 'utf8'));
  const m = mergeOccupations([pub]);
  const kb = resolveOccupation(m, 'knight-bailiff');
  const names = kb.skills.map((s) => s.name);
  assert.ok(names.includes('Law') && names.includes('Agriculture'), 'bailiff keeps its own Law + Agriculture');
  assert.deepEqual(kb.nameByCulture, { Imperial: 'Patrician', default: 'Knight' });
  assert.ok(!('extends' in kb), 'extends flattened on resolve');
});

test('harper-skald: verbose instrument grant → three Musician specialties (one /4, two /3)', () => {
  const pub = JSON.parse(readFileSync('chargen/occupations.json', 'utf8'));
  const hs = pub.occupations.find((o) => o.id === 'harper-skald');
  const musician = hs.skills.filter((s) => /^Musician \(/.test(s.name));
  assert.equal(musician.length, 3, 'three instrument specialties');
  assert.equal(musician.filter((s) => s.oml === 4).length, 1, 'one at Musician/4');
  assert.equal(musician.filter((s) => s.oml === 3).length, 2, 'two at Musician/3');
  assert.ok(!hs.skills.some((s) => /^One instrument/.test(s.name)), 'unresolvable verbose grant removed');
});

test('extends: lint flags a missing parent; resolve throws on a cycle', () => {
  const dangling = { _meta: { layer: 'public' }, occupations: [{ id: 'a', extends: 'ghost' }] };
  assert.ok(lintOccupations([dangling]).errors.some((e) => e.includes('extends missing "ghost"')));
  const cycle = { _meta: { layer: 'public' }, occupations: [{ id: 'a', extends: 'b' }, { id: 'b', extends: 'a' }] };
  assert.throws(() => resolveOccupation(mergeOccupations([cycle]), 'a'), /extends cycle/);
});
