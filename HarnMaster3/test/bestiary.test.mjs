// Tests for the chargen bestiary engine (chargen/bestiary.mjs).
// Fixtures are inline + self-contained (independent of the shipped bestiary*.json).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeBestiary, resolveCreature, lintBestiary, SETTINGS } from '../chargen/bestiary.mjs';

// ---- fixtures ---------------------------------------------------------------

const publicFile = {
  _meta: { setting: 'public' },
  components: {
    archetypes: {
      quadruped: { label: 'Quadruped', hitLocations: [
        { name: 'Head', lo: 1, hi: 8 }, { name: 'Barrel', lo: 9, hi: 100 },
      ] },
      custom: { label: 'Custom', hitLocations: [] },
    },
    sizeClasses: { mediumHorse: { label: 'Medium Horse [MH]', carryMult: 8 }, large: { label: 'Large' } },
  },
  nodes: [
    { id: 'horse', name: 'Horse', rank: 'genus', setting: 'public', selectable: false },
    {
      id: 'horse-baseline', name: 'Horse (generic)', rank: 'species', genus: 'horse',
      setting: 'public', selectable: false, archetype: 'quadruped', sizeClass: 'mediumHorse',
      attributes: { str: 14, agl: 12 },
      attacks: [{ name: 'Kick', ml: 60, impact: 6, aspect: 'b' }],
    },
    {
      id: 'lion', name: 'Lion', rank: 'species', genus: 'cats',
      setting: 'public', selectable: true, archetype: 'quadruped', sizeClass: 'large',
      attributes: { str: 18 },
      attacks: [{ name: 'Bite', ml: 80, impact: 8, aspect: 'p' }],
    },
  ],
};

const homebrewFile = {
  _meta: { setting: 'homebrew' },
  components: { archetypes: {}, sizeClasses: {} },
  nodes: [
    { id: 'dire-wolf', name: 'Dire Wolf', setting: 'homebrew', selectable: true,
      archetype: 'quadruped', sizeClass: 'large', attributes: { str: 16 } },
  ],
};

const privateFile = {
  _meta: { setting: 'harn' },
  components: { archetypes: {}, sizeClasses: {} },
  nodes: [
    // a private breed that attaches under the public horse genus and inherits the baseline
    { id: 'chelni', name: 'Chelni', rank: 'breed', genus: 'horse', setting: 'harn',
      selectable: true, extends: 'horse-baseline', attributes: { agl: 15 } },
    // a private creature that supplies its OWN location table (the Ivashu case)
    { id: 'gnarl', name: 'Gnarl', setting: 'harn', selectable: true, archetype: 'custom',
      hitLocations: [{ name: 'Mass', lo: 1, hi: 100 }] },
  ],
};

// ---- merge ------------------------------------------------------------------

test('mergeBestiary unions components and nodes across files', () => {
  const m = mergeBestiary([publicFile, homebrewFile, privateFile]);
  assert.ok(m.components.archetypes.quadruped, 'archetype carried from public');
  assert.equal(m.nodes.size, 6);
  assert.ok(m.nodes.has('chelni') && m.nodes.has('dire-wolf') && m.nodes.has('lion'));
});

test('mergeBestiary deep-merges same id across layers and accumulates sources', () => {
  // homebrew tweaks ONE field of the public lion without restating its stats
  const override = { _meta: { setting: 'homebrew' }, nodes: [{ id: 'lion', name: 'Tweaked Lion', setting: 'homebrew', selectable: false }] };
  const m = mergeBestiary([publicFile, override]);
  const lion = m.nodes.get('lion');
  assert.equal(lion.name, 'Tweaked Lion', 'overridden field wins');
  assert.equal(lion.selectable, false);
  assert.equal(lion.attributes.str, 18, 'unstated fields inherited from the public layer');
  assert.deepEqual(lion.attacks.length, 1, 'arrays inherited when not restated');
  assert.deepEqual(lion.sources.sort(), ['homebrew', 'public']);
});

test('mergeBestiary tracks node-level source provenance', () => {
  const supplement = { _meta: { setting: 'harn' }, nodes: [
    { id: 'lion', source: '4611', hitLocations: [{ name: 'Head', lo: 1, hi: 10 }] },
  ] };
  const m = mergeBestiary([publicFile, supplement]);
  const lion = m.nodes.get('lion');
  assert.deepEqual(lion.sources.sort(), ['4611', 'public']);
  assert.equal(lion.hitLocations.length, 1, 'supplement augments with a hit-location table');
  assert.equal(lion.attributes.str, 18, 'base stats inherited');
});

test('mergeBestiary skips falsy files (absent private file)', () => {
  const m = mergeBestiary([publicFile, null, undefined]);
  assert.equal(m.nodes.size, 3);
});

// ---- resolve ----------------------------------------------------------------

test('resolveCreature expands archetype default hit locations', () => {
  const m = mergeBestiary([publicFile]);
  const lion = resolveCreature(m, 'lion');
  assert.equal(lion.hitLocationsFrom, 'archetype');
  assert.equal(lion.hitLocations.length, 2);
  assert.equal(lion.archetypeLabel, 'Quadruped');
  assert.deepEqual(lion.sizeInfo, { label: 'Large' });
});

test('resolveCreature honors a per-creature hitLocations override', () => {
  const m = mergeBestiary([publicFile, privateFile]);
  const gnarl = resolveCreature(m, 'gnarl');
  assert.equal(gnarl.hitLocationsFrom, 'override');
  assert.equal(gnarl.hitLocations.length, 1);
  assert.equal(gnarl.hitLocations[0].name, 'Mass');
});

test('resolveCreature walks extends and deep-merges overrides', () => {
  const m = mergeBestiary([publicFile, privateFile]);
  const chelni = resolveCreature(m, 'chelni');
  assert.equal(chelni.attributes.str, 14, 'inherited from baseline');
  assert.equal(chelni.attributes.agl, 15, 'overridden by breed');
  // attacks not supplied by the breed → inherited from baseline (empty/absent does not clobber)
  assert.equal(chelni.attacks.length, 1);
  assert.equal(chelni.attacks[0].name, 'Kick');
  // archetype/sizeClass inherited through the chain
  assert.equal(chelni.archetypeLabel, 'Quadruped');
});

test('resolveCreature throws on unknown id, missing parent, circular extends', () => {
  const m = mergeBestiary([publicFile]);
  assert.throws(() => resolveCreature(m, 'nope'), /unknown creature id/);

  const badParent = mergeBestiary([{ _meta: { setting: 'homebrew' }, nodes: [
    { id: 'orphan', setting: 'homebrew', selectable: true, extends: 'ghost' },
  ] }]);
  assert.throws(() => resolveCreature(badParent, 'orphan'), /extends missing "ghost"/);

  const cycle = mergeBestiary([{ _meta: { setting: 'homebrew' }, nodes: [
    { id: 'a', setting: 'homebrew', extends: 'b' }, { id: 'b', setting: 'homebrew', extends: 'a' },
  ] }]);
  assert.throws(() => resolveCreature(cycle, 'a'), /circular extends/);
});

// ---- lint -------------------------------------------------------------------

test('lintBestiary passes a well-formed tri-state set', () => {
  const { errors } = lintBestiary([publicFile, homebrewFile, privateFile]);
  assert.deepEqual(errors, []);
});

test('lintBestiary flags an IP leak (harn node in the public file)', () => {
  const leaky = { _meta: { setting: 'public' }, components: publicFile.components, nodes: [
    ...publicFile.nodes,
    { id: 'gargun', name: 'Gargun', setting: 'harn', selectable: false },
  ] };
  const { errors } = lintBestiary([leaky]);
  assert.ok(errors.some((e) => e.includes('IP LEAK') && e.includes('gargun')));
});

test('lintBestiary flags setting/file mismatch and dup ids within a file', () => {
  const bad = { _meta: { setting: 'homebrew' }, nodes: [
    { id: 'x', setting: 'public', selectable: false },   // mismatch
    { id: 'y', setting: 'homebrew', selectable: false },
    { id: 'y', setting: 'homebrew', selectable: false },  // dup
  ] };
  const { errors } = lintBestiary([bad]);
  assert.ok(errors.some((e) => e.includes('must match the file')));
  assert.ok(errors.some((e) => e.includes('duplicate id "y"')));
});

test('lintBestiary flags an unresolvable selectable node', () => {
  const bad = { _meta: { setting: 'homebrew' }, nodes: [
    { id: 'z', setting: 'homebrew', selectable: true, archetype: 'nonexistent' },
  ] };
  const { errors } = lintBestiary([bad]);
  assert.ok(errors.some((e) => e.includes('unresolvable selectable node "z"')));
});

test('SETTINGS is the documented tri-state', () => {
  assert.deepEqual(SETTINGS, ['public', 'homebrew', 'harn']);
});
