#!/usr/bin/env node
// parse-bestiary-article.mjs — parse the ARTICLE-format bestiaries (4611 Ivashu, 4601 HarnWorld
// Bestiary) into bestiary nodes. These supplements use multipage articles with a regular stat block:
//   <Name header>  Habitat:/Height:/Weight:/Diet:/Lifespan:/Group:
//   Attributes   <NN label> grid (Str Sta Dex Agl Eye Hrg Sml Int Aur Wil + End/Mov/Swim derived)
//   Skills       <NN name> pairs; attacks carry an impact + aspect ("Claw 4 e", "Bite 5 p")
//   Armour       Bn En Pn Fn  GAC g
//   Strike Locations   lo–hi  Location  (the per-creature hit-location table)
// The PDF extraction mangles small-caps ("S t r", "a w a r e n e S S"); we normalize by stripping
// single-letter spacing. Output = OWNER-ONLY layer (supplement content): _meta.distribution owner-only.
//
// Run:  node chargen/tools/parse-bestiary-article.mjs <txt> <source> <title> <out.json>
//   e.g. node chargen/tools/parse-bestiary-article.mjs ../PDF/4611-Ivashu.txt 4611 "Ivashu (4611)" chargen/owner/bestiary.4611.json

import { readFileSync, writeFileSync } from 'node:fs';

const [SRC, SOURCE, TITLE, OUT] = process.argv.slice(2);
if (!SRC || !SOURCE || !OUT) { console.error('usage: parse-bestiary-article.mjs <txt> <source> <title> <out.json>'); process.exit(1); }

// Authoritative creature names per source, IN DOCUMENT ORDER (the PDF drop-caps/page-headers make
// heuristic name extraction unreliable; stats parse fine, so we override names by block index).
// A 2-form creature (e.g. Tave) occupies two consecutive blocks. Count must match the parsed blocks.
const NAMES = {
  4611: ['Adwelna', 'Aklash', 'Ergath', 'Hru', 'Hygith', 'Miuruca', 'Nolah', 'Ogarna', 'Polan-Tekek', 'Scurgah', 'Tave (Human)', 'Tave (Serpent)', 'Umbath', 'Vlasta'],
};
// A few 4601 creatures are named only in prose (no clean title line) → fix by matching the bad id.
// Applied in order; each entry consumes the first not-yet-corrected node whose id contains the key
// (so the two grave-wight blocks map to Male then Female).
const CORRECTIONS = {
  4601: [
    ['rare-and-much-sought-after', 'Khanseti'], ['red-orange-hue', 'Reksyni'], ['mules-and-hinnies', 'Mule'],
    ['rodents-and-forest', 'Beaver'], ['weasels-and-forest', 'Weasel'], ['tawedog-chelni-pony', 'Tawedog'],
    ['ghosts-battlefields', 'Grave-Wight (Male)'], ['ghosts-battlefields', 'Grave-Wight (Female)'],
    ['swine-woodlands', 'Domestic Swine'],
  ],
};
// Genus is captured from the running headers ("aquatiCs 2", "Ivashu 1", …) so ids become
// <genus>-<species> and merge-by-id onto the matching PUBLIC bestiary.json nodes (4001 summaries),
// augmenting them with the fuller article stats + hit-location tables.
const GENERA = new Set(['aquatics', 'bats', 'bears', 'birds', 'cats', 'cattle', 'chimerae', 'deer', 'dogs', 'dragons', 'ethereals', 'gargun', 'ghosts', 'goats', 'horses', 'ilme', 'ivashu', 'lycanthropes', 'morvrin', 'rabbits', 'rodents', 'seals', 'sheep', 'snakes', 'swine', 'tawedog', 'yelgri', 'weasels']);
const genusHeader = (l) => { const m = /^([a-z]+)\s*\d+$/.exec(word(l)); return m && GENERA.has(m[1]) ? m[1] : null; };
const DIET = /^(carnivore|omnivore|herbivore|piscivore|insectivore|scavenger|seetext|frugivore|nectarivore)$/;

const raw = readFileSync(SRC, 'utf8').split(/\r?\n/);
// drop page/copyright noise
const lines = raw.filter((l) => !/=====|Columbia Games|HârnWorld|Copyright|^®$|^### |^# \d/.test(l));

// Collapse small-caps spacing: remove every space sitting between two letters ("a w a r e n e S S"
// -> "awareness", "I n I t I at I v e" -> "Initiative"). Safe in the stat grids because adjacent
// entries are separated by NUMBERS (letter–space–digit is preserved, e.g. "claw 5 e" stays apart).
function deSpace(s) { let p; s = String(s); do { p = s; s = s.replace(/([A-Za-z]) +([A-Za-z])/g, '$1$2'); } while (s !== p); return s.replace(/\s+/g, ' ').trim(); }
const word = (s) => deSpace(s).replace(/\s+/g, '').toLowerCase();         // "S t r" -> "str"
const titleCase = (s) => s.replace(/\b\w/g, (c) => c.toUpperCase());
// Gentle de-space for NAMES: join a lone drop-cap letter to the next token ("V orang"->"Vorang")
// but KEEP spaces between full words ("Black Bear" stays two words). Tidy parens + title-case.
function nameDeSpace(s) {
  const toks = String(s).replace(/\s+/g, ' ').trim().split(' ');
  const out = [];
  for (let x = 0; x < toks.length; x++) {
    if (/^[A-Za-z]$/.test(toks[x]) && x + 1 < toks.length && /^[A-Za-z]/.test(toks[x + 1])) { out.push(toks[x] + toks[x + 1]); x++; }
    else out.push(toks[x]);
  }
  return titleCase(out.join(' ').toLowerCase()).replace(/\(\s*([^)]+?)\s*\)/g, '($1)').trim();
}

const ATTR = { str: 'str', sta: 'sta', dex: 'dex', agl: 'agl', eye: 'eye', hrg: 'hrg', sml: 'sml', int: 'int', aur: 'aur', wil: 'wil' };
const DERIVED = { end: 'end', mov: 'move', move: 'move', swim: 'swim', sw: 'swim', ini: 'ini', init: 'ini' };
// section-header detectors (post-deSpace, lowercased, despaced)
const isHdr = (l, re) => re.test(word(l));
const ATTR_HDR = /^attrib?utes?$/, SKILL_HDR = /^ski?l+s?$/, ARM_HDR = /^armou?r$/, LOC_HDR = /^strikeloca?ti?o?ns?/;
const FIELD = /^\s*(Habitat|Height|Length|Weight|Diet|Lifespan|Group|Senses|Range|Wingspan|Wingspread|Colou?r|Tactics|Special|Speed|Size|Load|Price|Value|Cost|Quantity|Domestication|Mount|Cycle|Activity|Venom|Aspect|Movement|Shoulder|Wingspread|Tail|Reach)\s*:/i;
const ATTACK_NAMES = new Set(['claw', 'bite', 'tentacle', 'trample', 'gore', 'butt', 'sting', 'beak', 'hex', 'breath', 'fist', 'kick', 'pincer', 'tail', 'horn', 'tusk', 'crush', 'constrict', 'spit', 'slam', 'punch', 'talon', 'peck', 'squeeze', 'lash', 'maul']);

// pull "NN label" tokens out of a grid region (attributes / skills): returns [{n, label}].
// De-space FIRST so "S t r"→"str", "b r e a t H"→"breath" become single tokens before matching.
function pairs(region) {
  const toks = deSpace(Array.isArray(region) ? region.join(' ') : region);
  const out = []; const re = /(\d{1,3}|•|Tr)\s+([A-Za-z]+)/g;
  let m; while ((m = re.exec(toks))) out.push({ n: m[1], label: m[2].toLowerCase() });
  return out;
}

// strike-location ranges: "01–12 Head", "19–27 •Shoulder"
function locs(region) {
  const out = [];
  for (const l of region) {
    const m = /^\s*(\d{1,3})\s*[–-]\s*(\d{1,3})\s+[•*]?\s*(.+?)\s*$/.exec(l);
    if (m) { const hi = m[2] === '00' ? 100 : +m[2]; out.push({ lo: +m[1], hi, location: titleCase(m[3].replace(/\s+/g, ' ').trim()) }); }
  }
  return out;
}

const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[()'’.]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// ---- segment into creatures by the Attributes...StrikeLocations run ----
const creatures = [];
let i = 0; let currentGenus = '';
while (i < lines.length) {
  const gh = genusHeader(lines[i]); if (gh) { currentGenus = gh; i++; continue; }
  if (!isHdr(lines[i], ATTR_HDR)) { i++; continue; }
  const attrStart = i;
  // collect section regions
  const sect = { attrs: [], skills: [], armour: [], locs: [] };
  let k = attrStart + 1; let cur = 'attrs';
  for (; k < lines.length; k++) {
    if (isHdr(lines[k], SKILL_HDR)) { cur = 'skills'; continue; }
    if (isHdr(lines[k], ARM_HDR)) { cur = 'armour'; continue; }
    if (isHdr(lines[k], LOC_HDR)) { cur = 'locs'; continue; }
    if (cur === 'locs') {
      if (FIELD.test(lines[k]) || genusHeader(lines[k]) || isHdr(lines[k], ATTR_HDR)) break;            // next creature
      const t = lines[k].trim();
      if (/^B\s*\d+\s+E\s*\d+\s+P\s*\d+\s+F\s*\d+/i.test(deSpace(t))) { sect.armour.push(lines[k]); continue; } // armour interleaved in the loc list (dragons)
      if (/^\d{1,3}\s*[–-]/.test(t)) { sect.locs.push(lines[k]); continue; }                            // a strike-loc range
      if (!t || /^[•*]/.test(t) || /^(each|range|odd|even|gac)/i.test(t)) continue;                     // footnotes within the loc list
      if (sect.locs.length) break;                                                                       // end of block
      continue;
    }
    sect[cur].push(lines[k]);
    if (isHdr(lines[k], ATTR_HDR) && k > attrStart) break;
  }
  // NAME = the first non-field line above the Attributes block (skip the Habitat/Length/Weight/… field
  // lines). Works for normal creatures (→ title above the fields) AND dragon age-blocks (→ the age label,
  // e.g. "Hatchling (0–3 Months)", since those have no Habitat). Preserved by the viewer text export.
  let nameLn = '';
  for (let j = attrStart - 1; j >= 0 && j > attrStart - 14; j--) {
    const t = lines[j].trim();
    if (!t || FIELD.test(lines[j]) || genusHeader(lines[j])) continue;          // skip blanks / fields / page header
    if (isHdr(lines[j], LOC_HDR) || isHdr(lines[j], ARM_HDR) || isHdr(lines[j], SKILL_HDR) || isHdr(lines[j], ATTR_HDR)) break; // prev creature
    if (/^[•*\d]/.test(t)) continue;                              // bullets / split field-value fragments ("4-36 lb …")
    if (/^(the |see |hunting|combat|copyright|columbia)/i.test(t)) continue; // tagline / x-ref / prose / footer
    const cand = nameDeSpace(t.split(/[,/]/)[0]).replace(/\s*\((?:male|female|m|f)\)\s*$/i, '').trim();
    if (cand && /[A-Za-z]/.test(cand) && cand.length > 1) { nameLn = cand; break; }
  }
  i = k;

  // attributes + derived
  const attributes = {}, derived = {};
  for (const { n, label } of pairs(sect.attrs)) {
    const v = n === '•' ? null : (n === 'Tr' ? 0 : +n);
    if (ATTR[label]) attributes[ATTR[label]] = v;
    else if (DERIVED[label]) derived[DERIVED[label]] = v;
  }
  // skills + attacks — de-space first so "c l a w 5 e"→"claw 5 e", "b r e a t H"→"breath"
  const skills = [], attacks = [];
  const sk = deSpace(sect.skills.join(' '));
  // attack: "NN name IMP aspect"  e.g. "55 claw 4 e", "40 Trample 14b" (name is one word post-de-space)
  const reAtk = /(\d{1,3})\s+([A-Za-z]+)\s+(\d{1,2})\s*([bepf])\b/gi;
  const consumed = [];
  let m;
  while ((m = reAtk.exec(sk))) { attacks.push({ name: titleCase(m[2].toLowerCase()), ml: +m[1], impact: +m[3], aspect: m[4].toLowerCase() }); consumed.push(m[0]); }
  let skRest = sk; for (const c of consumed) skRest = skRest.replace(c, ' ');
  for (const { n, label } of pairs(skRest)) {
    if (label === 'initiative') derived.ini = +n;
    else if (label === 'dodge') derived.dodge = +n;
    else if (label) skills.push({ name: titleCase(label), ml: n === '•' ? null : +n });
  }
  // armour B/E/P/F + GAC
  let armorNatural = null, gac = null;
  const am = /B\s*(\d+)\s+E\s*(\d+)\s+P\s*(\d+)\s+F\s*(\d+)/i.exec(deSpace(sect.armour.join(' ')));
  if (am) armorNatural = { b: +am[1], e: +am[2], p: +am[3], f: +am[4] };
  const gm = /GAC\s*(\d+)/i.exec(deSpace(sect.armour.join(' '))); if (gm) gac = +gm[1];

  if (!Object.keys(attributes).length) continue;
  const heuristicName = nameLn; // already cleaned via nameDeSpace from the post-block title
  creatures.push({ _name: heuristicName, _genus: currentGenus, attributes, derived, armorNatural, gac, attacks, skills, hitLocations: locs(sect.locs) });
}

// apply the authoritative name list (by document order) when available; else the heuristic name
const NL = NAMES[SOURCE];
if (NL && NL.length !== creatures.length) console.warn(`⚠ name-list/${SOURCE} has ${NL.length} names but parsed ${creatures.length} blocks — names may be misaligned`);
const finalCreatures = creatures.map((c, idx) => {
  const name = (NL && NL[idx]) || c._name;
  const { _name, _genus, ...rest } = c;
  const id = (_genus ? slug(_genus) + '-' : '') + slug(name);
  // setting 'harn' = owner-only tier (git-ignored, runtime-loaded). For nodes that match a public id,
  // archetype/selectable/rank inherit via merge-by-id; genus is restated (same value, or seeds a new node).
  return { id, name, source: SOURCE, setting: 'harn', ...(_genus ? { genus: _genus } : {}), ...rest };
});

// backfill a missing genus (first creature parsed before its genus running-header) from the next sibling
for (let x = 0; x < finalCreatures.length; x++) {
  if (!finalCreatures[x].genus) {
    const nxt = finalCreatures.slice(x + 1).find((c) => c.genus);
    if (nxt) { finalCreatures[x].genus = nxt.genus; finalCreatures[x].id = slug(nxt.genus) + '-' + slug(finalCreatures[x].name); }
  }
}

// apply prose-name corrections (match bad id, in order, once each)
for (const [key, name] of CORRECTIONS[SOURCE] || []) {
  const n = finalCreatures.find((c) => c.id.includes(key) && !c._fixed);
  if (n) { n.name = name; n.id = (n.genus ? slug(n.genus) + '-' : '') + slug(name); n._fixed = true; }
}
finalCreatures.forEach((c) => { delete c._fixed; });

// Major dragons (Ahnerin=fire, Dhiverin=ice) SHARE the 7 age stat blocks. Emit 14 nodes — each type ×
// each age; Mature is the full base, the other ages `extends` it (their stats override). (owner rule)
const AGE_RE = /^(hatchling|young|adolescent|mature|very old|old|ancient)/i;
const ageNodes = finalCreatures.filter((c) => c.genus === 'dragons' && AGE_RE.test(c.name));
if (ageNodes.length) {
  const TYPES = [
    { name: 'Ahnerin', sl: 'ahnerin', sq: ['Fire dragon (Peleahn): fiery breath weapon; vulnerable to cold-based attacks'] },
    { name: 'Dhiverin', sl: 'dhiverin', sq: ['Ice dragon (Odivshe): frost breath weapon; vulnerable to fire-based attacks'] },
  ];
  const expanded = [];
  for (const t of TYPES) for (const a of ageNodes) {
    const age = a.name.match(AGE_RE)[1].replace(/\b\w/g, (c) => c.toUpperCase());
    const ageSl = slug(age); const isMature = ageSl === 'mature';
    const node = { id: `dragons-${t.sl}-${ageSl}`, name: `${t.name}, ${age}`, source: SOURCE, setting: 'harn',
      genus: 'dragons', rank: 'species', archetype: 'custom', selectable: true,
      attributes: a.attributes, derived: a.derived, attacks: a.attacks, skills: a.skills };
    if (a.armorNatural) node.armorNatural = a.armorNatural;
    if (a.gac != null) node.gac = a.gac;
    if (a.hitLocations && a.hitLocations.length) node.hitLocations = a.hitLocations;
    if (isMature) node.specialQualities = t.sq; else node.extends = `dragons-${t.sl}-mature`;
    expanded.push(node);
  }
  const rest = finalCreatures.filter((c) => !ageNodes.includes(c));
  finalCreatures.length = 0; finalCreatures.push(...rest, ...expanded);
}

const out = {
  _meta: {
    harnbestiary: 1, setting: 'harn', distribution: 'owner-only', source: SOURCE, title: TITLE || SOURCE,
    note: `OWNER-ONLY (git-ignored) — ${SOURCE} supplement creatures, article stat blocks parsed from the owner's licensed text. Functional stats only (no prose; descriptions are flavor). Merges by id onto bestiary.json (4001). Regenerate with parse-bestiary-article.mjs.`,
  },
  nodes: finalCreatures,
};
writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
console.log(`${OUT}: ${finalCreatures.length} creatures`);
for (const c of finalCreatures) console.log(`  ${c.id}: attrs ${Object.keys(c.attributes).length}, attacks ${c.attacks.length}, skills ${c.skills.length}, locs ${c.hitLocations.length}`);
