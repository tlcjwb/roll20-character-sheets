// Tests for the chargen core logic (chargen/chargen.mjs), using the real skills.json.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  parseSunMods, sunTokens, skillBase, resolveSkillDef, computeOccupationSkills, openAtOML,
  rollDice, rollAttributes, buildHarncharPC, buildHarncharCreature,
  rollFrame, rollHeight, weightFor, comelinessDesc, rollMedical, rollDiceDetailed,
  speciesKey, weightMod, attrMods, occDisplayName, occTitles, militaryUnitSkills, unionByHigherOML,
} from '../chargen/chargen.mjs';

const SKILLS = JSON.parse(readFileSync('chargen/skills.json', 'utf8')).skills;
const TABLES = JSON.parse(readFileSync('chargen/tables.json', 'utf8')).tables;
const OCC = JSON.parse(readFileSync('chargen/occupations.json', 'utf8')).occupations;
const fixedRng = (vals) => { let i = 0; return () => vals[i++ % vals.length]; };

test('parseSunMods / sunTokens', () => {
  assert.deepEqual(parseSunMods('ula/ara+2; hir+1'), { ula: 2, ara: 2, hir: 1 });
  assert.deepEqual(sunTokens('angberelius'), ['ang']);
  assert.deepEqual(sunTokens('ulandus-aralius'), ['ula', 'ara']); // cusp
});

test('skillBase matches the sheet formula (avg of 3 attrs, rounded, + best sunsign bonus)', () => {
  // sword: attrs [str,dex,dex], sun "ang+3; ahn/nad+1"
  const attrs = { str: 13, dex: 16 }; // 13+16+16 = 45 → /3 = 15
  assert.equal(skillBase(SKILLS.sword, attrs, []), 15);
  assert.equal(skillBase(SKILLS.sword, attrs, sunTokens('angberelius')), 18); // +3
  assert.equal(skillBase(SKILLS.sword, attrs, sunTokens('nadai')), 16);       // +1
});

test('resolveSkillDef handles aliases and parentheticals', () => {
  assert.equal(resolveSkillDef(SKILLS, 'Horsecraft').key, 'animalcraft');       // alias
  assert.equal(resolveSkillDef(SKILLS, 'Animalcraft (Horse)').key, 'animalcraft'); // strip paren
  assert.equal(resolveSkillDef(SKILLS, 'Sword (Broadsword)').key, 'sword');     // paren base
  assert.equal(resolveSkillDef(SKILLS, 'Nonsense'), null);
});

test('computeOccupationSkills computes SB and ML = SB × occupation oml', () => {
  const occ = { skills: [{ name: 'Horsecraft', oml: 4 }, { name: 'Riding', oml: 4 }, { name: 'Hidework', oml: 4 }] };
  const attrs = { str: 12, sta: 12, dex: 12, agl: 12, eye: 12, hrg: 12, sml: 12, voi: 12, int: 12, aur: 12, wil: 12 };
  const rows = computeOccupationSkills(occ, attrs, '', SKILLS);
  assert.equal(rows.length, 3);
  for (const r of rows) {
    assert.ok(r.resolved);
    assert.equal(r.ml, r.sb * 4, 'ML = SB × oml');
    assert.equal(r.sb, 12, 'all-12 attrs → SB 12 (no sunsign)');
  }
  assert.equal(resolveSkillDef(SKILLS, rows[0].name).key, 'animalcraft');
});

test('computeOccupationSkills flags an unresolvable grant', () => {
  const occ = { skills: [{ name: '2nd Language', oml: 0 }] };
  const rows = computeOccupationSkills(occ, {}, '', SKILLS);
  assert.equal(rows[0].resolved, false);
});

test('openAtOML opens skills at their own OML multiplier', () => {
  const attrs = { eye: 15, hrg: 15, sml: 15 }; // awareness avg 15, oml 4
  const [aw] = openAtOML(['awareness'], attrs, '', SKILLS);
  assert.equal(aw.sb, 15);
  assert.equal(aw.ml, 60); // 15 × 4
  assert.equal(aw.section, 'communicationskill');
});

test('rollDice is deterministic with an injected RNG', () => {
  assert.equal(rollDice('3d6', fixedRng([0.5])), 12);    // each die = 1 + floor(0.5*6) = 4
  assert.equal(rollDice('2d6+6', fixedRng([0.5])), 14);  // 4 + 4 + 6
  assert.equal(rollDice('bad'), null);
  const a = rollAttributes(null, fixedRng([0]));         // floor(0)→1 per die → 3 per attr
  assert.equal(a.str, 3);
});

test('rollDice supports 4d6 drop-lowest (the campaign house rule)', () => {
  // dice = [1,4,4,4]; drop lowest (1) → 12
  assert.equal(rollDice('4d6dl', fixedRng([0, 0.5, 0.5, 0.5])), 12);
  // dice = [1,4,4,4]; drop highest (one 4) → 9
  assert.equal(rollDice('4d6dh', fixedRng([0, 0.5, 0.5, 0.5])), 9);
});

test('rollDiceDetailed exposes all individual dice + the dropped one', () => {
  assert.deepEqual(rollDiceDetailed('3d6', fixedRng([0.5])), { total: 12, rolls: [4, 4, 4], kept: [4, 4, 4], dropped: null, mod: 0 });
  const d = rollDiceDetailed('4d6dl', fixedRng([0, 0.5, 0.5, 0.5]));
  assert.deepEqual(d.rolls, [1, 4, 4, 4]); // all four shown
  assert.equal(d.dropped, 1);
  assert.equal(d.total, 12);
});

test('buildHarncharPC includes psyche/medical only when their Show house rules are on (opt-in)', () => {
  const off = buildHarncharPC({ psyche: [{ trait: 'phobia' }], medical: [{ trait: 'Scars' }] });
  assert.deepEqual(off.character.psyche, [], 'psyche off by default');
  assert.deepEqual(off.character.medical, [], 'medical off by default');
  const on = buildHarncharPC({ psyche: [{ trait: 'phobia' }], medical: [{ trait: 'Scars' }], houserules: { showPsyche: true, showMedical: true, fourD6Attr: 'str' } });
  assert.deepEqual(on.character.psyche, [{ trait: 'phobia' }]);
  assert.deepEqual(on.character.medical, [{ trait: 'Scars' }]);
  assert.equal(on.houserules.showPsyche, true);
});

test('rollMedical reads the sex-specific d100 column', () => {
  const r8 = () => 0.08; // roll = 9
  assert.equal(rollMedical(TABLES.medical, 'Male', r8).entry.name, 'Albinism');  // male 9
  assert.equal(rollMedical(TABLES.medical, 'Female', r8).entry.name, 'Allergy'); // female 7-10
});

test('buildHarncharPC routes skills into sheet sections and stamps the envelope', () => {
  const out = buildHarncharPC({
    identity: { name: 'Test', occupation: 'Ostler' },
    attributes: { str: 12 },
    skills: [
      { name: 'Sword', ml: 45, section: 'combatskill' },
      { name: 'Awareness', ml: 60, section: 'communicationskill' },
      { name: 'Hidework', ml: 40, section: 'loreskill' },
    ],
  });
  assert.equal(out.harnchar, 1);
  assert.equal(out.kind, 'pc');
  assert.equal(out.character.skills.combat.length, 1);
  assert.equal(out.character.skills.communication[0].name, 'Awareness');
  assert.equal(out.character.skills.lore[0].ml, 40);
});

test('appearance: frame (3d6 + species/sex mod), height, weight, comeliness descriptor', () => {
  const r5 = () => 0.5; // each d6 = 4 → 3d6 = 12, 4d6 = 16
  // Human male: 3d6=12 (no mod) → Medium
  const fr = rollFrame('Human', 'Male', TABLES.frame, r5);
  assert.equal(fr.roll, 12); assert.equal(fr.frame, 'Medium'); assert.deepEqual(fr.dice, [4, 4, 4]);
  // Human female: 12 - 3 = 9 → still Medium; Khuzdul: 12 + 3 = 15 → Heavy
  assert.equal(rollFrame('Human', 'Female', TABLES.frame, r5).frame, 'Medium');
  assert.equal(rollFrame('Khuzdul', 'Male', TABLES.frame, r5).frame, 'Heavy');
  // Human male height = 54 + 4d6(16) = 70
  assert.equal(rollHeight('Human', 'Male', TABLES.heightBase, r5), 70);
  // 70" optimum = 160lb; Massive = +20% → 192
  assert.equal(weightFor(70, 'Medium', TABLES.weightByHeight, TABLES.frame), 160);
  assert.equal(weightFor(70, 'Massive', TABLES.weightByHeight, TABLES.frame), 192);
  // CML 14 → Attractive
  assert.equal(comelinessDesc(14, TABLES.comelinessDesc), 'Attractive');
  assert.equal(comelinessDesc(4, TABLES.comelinessDesc), 'Ugly');
  // morality reuses the same range-descriptor lookup
  assert.equal(comelinessDesc(11, TABLES.moralityDesc), 'Law-Abiding');
  assert.equal(comelinessDesc(3, TABLES.moralityDesc), 'Diabolical');
});

test('per-species attribute modifiers (3d6 + species/sex/weight)', () => {
  assert.equal(speciesKey('Khuzdul (dwarf)'), 'khuzdul');
  assert.equal(speciesKey('Sindarin (elf)'), 'sindarin');
  assert.equal(speciesKey('Human'), 'human');
  assert.deepEqual(attrMods('str', 'Khuzdul (dwarf)', 'Male', 0), [{ label: 'khuzdul', val: 4 }]);
  assert.deepEqual(attrMods('sta', 'Khuzdul (dwarf)', 'Male', 0), [{ label: 'khuzdul', val: 2 }]); // sta +2 (not +4)
  assert.deepEqual(attrMods('dex', 'Khuzdul (dwarf)', 'Male', 0), [{ label: 'khuzdul', val: 1 }]); // dex +1 (not +4)
  assert.deepEqual(attrMods('dex', 'Sindarin (elf)', 'Male', 0), [{ label: 'sindarin', val: 2 }]);
  assert.deepEqual(attrMods('wil', 'Khuzdul (dwarf)', 'Male', 0), [{ label: 'khuzdul', val: 3 }]);
  assert.deepEqual(attrMods('aur', 'Sindarin (elf)', 'Male', 0), [{ label: 'sindarin', val: 4 }]);
  assert.deepEqual(attrMods('aur', 'Human', 'Female', 0), [{ label: 'female', val: 2 }]);
  assert.deepEqual(attrMods('aur', 'Human', 'Male', 0), []); // human male: no aura mod
  // Strength = weight; Agility = frame; Stamina = neither
  assert.equal(weightMod(170), 1); assert.equal(weightMod(80), -4); assert.equal(weightMod(150), 0);
  assert.deepEqual(attrMods('str', 'Human', 'Male', 200), [{ label: 'weight', val: 3 }]);
  assert.deepEqual(attrMods('agl', 'Human', 'Male', 200, 'Heavy'), [{ label: 'frame', val: -1 }]); // frame, not weight
  assert.deepEqual(attrMods('agl', 'Sindarin (elf)', 'Male', 0, 'Scant'), [{ label: 'sindarin', val: 2 }, { label: 'frame', val: 2 }]);
  assert.deepEqual(attrMods('sta', 'Human', 'Male', 200, 'Heavy'), []); // stamina: no weight/frame mod
  assert.deepEqual(attrMods('eye', 'Human', 'Male', 0, 'Medium', 'Tribal'), [{ label: 'tribesmen', val: 1 }]);
});

test('occupation display: Pattern A title-choice + Pattern B culture-name', () => {
  // A — title-choice: interchangeable titles, one bundle
  assert.deepEqual(occTitles({ name: 'Cook/Servant', titles: ['Cook', 'Servant'] }, 'Feudal'), ['Cook', 'Servant']);
  // B — culture-determined name (cleric-shaman): Tribal → Shaman, else → Cleric
  const cleric = { name: 'Cleric/Shaman', nameByCulture: { Tribal: 'Shaman', default: 'Cleric' } };
  assert.equal(occDisplayName(cleric, 'Tribal'), 'Shaman');
  assert.equal(occDisplayName(cleric, 'Feudal'), 'Cleric');
  assert.deepEqual(occTitles(cleric, 'Feudal'), ['Cleric']); // single culture-resolved title
  // plain occupation: just its name
  assert.equal(occDisplayName({ name: 'Farmer' }, 'Feudal'), 'Farmer');
  assert.deepEqual(occTitles({ name: 'Farmer' }, 'Feudal'), ['Farmer']);
});

test('Pattern F — military unit skills = unit + ALL-common (except Militia), higher OML wins', () => {
  const allCommon = [{ name: 'Initiative', oml: 5 }, { name: 'Survival', oml: 4 }];
  const knight = { name: 'Knight', skills: [{ name: 'Initiative', oml: 6 }, { name: 'Lance', oml: 6 }] };
  const knightBundle = militaryUnitSkills(knight, allCommon);
  const byName = Object.fromEntries(knightBundle.map((s) => [s.name, s.oml]));
  assert.equal(byName.Initiative, 6, 'overlap → higher OML (unit 6 > common 5)');
  assert.equal(byName.Lance, 6);
  assert.equal(byName.Survival, 4, 'ALL-common added');
  // Militia gets NO ALL-common block
  const militia = { name: 'Militia', militia: true, skills: [{ name: 'Spear', oml: 4 }] };
  assert.deepEqual(militaryUnitSkills(militia, allCommon), [{ name: 'Spear', oml: 4 }]);

  // sanity vs the REAL Character-27 table: every byCulture unit resolves through the skill engine
  const mil = TABLES.military;
  for (const [culture, units] of Object.entries(mil.byCulture)) {
    for (const u of units) {
      const rows = computeOccupationSkills({ skills: militaryUnitSkills(u, mil.allCommon) }, { str: 12, dex: 12, agl: 12, eye: 12, str0: 0 }, '', SKILLS);
      const unresolved = rows.filter((r) => r.resolved === false).map((r) => r.name);
      assert.deepEqual(unresolved, [], `${culture}/${u.name} (${u.class}) has unresolved skills: ${unresolved.join(', ')}`);
    }
  }
});

test('Pattern E — cleric bundle = ALL-common + selected deity (Char 23), deity drives skills', () => {
  const cl = TABLES.clerics;
  assert.ok(cl && cl.byDeity, 'clerics table present');
  // Ritual is now PER-DEITY (Ritual (Deity), VOI INT + deity attr, RML = SB×4), not in ALL-common
  assert.ok(!cl.allCommon.some((s) => s.name === 'Ritual'), 'Ritual moved out of ALL-common');
  assert.deepEqual(cl.byDeity.Larani.ritual.attrs, ['voi', 'int', 'wil'], 'per-deity Ritual base attrs');
  assert.equal(cl.byDeity.Halea.ritual.attrs[2], 'cml', 'Halea Ritual uses CML');
  assert.equal(cl.byDeity.Larani.church.language, 'Emela', 'church language named');
  // Larani (martial) — deity skills added; Heraldry overlaps ALL(2) vs Larani(3) → higher wins
  const larani = Object.fromEntries(unionByHigherOML(cl.byDeity.Larani.skills, cl.allCommon).map((s) => [s.name, s.oml]));
  assert.equal(larani.Sword, 4); assert.equal(larani.Heraldry, 3);
  // Peoni (agricultural) differs from Larani — the deity genuinely drives the bundle
  const peoni = unionByHigherOML(cl.byDeity.Peoni.skills, cl.allCommon);
  assert.ok(peoni.some((s) => s.name === 'Agriculture') && !peoni.some((s) => s.name === 'Sword'));
  assert.equal(Object.keys(cl.byDeity).length, 10, 'all ten deities present');
});

test('Pattern E — mage bundle = ALL-common + selected convocation (Char 26), convocation drives skills', () => {
  const mg = TABLES.mages;
  assert.ok(mg && mg.byConvocation, 'mages table present');
  const fyvria = unionByHigherOML(mg.byConvocation.Fyvria.skills, mg.allCommon).map((s) => s.name);
  assert.ok(fyvria.includes('Physician') && fyvria.includes('Folklore'), 'convocation list + ALL-common');
  const peleahn = unionByHigherOML(mg.byConvocation.Peleahn.skills, mg.allCommon).map((s) => s.name);
  assert.ok(peleahn.includes('Alchemy') && !peleahn.includes('Physician'), 'Peleahn differs from Fyvria');
  assert.deepEqual(mg.byConvocation.Lyahvi.csb, ['aur', 'aur', 'eye'], 'CSB attrs carried for the CML');
  assert.ok(mg.byConvocation.Lyahvi.specialties && mg.byConvocation.Lyahvi.specialties.length === 3, 'convocation specialties (spell domains) carried');
  assert.equal(Object.keys(mg.byConvocation).length, 6, 'six elemental convocations');
});

test('buildHarncharPC passes a mage magic block through to the harnchar envelope', () => {
  const out = buildHarncharPC({ identity: { name: 'M' }, magic: { convocations: [{ name: 'Fyvria', ml: 42 }], spells: [] } });
  assert.equal(out.character.magic.convocations[0].name, 'Fyvria');
  assert.equal(out.character.magic.convocations[0].ml, 42);
  // default (no mage) stays empty
  assert.deepEqual(buildHarncharPC({ identity: { name: 'X' } }).character.magic, { convocations: [], spells: [] });
});

test('base+SB opening (languages/scripts) — ML = base + SB×mult', () => {
  const rows = computeOccupationSkills({ skills: [{ name: 'Script (Local)', base: 70, mult: 2 }] }, { dex: 12, eye: 12, int: 12 }, '', SKILLS);
  const script = rows[0];
  assert.equal(script.resolved, true);
  assert.ok(script.key.startsWith('script'), 'resolves to the base script skill (specialty-distinct key)');
  assert.equal(script.ml, 70 + script.sb * 2, 'ML = 70 + SB×2');
  assert.equal(script.oml, null, 'base+SB skills carry no numeric OML (rendered as —)');
});

test('Char 25 convocational sunsign modifiers carried (applied to the CML CSB)', () => {
  const sm = TABLES.mages.sunMods;
  assert.equal(sm.Lyahvi.Ulandus, -3);
  assert.equal(sm.Fyvria.Ulandus, 3);
  assert.equal(sm.Jmorvi.Feneri, 3);
});

test('harper-skald: three Musician instrument specialties + a Script placeholder all resolve', () => {
  const hs = OCC.find((o) => o.id === 'harper-skald');
  const rows = computeOccupationSkills({ skills: hs.skills }, { dex: 12, hrg: 12, voi: 12, int: 12, wil: 12, eye: 12 }, '', SKILLS);
  const musician = rows.filter((r) => /^Musician \(/.test(r.name));
  assert.equal(musician.length, 3, 'one /4 + two /3 instrument specialties');
  assert.ok(musician.every((r) => r.resolved && r.key.startsWith('musician')));
  assert.equal(new Set(musician.map((r) => r.key)).size, 3, 'three distinct instrument keys (no collapse)');
  assert.ok(rows.find((r) => r.name === 'Script (Local)').resolved);
  assert.deepEqual(rows.filter((r) => r.resolved === false).map((r) => r.name), [], 'no unresolvable grants remain');
});

test('Craft & Lore hint tags (cl) — crafts, lores, and untagged field skills', () => {
  assert.equal(SKILLS.brewing.cl, 'craft');
  assert.equal(SKILLS.animalcraft.cl, 'craft', 'husbandry trade → Craft');
  assert.equal(SKILLS.piloting.cl, 'craft', 'HârnWorld handling → Craft');
  assert.equal(SKILLS.heraldry.cl, 'lore');
  assert.equal(SKILLS.lore.cl, 'lore');
  assert.equal(SKILLS.fishing.cl, undefined, 'field skill → no hint');
  assert.equal(SKILLS.survival.cl, undefined);
});

test('buildHarncharCreature produces a kind:creature envelope', () => {
  const out = buildHarncharCreature({
    name: 'Lion', archetype: 'quadruped', attributes: { str: 20 },
    derived: { move: 36 }, attacks: [{ name: 'Bite', ml: 85, impact: 6, aspect: 'p' }],
    armorNatural: { b: 4, e: 4, p: 1, f: 3 }, hitLocations: [], skills: [], specialQualities: [],
  });
  assert.equal(out.kind, 'creature');
  assert.equal(out.character.archetype, 'quadruped');
  assert.equal(out.character.attacks[0].name, 'Bite');
});
