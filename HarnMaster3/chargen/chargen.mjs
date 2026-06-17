// HarnMaster3 chargen — core logic. Pure ES module (Node + browser). SB / OML math mirrors
// harnsheet.html (computeSB) so generated MLs match the sheet on import. RNG is injected.
import { resolveOccupation } from './occupations.mjs'; // (build-generator strips imports; it's a global in the bundle)

export const SUN_ABBR = {
  ulandus: 'ula', aralius: 'ara', feniri: 'fen', ahnu: 'ahn', angberelius: 'ang', nadai: 'nad',
  hirin: 'hir', tarael: 'tar', tai: 'tai', skorus: 'sko', masara: 'mas', lado: 'lad',
};
export const ATTR_KEYS = ['str', 'sta', 'dex', 'agl', 'eye', 'hrg', 'sml', 'voi', 'int', 'aur', 'wil', 'cml', 'moral'];
const SECTION_KEY = { combatskill: 'combat', physicalskill: 'physical', communicationskill: 'communication', loreskill: 'lore', ritualskill: 'ritual', magicskill: 'magic' };
// Animalcraft specializations share the Animalcraft definition.
const SKILL_ALIAS = { horsecraft: 'animalcraft', oxcraft: 'animalcraft', birdcraft: 'animalcraft', ratcraft: 'animalcraft', dogcraft: 'animalcraft' };

// "ula/ara+2; hir+1" → { ula:2, ara:2, hir:1 }
export function parseSunMods(str) {
  const map = {};
  String(str || '').toLowerCase().split(';').forEach((g) => {
    const m = g.match(/([a-z/ ]+)\+(\d+)/);
    if (!m) return;
    const b = parseInt(m[2], 10);
    m[1].split('/').forEach((s) => { s = s.trim(); if (s) map[s] = b; });
  });
  return map;
}

// sunsign attr ("ulandus" or cusp "ulandus-aralius") → ['ula', 'ara']; accepts abbreviations too.
export function sunTokens(sunsign) {
  const abbrs = new Set(Object.values(SUN_ABBR));
  return String(sunsign || '').toLowerCase().trim().split(/[-/]/).map((s) => {
    s = s.trim();
    return SUN_ABBR[s] || (abbrs.has(s) ? s : null);
  }).filter(Boolean);
}

export const skillKey = (name) => String(name || '').toLowerCase().trim().replace(/\s*\(.*\)\s*$/, '');

// Resolve a skill name to its definition in `skills` (alias + parenthetical-base aware).
export function resolveSkillDef(skills, name) {
  const key = skillKey(name);
  if (skills[key]) return { key, def: skills[key] };
  if (SKILL_ALIAS[key] && skills[SKILL_ALIAS[key]]) return { key: SKILL_ALIAS[key], def: skills[SKILL_ALIAS[key]] };
  const m = String(name || '').match(/\(([^)]+)\)\s*$/);
  if (m) { const pk = m[1].trim().toLowerCase(); if (skills[pk]) return { key: pk, def: skills[pk] }; }
  return null;
}

// Skill Base = round(avg of the skill's 3 attributes) + best matching sunsign bonus. Matches the sheet.
export function skillBase(def, attrs, tokens) {
  let sum = 0;
  def.attrs.forEach((a) => { sum += Number(attrs[a]) || 0; });
  let sb = Math.round(sum / 3);
  const sm = parseSunMods(def.sun);
  let bonus = 0;
  (tokens || []).forEach((t) => { if (sm[t] != null && sm[t] > bonus) bonus = sm[t]; });
  return sb + bonus;
}

// Compute an occupation's skill bundle: each entry's SB (from attributes+sunsign) and ML = SB × oml
// (the occupation's listed multiplier). Unresolvable names (e.g. "2nd Language") are flagged.
export function computeOccupationSkills(occupation, attrs, sunsign, skills) {
  const tokens = sunTokens(sunsign);
  return (occupation.skills || []).map((s) => {
    let def; let key;
    if (s.attrs) { def = { attrs: s.attrs, sun: s.sun, section: s.section }; key = (s.name || '').toLowerCase(); } // explicit-attr grant (e.g. Ritual (Deity))
    else {
      const r = resolveSkillDef(skills, s.name);
      if (!r) return { name: s.name, oml: s.oml, resolved: false, note: 'no skill definition — set SB/ML by hand' };
      def = r.def;
      // Keep specialties/aliases distinct so several that share one base/target key don't collide
      // downstream: Language (2nd) ≠ Language (Church); Sword (Broadsword) ≠ Sword (Falchion);
      // Ratcraft ≠ Dogcraft (both alias → animalcraft) ≠ Horsecraft.
      const m = /\(([^)]+)\)\s*$/.exec(String(s.name));
      const nk = skillKey(s.name); // the name's own normalized key (e.g. 'ratcraft')
      key = m ? `${r.key} (${m[1].trim().toLowerCase()})` : (nk !== r.key ? nk : r.key);
    }
    const sb = skillBase(def, attrs, tokens);
    // SB×oml normally; languages/scripts open at base + SB×mult (70+SB); weapon "choose" picks open at
    // the chosen skill's OWN OML + SB×bonus (= SB×(ownOml+bonus), e.g. "OML+SB×2").
    const ownOml = (def.oml || 1) + (s.bonus || 0);
    const ml = s.useOwnOml ? sb * ownOml
      : (s.base != null) ? s.base + sb * (s.mult == null ? 1 : s.mult)
        : sb * s.oml;
    // displayed OML: effective own-OML+bonus for weapon picks; null for base+SB (70+SB) skills
    const oml = s.useOwnOml ? ownOml : (s.base != null ? null : s.oml);
    return { name: s.name, key, sb, oml, ml, section: def.section || 'loreskill', group: def.group, resolved: true };
  });
}

// Open a set of skills at their OML (SB × the skill's own oml) — e.g. automatic/universal skills.
export function openAtOML(skillKeys, attrs, sunsign, skills) {
  const tokens = sunTokens(sunsign);
  const out = [];
  for (const key of skillKeys) {
    const def = skills[key];
    if (!def || def.oml == null) continue;
    const sb = skillBase(def, attrs, tokens);
    out.push({ name: key, key, sb, oml: def.oml, ml: sb * def.oml, section: def.section || 'loreskill', group: def.group, resolved: true });
  }
  return out;
}

// Roll a dice spec: "3d6", "2d6+6", or with a single drop: "4d6dl" (drop lowest) / "4d6dh" (drop
// highest). Returns { total, rolls (in order), kept, dropped, mod } so the UI can show the individual
// dice (e.g. "STR 11 (3,4,4)"). `rng` returns [0,1) (default Math.random — inject a deterministic one).
export function rollDiceDetailed(spec, rng) {
  const m = String(spec).match(/^(\d+)d(\d+)(dl|dh)?([+-]\d+)?$/i);
  if (!m) return null;
  const n = +m[1]; const sides = +m[2]; const drop = m[3] ? m[3].toLowerCase() : null; const mod = m[4] ? +m[4] : 0;
  const r = rng || Math.random;
  const rolls = [];
  for (let i = 0; i < n; i++) rolls.push(1 + Math.floor(r() * sides));
  let dropped = null; const kept = rolls.slice();
  if (drop && rolls.length > 1) { const target = drop === 'dl' ? Math.min(...rolls) : Math.max(...rolls); dropped = target; kept.splice(rolls.indexOf(target), 1); }
  return { total: kept.reduce((s, x) => s + x, 0) + mod, rolls, kept, dropped, mod };
}
export function rollDice(spec, rng) { const d = rollDiceDetailed(spec, rng); return d ? d.total : null; }

// Roll attributes from a per-attribute dice spec (defaults to 3d6).
export function rollAttributes(dice, rng) {
  const a = {};
  for (const k of ATTR_KEYS) a[k] = rollDice((dice && dice[k]) || '3d6', rng);
  return a;
}

// ---- per-species attribute modifiers (4001 Character 6-8) ----
// All attributes roll 3d6; species/sex/culture/weight/frame modify the result.
export const SPECIES_ATTR_MOD = {
  khuzdul: { str: 4, sta: 2, dex: 1, eye: 1, hrg: 2, sml: 2, aur: -2, wil: 3 },
  sindarin: { str: 1, sta: 1, dex: 2, agl: 2, eye: 2, hrg: 2, sml: 3, voi: 2, cml: 2, aur: 4, moral: 3 },
};
const TRIBAL_ATTR_MOD = { eye: 1, hrg: 2, sml: 2 }; // Tribal culture (keener senses)
const FRAME_AGL_MOD = { Scant: 2, Light: 1, Medium: 0, Heavy: -1, Massive: -2 }; // frame → Agility
export const speciesKey = (species) => { const s = String(species || '').toLowerCase(); return /khuzdul|dwarf/.test(s) ? 'khuzdul' : /sindarin|elf/.test(s) ? 'sindarin' : 'human'; };

// Weight modifies STRENGTH only (heavier → stronger). Stamina/Agility are NOT weight-modified.
export function weightMod(weight) {
  const w = Number(weight) || 0;
  const t = [[56, 85, -4], [86, 110, -3], [111, 130, -2], [131, 145, -1], [146, 155, 0], [156, 170, 1], [171, 190, 2], [191, 215, 3], [216, 245, 4]];
  const e = t.find(([lo, hi]) => w >= lo && w <= hi);
  return e ? e[2] : 0;
}

// Modifiers applied to a 3d6 roll for `attr` → [{ label, val }]. Strength uses weight; Agility uses frame.
export function attrMods(attr, species, sex, weight, frame, culture) {
  const mods = []; const sk = speciesKey(species);
  const sm = (SPECIES_ATTR_MOD[sk] || {})[attr]; if (sm) mods.push({ label: sk, val: sm });
  if (attr === 'aur' && sk === 'human' && /^f/i.test(sex || '')) mods.push({ label: 'female', val: 2 });
  if (/tribal/i.test(culture || '') && TRIBAL_ATTR_MOD[attr]) mods.push({ label: 'tribesmen', val: TRIBAL_ATTR_MOD[attr] });
  if (attr === 'str') { const wm = weightMod(weight); if (wm) mods.push({ label: 'weight', val: wm }); }
  if (attr === 'agl' && FRAME_AGL_MOD[frame]) mods.push({ label: 'frame', val: FRAME_AGL_MOD[frame] });
  return mods;
}

// ---- appearance (4001 Character 3) ----

// Roll Frame: 3d6 + species/sex modifier, looked up on the frame table → { roll, frame }.
export function rollFrame(species, sex, frameTable, rng) {
  const d = rollDiceDetailed('3d6', rng);
  let roll = d.total;
  const fm = frameTable.frameMod || {};
  const female = /^f/i.test(sex || '');
  if (/human/i.test(species) && female) roll += fm.humanFemale || 0;
  else if (/sindarin/i.test(species)) roll += fm.sindarin || 0;
  else if (/khuzdul/i.test(species)) roll += fm.khuzdul || 0;
  roll = Math.max(3, Math.min(18, roll));
  const e = (frameTable.entries || []).find((x) => roll >= x.lo && roll <= x.hi);
  return { roll, frame: e ? e.result : null, dice: d.rolls };
}

// Height (inches) = species/sex base + 4d6.
export function rollHeight(species, sex, heightTable, rng) {
  const sp = (heightTable.bySpecies || {})[species] || (heightTable.bySpecies || {}).Human || { male: 54, female: 52 };
  const base = /^f/i.test(sex || '') ? sp.female : sp.male;
  return base + rollDice(heightTable.dice || '4d6', rng);
}

// Optimum weight (lb) for a height × the frame factor (rounded). Heights clamp to 40..89.
export function weightFor(heightIn, frame, weightTable, frameTable) {
  const h = Math.max(40, Math.min(89, Math.round(heightIn || 40)));
  const base = (weightTable.lb || {})[h] || 0;
  const factor = (frameTable.factors || {})[frame] != null ? frameTable.factors[frame] : 1;
  return Math.round(base * factor);
}

// Roll on the Medical table (sex-specific d100 columns) → { roll, entry }.
export function rollMedical(table, sex, rng) {
  const roll = 1 + Math.floor((rng || Math.random)() * 100);
  const female = /^f/i.test(sex || '');
  const entry = (table.entries || []).find((x) => (female ? roll >= x.flo && roll <= x.fhi : roll >= x.mlo && roll <= x.mhi));
  return { roll, entry };
}

// Comeliness descriptor (Ugly..Handsome) from the CML attribute value (clamped 3..18).
export function comelinessDesc(cml, descTable) {
  const v = Math.max(3, Math.min(18, Number(cml) || 3));
  const e = (descTable.entries || []).find((x) => v >= x.lo && v <= x.hi);
  return e ? e.result : null;
}

// Occupation display name (Pattern B — culture-determined): nameByCulture maps a culture to a
// fixed title (e.g. cleric-shaman → Tribal "Shaman", default "Cleric"); else the plain name.
export function occDisplayName(occ, culture) {
  if (occ && occ.nameByCulture) return occ.nameByCulture[culture] || occ.nameByCulture.default || occ.name;
  return occ ? occ.name : '';
}

// Occupation title list (Pattern A — title-choice): an occupation with interchangeable titles
// (Cook/Servant) expands to one pickable title per option, all sharing one skill bundle; otherwise
// a single culture-resolved name. The chosen title becomes identity.occupation.
export function occTitles(occ, culture) {
  if (occ && Array.isArray(occ.titles) && occ.titles.length) return occ.titles.slice();
  return [occDisplayName(occ, culture)];
}

// Union skill lists by name, keeping the HIGHER OML on overlap — the shared Char-23/27 rule
// ("if a skill is listed under ALL and the specific church/unit, use the higher OML").
export function unionByHigherOML(...lists) {
  const m = new Map();
  for (const list of lists) for (const sk of (list || [])) {
    const e = m.get(sk.name);
    if (!e || (sk.oml || 0) > (e.oml || 0)) m.set(sk.name, { ...sk }); // keep full shape (base/mult/oml)
  }
  return [...m.values()];
}

// Pattern F (Character 27): a military unit's full skill bundle = its own skills + the ALL-military
// common skills (opened for every unit EXCEPT Militia), unioned with the higher OML winning.
export function militaryUnitSkills(unit, allCommon) {
  return (unit && unit.militia) ? unionByHigherOML(unit.skills) : unionByHigherOML(unit && unit.skills, allCommon);
}

export const isKnightOcc = (id) => id === 'knight-bachelor' || id === 'knight-bailiff';

// Resolve an occupation id + selections to its skill bundle (pure; data = {occupations(merged),
// military, clerics, mages}). The single code path for soldiers (Char 27 unit), knights (culture
// knight unit + Lady by sex), clerics (deity, Char 23), mages (convocation, Char 26) and ordinary
// occupations. Used by the character occupation AND the parent (family skills). Returns
// { name, skills:[{name,oml|base,mult}], special?, conv?, csb?, neutralCsb?, specialties?, … }.
export function occBundle(occId, sel, data) {
  sel = sel || {}; data = data || {};
  const occs = data.occupations; const cul = sel.culture;
  const reso = (id, opts) => resolveOccupation(occs, id, opts);
  // The culture's Knight-unit bundle (Char 27) — used by noble knights AND "plus Knight skills" occupations (Herald).
  const knightSkillsFor = () => {
    const mil = data.military; const kunits = ((mil && mil.byCulture[cul]) || []).filter((u) => u.knight);
    const unit = kunits.find((u) => u.id === sel.milunit) || kunits[0];
    return { unit, skills: unit ? militaryUnitSkills(unit, mil.allCommon) : [] };
  };
  if (occId === 'soldier') {
    const mil = data.military; const units = (mil && mil.byCulture[cul]) || [];
    const unit = units.find((u) => u.id === sel.milunit);
    if (unit) return { name: `${unit.name} (${unit.class})`, skills: militaryUnitSkills(unit, mil.allCommon), end: unit.end };
    return { name: 'Soldier', skills: [], needs: units.length ? 'unit' : 'none-for-culture' };
  }
  if (isKnightOcc(occId)) {
    if (/^f/i.test(sel.sex || '')) { const lady = reso('lady'); return { name: 'Lady', skills: lady.skills || [] }; }
    const base = reso(occId);
    const k = knightSkillsFor();
    return { name: occDisplayName(base, cul), skills: unionByHigherOML(k.skills, base.skills || []), knightUnit: k.unit ? `${k.unit.name} (${k.unit.class})` : null };
  }
  if (occId === 'cleric-shaman') {
    const cl = data.clerics; const base = reso('cleric-shaman'); const dn = sel.deity;
    const d = (cl && dn && cl.byDeity[dn]) || null;
    const extra = []; // deity-specific: Ritual (RML = SB×4, deity attrs), church language/script (named), optional temple tongue
    if (d) {
      if (d.ritual) extra.push({ name: `Ritual (${dn})`, oml: 4, attrs: d.ritual.attrs, sun: d.ritual.sun, section: 'ritualskill' });
      if (d.church && d.church.language) extra.push({ name: `Language (${d.church.language})`, oml: 3 });
      if (d.church && d.church.script) extra.push({ name: `Script (${d.church.script})`, base: 70, mult: 1 });
      if (sel.templeTongues && d.templeTongue) extra.push({ name: `Language (${d.templeTongue})`, oml: 3 });
    }
    return { name: occDisplayName(base, cul), skills: unionByHigherOML(d ? d.skills : [], extra, cl ? cl.allCommon : []),
      special: [...((cl && cl.allCommonSpecial) || []), ...((d && d.special) || [])], choices: (d && d.choices) || null, deity: d ? dn : null };
  }
  if (occId === 'mage-shek-pvar') {
    const mg = data.mages; const base = reso('mage-shek-pvar');
    const c = (mg && sel.convocation && mg.byConvocation[sel.convocation]) || null;
    return { name: c ? `Mavari (${sel.convocation})` : 'Mage (Shek-Pvar)', skills: unionByHigherOML(c ? c.skills : [], mg ? mg.allCommon : []),
      special: (mg && mg.allCommonSpecial) || [], conv: c ? sel.convocation : null, csb: c ? c.csb : null, neutralCsb: mg ? mg.neutralCsb : null, specialties: c ? (c.specialties || []) : null };
  }
  if (occId) {
    const occ = reso(occId, sel.spec ? { specialization: sel.spec } : {});
    // "plus Knight skills to OML" (Herald) — union the FULL Knight (knight-bailiff) bundle: the
    // culture Knight-unit skills PLUS Law/Agriculture (not just the Knight-Bachelor unit skills).
    const skills = occ.knightSkills
      ? unionByHigherOML(occ.skills || [], occBundle('knight-bailiff', { culture: cul, sex: 'Male', milunit: sel.milunit }, data).skills)
      : (occ.skills || []);
    return { name: occDisplayName(occ, cul), skills, special: occ.special || [], choices: occ.choices || null, category: occ.category, years: occ.years, sources: occ.sources };
  }
  return { name: '', skills: [] };
}

// ── Equipment & Funds (Character 17) ───────────────────────────────────────
// Starting funds are family wealth: Social Class × wealth level (Poor/Average/Rich),
// from tables.familyWealth.byClass. Returns the amount in d (pennies), or null.
export function familyFunds(byClass, socialClass, wealthLevel) {
  const row = byClass && byClass[socialClass];
  if (!row) return null;
  return row[wealthLevel] != null ? row[wealthLevel] : null;
}

// Sum a chosen-equipment list against funds. Each item: {name, qty?, d (price each), wt (weight each)}.
// Returns total spent (d), carried weight (lb), item count, and funds remaining (if `funds` given).
export function gearTotals(items, funds) {
  let spent = 0, weight = 0, count = 0;
  for (const it of items || []) {
    const q = it.qty == null ? 1 : it.qty;
    if (typeof it.d === 'number') spent += it.d * q;
    if (typeof it.wt === 'number') weight += it.wt * q;
    count += q;
  }
  const r3 = (n) => Math.round(n * 1000) / 1000;
  const out = { spent: r3(spent), weight: r3(weight), count };
  if (typeof funds === 'number') out.remaining = r3(funds - spent);
  return out;
}

// Assemble a `harnchar` v1 PC record. `state.skills` is a flat list of {name, ml, section}.
export function buildHarncharPC(state) {
  const skills = { fixed: state.fixed || {}, combat: [], physical: [], communication: [], lore: [], ritual: [], magic: [] };
  for (const s of state.skills || []) {
    const bucket = skills[SECTION_KEY[s.section] || 'lore'];
    bucket.push({ name: s.name, ml: s.ml });
  }
  const hr = state.houserules || {};
  return {
    harnchar: 1, kind: 'pc', generator: 'harnchargen', generatorVersion: '0.1.0', build: state.build || 'dist',
    ...(state.sources ? { sources: state.sources } : {}),
    ...(Object.keys(hr).length ? { houserules: hr } : {}),
    character: {
      identity: state.identity || {},
      attributes: state.attributes || {},
      skills,
      psyche: hr.showPsyche ? (state.psyche || []) : [],     // psyche is opt-in (off by default)
      medical: hr.showMedical ? (state.medical || []) : [],  // medical is opt-in (off by default)
      honor: state.honor || null,
      religion: state.religion || null,
      magic: state.magic || { convocations: [], spells: [] },
      gear: state.gear || {},
    },
  };
}

// Assemble a `harnchar` v1 creature record from a resolved bestiary creature (resolveCreature output).
export function buildHarncharCreature(c) {
  return {
    harnchar: 1, kind: 'creature', generator: 'harnchargen', generatorVersion: '0.1.0',
    character: {
      identity: { name: c.name, species: c.name },
      archetype: c.archetype,
      attributes: c.attributes || {},
      derived: c.derived || {},
      movement: c.derived ? { move: c.derived.move } : {},
      attacks: c.attacks || [],
      armor: { natural: c.armorNatural || (c.specialQualities || []).includes('Ethereal') ? (c.armorNatural || 'Ethereal') : '', byLocation: {} },
      hitLocations: c.hitLocations || [],
      skills: c.skills || [],
      specialQualities: c.specialQualities || [],
    },
  };
}
