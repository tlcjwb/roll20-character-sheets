// Rule-driven chargen tests organized by 4001 page → section → rule (north star: the resolved
// occupation bundle + the emitted harnchar JSON are correct). Uses the REAL data files, public and
// public+private. Complements the per-module engine tests with the page-by-page, JSON-focused view.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { mergeOccupations } from '../chargen/occupations.mjs';
import { occBundle, computeOccupationSkills, buildHarncharPC, familyFunds, gearTotals } from '../chargen/chargen.mjs';

const SKILLS = JSON.parse(readFileSync('chargen/skills.json', 'utf8')).skills;
const TABLES = JSON.parse(readFileSync('chargen/tables.json', 'utf8')).tables;
const OCC_PUB = JSON.parse(readFileSync('chargen/occupations.json', 'utf8'));
const dataFor = (layers) => ({ occupations: mergeOccupations(layers), military: TABLES.military, clerics: TABLES.clerics, mages: TABLES.mages });
const DATA = dataFor([OCC_PUB]);
const names = (b) => b.skills.map((s) => s.name);
// resolve a bundle's MLs the way the generator does, then assemble the harnchar JSON
const toJSON = (occId, sel, data = DATA, attrs = { str: 13, sta: 12, dex: 13, agl: 12, eye: 12, hrg: 12, sml: 12, voi: 12, int: 13, aur: 12, wil: 13, cml: 12, moral: 11 }) => {
  const b = occBundle(occId, sel, data);
  const rows = computeOccupationSkills({ skills: b.skills }, attrs, '', SKILLS).filter((r) => r.resolved !== false);
  return buildHarncharPC({ identity: { name: 'T', occupation: b.name }, attributes: attrs, skills: rows.map((r) => ({ name: r.name, ml: r.ml, section: r.section })) });
};

describe('Character 14–15 — Occupation & Occupational Skills', () => {
  test('ordinary occupation: Ostler → Horsecraft/Riding/Hidework bundle', () => {
    const b = occBundle('ostler', { culture: 'Feudal' }, DATA);
    assert.equal(b.name, 'Ostler');
    ['Horsecraft', 'Riding', 'Hidework'].forEach((s) => assert.ok(names(b).includes(s), `has ${s}`));
  });
  test('north star: bundle → skills route into the harnchar JSON skill sections', () => {
    const out = toJSON('ostler', { culture: 'Feudal' });
    assert.equal(out.harnchar, 1);
    assert.equal(out.kind, 'pc');
    assert.equal(out.character.identity.occupation, 'Ostler');
    const all = Object.values(out.character.skills).flat().map((s) => s.name);
    assert.ok(all.includes('Riding'));
  });
});

describe('Character 17 — Equipment & Funds', () => {
  const byClass = TABLES.familyWealth.byClass;
  test('starting funds = Social Class × wealth level (Poor/Average/Rich)', () => {
    assert.equal(familyFunds(byClass, 'Serf', 'Poor'), 40);
    assert.equal(familyFunds(byClass, 'Guilded', 'Average'), 180);
    assert.equal(familyFunds(byClass, 'Noble', 'Rich'), 2400);
  });
  test('unknown class/level → null (caller falls back / leaves editable)', () => {
    assert.equal(familyFunds(byClass, 'Royalty', 'Rich'), null);
    assert.equal(familyFunds(byClass, 'Noble', 'Destitute'), null);
  });
  test('gearTotals sums price × qty and weight × qty', () => {
    const items = [{ name: 'Mail Habergeon', qty: 1, d: 345, wt: 25 }, { name: 'Belt Pouch', qty: 2, d: 5, wt: 0.5 }];
    const t = gearTotals(items);
    assert.equal(t.spent, 355);
    assert.equal(t.weight, 26);
    assert.equal(t.count, 3);
  });
  test('gearTotals reports funds remaining (and goes negative when over budget)', () => {
    assert.equal(gearTotals([{ d: 100, wt: 1 }], 180).remaining, 80);
    assert.equal(gearTotals([{ d: 300, wt: 1 }], 180).remaining, -120);
    assert.deepEqual(gearTotals([]), { spent: 0, weight: 0, count: 0 });
  });
  test('north star: chosen items land in the harnchar gear block', () => {
    const items = [{ name: 'Mail Habergeon', qty: 1, d: 345, wt: 25 }];
    const t = gearTotals(items, 1200);
    const out = buildHarncharPC({ identity: { name: 'T' }, attributes: {}, skills: [], gear: { wealthLevel: 'Average', funds: 1200, items, spent: t.spent, weightCarried: t.weight, remaining: t.remaining } });
    assert.equal(out.character.gear.funds, 1200);
    assert.equal(out.character.gear.items[0].name, 'Mail Habergeon');
    assert.equal(out.character.gear.remaining, 855);
  });
  test('provenance: state.sources is recorded in the harnchar envelope (omitted if absent)', () => {
    const withSrc = buildHarncharPC({ sources: ['4001', '4823'], identity: {}, attributes: {}, skills: [] });
    assert.deepEqual(withSrc.sources, ['4001', '4823']);
    const noSrc = buildHarncharPC({ identity: {}, attributes: {}, skills: [] });
    assert.ok(!('sources' in noSrc));
  });
});

describe('Character 17 — public 4001 equipment catalog (Combat 3-5)', () => {
  const EQ = JSON.parse(readFileSync('chargen/equipment.json', 'utf8'));
  const allItems = EQ.vendors.flatMap((v) => v.items);
  const byName = (n) => allItems.find((it) => it.name === n);
  test('two vendors (Weapons + Armour), harnequip schema', () => {
    assert.equal(EQ._meta.harnequip, 1);
    assert.deepEqual(EQ.vendors.map((v) => v.id).sort(), ['armour-4001', 'weapons-4001']);
  });
  test('bows are weapons (Bow class) with the 4001 PR-column prices', () => {
    assert.equal(byName('Shortbow').d, 24);
    assert.equal(byName('Longbow').d, 36);
    assert.equal(byName('Crossbow').d, 60);
    assert.equal(byName('Hartbow').d, 96);
    assert.ok(allItems.filter((it) => it.class === 'Bow').every((it) => it.kind === 'weapon'));
  });
  test('armour pieces carry price, weight, material protection + locations', () => {
    const h = byName('Mail Hauberk');
    assert.equal(h.d, 990); assert.equal(h.wt, 33);
    assert.deepEqual(h.protection, { b: 2, e: 8, p: 5, f: 1 });
    assert.ok(h.locations.includes('Thorax'));
  });
  test('every item has a name + kind; prices are numbers or null (n/a)', () => {
    for (const it of allItems) {
      assert.ok(it.name && it.kind, `bad item ${JSON.stringify(it)}`);
      assert.ok(it.d == null || typeof it.d === 'number');
    }
  });
});

describe('Character 27 — Military Careers', () => {
  test('Soldier + Feudal Guardsman (LF) → unit skills + ALL-common, named "Guardsman (LF)"', () => {
    const b = occBundle('soldier', { culture: 'Feudal', milunit: 'mil-feudal-guardsman-lf' }, DATA);
    assert.equal(b.name, 'Guardsman (LF)');
    assert.ok(names(b).includes('Spear'), 'unit weapon');
    assert.ok(names(b).includes('Initiative'), 'ALL-military common');
  });
  test('Militia gets NO ALL-common block', () => {
    const b = occBundle('soldier', { culture: 'Feudal', milunit: 'mil-feudal-militia' }, DATA);
    assert.ok(!names(b).includes('Initiative'), 'Militia excluded from ALL-common');
  });
  test('no unit chosen → empty bundle, flagged needs:unit', () => {
    const b = occBundle('soldier', { culture: 'Feudal' }, DATA);
    assert.deepEqual(b.skills, []);
    assert.equal(b.needs, 'unit');
  });
  test('Soldier excludes Knight units (knight is its own Noble occupation)', () => {
    const b = occBundle('soldier', { culture: 'Feudal', milunit: 'mil-feudal-knight-mh' }, DATA);
    assert.deepEqual(b.skills, [], 'a knight unit id is not resolvable under soldier');
    assert.equal(b.needs, 'unit');
  });
});

describe('Character 27 / Noble — Knights (Pattern F4/G)', () => {
  test('Imperial male knight-bailiff → "Patrician", culture knight unit + Law/Agriculture (extends)', () => {
    const b = occBundle('knight-bailiff', { culture: 'Imperial', sex: 'Male' }, DATA);
    assert.equal(b.name, 'Patrician');
    assert.ok(names(b).includes('Law') && names(b).includes('Agriculture'), 'bailiff extras');
    assert.ok(names(b).includes('Riding'), 'from the culture knight unit');
  });
  test('Herald gets its own skills PLUS the culture Knight skills ("plus Knight skills to OML")', () => {
    const n = names(occBundle('herald', { culture: 'Feudal' }, DATA));
    assert.ok(n.includes('Heraldry') && n.includes('Oratory'), 'own Herald skills');
    assert.ok(n.includes('Riding') && n.includes('Polearm (Lance)'), 'Knight-unit (Knight Bachelor) skills');
    assert.ok(n.includes('Law') && n.includes('Agriculture'), 'full Knight (knight-bailiff) bundle: + Law/Agriculture');
  });
  test('Feudal male knight-bailiff → "Knight"; female → "Lady" (own bundle, courtly)', () => {
    assert.equal(occBundle('knight-bailiff', { culture: 'Feudal', sex: 'Male' }, DATA).name, 'Knight');
    const lady = occBundle('knight-bailiff', { culture: 'Feudal', sex: 'Female' }, DATA);
    assert.equal(lady.name, 'Lady');
    assert.ok(lady.skills.some((s) => s.name === 'Needlework'), 'Lady bundle, not knight');
    assert.ok(!lady.skills.some((s) => s.name === 'Lance'));
  });
});

describe('Character 27 — Fighting Orders (deity-sponsored religious military)', () => {
  test('FO unit skills come from the Char-27 Fighting Order block (Knight MH carries Mace — distinct from Feudal)', () => {
    const b = occBundle('fighting-order', { milunit: 'mil-fo-knight-mh', deity: 'Larani', fightingOrder: 'Order of the Lady of Paladins' }, DATA);
    const n = names(b);
    assert.ok(n.includes('Club (Mace)'), 'Fighting Order Knight has Mace');
    assert.ok(n.includes('Polearm (Lance)') && n.includes('Riding') && n.includes('Initiative'));
    assert.ok(n.includes('Foraging'), 'ALL MILITARY common skills unioned in');
    assert.equal(b.deity, 'Larani');
    assert.equal(b.fightingOrder, 'Order of the Lady of Paladins');
    assert.ok(b.name.includes('Order of the Lady of Paladins'));
  });
  test('FO infantry/archer use their own kit; deity carried through', () => {
    const inf = occBundle('fighting-order', { milunit: 'mil-fo-infantry-mf', deity: 'Agrik', fightingOrder: 'Roving Doom' }, DATA);
    assert.ok(names(inf).includes('Spear') && names(inf).includes('Sword (Falchion)'));
    assert.equal(inf.deity, 'Agrik');
    assert.equal(inf.fightingOrder, 'Roving Doom');
  });
  test('no unit chosen → needs a unit (skills empty)', () => {
    const b = occBundle('fighting-order', { deity: 'Larani' }, DATA);
    assert.equal(b.skills.length, 0);
    assert.equal(b.needs, 'unit');
  });
  test('order names present: Agrik 7 fighting orders, Larani 2; Peoni cleric orders are gendered', () => {
    assert.equal(TABLES.clerics.byDeity.Agrik.fightingOrders.length, 7);
    assert.deepEqual(TABLES.clerics.byDeity.Larani.fightingOrders.map((o) => o.name), ['Order of the Lady of Paladins', 'Order of the Checkered Shield']);
    const peoni = TABLES.clerics.byDeity.Peoni.orders;
    assert.ok(peoni.find((o) => o.name === 'Balm of Joy' && o.sex === 'F'));
    assert.ok(peoni.find((o) => o.name === 'Irreproachable Order' && o.sex === 'M'));
  });
});

describe('Character 23 — Clerics (Pattern E, deity-driven)', () => {
  test('Larani cleric (Feudal) → "Cleric"; Ritual (Larani) at RML=SB×4; named church language/script', () => {
    const b = occBundle('cleric-shaman', { culture: 'Feudal', deity: 'Larani' }, DATA);
    assert.equal(b.name, 'Cleric');
    assert.ok(names(b).includes('Sword'), 'Larani deity skill');
    assert.ok(names(b).includes('Ritual (Larani)'), 'per-deity Ritual (not plain "Ritual")');
    assert.ok(names(b).includes('Language (Emela)'), 'church language named, not "Church"');
    assert.ok(names(b).includes('Script (Khruni)'), 'church script named');
    const rows = computeOccupationSkills({ skills: b.skills }, { voi: 12, int: 12, wil: 12, dex: 12, eye: 12 }, '', SKILLS);
    const rit = rows.find((r) => r.name === 'Ritual (Larani)');
    assert.equal(rit.resolved, true);
    assert.equal(rit.ml, rit.sb * 4, 'RML = SB×4');
    assert.equal(rit.section, 'ritualskill');
  });
  test('Tribal cleric → "Shaman"; Peoni differs from Larani (deity drives skills)', () => {
    assert.equal(occBundle('cleric-shaman', { culture: 'Tribal', deity: 'Peoni' }, DATA).name, 'Shaman');
    const peoni = names(occBundle('cleric-shaman', { culture: 'Feudal', deity: 'Peoni' }, DATA));
    assert.ok(peoni.includes('Agriculture') && !peoni.includes('Sword'));
    assert.ok(peoni.includes('Ritual (Peoni)'));
  });
  test('2nd/3rd Language + scripts resolve & calculate (Save-K\'nor)', () => {
    const b = occBundle('cleric-shaman', { culture: 'Feudal', deity: "Save-K'nor" }, DATA);
    const rows = computeOccupationSkills({ skills: b.skills }, { voi: 12, int: 12, wil: 12, dex: 12, eye: 12 }, '', SKILLS);
    ['Language (2nd)', 'Language (3rd)', 'Script (2nd)'].forEach((n) => {
      const r = rows.find((x) => x.name === n);
      assert.ok(r && r.resolved, `${n} resolves`);
      assert.ok(r.ml > 0, `${n} has a computed ML`);
    });
  });
  test('Temple Tongues option adds the church secret tongue (Agrik → Surikal)', () => {
    const off = names(occBundle('cleric-shaman', { culture: 'Feudal', deity: 'Agrik' }, DATA));
    const on = names(occBundle('cleric-shaman', { culture: 'Feudal', deity: 'Agrik', templeTongues: true }, DATA));
    assert.ok(!off.includes('Language (Surikal)'), 'off by default');
    assert.ok(on.includes('Language (Surikal)'), 'added when option on');
  });
});

describe('skills-table dedup — specialties of one base skill stay distinct', () => {
  test('multiple Language/Script specialties get distinct keys (no collapse)', () => {
    const grants = [
      { name: 'Language (Native Tongue)', base: 70, mult: 1 }, { name: 'Language (2nd)', oml: 4 },
      { name: 'Language (Emela)', oml: 3 }, { name: 'Script (Local)', base: 70, mult: 1 }, { name: 'Script (Khruni)', base: 70, mult: 1 },
    ];
    const rows = computeOccupationSkills({ skills: grants }, { voi: 12, int: 12, wil: 12, dex: 12, eye: 12 }, '', SKILLS);
    const byKey = new Map(rows.map((r) => [r.key, r])); // mirrors recomputePC's bySkill map
    assert.equal(byKey.size, 5, 'all five specialties survive distinct keys');
  });
  test('aliased craft skills stay distinct (Ratter: Ratcraft + Dogcraft both alias→animalcraft, not collapsed)', () => {
    const rows = computeOccupationSkills({ skills: [{ name: 'Ratcraft', oml: 5 }, { name: 'Dogcraft', oml: 4 }] }, { dex: 12, hrg: 12, voi: 12, int: 12, wil: 12, agl: 12, sml: 12 }, '', SKILLS);
    assert.ok(rows.every((r) => r.resolved), 'both resolve via the animalcraft alias');
    assert.deepEqual(rows.map((r) => r.key).sort(), ['dogcraft', 'ratcraft'], 'distinct keys, not both "animalcraft"');
    assert.equal(new Map(rows.map((r) => [r.key, r])).size, 2, 'both survive the skills-table dedup');
  });
  test('a full cleric bundle keeps every language/script/ritual row after dedup (Larani + temple tongue n/a)', () => {
    const b = occBundle('cleric-shaman', { culture: 'Feudal', deity: 'Larani' }, DATA);
    const rows = computeOccupationSkills({ skills: b.skills }, { voi: 12, int: 12, wil: 12, dex: 12, eye: 12, str: 12, sml: 12 }, '', SKILLS);
    const surviving = [...new Map(rows.map((r) => [r.key, r])).values()].map((r) => r.name);
    ['Language (Emela)', 'Script (Local)', 'Script (Khruni)', 'Ritual (Larani)'].forEach((n) => assert.ok(surviving.includes(n), `${n} survives dedup`));
  });
});

describe('Character 15 — choose-N grants (weapon/craft/lore picks)', () => {
  test('occupations carry structured `choices` (Mercantyler weapon, Gladiator 3@+SB×2, Chandler crafts, Sage lore)', () => {
    const byId = Object.fromEntries(OCC_PUB.occupations.map((o) => [o.id, o]));
    assert.deepEqual(byId.mercantyler.choices, [{ category: 'weapon', count: 1, bonus: 0 }]);
    assert.deepEqual(byId.gladiator.choices, [{ category: 'weapon', count: 3, bonus: 2 }]);
    assert.deepEqual(byId.chandler.choices, [{ category: 'craft', count: 3, oml: 3 }]);
    assert.deepEqual(byId['sage-tutor'].choices, [{ category: 'lore', count: 3, oml: 4 }]);
    assert.ok(!(byId.mercantyler.special || []).some((s) => /weapon/i.test(s)), 'weapon note removed from special');
  });
  test('a weapon pick = SB×(own OML + bonus); a craft/lore pick = SB×oml', () => {
    const attrs = { str: 13, dex: 13, agl: 13, eye: 12, sml: 12, voi: 12, int: 12, wil: 12, hrg: 12 };
    const wep = computeOccupationSkills({ skills: [{ name: 'Sword', useOwnOml: true, bonus: 2 }] }, attrs, '', SKILLS)[0];
    assert.equal(wep.resolved, true);
    assert.equal(wep.ml, wep.sb * (3 + 2), 'Sword OML(3) + SB×2 = SB×5');
    assert.equal(wep.oml, 5, 'displayed OML = own OML(3) + bonus(2), not undefined');
    const craft = computeOccupationSkills({ skills: [{ name: 'Glassworking', oml: 3 }] }, attrs, '', SKILLS)[0];
    assert.equal(craft.ml, craft.sb * 3, 'craft opens at SB×3');
  });
});

describe('Character 26 — Mages (Pattern E, convocation-driven)', () => {
  test('Fyvria mage → "Mavari (Fyvria)" + convocation skills + ALL-common, CSB attrs carried', () => {
    const b = occBundle('mage-shek-pvar', { culture: 'Feudal', convocation: 'Fyvria' }, DATA);
    assert.equal(b.name, 'Mavari (Fyvria)');
    assert.ok(names(b).includes('Physician'), 'Fyvria skill');
    assert.ok(names(b).includes('Folklore'), 'ALL-common');
    assert.deepEqual(b.csb, ['aur', 'aur', 'sml']);
    assert.ok(b.specialties.includes('Healing'), 'convocation specialties surfaced');
  });
});

describe('public + private (4001 ± owner extensions; homebrew ignored)', () => {
  test('owner 4823 layer augments the Ostler (skips cleanly if owner file absent)', (t) => {
    const owner = 'chargen/owner/occupations.4823.json';
    if (!existsSync(owner)) { t.skip('owner-only ' + owner + ' absent'); return; }
    const priv = JSON.parse(readFileSync(owner, 'utf8'));
    const withPriv = occBundle('ostler', { culture: 'Feudal' }, dataFor([OCC_PUB, priv]));
    const pubOnly = occBundle('ostler', { culture: 'Feudal' }, DATA);
    assert.notDeepEqual(withPriv, pubOnly, 'loading the private layer changes the Ostler');
  });
});
