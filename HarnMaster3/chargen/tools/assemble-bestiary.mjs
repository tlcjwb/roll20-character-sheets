// Assemble final bestiary.json (public) + bestiary.private.json (harn) from one or more parser
// outputs plus the hand-coded compressed-format creatures (Ethereals/Ghosts/Ivashu-Umbath) and Morvrin.
// Run from HarnMaster3/:  cmd.exe /c "node chargen\\tools\\assemble-bestiary.mjs [parsed1.json parsed2.json ...]"
// Default input: chargen/bestiary.parsed.json. When 4601/4611 are added, parse each to its own
// parsed-json then pass them all here — public/private nodes merge across sources (dedup by id, later wins).
import { readFileSync, writeFileSync } from 'node:fs';

const inputs = process.argv.slice(2).length ? process.argv.slice(2) : ['chargen/bestiary.parsed.json'];
const mergeById = (arrays) => { const m = new Map(); for (const arr of arrays) for (const n of arr) m.set(n.id, n); return [...m.values()]; };
const sources = inputs.map((p) => JSON.parse(readFileSync(p, 'utf8')));
const parsed = { public: mergeById(sources.map((s) => s.public || [])), private: mergeById(sources.map((s) => s.private || [])) };
const current = JSON.parse(readFileSync('chargen/bestiary.json', 'utf8')); // reuse the components I authored

const GENUS_ARCHETYPE = {
  aquatics:'custom', bats:'winged', bears:'quadruped', birds:'winged', cats:'quadruped',
  cattle:'quadruped', chimerae:'custom', deer:'quadruped', dogs:'quadruped', dragons:'custom',
  ethereals:'custom', gargun:'humanoid', ghosts:'custom', goats:'quadruped', horses:'quadruped',
  ilme:'custom', ivashu:'custom', lycanthropes:'quadruped', morvrin:'custom', rabbits:'quadruped',
  rodents:'quadruped', seals:'custom', sheep:'quadruped', snakes:'custom', swine:'quadruped',
  tawedog:'quadruped', yelgri:'winged', weasels:'quadruped',
};
// 4001 core stat blocks are functional data → all PUBLIC. Tri-state stays for future UNOWNED
// supplements (4601/4611); for 4001 this set is empty so every genus ships public.
const PRIVATE_GENERA = new Set([]);

// The Gargun summary table is attributes-only ("See Gargun article for armour and skills"). The
// article (4001 p.150+) gives each sub-species' armour/skills/weapons — transcribed here and merged
// onto the parsed Gargun nodes (which keep their summary attributes/derived). All share NATURAL
// armour B4 E3 P1 F3, GAC 1, and Night vision.
const gAtk = (name, ml, impact, aspect) => ({ name, ml, impact, aspect });
const gSk = (name, ml) => ({ name, ml });
const GA_ARMOR = { armorNatural: { b: 4, e: 3, p: 1, f: 3 }, gac: 1 };
const NIGHTVIS = 'Night vision (negates the usual darkness penalty)';
const GARGUN_ARTICLE = {
  'gargun-arak': { ...GA_ARMOR,
    attacks: [gAtk('Unarmed', 55, 2, 'b'), gAtk('Club', 50, 4, 'b'), gAtk('Dagger', 60, 5, 'p'), gAtk('Mankar', 55, 5, 'e'), gAtk('Shield', 55, 1, 'b'), gAtk('Spear', 50, 7, 'p')],
    skills: [gSk('Initiative', 50), gSk('Awareness', 52), gSk('Dodge', 55), gSk('Climbing', 55), gSk('Jumping', 55), gSk('Stealth', 60), gSk('Throwing', 50), gSk('Herblore', 77), gSk('Survival', 55), gSk('Tracking', 65), gSk('Shortbow', 50), gSk('Blowgun', 50)],
    specialQualities: [NIGHTVIS, 'Equipment: Shortbow, Mankar, Club, Dagger, Buckler, Cloth Tunic, Leather Vest, Cowl'] },
  'gargun-hyeka': { ...GA_ARMOR,
    attacks: [gAtk('Unarmed', 55, 2, 'b'), gAtk('Mankar', 55, 5, 'e'), gAtk('Dagger', 50, 5, 'p'), gAtk('Pickaxe', 55, 8, 'p'), gAtk('Shield', 55, 2, 'b'), gAtk('Spear', 55, 7, 'p')],
    skills: [gSk('Initiative', 55), gSk('Awareness', 44), gSk('Dodge', 55), gSk('Climbing', 55), gSk('Jumping', 55), gSk('Stealth', 48), gSk('Throwing', 50), gSk('Metalcraft', 70), gSk('Mining', 80)],
    specialQualities: [NIGHTVIS, 'Equipment: Mankar, Pickaxe, Spear, Roundshield, Mining Tools, Cloth Tunic, Leather'] },
  'gargun-khanu': { ...GA_ARMOR,
    attacks: [gAtk('Unarmed', 72, 3, 'b'), gAtk('Handaxe', 60, 6, 'e'), gAtk('Dagger', 50, 5, 'p'), gAtk('Mang', 60, 6, 'e'), gAtk('Shield', 60, 2, 'b'), gAtk('Spear', 60, 7, 'p')],
    skills: [gSk('Initiative', 72), gSk('Awareness', 44), gSk('Dodge', 55), gSk('Climbing', 60), gSk('Jumping', 60), gSk('Stealth', 48), gSk('Throwing', 55), gSk('Survival', 60), gSk('Tracking', 55)],
    specialQualities: [NIGHTVIS, 'Equipment: Mang, Spear, Club, Handaxe, Roundshield, Cloth Tunic, Ring Byrnie, Plate Halfhelm'] },
  'gargun-kyani': { ...GA_ARMOR,
    attacks: [gAtk('Unarmed', 55, 2, 'b'), gAtk('Mankar', 55, 6, 'e'), gAtk('Dagger', 50, 5, 'p'), gAtk('Spear', 55, 7, 'p'), gAtk('Shield', 55, 2, 'b')],
    skills: [gSk('Initiative', 55), gSk('Awareness', 44), gSk('Dodge', 55), gSk('Climbing', 55), gSk('Jumping', 55), gSk('Stealth', 48), gSk('Throwing', 50), gSk('Jewelcraft', 60), gSk('Survival', 55), gSk('Tracking', 55), gSk('Wolfcraft', 66)],
    specialQualities: [NIGHTVIS, 'Equipment: Spear, Mankar, Dagger, Roundshield, Cloth Leggings, Leather Tunic, Fur Cowl and Kilt'] },
  'gargun-viasal': { ...GA_ARMOR,
    attacks: [gAtk('Unarmed', 55, 2, 'b'), gAtk('Handaxe', 60, 6, 'e'), gAtk('Dagger', 60, 5, 'p'), gAtk('Mang', 55, 6, 'e'), gAtk('Shield', 55, 2, 'b'), gAtk('Spear', 60, 7, 'p')],
    skills: [gSk('Initiative', 66), gSk('Awareness', 44), gSk('Dodge', 55), gSk('Climbing', 55), gSk('Jumping', 55), gSk('Stealth', 48), gSk('Throwing', 55), gSk('Survival', 55), gSk('Tracking', 66)],
    specialQualities: [NIGHTVIS, 'Equipment: Mang, Handaxe, Spear, Roundshield, Cloth Tunic, Ring Byrnie, Plate Halfhelm'] },
};
const sk = (...pairs) => pairs.map(([name, ml]) => ({ name, ml }));

// Hand-coded compressed (collapsed-physical) creatures the parser skips. "Ethereal" = no physical armour.
const compressed = [
  { id:'ethereals-dryad', name:'Dryad', genus:'ethereals', setting:'public',
    attributes:{int:12,aur:18,wil:12}, derived:{ini:70,move:14,dodge:90},
    skills:sk(['Charm',90],['Sensitivity',90],['Telepathy',90],['Fyvria',90]), specialQualities:['Ethereal'] },
  { id:'ghosts-damned-soul', name:'Damned Soul', genus:'ghosts', setting:'public',
    attributes:{int:13,aur:15,wil:12}, derived:{move:14},
    skills:sk(['Telepathy',75],['Sensitivity',75],['Manifestation',65],['Mental Conflict',65]), specialQualities:['Ethereal'] },
  { id:'ghosts-revenant', name:'Revenant', genus:'ghosts', setting:'public',
    attributes:{int:14,aur:14,wil:17}, derived:{move:14},
    skills:sk(['Telepathy',70],['Sensitivity',70],['Manifestation',75],['Mental Conflict',80]), specialQualities:['Ethereal'] },
  { id:'ethereals-asiri', name:'Asiri', genus:'ethereals', setting:'harn',
    attributes:{int:10,aur:13,wil:10}, derived:{ini:55,move:16,dodge:65},
    skills:sk(['Charm',65],['Sensitivity',65],['Telepathy',65]), specialQualities:['Ethereal'] },
  { id:'ethereals-elmithri', name:'Elmithri', genus:'ethereals', setting:'harn',
    attributes:{int:9,aur:11,wil:8}, derived:{ini:45,move:10,dodge:55},
    skills:sk(['Charm',55],['Sensitivity',55],['Telepathy',55]), specialQualities:['Ethereal'] },
  { id:'ethereals-vhir', name:'V’hir', genus:'ethereals', setting:'harn',
    attributes:{int:15,aur:21,wil:21}, derived:{ini:105,move:16,dodge:105},
    attacks:[{name:'Whip',ml:84,impact:5,aspect:'f'}],
    skills:sk(['Telepathy',105],['Sensitivity',105],['Peleahn',105]), specialQualities:['Ethereal'] },
  { id:'ivashu-umbath', name:'Umbath', genus:'ivashu', setting:'harn',
    attributes:{int:13,aur:19,wil:12}, derived:{ini:70,move:40,dodge:95},
    skills:sk(['Telepathy',95],['Sensitivity',95]), specialQualities:['Ethereal'] },
];
const finishCompressed = (c) => ({
  rank:'species', archetype:'custom', source:'4001', attacks:[], skills:[], specialQualities:[],
  selectable:true, flavorKey:c.id, ...c,
});

// Morvrin: the book gives no average stats (they use the deceased's life stats) — a private,
// non-selectable genus note so no data is lost.
const morvrinNote = {
  id:'morvrin-undead', name:'Morvrin (undead)', rank:'genus', setting:'harn', source:'4001', genus:'morvrin',
  archetype:'humanoid', selectable:false,
  note:'No average stats — a morvrin uses the attributes it had in life. Types incl. Amorvrin, Gulmorvrin, Dalkeshi Gulmora.',
};

// genus container nodes
const allGenera = new Set([...parsed.public, ...parsed.private, ...compressed].map((n) => n.genus));
const genusNodes = [...allGenera].sort().map((g) => ({
  id: g, name: g[0].toUpperCase() + g.slice(1), rank:'genus',
  setting: PRIVATE_GENERA.has(g) ? 'harn' : 'public', source: '4001', genus: g,
  archetype: GENUS_ARCHETYPE[g] || 'custom', selectable: false,
}));

// All current creatures derive from 4001 CORE (owned) → functional stat blocks ship PUBLIC. The
// GARGUN_ARTICLE augment is applied across every parsed node; future UNOWNED-supplement nodes are
// the only candidates for a private layer (none today).
const augment = (n) => (GARGUN_ARTICLE[n.id] ? { ...n, ...GARGUN_ARTICLE[n.id] } : n);
const cooked = compressed.map(finishCompressed);
const allNodes = [
  ...genusNodes, morvrinNote,
  ...parsed.public.map(augment), ...parsed.private.map(augment), ...cooked,
].map((n) => ({ ...n, setting: 'public' }));
allNodes.sort((a, b) => (a.rank === 'genus' ? 0 : 1) - (b.rank === 'genus' ? 0 : 1) || a.id.localeCompare(b.id));

const publicFile = {
  _meta: {
    harnbestiary: 1, setting: 'public',
    note: 'PUBLIC bestiary — functional stat blocks for ALL HarnMaster (4001) CORE creatures (Bestiary 3-8 summary tables + the Gargun/Ivashu/Yelgri articles). Stat blocks are functional game data, NOT copyrightable prose (creature descriptions live in flavor.*.json); coined Hârn names are not copyright. So all 4001-core creatures ship here — only UNOWNED-supplement content (4601/4611) would warrant a private layer. Generated by chargen/tools/parse-bestiary.mjs + assemble-bestiary.mjs from the owner\'s licensed 4001. Columns: STR STA DEX AGL EYE HRG SML INT AUR WIL (attributes; no VOI for creatures) + derived {ini,end,move,dodge} + natural ARMOUR {b,e,p,f} + GAC + attacks/skills.',
    ranksNote: 'rank is a soft label; mechanics come from extends + components.',
  },
  components: current.components,
  nodes: allNodes,
};

writeFileSync('chargen/bestiary.json', JSON.stringify(publicFile, null, 2) + '\n');
console.log(`bestiary.json: ${allNodes.length} nodes (${allNodes.filter((n) => n.selectable).length} selectable)`);
